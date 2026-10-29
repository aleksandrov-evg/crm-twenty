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
  'Calendar managed activation with isolated PostgreSQL',
  () => {
    const workspaceId = randomUUID();
    const id = randomUUID();
    const database = `calendar_activation_${randomUUID().replace(/-/g, '')}`;
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
      await source.query('TRUNCATE calendar_sync."calendarConnection" CASCADE');
    });

    afterAll(async () => {
      if (source?.isInitialized) await source.destroy();
      if (admin?.isInitialized) {
        await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
        await admin.destroy();
      }
    });

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
    };
    const activations = (binding: string) =>
      new CalendarActivationStore(
        source,
        { workspaceId, connectionId: id },
        binding,
      );

    it('activates exactly the prepared configuration and preserves the frozen intent', async () => {
      await prepare();
      const evidence = createCapabilityFixture(workspaceId).evidence;
      const before = await source.query(
        'SELECT * FROM calendar_sync."calendarSessionCreateIntent"',
      );
      const receipt = await activations(evidence.binding).activate(1, evidence);
      expect(receipt).toMatchObject({
        workspaceId,
        connectionId: id,
        configurationVersion: 1,
      });
      expect(await activations(evidence.binding).getActive()).toMatchObject({
        id: receipt.id,
      });
      expect(
        await activations(evidence.binding).activate(1, {
          ...evidence,
          checkedAt: new Date().toISOString(),
        }),
      ).toMatchObject({ id: receipt.id });
      expect(
        await source.query(
          'SELECT state, "configurationVersion" FROM calendar_sync."calendarConnection"',
        ),
      ).toEqual([{ state: 'ACTIVE', configurationVersion: 1 }]);
      expect(
        await source.query(
          'SELECT * FROM calendar_sync."calendarSessionCreateIntent"',
        ),
      ).toEqual(before);
    });

    it('does not accept a stale configuration or capability check', async () => {
      await prepare();
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await expect(
        activations(evidence.binding).activate(2, evidence),
      ).rejects.toThrow('CALENDAR_ACTIVATION_STATE_CHANGED');
      await expect(
        activations(evidence.binding).activate(1, {
          ...evidence,
          checkedAt: '2020-01-01T00:00:00Z',
        }),
      ).rejects.toThrow('CALENDAR_ACTIVATION_EVIDENCE_INVALID');
      expect(
        await source.query('SELECT * FROM calendar_sync."calendarActivation"'),
      ).toEqual([]);
    });

    it('requires a fresh complete snapshot and prepared events', async () => {
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await expect(
        activations(evidence.binding).activate(1, evidence),
      ).rejects.toThrow('CALENDAR_ACTIVATION_SNAPSHOT_REQUIRED');
      await poller.runOnce();
      await expect(
        activations(evidence.binding).activate(1, evidence),
      ).rejects.toThrow('CALENDAR_ACTIVATION_PREVIEW_REQUIRED');
      await new CalendarImportPreviewStore(source).runOnce();
      await source.query(
        `UPDATE calendar_sync."calendarConnection" SET "lastSuccessfulReadAt" = now() - interval '2 minutes'`,
      );
      await expect(
        activations(evidence.binding).activate(1, evidence),
      ).rejects.toThrow('CALENDAR_ACTIVATION_SNAPSHOT_REQUIRED');
    });

    it('does not activate from a recent but partial inventory', async () => {
      await prepare();
      await source.query('UPDATE calendar_sync."calendarConnection" SET "lastReadError" = $1', ['partial-snapshot']);
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await expect(activations(evidence.binding).activate(1, evidence)).rejects.toThrow('CALENDAR_ACTIVATION_SNAPSHOT_REQUIRED');
      expect(await source.query('SELECT * FROM calendar_sync."calendarActivation"')).toEqual([]);
    });

    it('blocks unresolved current reviews', async () => {
      reader.mockResolvedValue({
        status: 'snapshot',
        resources: [
          {
            ...resource,
            calendarData: calendarData.replace(
              'format=GROUP_REFORMER',
              'format=UNKNOWN',
            ),
          },
        ],
      });
      await poller.runOnce();
      await new CalendarImportPreviewStore(source).runOnce();
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await expect(
        activations(evidence.binding).activate(1, evidence),
      ).rejects.toThrow('CALENDAR_ACTIVATION_REVIEW_REQUIRED');
    });

    it('invalidates activation after pause and rejects token or workspace changes', async () => {
      await prepare();
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await activations(evidence.binding).activate(1, evidence);
      expect(await activations('rotated-token-binding').getActive()).toBeNull();
      await expect(
        activations('rotated-token-binding').activate(1, {
          ...evidence,
          binding: 'rotated-token-binding',
        }),
      ).rejects.toThrow('CALENDAR_ACTIVATION_BINDING_CHANGED');
      await connections.pause({ workspaceId, id }, 1);
      expect(await activations(evidence.binding).getActive()).toBeNull();
      await expect(
        activations(evidence.binding).activate(1, evidence),
      ).rejects.toThrow('CALENDAR_ACTIVATION_STATE_CHANGED');
    });

    it('requires a matching fresh runtime capability proof before a POST can start', async () => {
      await prepare();
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await activations(evidence.binding).activate(1, evidence);
      const store = new CalendarCreationExecutionStore(
        source,
        { workspaceId, connectionId: id },
        evidence.binding,
      );
      const lease = await store.claimNext();
      if (!lease) throw Error('Expected lease');
      await store.recordInspection(lease, { status: 'absent' });
      const guard = new CalendarLiveSourceGuard(
        store,
        cipher,
        async (checked) => ({ status: 'verified', ...checked }),
      );
      await guard.check(lease);
      expect(await store.beginSend(lease)).toBe(false);
      expect(
        await store.recordCapabilities(lease, {
          ...evidence,
          commandUpdatedAt: '2099-01-01T00:00:00Z',
        }),
      ).toBe(false);
      expect(await store.recordCapabilities(lease, evidence)).toBe(true);
      expect(await store.beginSend(lease)).toBe(true);
      expect(
        await source.query(
          'SELECT "activationId", "crmCapabilityCheck" FROM calendar_sync."calendarCreationAttempt"',
        ),
      ).toEqual([
        expect.objectContaining({
          activationId: expect.any(String),
          crmCapabilityCheck: evidence,
        }),
      ]);
    });

    it('does not send with an expired capability proof or too little remaining lease time', async () => {
      await prepare();
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await activations(evidence.binding).activate(1, evidence);
      const store = new CalendarCreationExecutionStore(
        source,
        { workspaceId, connectionId: id },
        evidence.binding,
      );
      const lease = await store.claimNext();
      if (!lease) throw Error('Expected lease');
      await store.recordInspection(lease, { status: 'absent' });
      await new CalendarLiveSourceGuard(store, cipher, async (checked) => ({
        status: 'verified',
        ...checked,
      })).check(lease);
      await store.recordCapabilities(lease, evidence);
      await source.query(
        `UPDATE calendar_sync."calendarCreationAttempt" SET "crmCapabilitiesCheckedAt" = now() - interval '61 seconds'`,
      );
      expect(await store.beginSend(lease)).toBe(false);
      await store.recordCapabilities(lease, evidence);
      await source.query(
        `UPDATE calendar_sync."calendarCreationExecution" SET "leaseUntil" = now() + interval '40 seconds'`,
      );
      expect(await store.beginSend(lease)).toBe(false);
    });

    it('creates through the configured sender only after activation, fresh CRM checks and a live conditional GET', async () => {
      await prepare();
      const fixture = createCapabilityFixture(workspaceId);
      await activations(fixture.evidence.binding).activate(1, fixture.evidence);
      const sessionId = randomUUID();
      const payload = (
        await source.query(
          'SELECT payload FROM calendar_sync."calendarSessionCreateIntent"',
        )
      )[0].payload;
      let created = false;
      const writes: unknown[] = [];
      const page = (object: string, values: unknown[]) =>
        Response.json({
          data: { [object]: values },
          pageInfo: { hasNextPage: false },
        });
      const request = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, options) => {
          const url = new URL(String(input));
          if (url.pathname === '/metadata')
            return Response.json(fixture.metadata);
          if (url.pathname === '/rest/classSessions') {
            if (
              !created ||
              url.searchParams.get('filter')?.endsWith('0'.repeat(64))
            )
              return page('classSessions', []);
            return page('classSessions', [
              {
                id: sessionId,
                recordingKey: `session-create:${payload.idempotencyKey}`,
                name: payload.name,
                sessionFormat: payload.sessionFormat,
                startsAt: payload.startsAt,
                endsAt: '2099-01-10T10:00:00Z',
                capacity: payload.capacity,
                status: 'PLANNED',
                creationRequest: JSON.stringify({
                  status: 'PLANNED',
                  participants: [],
                  attendanceReason: '',
                }),
              },
            ]);
          }
          if (url.pathname === '/rest/studioEvents') {
            if (
              url.searchParams
                .get('filter')
                ?.endsWith('00000000-0000-0000-0000-000000000000')
            )
              return page('studioEvents', []);
            return page('studioEvents', [
              {
                id: sessionId,
                classSessionId: sessionId,
                eventType: 'SESSION_CREATED',
                outcome: 'SUCCESS',
                idempotencyKey: payload.idempotencyKey,
                details: JSON.stringify({
                  name: payload.name,
                  startsAt: payload.startsAt,
                  endsAt: '2099-01-10T10:00:00Z',
                  capacity: payload.capacity,
                  status: 'PLANNED',
                  participants: [],
                  attendanceReason: '',
                }),
              },
            ]);
          }
          if (
            url.pathname === '/s/studio/sessions/create' &&
            options?.method === 'POST'
          ) {
            writes.push(JSON.parse(String(options.body)));
            created = true;
            return Response.json({
              success: true,
              classSessionId: sessionId,
              duplicate: false,
            });
          }
          throw Error('Unexpected request');
        });
      const caldav = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          new Response(calendarData, {
            headers: { ETag: resource.etag, 'Content-Type': 'text/calendar' },
          }),
        );
      jest
        .mocked(createYandexCalDavTransport)
        .mockReturnValue({ fetch: caldav, close: async () => undefined });
      try {
        const configure = configureCalendarCreationWorker({
          CALENDAR_CREATION_RECOVERY_ENABLED: 'true',
          CALENDAR_LIVE_SOURCE_CHECK_ENABLED: 'true',
          CALENDAR_CREATE_SEND_ENABLED: 'true',
          TWENTY_WORKSPACE_ID: workspaceId,
          CALENDAR_CONNECTION_ID: id,
          TWENTY_API_URL: CRM_TEST_CONFIGURATION.baseUrl,
          TWENTY_API_TOKEN: CRM_TEST_CONFIGURATION.apiToken,
          CALENDAR_ENCRYPTION_KEY: 'ab'.repeat(32),
        });
        if (!configure) throw Error('Expected worker factory');
        expect(await configure(source).runOnce()).toBe('saved');
        expect(await configure(source).runOnce()).toBe('idle');
        expect(writes).toEqual([payload]);
        expect(caldav).toHaveBeenCalledWith(
          resource.url,
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ 'If-Match': resource.etag }),
          }),
        );
        expect(
          await source.query(
            'SELECT state FROM calendar_sync."calendarCreationExecution"',
          ),
        ).toEqual([{ state: 'CONFIRMED' }]);
        expect(
          await source.query(
            'SELECT "activationId", "crmCapabilityCheck", "liveSourceCheck", "sendResult" FROM calendar_sync."calendarCreationAttempt"',
          ),
        ).toEqual([
          expect.objectContaining({
            activationId: expect.any(String),
            crmCapabilityCheck: expect.objectContaining({
              binding: fixture.evidence.binding,
            }),
            liveSourceCheck: expect.objectContaining({ status: 'verified' }),
            sendResult: {
              status: 'confirmed',
              classSessionId: sessionId,
              duplicate: false,
            },
          }),
        ]);
      } finally {
        request.mockRestore();
        jest.mocked(createYandexCalDavTransport).mockReset();
      }
    });

    it('can pause without credentials or the encryption key and immediately invalidates activation', async () => {
      await prepare();
      const evidence = createCapabilityFixture(workspaceId).evidence;
      await activations(evidence.binding).activate(1, evidence);
      const paused = await new CalendarConnectionStore(source).pause(
        { workspaceId, id },
        1,
      );
      expect(paused).toMatchObject({
        state: 'PAUSED',
        configurationVersion: 2,
      });
      expect(await activations(evidence.binding).getActive()).toBeNull();
      expect(
        await new CalendarConnectionStore(source).pause({ workspaceId, id }, 1),
      ).toBeNull();
    });

    it('reverses and reapplies the activation migration', async () => {
      await source.undoLastMigration({ transaction: 'all' });
      await source.undoLastMigration({ transaction: 'all' });
      await source.runMigrations({ transaction: 'all' });
      expect(
        await source.query('SELECT * FROM calendar_sync."calendarActivation"'),
      ).toEqual([]);
    });
  },
);
