import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { CreateCalendarOperations1792229192906 } from '../../migrations/1792229192906-create-calendar-operations';
import { CreateCalendarConnections1792230811000 } from '../../migrations/1792230811000-create-calendar-connections';
import { CalendarCredentialCipher } from '../../security/calendar-credential-cipher';
import { CalendarConnectionStore } from '../calendar-connection.store';

const socketPath = process.env.STUDIO_CALENDAR_TEST_SOCKET;
const describeWithDatabase = socketPath ? describe : describe.skip;

describeWithDatabase('CalendarConnectionStore with isolated PostgreSQL', () => {
  const workspaceId = randomUUID();
  const id = randomUUID();
  const database = `calendar_connection_${randomUUID().replace(/-/g, '')}`;
  const cipher = new CalendarCredentialCipher('primary', {
    primary: 'ab'.repeat(32),
  });
  const input = () => ({
    id,
    workspaceId,
    username: 'trainer@yandex.ru',
    appPassword: 'test-secret',
    timezone: 'Europe/Moscow',
    calendar: {
      url: 'https://caldav.yandex.ru/calendars/test/classes/',
      displayName: 'Тренировки',
      reports: ['syncCollection'],
      writeAccess: 'unverified' as const,
    },
  });
  let admin: DataSource;
  let source: DataSource;
  let store: CalendarConnectionStore;

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
      ],
    }).initialize();
    await source.query('CREATE SCHEMA calendar_sync');
    await source.runMigrations({ transaction: 'all' });
    store = new CalendarConnectionStore(source, cipher);
  });

  afterEach(async () => {
    await source.query('TRUNCATE calendar_sync."calendarConnection"');
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      await admin.destroy();
    }
  });

  it('stores only encrypted credentials and returns a secret-free preview', async () => {
    const connection = await store.createPreview(input());
    expect(connection.state).toBe('PREVIEW');
    expect(connection.configurationVersion).toBe(1);
    expect(JSON.stringify(connection)).not.toContain('Password');
    expect(JSON.stringify(connection)).not.toContain('test-secret');
    const rows = await source.query<Array<{ encryptedAppPassword: string }>>(
      'SELECT "encryptedAppPassword" FROM calendar_sync."calendarConnection"',
    );
    expect(rows[0].encryptedAppPassword).toMatch(/^v1\.primary\./);
    expect(rows[0].encryptedAppPassword).not.toContain('test-secret');
    expect(
      await store.readCredentialsForDiscovery({ workspaceId, id }),
    ).toEqual({ username: 'trainer@yandex.ru', appPassword: 'test-secret' });
  });

  it('deduplicates creation but rejects the same ID with a different password', async () => {
    const first = await store.createPreview(input());
    expect(await store.createPreview(input())).toEqual(first);
    await expect(
      store.createPreview({ ...input(), appPassword: 'changed-secret' }),
    ).rejects.toThrow('CALENDAR_CONNECTION_IDEMPOTENCY_CONFLICT');
  });

  it('allows only one connected calendar per workspace until disconnect', async () => {
    await store.createPreview(input());
    await expect(
      store.createPreview({ ...input(), id: randomUUID() }),
    ).rejects.toMatchObject({ code: '23505' });
    await store.disconnect({ workspaceId, id }, 1);
    expect(
      (await store.createPreview({ ...input(), id: randomUUID() })).state,
    ).toBe('PREVIEW');
  });

  it('does not disclose or change another workspace connection', async () => {
    await store.createPreview(input());
    const other = { workspaceId: randomUUID(), id };
    expect(await store.get(other)).toBeNull();
    expect(await store.readCredentialsForDiscovery(other)).toBeNull();
    expect(await store.pause(other, 1)).toBeNull();
    expect(await store.replacePassword(other, 1, 'changed')).toBeNull();
    expect(await store.disconnect(other, 1)).toBeNull();
  });

  it('rejects stale state changes and keeps public responses secret-free', async () => {
    await store.createPreview(input());
    expect(
      (await store.pause({ workspaceId, id }, 1))?.configurationVersion,
    ).toBe(2);
    expect(await store.disconnect({ workspaceId, id }, 1)).toBeNull();
    expect((await store.get({ workspaceId, id }))?.state).toBe('PAUSED');
    expect(JSON.stringify(await store.get({ workspaceId, id }))).not.toContain(
      'encryptedAppPassword',
    );
  });

  it('replaces a password with CAS and requires a fresh preview', async () => {
    await store.createPreview(input());
    const outcomes = await Promise.all([
      store.replacePassword({ workspaceId, id }, 1, 'first-replacement'),
      store.replacePassword({ workspaceId, id }, 1, 'second-replacement'),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const connection = await store.get({ workspaceId, id });
    expect(connection?.state).toBe('PREVIEW');
    expect(connection?.credentialVersion).toBe(2);
    expect(connection?.configurationVersion).toBe(2);
    expect(['first-replacement', 'second-replacement']).toContain(
      (await store.readCredentialsForDiscovery({ workspaceId, id }))
        ?.appPassword,
    );
  });

  it('forgets the encrypted password on disconnect and cannot resurrect it with a stale update', async () => {
    await store.createPreview(input());
    expect((await store.disconnect({ workspaceId, id }, 1))?.state).toBe(
      'DISCONNECTED',
    );
    expect(
      await store.readCredentialsForDiscovery({ workspaceId, id }),
    ).toBeNull();
    expect(
      await store.replacePassword({ workspaceId, id }, 2, 'changed'),
    ).toBeNull();
    expect(
      await source.query(
        'SELECT "encryptedAppPassword" FROM calendar_sync."calendarConnection" WHERE id = $1',
        [id],
      ),
    ).toEqual([{ encryptedAppPassword: null }]);
  });

  it('rejects unsafe calendar URLs before storing credentials', async () => {
    await expect(
      store.createPreview({
        ...input(),
        calendar: { ...input().calendar, url: 'https://other.example/' },
      }),
    ).rejects.toThrow('CALENDAR_CONNECTION_INVALID');
    expect(await store.get({ workspaceId, id })).toBeNull();
  });

  it('supports migration rollback without removing the existing operations table', async () => {
    const runner = source.createQueryRunner();
    try {
      await new CreateCalendarConnections1792230811000().down(runner);
      expect(
        await source.query(
          'SELECT to_regclass(\'calendar_sync."calendarConnection"\') AS name',
        ),
      ).toEqual([{ name: null }]);
      expect(
        await source.query(
          'SELECT count(*)::int AS count FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toEqual([{ count: 0 }]);
      await new CreateCalendarConnections1792230811000().up(runner);
    } finally {
      await runner.release();
    }
  });
});
