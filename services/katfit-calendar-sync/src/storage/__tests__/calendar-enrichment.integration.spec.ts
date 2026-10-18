import { createHash } from 'node:crypto';
import { CalendarDescriptionStore } from '../calendar-description.store';
import { CalendarDescriptionPreparer } from '../../enrichment/calendar-description-preparer';
import { CalendarDescriptionPublisher } from '../../enrichment/calendar-description-publisher';
import { CalendarCreationFinalizer } from '../../enrichment/calendar-creation-finalizer';
import { type CalendarCrmSession } from '../../crm/find-calendar-session';
import { type CalendarRoster } from '../../crm/read-calendar-roster';
import { FinalizeCalendarCreation1792246000000 } from '../../migrations/1792246000000-finalize-calendar-creation';
import { configureCalendarCreationWorker } from '../../creation/configure-calendar-creation-worker';
import { createYandexCalDavTransport } from '../../transport/create-yandex-caldav-transport';
import { CRM_TEST_CONFIGURATION } from '../../crm/__tests__/fixtures/calendar-capability-fixture';
jest.mock('../../transport/create-yandex-caldav-transport', () => ({
  createYandexCalDavTransport: jest.fn(),
}));
import { CreateCalendarActivation1792245000000 } from '../../migrations/1792245000000-create-calendar-activation';
import { CalendarActivationStore } from '../calendar-activation.store';
import { createCapabilityFixture } from '../../crm/__tests__/fixtures/calendar-capability-fixture';
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
  'Calendar finalization and reverse enrichment with isolated PostgreSQL',
  () => {
    const workspaceId = randomUUID();
    const id = randomUUID();
    const database = `calendar_enrichment_${randomUUID().replace(/-/g, '')}`;
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
          CreateCalendarActivation1792245000000,
          FinalizeCalendarCreation1792246000000,
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

    const scope = { workspaceId, connectionId: id };
    const prepare = async () => {
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      await new CalendarCrmReconciler(
        new CalendarCrmReconciliationStore(source, scope),
        async () => ({ status: 'not-found' }),
      ).runOnce();
      await new CalendarSessionIntentStore(source, scope).runOnce();
      const payload = (
        await source.query(
          'SELECT payload FROM calendar_sync."calendarSessionCreateIntent"',
        )
      )[0].payload;
      const session: CalendarCrmSession = {
        id: randomUUID(),
        recordingKey: `session-create:${payload.idempotencyKey}`,
        name: payload.name,
        startsAt: payload.startsAt,
        endsAt: new Date(
          Date.parse(payload.startsAt) + payload.durationMinutes * 60000,
        ).toISOString(),
        capacity: payload.capacity,
        sessionFormat: payload.sessionFormat,
        status: 'PLANNED',
      };
      return { payload, session };
    };
    const confirm = async (
      session: CalendarCrmSession,
      includeSnapshot = true,
    ) => {
      const worker = new CalendarCreationWorker(
        new CalendarCreationExecutionStore(source, scope),
        async () => ({
          status: 'confirmed',
          classSessionId: session.id,
          recordingKey: session.recordingKey,
          ...(includeSnapshot ? { session } : {}),
        }),
      );
      expect(await worker.runOnce()).toBe('saved');
    };
    const roster = (): CalendarRoster => {
      const participants = [
        {
          personId: '2fb80061-5573-46b6-9c69-e2673d523776',
          name: 'Анна Иванова',
        },
        {
          personId: 'f4071e4f-93a5-49be-afcd-3d319c116eb7',
          name: 'Анна Иванова',
        },
      ];
      return {
        status: 'read',
        participants,
        rosterHash: createHash('sha256')
          .update(JSON.stringify(participants))
          .digest('hex'),
      };
    };
    const draft = async () =>
      new CalendarDescriptionPreparer(
        new CalendarDescriptionStore(source, scope),
        async () => roster(),
      ).runOnce();
    const activate = async () => {
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await new CalendarActivationStore(
        source,
        scope,
        evidence.binding,
      ).activate(1, evidence);
      return evidence;
    };
    const fakeTransport = (
      initial = calendarData,
      initialEtag = resource.etag,
    ) => {
      let remote = initial,
        etag = initialEtag,
        failAfterWrite = false;
      const calls: string[] = [];
      const request = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockImplementation(async (input, options) => {
          const request = new Request(input, options);
          calls.push(request.method);
          if (request.method === 'PUT') {
            expect(request.headers.get('If-Match')).toBe(resource.etag);
            remote = await request.text();
            etag = '"written"';
            if (failAfterWrite) throw Error('Lost PUT response');
            return new Response(null, { status: 204, headers: { ETag: etag } });
          }
          if (request.method !== 'GET') throw Error('Unexpected method');
          if (failAfterWrite && etag === '"written"')
            throw Error('Temporary GET failure');
          return new Response(remote, {
            headers: { ETag: etag, 'Content-Type': 'text/calendar' },
          });
        });
      const factory = jest
        .fn<
          ReturnType<typeof createYandexCalDavTransport>,
          Parameters<typeof createYandexCalDavTransport>
        >()
        .mockReturnValue({ fetch: request, close: async () => undefined });
      return {
        factory,
        calls,
        remote: () => remote,
        setLost: (lost: boolean) => {
          failAfterWrite = lost;
        },
      };
    };

    it('atomically links UID, records a common base, applies inbox and schedules enrichment', async () => {
      const { session } = await prepare();
      await confirm(session);
      expect(
        await source.query(
          'SELECT uid, "classSessionId", "commonBase", "baseResourceVersion" FROM calendar_sync."calendarSessionLink"',
        ),
      ).toEqual([
        expect.objectContaining({
          uid: 'one',
          classSessionId: session.id,
          commonBase: expect.objectContaining({ name: session.name }),
          baseResourceVersion: 1,
        }),
      ]);
      expect(
        await source.query(
          'SELECT state, "finalizationState" FROM calendar_sync."calendarCreationExecution"',
        ),
      ).toEqual([{ state: 'CONFIRMED', finalizationState: 'LINKED' }]);
      expect(
        await source.query('SELECT state FROM calendar_sync."calendarInbox"'),
      ).toEqual([{ state: 'APPLIED' }]);
      expect(
        await source.query(
          'SELECT uid FROM calendar_sync."calendarDescriptionRefresh"',
        ),
      ).toEqual([{ uid: 'one' }]);
      expect(
        await source.query(
          'SELECT decision FROM calendar_sync."calendarCrmReconciliation"',
        ),
      ).toEqual([{ decision: 'LINKED' }]);
    });

    it('backfills previously confirmed creations with a fresh API read', async () => {
      const { session } = await prepare();
      await confirm(session, false);
      expect(
        await source.query('SELECT * FROM calendar_sync."calendarSessionLink"'),
      ).toEqual([]);
      const finalizer = new CalendarCreationFinalizer(
        source,
        scope,
        async () => ({ status: 'matched', session }),
      );
      expect(await finalizer.runOnce()).toBe('saved');
      expect(await finalizer.runOnce()).toBe('idle');
      expect(
        await source.query(
          'SELECT "finalizationState" FROM calendar_sync."calendarCreationExecution"',
        ),
      ).toEqual([{ finalizationState: 'LINKED' }]);
    });

    it('preserves identity but refuses a common base when schedules diverged after creation', async () => {
      const { session } = await prepare();
      await source.query(
        'UPDATE calendar_sync."calendarResource" SET "calendarData" = $1, "resourceVersion" = 2',
        [calendarData.replace('SUMMARY:Тренировка', 'SUMMARY:Перенесено')],
      );
      await confirm(session);
      expect(
        await source.query(
          'SELECT uid, "commonBase" FROM calendar_sync."calendarSessionLink"',
        ),
      ).toEqual([{ uid: 'one', commonBase: null }]);
      expect(
        await source.query(
          'SELECT "finalizationState", "finalizationReason" FROM calendar_sync."calendarCreationExecution"',
        ),
      ).toEqual([
        {
          finalizationState: 'NEEDS_REVIEW',
          finalizationReason: 'FINALIZATION_SCHEDULE_DIVERGED',
        },
      ]);
      expect(
        await source.query('SELECT state FROM calendar_sync."calendarInbox"'),
      ).toEqual([{ state: 'PENDING' }]);
    });

    it('prepares an immutable description outbox and does not clear names on a reader failure', async () => {
      const { session } = await prepare();
      await confirm(session);
      expect(await draft()).toBe('saved');
      const first = await source.query(
        'SELECT payload FROM calendar_sync."studioCalendarOperation"',
      );
      expect(first).toEqual([
        expect.objectContaining({
          payload: expect.objectContaining({
            kind: 'ENRICH_DESCRIPTION',
            classSessionId: session.id,
          }),
        }),
      ]);
      await source.query(
        'UPDATE calendar_sync."calendarDescriptionRefresh" SET "nextAttemptAt" = now()',
      );
      await new CalendarDescriptionPreparer(
        new CalendarDescriptionStore(source, scope),
        async () => ({ status: 'unavailable' }),
      ).runOnce();
      expect(
        await source.query(
          'SELECT payload FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual(first);
      await source.query(
        'UPDATE calendar_sync."calendarDescriptionRefresh" SET "nextAttemptAt" = now()',
      );
      await draft();
      expect(
        await source.query(
          'SELECT id FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toHaveLength(1);
    });

    it('waits in PREVIEW and publishes names with If-Match only after activation', async () => {
      const { session } = await prepare();
      await confirm(session);
      await draft();
      const evidence = createCapabilityFixture(workspaceId).evidence;
      const transport = fakeTransport();
      const publisher = new CalendarDescriptionPublisher(
        source,
        scope,
        evidence.binding,
        cipher,
        async () => ({ status: 'matched', session }),
        async () => roster(),
        transport.factory,
      );
      expect(await publisher.runOnce()).toBe('idle');
      expect(transport.calls).toEqual([]);
      await new CalendarActivationStore(
        source,
        scope,
        evidence.binding,
      ).activate(1, evidence);
      expect(await publisher.runOnce()).toBe('saved');
      expect(transport.calls).toEqual(['GET', 'PUT', 'GET']);
      expect(transport.remote()).toContain('X-KATFIT-SESSION-ID:');
      expect(
        await source.query(
          'SELECT state FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual([{ state: 'SUCCEEDED' }]);
    });

    it('recovers a lost PUT response without writing the same event again', async () => {
      const { session } = await prepare();
      await confirm(session);
      await draft();
      const evidence = await activate();
      const transport = fakeTransport();
      transport.setLost(true);
      const makePublisher = () =>
        new CalendarDescriptionPublisher(
          source,
          scope,
          evidence.binding,
          cipher,
          async () => ({ status: 'matched', session }),
          async () => roster(),
          transport.factory,
        );
      expect(await makePublisher().runOnce()).toBe('saved');
      expect(
        await source.query(
          'SELECT state, "requiresReconciliation" FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual([{ state: 'RETRY', requiresReconciliation: true }]);
      transport.setLost(false);
      await source.query(
        'UPDATE calendar_sync."studioCalendarOperation" SET "nextAttemptAt" = now()',
      );
      expect(await makePublisher().runOnce()).toBe('saved');
      expect(transport.calls.filter((method) => method === 'PUT')).toHaveLength(
        1,
      );
      expect(
        await source.query(
          'SELECT state FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual([{ state: 'SUCCEEDED' }]);
    });

    it('does not overwrite a concurrent calendar edit', async () => {
      const { session } = await prepare();
      await confirm(session);
      await draft();
      const evidence = await activate();
      const transport = fakeTransport(
        calendarData.replace('DESCRIPTION:', 'DESCRIPTION:Новый комментарий\n'),
        '"edited"',
      );
      await new CalendarDescriptionPublisher(
        source,
        scope,
        evidence.binding,
        cipher,
        async () => ({ status: 'matched', session }),
        async () => roster(),
        transport.factory,
      ).runOnce();
      expect(transport.calls).toEqual(['GET']);
      expect(
        await source.query(
          'SELECT state FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual([{ state: 'CONFLICT' }]);
    });

    it('supersedes a draft if clients changed and never sends stale names', async () => {
      const { session } = await prepare();
      await confirm(session);
      await draft();
      const evidence = await activate();
      const transport = fakeTransport();
      await new CalendarDescriptionPublisher(
        source,
        scope,
        evidence.binding,
        cipher,
        async () => ({ status: 'matched', session }),
        async () => ({
          status: 'read',
          participants: [],
          rosterHash: '0'.repeat(64),
        }),
        transport.factory,
      ).runOnce();
      expect(transport.calls).toEqual([]);
      expect(
        await source.query(
          'SELECT state FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual([{ state: 'SUPERSEDED' }]);
    });

    it('rolls back link and inbox changes if common-base persistence fails', async () => {
      const { session } = await prepare();
      await source.query(
        `ALTER TABLE calendar_sync."calendarSessionLink" ADD CONSTRAINT reject_test_base CHECK ("commonBase" IS NULL)`,
      );
      try {
        const worker = new CalendarCreationWorker(
          new CalendarCreationExecutionStore(source, scope),
          async () => ({
            status: 'confirmed',
            classSessionId: session.id,
            recordingKey: session.recordingKey,
            session,
          }),
        );
        await expect(worker.runOnce()).rejects.toThrow();
        expect(
          await source.query(
            'SELECT * FROM calendar_sync."calendarSessionLink"',
          ),
        ).toEqual([]);
        expect(
          await source.query('SELECT state FROM calendar_sync."calendarInbox"'),
        ).toEqual([{ state: 'PENDING' }]);
        expect(
          await source.query(
            'SELECT * FROM calendar_sync."calendarDescriptionRefresh"',
          ),
        ).toEqual([]);
      } finally {
        await source.query(
          'ALTER TABLE calendar_sync."calendarSessionLink" DROP CONSTRAINT reject_test_base',
        );
      }
    });

    it('rolls back the outbox when the description job cannot be acknowledged', async () => {
      const { session } = await prepare();
      await confirm(session);
      await source.query(
        `ALTER TABLE calendar_sync."calendarDescriptionRefresh" ADD CONSTRAINT reject_test_ack CHECK ("lastResult" IS DISTINCT FROM 'PREPARED')`,
      );
      try {
        await expect(draft()).rejects.toThrow();
        expect(
          await source.query(
            'SELECT * FROM calendar_sync."studioCalendarOperation"',
          ),
        ).toEqual([]);
      } finally {
        await source.query(
          'ALTER TABLE calendar_sync."calendarDescriptionRefresh" DROP CONSTRAINT reject_test_ack',
        );
      }
    });

    it('rejects a draft prepared for a stale calendar version', async () => {
      const { session } = await prepare();
      await confirm(session);
      const store = new CalendarDescriptionStore(source, scope);
      const lease = await store.claimNext();
      if (!lease) throw Error('Expected lease');
      await source.query(
        'UPDATE calendar_sync."calendarResource" SET "resourceVersion" = "resourceVersion" + 1',
      );
      expect(await store.settle(lease, roster())).toBe(false);
      expect(
        await source.query(
          'SELECT * FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual([]);
    });

    it('reverses and reapplies finalization tables', async () => {
      await source.undoLastMigration({ transaction: 'all' });
      await source.runMigrations({ transaction: 'all' });
      expect(
        await source.query(
          'SELECT * FROM calendar_sync."calendarDescriptionRefresh"',
        ),
      ).toEqual([]);
    });
  },
);
