import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { CreateCalendarOperations1792229192906 } from '../../migrations/1792229192906-create-calendar-operations';
import { StudioCalendarOperationStore } from '../studio-calendar-operation.store';

const socketPath = process.env.STUDIO_CALENDAR_TEST_SOCKET;
const describeWithDatabase = socketPath ? describe : describe.skip;

describeWithDatabase(
  'StudioCalendarOperationStore with isolated PostgreSQL',
  () => {
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const connectionId = randomUUID();
    const database = `studio_calendar_${randomUUID().replace(/-/g, '')}`;
    const migration = new CreateCalendarOperations1792229192906();
    let admin: DataSource;
    let dataSource: DataSource;
    let secondDataSource: DataSource;
    let store: StudioCalendarOperationStore;

    const input = (idempotencyKey = randomUUID()) => ({
      workspaceId,
      connectionId,
      idempotencyKey,
      resourceKey: 'training-1',
      action: 'EXPORT_EVENT' as const,
      payload: { classSessionId: 'session-1', revision: 1 },
    });

    beforeAll(async () => {
      jest.useRealTimers();

      // Never fall back to the application database for destructive fixtures.
      if (!socketPath?.startsWith('/tmp/studio-caldav-postgres.')) {
        throw new Error('An isolated studio CalDAV test socket is required');
      }

      const options = {
        type: 'postgres' as const,
        host: socketPath,
        port: 55439,
        username: 'postgres',
        database: 'postgres',
        schema: 'calendar_sync',
        migrationsTableName: 'migrations',
        migrations: [CreateCalendarOperations1792229192906],
      };

      admin = await new DataSource(options).initialize();
      await admin.query(`CREATE DATABASE "${database}"`);
      dataSource = await new DataSource({ ...options, database }).initialize();
      secondDataSource = await new DataSource({
        ...options,
        database,
      }).initialize();
      await dataSource.query('CREATE SCHEMA calendar_sync');
      await dataSource.runMigrations({ transaction: 'all' });

      store = new StudioCalendarOperationStore(dataSource);
    });

    afterEach(async () => {
      await dataSource.query(
        'TRUNCATE calendar_sync."studioCalendarOperation"',
      );
    });

    afterAll(async () => {
      if (secondDataSource?.isInitialized) await secondDataSource.destroy();
      if (dataSource?.isInitialized) await dataSource.destroy();
      if (admin?.isInitialized) {
        await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
        await admin.destroy();
      }
      jest.useFakeTimers();
    });

    it('deduplicates the same request even when JSON property order changes', async () => {
      const request = input();
      const first = await store.enqueue(request);
      const second = await store.enqueue({
        ...request,
        payload: { revision: 1, classSessionId: 'session-1' },
      });

      expect(second.id).toBe(first.id);
      expect(second.state).toBe('PENDING');
      await expect(
        store.enqueue({ ...request, payload: { revision: 2 } }),
      ).rejects.toThrow('STUDIO_CALENDAR_IDEMPOTENCY_CONFLICT');
    });

    it('tracks its own migration and does not apply it twice', async () => {
      expect(await dataSource.runMigrations({ transaction: 'all' })).toEqual(
        [],
      );
      expect(
        await dataSource.query('SELECT name FROM calendar_sync.migrations'),
      ).toEqual([{ name: 'CreateCalendarOperations1792229192906' }]);
    });

    it('recovers persisted work from an independent connection', async () => {
      const operation = await store.enqueue(input());
      const restartedStore = new StudioCalendarOperationStore(secondDataSource);
      const claimed = await restartedStore.claimNext(
        { workspaceId, connectionId },
        60,
      );

      expect(claimed?.id).toBe(operation.id);
      expect(claimed?.state).toBe('RUNNING');
      expect(claimed?.attempts).toBe(1);
    });

    it('lets only one concurrent worker claim work for a calendar', async () => {
      const otherStore = new StudioCalendarOperationStore(secondDataSource);
      for (let iteration = 0; iteration < 20; iteration++) {
        const scope = { workspaceId, connectionId: randomUUID() };
        await store.enqueue({ ...input(), ...scope });
        await store.enqueue({ ...input(), ...scope });
        const claims = await Promise.all([
          store.claimNext(scope, 60),
          otherStore.claimNext(scope, 60),
          store.claimNext(scope, 60),
        ]);
        expect(claims.filter(Boolean)).toHaveLength(1);
        expect(await store.claimNext(scope, 60)).toBeNull();
      }
    });

    it('does not claim a different action while another expired operation still owns the running slot', async () => {
      await store.enqueue({ ...input(), action: 'IMPORT_EVENT' });
      await store.enqueue(input());
      const imported = await store.claimNext(
        { workspaceId, connectionId },
        60,
        'IMPORT_EVENT',
      );
      if (!imported) throw Error('Expected import lease');
      await dataSource.query(
        `UPDATE calendar_sync."studioCalendarOperation" SET "leaseUntil" = now() - interval '1 second' WHERE id = $1`,
        [imported.id],
      );
      expect(
        await store.claimNext(
          { workspaceId, connectionId },
          60,
          'EXPORT_EVENT',
        ),
      ).toBeNull();
      expect(
        (
          await store.claimNext(
            { workspaceId, connectionId },
            60,
            'IMPORT_EVENT',
          )
        )?.id,
      ).toBe(imported.id);
    });

    it('does not allow another workspace or connection to claim or finish an operation', async () => {
      await store.enqueue(input());
      expect(
        await store.claimNext(
          { workspaceId: otherWorkspaceId, connectionId },
          60,
        ),
      ).toBeNull();
      const claimed = await store.claimNext({ workspaceId, connectionId }, 60);

      expect(claimed).not.toBeNull();
      if (!claimed) throw new Error('Expected a lease');

      expect(
        await store.settle(
          { ...claimed, workspaceId: otherWorkspaceId },
          { state: 'SUCCEEDED' },
        ),
      ).toBe(false);
      expect(
        await store.settle(
          { ...claimed, connectionId: randomUUID() },
          { state: 'SUCCEEDED' },
        ),
      ).toBe(false);
      expect(await store.settle(claimed, { state: 'SUCCEEDED' })).toBe(true);
      expect(await store.settle(claimed, { state: 'SUCCEEDED' })).toBe(false);
    });

    it('reclaims expired work before new work and fences out the old worker', async () => {
      const operation = await store.enqueue(input());
      const oldLease = await store.claimNext({ workspaceId, connectionId }, 60);

      if (!oldLease) throw new Error('Expected a lease');
      await store.enqueue(input());
      await dataSource.query(
        'UPDATE calendar_sync."studioCalendarOperation" SET "leaseUntil" = now() - interval \'1 second\' WHERE id = $1',
        [operation.id],
      );
      expect(await store.settle(oldLease, { state: 'SUCCEEDED' })).toBe(false);
      const reclaimed = await store.claimNext(
        { workspaceId, connectionId },
        60,
      );

      if (!reclaimed) throw new Error('Expected a reclaimed lease');
      expect(reclaimed.id).toBe(operation.id);
      expect(reclaimed.leaseGeneration).toBe(oldLease.leaseGeneration + 1);
      expect(reclaimed.attempts).toBe(2);
      expect(reclaimed.requiresReconciliation).toBe(true);
      expect(await store.settle(oldLease, { state: 'FAILED' })).toBe(false);
      expect(await store.settle(reclaimed, { state: 'SUCCEEDED' })).toBe(true);
    });

    it('honors retry delay and preserves the requirement to reconcile a lost response', async () => {
      const operation = await store.enqueue(input());
      const lease = await store.claimNext({ workspaceId, connectionId }, 60);

      if (!lease) throw new Error('Expected a lease');
      expect(
        await store.settle(lease, {
          state: 'RETRY',
          delaySeconds: 60,
          errorCode: 'WRITE_UNCONFIRMED',
          requiresReconciliation: true,
        }),
      ).toBe(true);
      expect(
        await store.claimNext({ workspaceId, connectionId }, 60),
      ).toBeNull();
      await dataSource.query(
        'UPDATE calendar_sync."studioCalendarOperation" SET "nextAttemptAt" = now() - interval \'1 second\' WHERE id = $1',
        [operation.id],
      );

      const retry = await store.claimNext({ workspaceId, connectionId }, 60);

      expect(retry?.requiresReconciliation).toBe(true);
      expect(retry?.errorCode).toBe('WRITE_UNCONFIRMED');
    });

    it('allows independent calendars to progress and scopes idempotency by workspace', async () => {
      const request = input();
      const first = await store.enqueue(request);
      const second = await store.enqueue({
        ...request,
        workspaceId: otherWorkspaceId,
      });

      expect(first.id).not.toBe(second.id);
      const claims = await Promise.all([
        store.claimNext({ workspaceId, connectionId }, 60),
        store.claimNext({ workspaceId: otherWorkspaceId, connectionId }, 60),
      ]);

      expect(claims.filter(Boolean)).toHaveLength(2);
    });

    it('rejects reuse of an idempotency key for another calendar', async () => {
      const request = input();

      await store.enqueue(request);
      await expect(
        store.enqueue({ ...request, connectionId: randomUUID() }),
      ).rejects.toThrow('STUDIO_CALENDAR_IDEMPOTENCY_CONFLICT');
    });

    it('has a reversible migration without creating CRM tables', async () => {
      expect(
        await dataSource.query("SELECT to_regnamespace('core') AS name"),
      ).toEqual([{ name: null }]);
      const runner = dataSource.createQueryRunner();

      try {
        await migration.down(runner);
        expect(
          await dataSource.query(
            'SELECT to_regclass(\'calendar_sync."studioCalendarOperation"\') AS name',
          ),
        ).toEqual([{ name: null }]);
        await migration.up(runner);
      } finally {
        await runner.release();
      }

      expect((await store.enqueue(input())).state).toBe('PENDING');
    });
  },
);
