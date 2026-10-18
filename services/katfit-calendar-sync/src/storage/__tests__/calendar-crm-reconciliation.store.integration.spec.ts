import { CreateCalendarSessionLinks1792241000000 } from '../../migrations/1792241000000-create-calendar-session-links';
import { CalendarCrmReconciliationStore } from '../calendar-crm-reconciliation.store';
import { CalendarCrmReconciler } from '../../reconciliation/calendar-crm-reconciler';
import { type CalendarSessionLookup } from '../../crm/find-calendar-session';
import { CreateCalendarImportPreview1792240000000 } from '../../migrations/1792240000000-create-calendar-import-preview';
import { CalendarImportPreviewStore } from '../calendar-import-preview.store';
import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { CreateCalendarOperations1792229192906 } from '../../migrations/1792229192906-create-calendar-operations';
import { CreateCalendarConnections1792230811000 } from '../../migrations/1792230811000-create-calendar-connections';
import { CreateCalendarInbox1792237004000 } from '../../migrations/1792237004000-create-calendar-inbox';
import { CalendarPoller } from '../../polling/calendar-poller';
import { CalendarCredentialCipher } from '../../security/calendar-credential-cipher';
import { type CalendarSnapshotResult } from '../../transport/read-calendar-snapshot';
import { CalendarConnectionStore } from '../calendar-connection.store';
import { CalendarPollStore } from '../calendar-poll.store';

const socketPath = process.env.STUDIO_CALENDAR_TEST_SOCKET;
const describeWithDatabase = socketPath ? describe : describe.skip;

