import { createHash, randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { type CalendarCrmSession } from '../../crm/find-calendar-session';
import { createCapabilityFixture } from '../../crm/__tests__/fixtures/calendar-capability-fixture';
import { CreateCrmExportIntent1792251000000 } from '../../migrations/1792251000000-create-crm-export-intent';
import { CalendarDescriptionPreparer } from '../../enrichment/calendar-description-preparer';
import { CalendarSchedulePreparer } from '../../schedule/calendar-schedule-worker';
import { CalendarDescriptionStore } from '../../storage/calendar-description.store';
import { CalendarScheduleStore } from '../../storage/calendar-schedule.store';
import { CalendarPoller } from '../../polling/calendar-poller';
import { CalendarCrmReconciler } from '../../reconciliation/calendar-crm-reconciler';
import { CalendarCredentialCipher } from '../../security/calendar-credential-cipher';
import { CalendarActivationStore } from '../../storage/calendar-activation.store';
import { CalendarConnectionStore } from '../../storage/calendar-connection.store';
import { CalendarCrmExportStore } from '../../storage/calendar-crm-export.store';
import { CalendarCrmReconciliationStore } from '../../storage/calendar-crm-reconciliation.store';
import { CalendarImportPreviewStore } from '../../storage/calendar-import-preview.store';
import { CalendarPollStore } from '../../storage/calendar-poll.store';
import { CalendarSessionIntentStore } from '../../storage/calendar-session-intent.store';
import { createCalendarDataSource } from '../../storage/create-calendar-data-source';
import { executeCrmOriginExport } from '../../transport/execute-crm-origin-export';
import { CalendarCrmExportWorker } from '../calendar-crm-export-worker';

const socketPath = process.env.STUDIO_CALENDAR_TEST_SOCKET;
const describeWithDatabase = socketPath ? describe : describe.skip;
describeWithDatabase(
  'CRM-origin session full roundtrip with isolated PostgreSQL',
  () => {
    const fixture = createCapabilityFixture();
    const workspaceId = fixture.workspaceId;
    const connectionId = randomUUID();
    const scope = { workspaceId, connectionId };
    const database = `calendar_crm_roundtrip_${randomUUID().replace(/-/g, '')}`;
    const calendarUrl = 'https://caldav.yandex.ru/calendars/test/roundtrip/';
    const cipher = new CalendarCredentialCipher('primary', {
      primary: 'ab'.repeat(32),
    });
    const session: CalendarCrmSession = {
      id: randomUUID(),
      recordingKey: `session-create:${randomUUID()}`,
      name: 'Группа из CRM',
      startsAt: '2099-01-01T12:00:00.000Z',
      endsAt: '2099-01-01T13:00:00.000Z',
      sessionFormat: 'GROUP_REFORMER',
      capacity: 4,
      status: 'PLANNED',
    };
    let admin: DataSource;
    let source: DataSource;
    let remote: { url: string; calendarData: string; etag: string } | null;
    let writes: number;
    let loseWriteReply: boolean;
    let failReads: boolean;
    const fetch: typeof globalThis.fetch = async (url, options) => {
      const request = new Request(url, options);
      if (request.method === 'PUT') {
        expect(request.headers.get('If-None-Match')).toBe('*');
        writes++;
        remote = {
          url: request.url,
          calendarData: await request.text(),
          etag: '"created-once"',
        };
        if (loseWriteReply) {
          failReads = true;
          throw Error('Lost PUT response');
        }
        return new Response(null, { status: 201 });
      }
      if (request.method !== 'GET') throw Error('Unexpected network method');
      if (failReads) throw Error('Temporary GET outage');
      return remote
        ? new Response(remote.calendarData, {
            status: 200,
            headers: { ETag: remote.etag, 'Content-Type': 'text/calendar' },
          })
        : new Response(null, { status: 404 });
    };
    const poll = async () => {
      await source.query(
        'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
      );
      const result = await new CalendarPoller(
        new CalendarPollStore(source, cipher),
        async () => ({ status: 'snapshot', resources: remote ? [remote] : [] }),
      ).runOnce();
      expect(result).toBe('saved');
    };
    const worker = () =>
      new CalendarCrmExportWorker(
        new CalendarCrmExportStore(source, scope, fixture.evidence.binding),
        {
          sendEnabled: true,
          list: async () => ({
            status: 'read',
            sessions: [session],
            needsReview: [],
          }),
          lookup: async () => ({ status: 'matched', session }),
          checkCapabilities: async () => true,
          execute: (command, _lease, authorizeCreate) =>
            executeCrmOriginExport(command, {
              calendarUrl,
              fetch,
              authorizeCreate,
            }),
        },
      );
    const due = () =>
      source.query(
        'UPDATE calendar_sync."calendarCrmExportIntent" SET "nextAttemptAt" = now()',
      );
    beforeAll(async () => {
      if (!socketPath?.startsWith('/tmp/studio-caldav-postgres.'))
        throw Error('An isolated test socket is required');
      const options = {
        type: 'postgres' as const,
        host: socketPath,
        port: 55439,
        username: 'postgres',
        database: 'postgres',
      };
      admin = await new DataSource(options).initialize();
      await admin.query(`CREATE DATABASE "${database}"`);
      const registered = createCalendarDataSource(
        'postgres://postgres@localhost/calendar_test',
      ).options.migrations;
      if (!Array.isArray(registered))
        throw Error('Explicit migrations required');
      const migrations = registered.includes(CreateCrmExportIntent1792251000000)
        ? registered
        : [...registered, CreateCrmExportIntent1792251000000];
      source = await new DataSource({
        ...options,
        database,
        schema: 'calendar_sync',
        migrationsTableName: 'migrations',
        migrations,
      }).initialize();
      await source.query('CREATE SCHEMA calendar_sync');
      await source.runMigrations({ transaction: 'all' });
    });
    beforeEach(async () => {
      remote = null;
      writes = 0;
      loseWriteReply = false;
      failReads = false;
      await new CalendarConnectionStore(source, cipher).createPreview({
        id: connectionId,
        workspaceId,
        username: 'trainer@yandex.ru',
        appPassword: 'test-secret',
        timezone: 'Europe/Moscow',
        calendar: {
          url: calendarUrl,
          displayName: 'Закрытый календарь',
          reports: [],
          writeAccess: 'unverified',
        },
      });
      await poll();
      await new CalendarActivationStore(
        source,
        scope,
        fixture.evidence.binding,
      ).activate(1, {
        ...fixture.evidence,
        checkedAt: new Date().toISOString(),
      });
    });
    afterEach(async () => {
      await source.query('TRUNCATE calendar_sync."studioCalendarOperation"');
      await source.query('TRUNCATE calendar_sync."calendarConnection" CASCADE');
    });
    afterAll(async () => {
      if (source?.isInitialized) await source.destroy();
      if (admin?.isInitialized) {
        await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
        await admin.destroy();
      }
    });
    it('exports one UI-created session, fences reimport before linking, then confirms common base and repeats without another PUT', async () => {
      expect(await worker().runOnce()).toBe('saved');
      expect(writes).toBe(1);
      expect(
        await source.query(
          'SELECT state FROM calendar_sync."calendarCrmExportIntent"',
        ),
      ).toEqual([{ state: 'WRITTEN' }]);
      await poll();
      expect(await new CalendarImportPreviewStore(source).runOnce()).toBe(
        'prepared',
      );
      const importedLookup = jest.fn(async () => ({
        status: 'not-found' as const,
      }));
      await new CalendarCrmReconciler(
        new CalendarCrmReconciliationStore(source, scope),
        importedLookup,
      ).runOnce();
      await new CalendarSessionIntentStore(source, scope).runOnce();
      expect(
        await source.query(
          'SELECT * FROM calendar_sync."calendarSessionCreateIntent"',
        ),
      ).toHaveLength(0);
      await due();
      expect(await worker().runOnce()).toBe('saved');
      const links = await source.query(
        'SELECT "classSessionId", "recordingKey", "commonBase", "baseResourceVersion", "baseEtag" FROM calendar_sync."calendarSessionLink"',
      );
      expect(links).toEqual([
        {
          classSessionId: session.id,
          recordingKey: session.recordingKey,
          commonBase: {
            name: session.name,
            interval: {
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              timezone: 'UTC',
            },
          },
          baseResourceVersion: 1,
          baseEtag: '"created-once"',
        },
      ]);
      expect(
        await source.query('SELECT state FROM calendar_sync."calendarInbox"'),
      ).toEqual([{ state: 'APPLIED' }]);
      expect(
        await source.query(
          'SELECT state FROM calendar_sync."calendarCrmExportIntent"',
        ),
      ).toEqual([{ state: 'CONFIRMED' }]);
      await new CalendarCrmReconciler(
        new CalendarCrmReconciliationStore(source, scope),
        importedLookup,
      ).runOnce();
      await new CalendarSessionIntentStore(source, scope).runOnce();
      expect(
        await source.query(
          'SELECT * FROM calendar_sync."calendarSessionCreateIntent"',
        ),
      ).toHaveLength(0);
      const linkedLookup = jest.fn(async () => ({
        status: 'matched' as const,
        session,
      }));
      expect(
        await new CalendarSchedulePreparer(
          new CalendarScheduleStore(source, scope, fixture.evidence.binding),
          linkedLookup,
        ).runOnce(),
      ).toBe('unchanged');
      expect(linkedLookup).toHaveBeenCalledWith(session.recordingKey);
      const rosterReader = jest.fn(async () => ({
        status: 'read' as const,
        participants: [],
        rosterHash: createHash('sha256').update('[]').digest('hex'),
      }));
      expect(
        await new CalendarDescriptionPreparer(
          new CalendarDescriptionStore(source, scope),
          rosterReader,
        ).runOnce(),
      ).toBe('saved');
      expect(rosterReader).toHaveBeenCalledWith(session.id);
      const enrichment = await source.query(
        'SELECT payload FROM calendar_sync."studioCalendarOperation" WHERE action = \'EXPORT_EVENT\'',
      );
      expect(enrichment).toHaveLength(1);
      expect(enrichment[0].payload).toMatchObject({
        classSessionId: session.id,
        recordingKey: session.recordingKey,
      });
      await due();
      expect(await worker().runOnce()).toBe('idle');
      expect(writes).toBe(1);
    });
    it('recovers a durable send with lost PUT reply after process restart using GET only', async () => {
      loseWriteReply = true;
      expect(await worker().runOnce()).toBe('saved');
      expect(writes).toBe(1);
      const intents = await source.query(
        'SELECT "sendStartedAt" FROM calendar_sync."calendarCrmExportIntent"',
      );
      expect(intents[0].sendStartedAt).toBeInstanceOf(Date);
      loseWriteReply = false;
      failReads = false;
      await poll();
      await due();
      expect(await worker().runOnce()).toBe('saved');
      expect(
        await source.query(
          'SELECT state FROM calendar_sync."calendarCrmExportIntent"',
        ),
      ).toEqual([{ state: 'CONFIRMED' }]);
      expect(
        await source.query(
          'SELECT "classSessionId" FROM calendar_sync."calendarSessionLink"',
        ),
      ).toEqual([{ classSessionId: session.id }]);
      expect(writes).toBe(1);
    });
  },
);
