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

describeWithDatabase('Calendar create intents with isolated PostgreSQL', () => {
  const workspaceId = randomUUID();
  const id = randomUUID();
  const database = `calendar_intents_${randomUUID().replace(/-/g, '')}`;
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

  const intents = () =>
    new CalendarSessionIntentStore(source, { workspaceId, connectionId: id });
  const records = () =>
    source.query('SELECT * FROM calendar_sync."calendarSessionCreateIntent"');
  const prepare = async () => {
    await poller.runOnce();
    const preview = new CalendarImportPreviewStore(source);
    while ((await preview.runOnce()) !== 'idle') {}
    const store = new CalendarCrmReconciliationStore(source, {
      workspaceId,
      connectionId: id,
    });
    const worker = new CalendarCrmReconciler(store, async () => ({
      status: 'not-found',
    }));
    while ((await worker.runOnce()) !== 'idle') {}
  };

  it('freezes a planned command without participants or external writes', async () => {
    await prepare();
    expect(await intents().runOnce()).toBe('prepared');
    expect(await intents().runOnce()).toBe('idle');
    expect(await records()).toEqual([
      expect.objectContaining({
        state: 'PREPARED',
        reason: null,
        payload: expect.objectContaining({
          name: 'Тренировка',
          status: 'PLANNED',
          participants: [],
          capacity: 6,
        }),
      }),
    ]);
    expect(
      await source.query('SELECT * FROM calendar_sync."calendarSessionLink"'),
    ).toEqual([]);
  });

  it('serializes concurrent preparation', async () => {
    await prepare();
    const outcomes = await Promise.all([
      intents().runOnce(),
      intents().runOnce(),
    ]);
    expect(outcomes.sort()).toEqual(['idle', 'prepared']);
    expect(await records()).toHaveLength(1);
  });

  it('preserves the first command after the event changes', async () => {
    await prepare();
    await intents().runOnce();
    const original = (await records())[0];
    await source.query(
      'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
    );
    reader.mockResolvedValue({
      status: 'snapshot',
      resources: [
        {
          ...resource,
          etag: '"new"',
          calendarData: calendarData.replace('capacity=6', 'capacity=8'),
        },
      ],
    });
    await prepare();
    await intents().runOnce();
    expect(await records()).toEqual([
      expect.objectContaining({
        idempotencyKey: original.idempotencyKey,
        payload: original.payload,
        inboxId: original.inboxId,
        state: 'NEEDS_REVIEW',
        reason: 'SOURCE_CHANGED_AFTER_PREPARATION',
      }),
    ]);
    expect(await intents().runOnce()).toBe('idle');
  });

  it('checks duplicate UID in raw resources even if the duplicate cannot become READY', async () => {
    reader.mockResolvedValue({
      status: 'snapshot',
      resources: [
        resource,
        {
          ...resource,
          url: `${calendarUrl}copy.ics`,
          calendarData: calendarData.replace(
            'DTSTART:20990110T090000Z',
            'DTSTART;VALUE=DATE:20990110',
          ),
        },
      ],
    });
    await prepare();
    await intents().runOnce();
    expect(await records()).toEqual([
      expect.objectContaining({
        state: 'NEEDS_REVIEW',
        reason: 'DUPLICATE_OR_MISSING_UID',
      }),
    ]);
  });

  it('requires review when another raw resource has no trustworthy identity', async () => {
    reader.mockResolvedValue({
      status: 'snapshot',
      resources: [
        resource,
        {
          ...resource,
          url: `${calendarUrl}broken.ics`,
          calendarData:
            'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR',
        },
      ],
    });
    await prepare();
    await intents().runOnce();
    expect(await records()).toEqual([
      expect.objectContaining({
        state: 'NEEDS_REVIEW',
        reason: 'UNVERIFIABLE_RESOURCE_IDENTITY',
      }),
    ]);
  });

  it('excludes paused and differently scoped connections', async () => {
    await prepare();
    expect(
      await new CalendarSessionIntentStore(source, {
        workspaceId: randomUUID(),
        connectionId: id,
      }).runOnce(),
    ).toBe('idle');
    await source.query(
      `UPDATE calendar_sync."calendarConnection" SET state = 'PAUSED'`,
    );
    expect(await intents().runOnce()).toBe('idle');
    expect(await records()).toEqual([]);
  });

  it('does not prepare an absent event or an old configuration', async () => {
    await prepare();
    await source.query(
      'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
    );
    reader.mockResolvedValue({ status: 'snapshot', resources: [] });
    await poller.runOnce();
    expect(await intents().runOnce()).toBe('idle');
    expect(await records()).toEqual([]);
  });

  it('reverses and reapplies the intent migration', async () => {
    await source.undoLastMigration({ transaction: 'all' });
    await source.runMigrations({ transaction: 'all' });
    expect(await records()).toEqual([]);
  });
});