describeWithDatabase(
  'Calendar CRM reconciliation with isolated PostgreSQL',
  () => {
    const workspaceId = randomUUID();
    const id = randomUUID();
    const database = `calendar_crm_${randomUUID().replace(/-/g, '')}`;
    const cipher = new CalendarCredentialCipher('primary', {
      primary: 'ab'.repeat(32),
    });
    const calendarUrl = 'https://caldav.yandex.ru/calendars/test/classes/';
    const calendarData = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:one',
      'SUMMARY:Тренировка',
      'DTSTART:20990110T090000Z',
      'DURATION:PT1H',
      'DESCRIPTION:KATFIT:\\nformat=GROUP_REFORMER\\ncapacity=6',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const resource = {
      url: `${calendarUrl}one.ics`,
      etag: '"v1"',
      calendarData,
    };
    const reader = jest.fn<
      Promise<CalendarSnapshotResult>,
      [string, { username: string; appPassword: string }]
    >();
    let admin: DataSource;
    let source: DataSource;
    let store: CalendarPollStore;
    let connections: CalendarConnectionStore;
    let poller: CalendarPoller;

    beforeAll(async () => {
      if (!socketPath?.startsWith('/tmp/studio-caldav-postgres.'))
        throw new Error('An isolated test socket is required');
      const options = {
        type: 'postgres' as const,
        host: socketPath,
        port: 55439,
        username: 'postgres',
        database: 'postgres',
      };
      admin = await new DataSource(options).initialize();
      await admin.query(`CREATE DATABASE "${database}"`);
      source = await new DataSource({
        ...options,
        database,
        schema: 'calendar_sync',
        migrationsTableName: 'migrations',
        migrations: [
          CreateCalendarOperations1792229192906,
          CreateCalendarConnections1792230811000,
          CreateCalendarInbox1792237004000,
          CreateCalendarImportPreview1792240000000,
          CreateCalendarSessionLinks1792241000000,
        ],
      }).initialize();
      await source.query('CREATE SCHEMA calendar_sync');
      await source.runMigrations({ transaction: 'all' });
      store = new CalendarPollStore(source, cipher);
      connections = new CalendarConnectionStore(source, cipher);
      poller = new CalendarPoller(store, reader);
    });

    beforeEach(async () => {
      reader.mockReset();
      reader.mockResolvedValue({ status: 'snapshot', resources: [resource] });
      await connections.createPreview({
        id,
        workspaceId,
        username: 'trainer@yandex.ru',
        appPassword: 'test-secret',
        timezone: 'Europe/Moscow',
        calendar: {
          url: calendarUrl,
          displayName: 'Тренировки',
          reports: [],
          writeAccess: 'unverified',
        },
      });
    });

    afterEach(async () => {
      await source.query('TRUNCATE calendar_sync."calendarConnection" CASCADE');
    });

    afterAll(async () => {
      if (source?.isInitialized) await source.destroy();
      if (admin?.isInitialized) {
        await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
        await admin.destroy();
      }
    });

    const reconciliation = () =>
      new CalendarCrmReconciliationStore(source, {
        workspaceId,
        connectionId: id,
      });
    const links = () =>
      source.query('SELECT * FROM calendar_sync."calendarSessionLink"');
    const decisions = () =>
      source.query(
        'SELECT decision, reason FROM calendar_sync."calendarCrmReconciliation" ORDER BY "updatedAt"',
      );
    const prepare = async () => {
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      return reconciliation().claimNext();
    };
    const matched = (
      key: string,
      sessionId = randomUUID(),
    ): CalendarSessionLookup => ({
      status: 'matched',
      session: {
        id: sessionId,
        recordingKey: key,
        name: 'Тренировка CRM',
        startsAt: '2099-01-10T09:00:00Z',
        endsAt: '2099-01-10T10:00:00Z',
        sessionFormat: 'GROUP_REFORMER',
        capacity: 6,
        status: 'PLANNED',
      },
    });

    it('links a matched session and keeps inbox pending without external writes', async () => {
      const lease = await prepare();
      if (!lease) throw Error('Expected lease');
      const result = matched(lease.candidate.recordingKey);
      expect(await reconciliation().settle(lease, result)).toBe(true);
      expect(await links()).toEqual([
        expect.objectContaining({
          uid: 'one',
          recordingKey: lease.candidate.recordingKey,
        }),
      ]);
      expect(await decisions()).toEqual([{ decision: 'LINKED', reason: null }]);
      expect(await reconciliation().claimNext()).toBeNull();
      expect(
        await source.query('SELECT state FROM calendar_sync."calendarInbox"'),
      ).toEqual([{ state: 'PENDING' }]);
      expect(
        await source.query(
          'SELECT * FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual([]);
    });

    it('classifies an absent session without creating a link', async () => {
      const lease = await prepare();
      if (!lease) throw Error('Expected lease');
      await reconciliation().settle(lease, { status: 'not-found' });
      expect(await links()).toEqual([]);
      expect(await decisions()).toEqual([
        { decision: 'CREATE_CANDIDATE', reason: null },
      ]);
    });

    it.each([
      'auth-required',
      'forbidden',
      'ambiguous',
      'invalid-response',
    ] as const)('requires review for CRM %s', async (status) => {
      const lease = await prepare();
      if (!lease) throw Error('Expected lease');
      await reconciliation().settle(lease, { status });
      expect(await links()).toEqual([]);
      expect(await decisions()).toEqual([
        {
          decision: 'NEEDS_REVIEW',
          reason: `CRM_${status.toUpperCase().replaceAll('-', '_')}`,
        },
      ]);
    });

    it('delays network failures and fences expired workers', async () => {
      const first = await prepare();
      if (!first) throw Error('Expected lease');
      await source.query(
        `UPDATE calendar_sync."calendarCrmReconciliation" SET "leaseUntil" = now() - interval '1 second'`,
      );
      const second = await reconciliation().claimNext();
      if (!second) throw Error('Expected replacement lease');
      expect(
        await reconciliation().settle(
          first,
          matched(first.candidate.recordingKey),
        ),
      ).toBe(false);
      expect(
        await reconciliation().settle(second, { status: 'unavailable' }),
      ).toBe(true);
      expect(await reconciliation().claimNext()).toBeNull();
      expect(await decisions()).toEqual([
        { decision: 'PENDING', reason: 'CRM_UNAVAILABLE' },
      ]);
    });

    it('does not accept stale configuration or cross-workspace leases', async () => {
      const lease = await prepare();
      if (!lease) throw Error('Expected lease');
      expect(
        await reconciliation().settle(
          { ...lease, workspaceId: randomUUID() },
          matched(lease.candidate.recordingKey),
        ),
      ).toBe(false);
      await source.query(
        `UPDATE calendar_sync."calendarConnection" SET state = 'PAUSED', "configurationVersion" = "configurationVersion" + 1`,
      );
      expect(
        await reconciliation().settle(
          lease,
          matched(lease.candidate.recordingKey),
        ),
      ).toBe(false);
      expect(await links()).toEqual([]);
    });

    it('rejects a resource change while lookup was in flight', async () => {
      const lease = await prepare();
      if (!lease) throw Error('Expected lease');
      await source.query(
        'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
      );
      reader.mockResolvedValue({
        status: 'snapshot',
        resources: [
          {
            ...resource,
            etag: '"v2"',
            calendarData: calendarData.replace('capacity=6', 'capacity=8'),
          },
        ],
      });
      await poller.runOnce();
      expect(
        await reconciliation().settle(
          lease,
          matched(lease.candidate.recordingKey),
        ),
      ).toBe(false);
      expect(await links()).toEqual([]);
    });

    it('serializes claims and excludes a different configured workspace', async () => {
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      const claims = await Promise.all([
        reconciliation().claimNext(),
        reconciliation().claimNext(),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(
        await new CalendarCrmReconciliationStore(source, {
          workspaceId: randomUUID(),
          connectionId: id,
        }).claimNext(),
      ).toBeNull();
    });

    it('detects duplicate UID resources', async () => {
      reader.mockResolvedValue({
        status: 'snapshot',
        resources: [resource, { ...resource, url: `${calendarUrl}copy.ics` }],
      });
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      const lease = await reconciliation().claimNext();
      if (!lease) throw Error('Expected lease');
      await reconciliation().settle(
        lease,
        matched(lease.candidate.recordingKey),
      );
      expect(await links()).toEqual([]);
      expect(await decisions()).toContainEqual({
        decision: 'NEEDS_REVIEW',
        reason: 'DUPLICATE_CALENDAR_UID',
      });
    });

    it('preserves identity across rescheduling and rejects changed CRM identity', async () => {
      const lease = await prepare();
      if (!lease) throw Error('Expected lease');
      await reconciliation().settle(
        lease,
        matched(lease.candidate.recordingKey),
      );
      const original = (await links())[0];
      await source.query(
        'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
      );
      reader.mockResolvedValue({
        status: 'snapshot',
        resources: [
          {
            ...resource,
            etag: '"v2"',
            calendarData: calendarData.replace('20990110', '20990111'),
          },
        ],
      });
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      const next = await reconciliation().claimNext();
      if (!next) throw Error('Expected next lease');
      expect(next.candidate.recordingKey).toBe(lease.candidate.recordingKey);
      await reconciliation().settle(next, matched(next.candidate.recordingKey));
      expect((await links())[0].classSessionId).toBe(original.classSessionId);
      expect(await decisions()).toContainEqual({
        decision: 'NEEDS_REVIEW',
        reason: 'CRM_IDENTITY_CHANGED',
      });
    });

    it('converts thrown lookup errors into delayed retry', async () => {
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      const worker = new CalendarCrmReconciler(reconciliation(), async () => {
        throw Error('secret');
      });
      expect(await worker.runOnce()).toBe('saved');
      expect(await decisions()).toEqual([
        { decision: 'PENDING', reason: 'CRM_UNAVAILABLE' },
      ]);
    });

    it.each(['matched', 'not-found'] as const)(
      'checks a previously linked session on a new version: %s',
      async (status) => {
        const lease = await prepare();
        if (!lease) throw Error('Expected lease');
        const sessionId = randomUUID();
        await reconciliation().settle(
          lease,
          matched(lease.candidate.recordingKey, sessionId),
        );
        await source.query(
          'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
        );
        reader.mockResolvedValue({
          status: 'snapshot',
          resources: [
            {
              ...resource,
              etag: '"next"',
              calendarData: calendarData.replace('capacity=6', 'capacity=8'),
            },
          ],
        });
        await poller.runOnce();
        await new CalendarImportPreviewStore(source).runOnce();
        const next = await reconciliation().claimNext();
        if (!next) throw Error('Expected next lease');
        await reconciliation().settle(
          next,
          status === 'matched'
            ? matched(next.candidate.recordingKey, sessionId)
            : { status },
        );
        expect(await links()).toHaveLength(1);
        expect((await links())[0].classSessionId).toBe(sessionId);
        expect(await decisions()).toContainEqual(
          status === 'matched'
            ? { decision: 'LINKED', reason: null }
            : {
                decision: 'NEEDS_REVIEW',
                reason: 'LINKED_CRM_SESSION_MISSING',
              },
        );
      },
    );

    it('rejects a recording key mismatch even from an injected lookup', async () => {
      const lease = await prepare();
      if (!lease) throw Error('Expected lease');
      await reconciliation().settle(lease, matched('other-key'));
      expect(await links()).toEqual([]);
      expect(await decisions()).toContainEqual({
        decision: 'NEEDS_REVIEW',
        reason: 'CRM_RECORDING_KEY_MISMATCH',
      });
    });

    it('does not attach two UIDs to one CRM session', async () => {
      const first = await prepare();
      if (!first) throw Error('Expected lease');
      const sessionId = randomUUID();
      await reconciliation().settle(
        first,
        matched(first.candidate.recordingKey, sessionId),
      );
      await source.query(
        'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
      );
      reader.mockResolvedValue({
        status: 'snapshot',
        resources: [
          resource,
          {
            ...resource,
            url: `${calendarUrl}other.ics`,
            calendarData: calendarData.replace('UID:one', 'UID:other'),
          },
        ],
      });
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      const second = await reconciliation().claimNext();
      if (!second) throw Error('Expected other lease');
      await reconciliation().settle(
        second,
        matched(second.candidate.recordingKey, sessionId),
      );
      expect(await links()).toHaveLength(1);
      expect(await decisions()).toContainEqual({
        decision: 'NEEDS_REVIEW',
        reason: 'CRM_SESSION_ALREADY_LINKED',
      });
    });

    it('reverses and reapplies the link migration', async () => {
      await source.undoLastMigration({ transaction: 'all' });
      await source.runMigrations({ transaction: 'all' });
      expect(await links()).toEqual([]);
    });
  },
);
