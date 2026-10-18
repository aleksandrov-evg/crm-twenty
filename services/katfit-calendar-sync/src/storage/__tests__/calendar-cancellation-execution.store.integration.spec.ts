import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createCalendarDataSource } from '../create-calendar-data-source';
import {
  CalendarCancellationExecutionStore,
  type CancellationExecutionSource,
} from '../calendar-cancellation-execution.store';
const socketPath = process.env.STUDIO_CALENDAR_TEST_SOCKET;
const describeWithDatabase = socketPath ? describe : describe.skip;
describeWithDatabase(
  'explicit cancellation execution on isolated PostgreSQL',
  () => {
    const database = `calendar_cancel_exec_${randomUUID().replace(/-/g, '')}`;
    const scope = { workspaceId: randomUUID(), connectionId: randomUUID() };
    const resourceId = randomUUID(),
      classSessionId = randomUUID(),
      reviewId = randomUUID();
    const session = {
      id: classSessionId,
      name: 'Test',
      startsAt: '2099-01-01T09:00:00.000Z',
      endsAt: '2099-01-01T10:00:00.000Z',
      sessionFormat: 'GROUP_REFORMER' as const,
      capacity: 1,
      status: 'PLANNED',
      recordingKey: 'key',
    };
    let admin: DataSource,
      source: DataSource,
      store: CalendarCancellationExecutionStore;
    beforeAll(async () => {
      admin = await new DataSource({
        type: 'postgres',
        host: socketPath,
        port: 55439,
        username: 'postgres',
        database: 'postgres',
      }).initialize();
      await admin.query(`CREATE DATABASE "${database}"`);
      source = new DataSource({
        type: 'postgres',
        host: socketPath,
        port: 55439,
        username: 'postgres',
        database,
        schema: 'calendar_sync',
        migrationsTableName: 'migrations',
        migrations: createCalendarDataSource(
          'postgresql://postgres@localhost/test',
        ).options.migrations,
      });
      await source.initialize();
      await source.query('CREATE SCHEMA calendar_sync');
      await source.runMigrations({ transaction: 'all' });
      store = new CalendarCancellationExecutionStore(source, scope, 'binding');
    });
    afterAll(async () => {
      if (source?.isInitialized) await source.destroy();
      if (admin?.isInitialized) {
        await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
        await admin.destroy();
      }
    });
    beforeEach(async () => {
      await source.query('TRUNCATE calendar_sync."calendarConnection" CASCADE');
      await source.query(
        `INSERT INTO calendar_sync."calendarConnection" (id,"workspaceId",username,"calendarUrl","displayName",timezone,reports,"encryptedAppPassword",state,"lastSuccessfulReadAt") VALUES ($1,$2,'test','https://caldav.yandex.ru/calendars/test/classes/','test','UTC','[]','v1.test','ACTIVE',clock_timestamp())`,
        [scope.connectionId, scope.workspaceId],
      );
      await source.query(
        `INSERT INTO calendar_sync."calendarResource" (id,"workspaceId","connectionId",url,etag,"contentHash","calendarData","lastSeenGeneration") VALUES ($1,$2,$3,'https://caldav.yandex.ru/calendars/test/classes/one','"one"','hash','data',1)`,
        [resourceId, scope.workspaceId, scope.connectionId],
      );
      await source.query(
        `INSERT INTO calendar_sync."calendarSessionLink" ("workspaceId","connectionId",uid,"recurrenceKey","classSessionId","resourceId","recordingKey","observedSession") VALUES ($1,$2,'one','single',$3,$4,'key','{}')`,
        [scope.workspaceId, scope.connectionId, classSessionId, resourceId],
      );
      await source.query(
        `INSERT INTO calendar_sync."calendarCancellationReview" (id,"workspaceId","connectionId",uid,"configurationVersion","resourceVersion",kind,state,reason,evidence,"initialBookingIds","seenBookingIds") VALUES ($1,$2,$3,'one',1,1,'CANCELLED','NEEDS_REVIEW','test','{}','[]','[]')`,
        [reviewId, scope.workspaceId, scope.connectionId],
      );
      await source.query(
        `INSERT INTO calendar_sync."calendarActivation" ("workspaceId","connectionId","configurationVersion",binding,evidence) VALUES ($1,$2,1,'binding','{}')`,
        [scope.workspaceId, scope.connectionId],
      );
    });
    const capture = async () => {
      const value = await store.capture(reviewId);
      expect(value).not.toBeNull();
      return value as CancellationExecutionSource;
    };
    test('only one concurrent sender claims a frozen command and uncertain state never resends', async () => {
      const captured = await capture();
      const prepared = await store.prepare(captured, [], session);
      expect(prepared.state).toBe('PREPARED');
      expect((await store.prepare(captured, [], session)).command).toEqual(
        prepared.command,
      );
      const claims = await Promise.all([
        store.beginSend(captured),
        store.beginSend(captured),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      await store.settle(reviewId, false);
      expect(await store.beginSend(captured)).toBe(false);
      await store.settle(reviewId, true);
      expect((await store.get(reviewId))?.state).toBe('CONFIRMED');
    });
    test('pause or changed resource after preflight blocks the send', async () => {
      const captured = await capture();
      await store.prepare(captured, [], session);
      await source.query(
        `UPDATE calendar_sync."calendarConnection" SET state = 'PAUSED'`,
      );
      expect(await store.beginSend(captured)).toBe(false);
      await source.query(
        `UPDATE calendar_sync."calendarConnection" SET state = 'ACTIVE'`,
      );
      await source.query(
        `UPDATE calendar_sync."calendarResource" SET "resourceVersion" = 2`,
      );
      expect(await store.beginSend(captured)).toBe(false);
    });
    test('changed review version cannot reuse the earlier frozen intent', async () => {
      const captured = await capture();
      await store.prepare(captured, [], session);
      await source.query(
        `UPDATE calendar_sync."calendarCancellationReview" SET "resourceVersion" = 2`,
      );
      await expect(
        store.prepare({ ...captured, resourceVersion: 2 }, [], session),
      ).rejects.toThrow('CANCELLATION_PREPARED_INVENTORY_CHANGED');
    });
    test('a moved session cannot replace the prepared cancellation snapshot', async () => {
      const captured = await capture();
      await store.prepare(captured, [], session);
      await expect(
        store.prepare(captured, [], {
          ...session,
          startsAt: '2099-01-01T11:00:00.000Z',
        }),
      ).rejects.toThrow('CANCELLATION_PREPARED_INVENTORY_CHANGED');
      expect((await store.get(reviewId))?.state).toBe('PREPARED');
    });
    test('wrong credential binding and scope cannot inspect or send the intent', async () => {
      const captured = await capture();
      await store.prepare(captured, [], session);
      const wrong = new CalendarCancellationExecutionStore(
        source,
        scope,
        'other',
      );
      expect(await wrong.get(reviewId)).toBeNull();
      expect(await wrong.capture(reviewId)).toBeNull();
      expect(await wrong.beginSend(captured)).toBe(false);
    });
  },
);
