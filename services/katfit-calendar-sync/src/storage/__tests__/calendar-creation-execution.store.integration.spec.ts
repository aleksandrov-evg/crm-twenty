import { checkCalendarResource } from '../../transport/check-calendar-resource';
import { AddCalendarLiveSourceCheck1792244000000 } from '../../migrations/1792244000000-add-calendar-live-source-check';
import { CalendarLiveSourceGuard } from '../../creation/calendar-live-source-guard';
import { type CalendarCreationLease } from '../calendar-creation-execution.store';
import { CreateCalendarCreationExecution1792243000000 } from '../../migrations/1792243000000-create-calendar-creation-execution';
import { CalendarCreationExecutionStore } from '../calendar-creation-execution.store';
import { CalendarCreationWorker } from '../../creation/calendar-creation-worker';
import { type CalendarCreationInspection } from '../../crm/inspect-calendar-session-creation';
import { type CalendarSessionCreationResult } from '../../crm/create-calendar-session';
import { type CalendarSessionCommand } from '../../domain/create-calendar-session-command';
import { CreateCalendarSessionIntents1792242000000 } from '../../migrations/1792242000000-create-calendar-session-intents';
import { CalendarSessionIntentStore } from '../calendar-session-intent.store';
import { CreateCalendarSessionLinks1792241000000 } from '../../migrations/1792241000000-create-calendar-session-links';
import { CalendarCrmReconciliationStore } from '../calendar-crm-reconciliation.store';
import { CalendarCrmReconciler } from '../../reconciliation/calendar-crm-reconciler';
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
  'Calendar durable execution with isolated PostgreSQL',
  () => {
    const workspaceId = randomUUID();
    const id = randomUUID();
    const database = `calendar_execution_${randomUUID().replace(/-/g, '')}`;
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
          CreateCalendarSessionIntents1792242000000,
          CreateCalendarCreationExecution1792243000000,
          AddCalendarLiveSourceCheck1792244000000,
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

    let recordingKey = '';
    const execution = () =>
      new CalendarCreationExecutionStore(source, {
        workspaceId,
        connectionId: id,
      });
    const attempts = () =>
      source.query(
        'SELECT * FROM calendar_sync."calendarCreationAttempt" ORDER BY generation',
      );
    const results = () =>
      source.query('SELECT * FROM calendar_sync."calendarCreationExecution"');
    const prepare = async () => {
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      await new CalendarCrmReconciler(
        new CalendarCrmReconciliationStore(source, {
          workspaceId,
          connectionId: id,
        }),
        async () => ({ status: 'not-found' }),
      ).runOnce();
      await new CalendarSessionIntentStore(source, {
        workspaceId,
        connectionId: id,
      }).runOnce();
      recordingKey = `session-create:${(await source.query('SELECT payload FROM calendar_sync."calendarSessionCreateIntent"'))[0].payload.idempotencyKey}`;
    };
    const liveGuard = () =>
      new CalendarLiveSourceGuard(execution(), cipher, async (source) => ({
        status: 'verified',
        ...source,
      }));
    const verifySource = (lease: CalendarCreationLease) =>
      liveGuard().check(lease);
    const expire = () =>
      source.query(
        `UPDATE calendar_sync."calendarCreationExecution" SET "leaseUntil" = now() - interval '1 second' WHERE state = 'RUNNING'`,
      );
    const activate = () =>
      source.query(
        `UPDATE calendar_sync."calendarConnection" SET state = 'ACTIVE'`,
      );
    const inspect = jest.fn<
      Promise<CalendarCreationInspection>,
      [CalendarSessionCommand]
    >();
    const sender = jest.fn<
      Promise<CalendarSessionCreationResult>,
      [CalendarSessionCommand]
    >();

    it('persists proof from read-only recovery without POST or marking inbox applied', async () => {
      await prepare();
      inspect.mockResolvedValue({
        status: 'confirmed',
        classSessionId: randomUUID(),
        recordingKey,
      });
      expect(
        await new CalendarCreationWorker(execution(), inspect).runOnce(),
      ).toBe('saved');
      expect(await attempts()).toEqual([
        expect.objectContaining({
          sendStartedAt: null,
          result: expect.objectContaining({ status: 'confirmed' }),
        }),
      ]);
      expect((await results())[0].state).toBe('CONFIRMED');
      expect(
        await source.query('SELECT state FROM calendar_sync."calendarInbox"'),
      ).toEqual([{ state: 'PENDING' }]);
    });

    it('delays absent inspections and preserves generations after restart', async () => {
      await prepare();
      inspect.mockResolvedValue({ status: 'absent' });
      await new CalendarCreationWorker(execution(), inspect).runOnce();
      expect(await execution().claimNext()).toBeNull();
      await source.query(
        'UPDATE calendar_sync."calendarCreationExecution" SET "nextAttemptAt" = now()',
      );
      const next = await execution().claimNext();
      expect(next?.leaseGeneration).toBe(2);
      expect(await attempts()).toHaveLength(2);
    });

    it('serializes workers and fences stale attempts', async () => {
      await prepare();
      const leases = await Promise.all([
        execution().claimNext(),
        execution().claimNext(),
      ]);
      expect(leases.filter(Boolean)).toHaveLength(1);
      const first = leases.find(Boolean);
      if (!first) throw Error('Expected lease');
      await expire();
      const second = await execution().claimNext();
      if (!second) throw Error('Expected reclaimed lease');
      expect(second.leaseGeneration).toBe(first.leaseGeneration + 1);
      expect(
        await execution().recordInspection(first, { status: 'absent' }),
      ).toBe(false);
      expect(await execution().settle(first, { status: 'unconfirmed' })).toBe(
        false,
      );
      expect(await execution().beginSend(first)).toBe(false);
      expect(await attempts()).toHaveLength(2);
    });

    it('requires ACTIVE and persists send intent before allowing exactly one POST per attempt', async () => {
      await prepare();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      expect(await execution().beginSend(lease)).toBe(false);
      await activate();
      expect(await execution().beginSend(lease)).toBe(false);
      await execution().recordInspection(lease, { status: 'absent' });
      await verifySource(lease);
      expect(await execution().beginSend(lease)).toBe(true);
      expect((await attempts())[0].sendStartedAt).toBeInstanceOf(Date);
      expect(await execution().beginSend(lease)).toBe(false);
    });

    it('keeps known identity after process loss following a successful response', async () => {
      await prepare();
      await activate();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      await execution().recordInspection(lease, { status: 'absent' });
      await verifySource(lease);
      await execution().beginSend(lease);
      const sessionId = randomUUID();
      expect(
        await execution().recordSendResult(lease, {
          status: 'confirmed',
          classSessionId: sessionId,
          duplicate: false,
        }),
      ).toBe(true);
      await expire();
      const next = await execution().claimNext();
      expect(next?.knownClassSessionId).toBe(sessionId);
      expect(await attempts()).toEqual([
        expect.objectContaining({
          sendResult: expect.objectContaining({ classSessionId: sessionId }),
          result: null,
        }),
        expect.objectContaining({ sendStartedAt: null }),
      ]);
    });

    it('does not record a response without a persisted send start', async () => {
      await prepare();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      expect(
        await execution().recordSendResult(lease, {
          status: 'confirmed',
          classSessionId: randomUUID(),
          duplicate: false,
        }),
      ).toBe(false);
      expect((await results())[0].knownClassSessionId).toBeNull();
    });

    it('blocks sending if source or snapshot freshness changes', async () => {
      await prepare();
      await activate();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      await execution().recordInspection(lease, { status: 'absent' });
      await verifySource(lease);
      await source.query(
        `UPDATE calendar_sync."calendarConnection" SET "lastSuccessfulReadAt" = now() - interval '3 minutes'`,
      );
      expect(await execution().beginSend(lease)).toBe(false);
      await source.query(
        'UPDATE calendar_sync."calendarConnection" SET "lastSuccessfulReadAt" = now()',
      );
      await source.query(
        'UPDATE calendar_sync."calendarResource" SET "resourceVersion" = "resourceVersion" + 1',
      );
      expect(await execution().beginSend(lease)).toBe(false);
      expect((await attempts())[0].sendStartedAt).toBeNull();
    });

    it('rejects duplicate UID even when the extra resource has not been previewed', async () => {
      await prepare();
      await activate();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      await execution().recordInspection(lease, { status: 'absent' });
      await verifySource(lease);
      await source.query(
        'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
      );
      reader.mockResolvedValue({
        status: 'snapshot',
        resources: [resource, { ...resource, url: `${calendarUrl}copy.ics` }],
      });
      await poller.runOnce();
      expect(await execution().beginSend(lease)).toBe(false);
    });

    it('does not let paused or differently scoped workers persist a result', async () => {
      await prepare();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      const other = new CalendarCreationExecutionStore(source, {
        workspaceId: randomUUID(),
        connectionId: id,
      });
      expect(await other.claimNext()).toBeNull();
      expect(await other.settle(lease, { status: 'absent' })).toBe(false);
      await source.query(
        `UPDATE calendar_sync."calendarConnection" SET state = 'PAUSED', "configurationVersion" = "configurationVersion" + 1`,
      );
      expect(
        await execution().recordInspection(lease, { status: 'absent' }),
      ).toBe(false);
      expect(await execution().settle(lease, { status: 'absent' })).toBe(false);
    });

    it('performs recovery with an injected sender and stores both observations and the result', async () => {
      await prepare();
      await activate();
      const sessionId = randomUUID();
      inspect
        .mockReset()
        .mockResolvedValueOnce({ status: 'absent' })
        .mockResolvedValue({
          status: 'confirmed',
          classSessionId: sessionId,
          recordingKey,
        });
      sender.mockReset().mockResolvedValue({ status: 'unconfirmed' });
      expect(
        await new CalendarCreationWorker(
          execution(),
          inspect,
          sender,
          (lease) => verifySource(lease),
          async () => null,
        ).runOnce(),
      ).toBe('saved');
      expect(sender).toHaveBeenCalledTimes(1);
      expect((await results())[0].state).toBe('CONFIRMED');
      expect((await attempts())[0]).toMatchObject({
        initialInspection: { status: 'absent' },
        sendResult: { status: 'unconfirmed' },
        result: { status: 'confirmed', classSessionId: sessionId },
      });
    });

    it('records incomplete identity before any possible resend and refuses its later disappearance', async () => {
      await prepare();
      const sessionId = randomUUID();
      inspect
        .mockReset()
        .mockResolvedValue({ status: 'incomplete', classSessionId: sessionId });
      await new CalendarCreationWorker(execution(), inspect).runOnce();
      expect((await results())[0].knownClassSessionId).toBe(sessionId);
      await source.query(
        'UPDATE calendar_sync."calendarCreationExecution" SET "nextAttemptAt" = now()',
      );
      inspect.mockResolvedValue({ status: 'absent' });
      await new CalendarCreationWorker(execution(), inspect).runOnce();
      expect((await results())[0]).toMatchObject({
        state: 'NEEDS_REVIEW',
        lastResult: { reason: 'KNOWN_CRM_IDENTITY_MISSING_OR_CHANGED' },
      });
    });

    it('requires a recent matching live source proof before POST', async () => {
      await prepare();
      await activate();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      await execution().recordInspection(lease, { status: 'absent' });
      expect(await execution().beginSend(lease)).toBe(false);
      expect((await verifySource(lease)).status).toBe('verified');
      await source.query(
        `UPDATE calendar_sync."calendarCreationAttempt" SET "liveSourceCheckedAt" = now() - interval '11 seconds'`,
      );
      expect(await execution().beginSend(lease)).toBe(false);
      expect((await verifySource(lease)).status).toBe('verified');
      expect(await execution().beginSend(lease)).toBe(true);
    });

    it('discards a GET result if the resource changed while the request was in flight', async () => {
      await prepare();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      const guard = new CalendarLiveSourceGuard(
        execution(),
        cipher,
        async (checked) => {
          await source.query(
            'UPDATE calendar_sync."calendarResource" SET etag = $1, "resourceVersion" = "resourceVersion" + 1',
            ['"changed"'],
          );
          return { status: 'verified', ...checked };
        },
      );
      expect(await guard.check(lease)).toEqual({ status: 'stale' });
      expect((await attempts())[0].liveSourceCheck).toBeNull();
    });

    it('does not expose credentials in a failed live source check', async () => {
      await prepare();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      const guard = new CalendarLiveSourceGuard(
        execution(),
        cipher,
        async (_source, credentials) => {
          expect(credentials.appPassword).toBe('test-secret');
          throw Error(credentials.appPassword);
        },
      );
      expect(await guard.check(lease)).toEqual({ status: 'unavailable' });
      expect((await attempts())[0].liveSourceCheck).toEqual({
        status: 'unavailable',
      });
    });

    it('does not POST when the live source changed even if CRM has no session', async () => {
      await prepare();
      await activate();
      inspect.mockReset().mockResolvedValue({ status: 'absent' });
      sender.mockReset();
      const guard = new CalendarLiveSourceGuard(
        execution(),
        cipher,
        async () => ({ status: 'changed' }),
      );
      await new CalendarCreationWorker(
        execution(),
        inspect,
        sender,
        (lease) => guard.check(lease),
        async () => null,
      ).runOnce();
      expect(sender).not.toHaveBeenCalled();
      expect((await results())[0]).toMatchObject({
        state: 'NEEDS_REVIEW',
        lastResult: { reason: 'CALDAV_SOURCE_CHANGED' },
      });
    });

    it('retries a live source network failure without POST', async () => {
      await prepare();
      await activate();
      inspect.mockReset().mockResolvedValue({ status: 'absent' });
      sender.mockReset();
      const guard = new CalendarLiveSourceGuard(
        execution(),
        cipher,
        async () => ({ status: 'unavailable' }),
      );
      await new CalendarCreationWorker(
        execution(),
        inspect,
        sender,
        (lease) => guard.check(lease),
        async () => null,
      ).runOnce();
      expect(sender).not.toHaveBeenCalled();
      expect((await results())[0]).toMatchObject({
        state: 'RETRY',
        lastResult: { status: 'unavailable' },
      });
    });

    it('binds the proof to the version captured before GET, even if ETag and content return to the same values', async () => {
      await prepare();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      const guard = new CalendarLiveSourceGuard(
        execution(),
        cipher,
        async (checked) => {
          await source.query(
            'UPDATE calendar_sync."calendarResource" SET "resourceVersion" = "resourceVersion" + 1',
          );
          await source.query(
            'UPDATE calendar_sync."calendarInbox" SET "resourceVersion" = "resourceVersion" + 1',
          );
          return { status: 'verified', ...checked };
        },
      );
      expect(await guard.check(lease)).toEqual({ status: 'stale' });
      expect((await attempts())[0].liveSourceCheck).toBeNull();
    });

    it('runs the live GET check from encrypted credentials through to the persisted proof', async () => {
      await prepare();
      const lease = await execution().claimNext();
      if (!lease) throw Error('Expected lease');
      const request = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          new Response(calendarData, {
            headers: { ETag: resource.etag, 'Content-Type': 'text/calendar' },
          }),
        );
      const guard = new CalendarLiveSourceGuard(
        execution(),
        cipher,
        async (checked, credentials) => {
          expect(credentials.appPassword).toBe('test-secret');
          return checkCalendarResource(checked, request);
        },
      );
      expect((await guard.check(lease)).status).toBe('verified');
      expect(request).toHaveBeenCalledWith(
        resource.url,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'If-Match': resource.etag }),
        }),
      );
      expect((await attempts())[0]).toMatchObject({
        liveSourceCheck: {
          status: 'verified',
          resourceVersion: 1,
          etag: resource.etag,
        },
      });
    });

    it('reverses and reapplies the execution migration', async () => {
      await source.undoLastMigration({ transaction: 'all' });
      await source.runMigrations({ transaction: 'all' });
      expect(await attempts()).toEqual([]);
    });
  },
);
