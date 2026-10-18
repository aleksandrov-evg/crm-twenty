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

describeWithDatabase('Calendar import preview with isolated PostgreSQL', () => {
  const workspaceId = randomUUID();
  const id = randomUUID();
  const database = `calendar_preview_${randomUUID().replace(/-/g, '')}`;
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
  const resource = { url: `${calendarUrl}one.ics`, etag: '"v1"', calendarData };
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

  const preview = () => new CalendarImportPreviewStore(source);
  const results = () =>
    source.query(
      'SELECT * FROM calendar_sync."calendarImportPreview" ORDER BY "createdAt"',
    );
  const due = () =>
    source.query(
      'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
    );

  it('prepares CalDAV inbox once and leaves CRM operations untouched', async () => {
    await poller.runOnce();
    expect(await preview().runOnce()).toBe('prepared');
    expect(await preview().runOnce()).toBe('idle');
    expect(await results()).toEqual([
      expect.objectContaining({
        decision: 'READY',
        candidate: expect.objectContaining({ uid: 'one', capacity: 6 }),
      }),
    ]);
    expect(
      await source.query('SELECT state FROM calendar_sync."calendarInbox"'),
    ).toEqual([{ state: 'PENDING' }]);
    expect(
      await source.query(
        'SELECT * FROM calendar_sync."studioCalendarOperation"',
      ),
    ).toEqual([]);
  });

  it('serializes concurrent preview workers', async () => {
    await poller.runOnce();
    const outcomes = await Promise.all([
      preview().runOnce(),
      preview().runOnce(),
    ]);
    expect(outcomes.sort()).toEqual(['idle', 'prepared']);
    expect(await results()).toHaveLength(1);
  });

  it('marks older inbox versions superseded', async () => {
    await poller.runOnce();
    await due();
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
    await preview().runOnce();
    await preview().runOnce();
    expect(await results()).toEqual([
      expect.objectContaining({ decision: 'SUPERSEDED', candidate: null }),
      expect.objectContaining({
        decision: 'READY',
        candidate: expect.objectContaining({ capacity: 8 }),
      }),
    ]);
  });

  it('requires verification for disappearance and supersedes missing after return', async () => {
    await poller.runOnce();
    await due();
    reader.mockResolvedValue({ status: 'snapshot', resources: [] });
    await poller.runOnce();
    await preview().runOnce();
    await preview().runOnce();
    expect(await results()).toEqual([
      expect.objectContaining({ decision: 'SUPERSEDED' }),
      expect.objectContaining({
        decision: 'NEEDS_REVIEW',
        reason: 'DELETION_REQUIRES_VERIFICATION',
      }),
    ]);
    await due();
    reader.mockResolvedValue({ status: 'snapshot', resources: [resource] });
    await poller.runOnce();
    await source.query('DELETE FROM calendar_sync."calendarImportPreview"');
    await preview().runOnce();
    await preview().runOnce();
    await preview().runOnce();
    expect(
      (await results()).map((row: { decision: string }) => row.decision),
    ).toEqual(['SUPERSEDED', 'SUPERSEDED', 'READY']);
  });

  it('does not prepare paused connections and recomputes after configuration changes', async () => {
    await poller.runOnce();
    await source.query(
      `UPDATE calendar_sync."calendarConnection" SET state = 'PAUSED', "configurationVersion" = "configurationVersion" + 1`,
    );
    expect(await preview().runOnce()).toBe('idle');
    await source.query(
      `UPDATE calendar_sync."calendarConnection" SET state = 'PREVIEW', "configurationVersion" = "configurationVersion" + 1`,
    );
    await preview().runOnce();
    await source.query(
      `UPDATE calendar_sync."calendarConnection" SET "configurationVersion" = "configurationVersion" + 1`,
    );
    await preview().runOnce();
    expect(await results()).toHaveLength(2);
  });

  it('stores review instead of guessing missing format and capacity', async () => {
    reader.mockResolvedValue({
      status: 'snapshot',
      resources: [
        {
          ...resource,
          calendarData: calendarData.replace(
            'DESCRIPTION:KATFIT:\\nformat=GROUP_REFORMER\\ncapacity=6\r\n',
            '',
          ),
        },
      ],
    });
    await poller.runOnce();
    await preview().runOnce();
    expect(await results()).toEqual([
      expect.objectContaining({
        decision: 'NEEDS_REVIEW',
        reason: 'MISSING_OR_INVALID_METADATA',
        candidate: null,
      }),
    ]);
  });

  it('excludes historical READY results as soon as resource or connection changes', async () => {
    await poller.runOnce();
    await preview().runOnce();
    expect(
      await source.query(
        'SELECT * FROM calendar_sync."calendarCurrentImportPreview"',
      ),
    ).toHaveLength(1);
    await due();
    reader.mockResolvedValue({
      status: 'snapshot',
      resources: [
        {
          ...resource,
          etag: '"changed"',
          calendarData: calendarData.replace('capacity=6', 'capacity=8'),
        },
      ],
    });
    await poller.runOnce();
    expect(
      await source.query(
        'SELECT * FROM calendar_sync."calendarCurrentImportPreview"',
      ),
    ).toHaveLength(0);
    await preview().runOnce();
    expect(
      await source.query(
        'SELECT * FROM calendar_sync."calendarCurrentImportPreview"',
      ),
    ).toHaveLength(1);
    await source.query(
      `UPDATE calendar_sync."calendarConnection" SET state = 'PAUSED'`,
    );
    expect(
      await source.query(
        'SELECT * FROM calendar_sync."calendarCurrentImportPreview"',
      ),
    ).toHaveLength(0);
    expect(await results()).toHaveLength(2);
  });

  it('reverses and reapplies the preview migration', async () => {
    await source.undoLastMigration({ transaction: 'all' });
    await source.runMigrations({ transaction: 'all' });
    expect(await results()).toEqual([]);
  });
});
