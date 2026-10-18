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

describeWithDatabase('Calendar ingestion with isolated PostgreSQL', () => {
  const workspaceId = randomUUID();
  const id = randomUUID();
  const database = `calendar_poll_${randomUUID().replace(/-/g, '')}`;
  const cipher = new CalendarCredentialCipher('primary', {
    primary: 'ab'.repeat(32),
  });
  const calendarUrl = 'https://caldav.yandex.ru/calendars/test/classes/';
  const calendarData =
    'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:one\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
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

  const due = () =>
    source.query(
      'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now() - interval \'1 second\' WHERE id = $1',
      [id],
    );
  const generation = () =>
    source.query<
      Array<{ readGeneration: number; lastReadError: string | null }>
    >(
      'SELECT "readGeneration", "lastReadError" FROM calendar_sync."calendarConnection" WHERE id = $1',
      [id],
    );
  const inbox = () =>
    source.query<
      Array<{
        kind: string;
        resourceVersion: number;
        calendarData: string | null;
      }>
    >(
      'SELECT "kind", "resourceVersion", "calendarData" FROM calendar_sync."calendarInbox" ORDER BY "resourceVersion"',
    );

  it('saves the resource, inbox and read generation together without CRM operations', async () => {
    expect(await poller.runOnce()).toBe('saved');
    expect(reader).toHaveBeenCalledWith(calendarUrl, {
      username: 'trainer@yandex.ru',
      appPassword: 'test-secret',
    });
    expect(await generation()).toEqual([
      { readGeneration: 1, lastReadError: null },
    ]);
    expect(await inbox()).toEqual([
      { kind: 'UPSERT', resourceVersion: 1, calendarData },
    ]);
    expect(
      await source.query(
        'SELECT count(*)::int AS count FROM calendar_sync."studioCalendarOperation"',
      ),
    ).toEqual([{ count: 0 }]);
    expect(await poller.runOnce()).toBe('idle');
  });

  it('does not redeliver an unchanged resource after the next poll', async () => {
    await poller.runOnce();
    await due();
    expect(await poller.runOnce()).toBe('saved');
    expect(await inbox()).toHaveLength(1);
    expect((await generation())[0].readGeneration).toBe(2);
  });

  it('preserves A → B → A as three distinct deliveries', async () => {
    await poller.runOnce();
    await due();
    reader.mockResolvedValue({
      status: 'snapshot',
      resources: [
        {
          ...resource,
          etag: '"v2"',
          calendarData: calendarData.replace('UID:one', 'UID:changed'),
        },
      ],
    });
    await poller.runOnce();
    await due();
    reader.mockResolvedValue({ status: 'snapshot', resources: [resource] });
    await poller.runOnce();
    expect((await inbox()).map((value) => value.resourceVersion)).toEqual([
      1, 2, 3,
    ]);
  });

  it('records missing candidates once and handles reappearance without cancelling anything', async () => {
    await poller.runOnce();
    reader.mockResolvedValue({ status: 'snapshot', resources: [] });
    await due();
    await poller.runOnce();
    await due();
    await poller.runOnce();
    expect((await inbox()).map((value) => value.kind)).toEqual([
      'UPSERT',
      'MISSING_CANDIDATE',
    ]);
    reader.mockResolvedValue({ status: 'snapshot', resources: [resource] });
    await due();
    await poller.runOnce();
    expect((await inbox()).map((value) => value.kind)).toEqual([
      'UPSERT',
      'MISSING_CANDIDATE',
      'UPSERT',
    ]);
    expect(
      await source.query(
        'SELECT "missingSinceGeneration" FROM calendar_sync."calendarResource"',
      ),
    ).toEqual([{ missingSinceGeneration: null }]);
  });

  it('does not advance generation or infer missing events on a partial response', async () => {
    await poller.runOnce();
    await due();
    reader.mockResolvedValue({ status: 'invalid-snapshot' });
    expect(await poller.runOnce()).toBe('failed');
    expect(await generation()).toEqual([
      { readGeneration: 1, lastReadError: 'invalid-snapshot' },
    ]);
    expect(await inbox()).toHaveLength(1);
  });

  it('rejects a snapshot after pause changed the configuration', async () => {
    reader.mockImplementation(async () => {
      await connections.pause({ workspaceId, id }, 1);
      return { status: 'snapshot', resources: [resource] };
    });
    expect(await poller.runOnce()).toBe('stale');
    expect(await inbox()).toEqual([]);
    expect((await generation())[0].readGeneration).toBe(0);
    expect(await poller.runOnce()).toBe('idle');
  });

  it('rejects a snapshot after disconnect and stops access to its credentials', async () => {
    reader.mockImplementation(async () => {
      await connections.disconnect({ workspaceId, id }, 1);
      return { status: 'snapshot', resources: [resource] };
    });
    expect(await poller.runOnce()).toBe('stale');
    expect(await inbox()).toEqual([]);
    expect(
      await connections.readCredentialsForDiscovery({ workspaceId, id }),
    ).toBeNull();
  });

  it('allows only one worker per connection and fences a reclaimed lease', async () => {
    const claims = await Promise.all([store.claimNext(), store.claimNext()]);
    const lease = claims.find((value) => value !== null);
    if (!lease) throw new Error('Expected a lease');
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(
      await store.readCredentials({ ...lease, workspaceId: randomUUID() }),
    ).toBeNull();
    await source.query(
      'UPDATE calendar_sync."calendarConnection" SET "pollLeaseUntil" = now() - interval \'1 second\' WHERE id = $1',
      [id],
    );
    const replacement = await store.claimNext();
    if (!replacement) throw new Error('Expected a new lease');
    expect(replacement.pollLeaseGeneration).toBe(lease.pollLeaseGeneration + 1);
    expect(await store.commitSnapshot(lease, [resource])).toBe(false);
    expect(await store.fail(lease, 'unavailable')).toBe(false);
    expect(await store.commitSnapshot(replacement, [resource])).toBe(true);
  });

  it('stops polling on authentication failure and does not erase resources', async () => {
    await poller.runOnce();
    await due();
    reader.mockResolvedValue({ status: 'auth-required' });
    expect(await poller.runOnce()).toBe('failed');
    expect((await connections.get({ workspaceId, id }))?.state).toBe(
      'AUTH_REQUIRED',
    );
    expect(await poller.runOnce()).toBe('idle');
    expect(await inbox()).toHaveLength(1);
    expect((await generation())[0].readGeneration).toBe(1);
  });

  it('rolls back every resource and inbox write if persistence fails midway', async () => {
    const lease = await store.claimNext();
    if (!lease) throw new Error('Expected a lease');
    await source.query(
      `ALTER TABLE calendar_sync."calendarInbox" ADD CONSTRAINT fixture_failure CHECK ("calendarData" NOT LIKE '%ROLLBACK_ME%')`,
    );
    try {
      await expect(
        store.commitSnapshot(lease, [
          resource,
          {
            ...resource,
            url: `${calendarUrl}two.ics`,
            calendarData: calendarData.replace('UID:one', 'UID:ROLLBACK_ME'),
          },
        ]),
      ).rejects.toThrow();
      expect(await inbox()).toEqual([]);
      expect(
        await source.query(
          'SELECT count(*)::int AS count FROM calendar_sync."calendarResource"',
        ),
      ).toEqual([{ count: 0 }]);
      expect((await generation())[0].readGeneration).toBe(0);
    } finally {
      await source.query(
        'ALTER TABLE calendar_sync."calendarInbox" DROP CONSTRAINT fixture_failure',
      );
    }
  });

  it('rolls back the inbox migration without deleting connection credentials or operations', async () => {
    const runner = source.createQueryRunner();
    const migration = new CreateCalendarInbox1792237004000();
    try {
      await migration.down(runner);
      expect(
        await source.query(
          'SELECT to_regclass(\'calendar_sync."calendarInbox"\') AS name',
        ),
      ).toEqual([{ name: null }]);
      expect(
        await connections.readCredentialsForDiscovery({ workspaceId, id }),
      ).not.toBeNull();
      await migration.up(runner);
    } finally {
      await runner.release();
    }
  });
});
