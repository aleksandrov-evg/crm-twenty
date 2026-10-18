import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createCalendarDataSource } from '../create-calendar-data-source';
import {
  CalendarCrmExportStore,
  type CalendarCrmExportLease,
} from '../calendar-crm-export.store';
import { CreateCrmExportIntent1792251000000 } from '../../migrations/1792251000000-create-crm-export-intent';
import { renderCrmOriginExport } from '../../domain/render-crm-origin-export';
import { CalendarCrmReconciliationStore } from '../calendar-crm-reconciliation.store';
const socketPath = process.env.STUDIO_CALENDAR_TEST_SOCKET;
const describeWithDatabase = socketPath ? describe : describe.skip;
describeWithDatabase('CRM initial export durable intent', () => {
  const database = `crm_export_${randomUUID().replace(/-/g, '')}`;
  const scope = { workspaceId: randomUUID(), connectionId: randomUUID() };
  const calendarUrl = 'https://caldav.yandex.ru/calendars/test/classes/';
  const session = {
    id: randomUUID(),
    recordingKey: `session-create:${randomUUID()}`,
    name: 'Test',
    startsAt: '2099-01-01T09:00:00.000Z',
    endsAt: '2099-01-01T10:00:00.000Z',
    sessionFormat: 'GROUP_REFORMER' as const,
    capacity: 6,
    status: 'PLANNED',
  };
  const rendered = renderCrmOriginExport({ ...scope, calendarUrl, session });
  if (rendered.status !== 'prepared') throw Error('Invalid fixture');
  const command = rendered.command;
  let source: DataSource, admin: DataSource, store: CalendarCrmExportStore;
  beforeAll(async () => {
    admin = await new DataSource({
      type: 'postgres',
      host: socketPath,
      port: 55439,
      username: 'postgres',
      database: 'postgres',
    }).initialize();
    await admin.query(`CREATE DATABASE "${database}"`);
    const migrations = createCalendarDataSource('postgres://localhost/test')
      .options.migrations;
    if (!Array.isArray(migrations)) throw Error('Expected migration list');
    source = await new DataSource({
      type: 'postgres',
      host: socketPath,
      port: 55439,
      username: 'postgres',
      database,
      schema: 'calendar_sync',
      migrationsTableName: 'migrations',
      migrations: migrations.some(
        (migration) => migration === CreateCrmExportIntent1792251000000,
      )
        ? migrations
        : [...migrations, CreateCrmExportIntent1792251000000],
    }).initialize();
    await source.query('CREATE SCHEMA calendar_sync');
    await source.runMigrations({ transaction: 'all' });
    store = new CalendarCrmExportStore(source, scope, 'binding');
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
      `INSERT INTO calendar_sync."calendarConnection" (id,"workspaceId",username,"calendarUrl","displayName",timezone,reports,"encryptedAppPassword",state,"lastSuccessfulReadAt") VALUES ($1,$2,'test',$3,'test','Europe/Moscow','[]','v1.test','ACTIVE',clock_timestamp())`,
      [scope.connectionId, scope.workspaceId, calendarUrl],
    );
    await source.query(
      `INSERT INTO calendar_sync."calendarActivation" ("workspaceId","connectionId","configurationVersion",binding,evidence) VALUES ($1,$2,1,'binding','{}')`,
      [scope.workspaceId, scope.connectionId],
    );
  });
  const lease = async () => {
    expect(await store.prepare(command, 1)).toBe('prepared');
    const value = await store.claimNext();
    expect(value).not.toBeNull();
    return value as CalendarCrmExportLease;
  };
  const pollResource = async (version = 1) => {
    const rows: { id: string }[] = await source.query(
      `INSERT INTO calendar_sync."calendarResource" ("workspaceId","connectionId",url,etag,"contentHash","calendarData","lastSeenGeneration","resourceVersion") VALUES ($1,$2,$3,'"one"','hash',$4,1,$5) RETURNING id`,
      [
        scope.workspaceId,
        scope.connectionId,
        command.resourceUrl,
        command.calendarData,
        version,
      ],
    );
    const inbox: { id: string }[] = await source.query(
      `INSERT INTO calendar_sync."calendarInbox" ("workspaceId","connectionId","resourceId","resourceVersion",kind,etag,"contentHash","calendarData") VALUES ($1,$2,$3,$4,'UPSERT','"one"','hash',$5) RETURNING id`,
      [
        scope.workspaceId,
        scope.connectionId,
        rows[0].id,
        version,
        command.calendarData,
      ],
    );
    await source.query(
      `INSERT INTO calendar_sync."calendarImportPreview" ("inboxId","configurationVersion",decision,candidate) VALUES ($1,1,'READY',$2::jsonb)`,
      [inbox[0].id, JSON.stringify({ uid: command.uid })],
    );
    return { resourceId: rows[0].id, inboxId: inbox[0].id };
  };
  test('freezes original session and fences one sender while retaining recovery marker', async () => {
    const current = await lease();
    expect(await store.prepare(command, 1)).toBe('existing');
    expect(
      await store.prepare(
        { ...command, session: { ...command.session, name: 'Changed' } },
        1,
      ),
    ).toBe('rejected');
    expect(await store.claimNext()).toBeNull();
    expect(await store.beginSend(current)).toBe(true);
    expect(await store.beginSend(current)).toBe(false);
    await store.retry(current, 'UNCONFIRMED');
    await source.query(
      `UPDATE calendar_sync."calendarCrmExportIntent" SET "nextAttemptAt" = now()`,
    );
    const recovered = await store.claimNext();
    expect(recovered?.sendStartedAt).not.toBeNull();
    expect(await store.authorize(current)).toBe(false);
    expect(await store.beginSend(recovered!)).toBe(false);
  });
  test('expired running intent from an earlier configuration is reviewed without blocking a new session', async () => {
    const old = await lease();
    expect(await store.beginSend(old)).toBe(true);
    await source.query(
      `UPDATE calendar_sync."calendarCrmExportIntent" SET "leaseUntil" = clock_timestamp() - interval '1 second'`,
    );
    await source.query(
      `UPDATE calendar_sync."calendarConnection" SET "configurationVersion" = 2`,
    );
    await source.query(
      `INSERT INTO calendar_sync."calendarActivation" ("workspaceId","connectionId","configurationVersion",binding,evidence) VALUES ($1,$2,2,'binding','{}')`,
      [scope.workspaceId, scope.connectionId],
    );
    const next = renderCrmOriginExport({
      ...scope,
      calendarUrl,
      session: {
        ...session,
        id: randomUUID(),
        recordingKey: `session-create:${randomUUID()}`,
      },
    });
    if (next.status !== 'prepared') throw Error('Invalid fixture');
    expect(await store.prepare(next.command, 2)).toBe('prepared');
    const claimed = await store.claimNext();
    expect(claimed?.command.session.id).toBe(next.command.session.id);
    const previous = await source.query(
      'SELECT state,reason,command,"sendStartedAt" FROM calendar_sync."calendarCrmExportIntent" WHERE id = $1',
      [old.id],
    );
    expect(previous[0]).toMatchObject({
      state: 'NEEDS_REVIEW',
      reason: 'CRM_EXPORT_CONFIGURATION_CHANGED',
      command: old.command,
    });
    expect(previous[0].sendStartedAt).not.toBeNull();
  });
  test('storage boundary rejects calendar-origin and unsupported CRM keys', async () => {
    for (const recordingKey of [
      'session-create:manual',
      '',
      `session-create:calendar-create:${'a'.repeat(64)}`,
    ]) {
      expect(
        await store.prepare(
          { ...command, session: { ...command.session, recordingKey } },
          1,
        ),
      ).toBe('rejected');
    }
    expect(
      await source.query(
        'SELECT id FROM calendar_sync."calendarCrmExportIntent"',
      ),
    ).toEqual([]);
  });
  test('pause, rotated configuration or binding cannot authorize the frozen lease', async () => {
    const current = await lease();
    await source.query(
      `UPDATE calendar_sync."calendarConnection" SET state = 'PAUSED'`,
    );
    expect(await store.authorize(current)).toBe(false);
    expect(await store.beginSend(current)).toBe(false);
    await source.query(
      `UPDATE calendar_sync."calendarConnection" SET state = 'ACTIVE', "configurationVersion" = 2`,
    );
    expect(await store.authorize(current)).toBe(false);
    expect(
      await new CalendarCrmExportStore(source, scope, 'other').authorize(
        current,
      ),
    ).toBe(false);
  });
  test('poll before finalization cannot become a calendar-origin create candidate', async () => {
    await lease();
    await pollResource();
    const reconciler = new CalendarCrmReconciliationStore(source, scope);
    expect(await reconciler.claimNext()).toBeNull();
    const rows = await source.query(
      'SELECT decision, reason FROM calendar_sync."calendarCrmReconciliation"',
    );
    expect(rows).toEqual([
      { decision: 'NEEDS_REVIEW', reason: 'CRM_EXPORT_INTENT_OWNS_UID' },
    ]);
  });
  test('a UID discovered by a later poll blocks initial creation under the send fence', async () => {
    const current = await lease();
    await pollResource();
    expect(await store.beginSend(current)).toBe(false);
    const rows = await source.query(
      'SELECT "sendStartedAt" FROM calendar_sync."calendarCrmExportIntent"',
    );
    expect(rows[0].sendStartedAt).toBeNull();
  });
  test('exact GET proof plus polled resource atomically creates link and common base', async () => {
    const current = await lease();
    expect(
      await store.recordVerified(current, '"one"', command.calendarData),
    ).toBe(true);
    expect(await store.finalize(current, command.session)).toBe(
      'waiting-for-poll',
    );
    const polled = await pollResource();
    expect(await store.finalize(current, command.session)).toBe('finalized');
    const links = await source.query(
      'SELECT uid,"classSessionId","recordingKey","commonBase" FROM calendar_sync."calendarSessionLink"',
    );
    expect(links[0]).toMatchObject({
      uid: command.uid,
      classSessionId: session.id,
      recordingKey: session.recordingKey,
      commonBase: { name: session.name },
    });
    expect(
      (
        await source.query(
          'SELECT state FROM calendar_sync."calendarInbox" WHERE id=$1',
          [polled.inboxId],
        )
      )[0].state,
    ).toBe('APPLIED');
    expect(
      (
        await source.query(
          'SELECT state FROM calendar_sync."calendarCrmExportIntent"',
        )
      )[0].state,
    ).toBe('CONFIRMED');
  });
  test('subsequent polls of a confirmed CRM export are linked locally without UID-derived CRM lookup', async () => {
    const current = await lease();
    await store.recordVerified(current, '"one"', command.calendarData);
    const polled = await pollResource();
    expect(await store.finalize(current, command.session)).toBe('finalized');
    await source.query(
      'UPDATE calendar_sync."calendarResource" SET "resourceVersion" = 2 WHERE id = $1',
      [polled.resourceId],
    );
    const inbox: { id: string }[] = await source.query(
      `INSERT INTO calendar_sync."calendarInbox" ("workspaceId","connectionId","resourceId","resourceVersion",kind,etag,"contentHash","calendarData") VALUES ($1,$2,$3,2,'UPSERT','"two"','hash',$4) RETURNING id`,
      [
        scope.workspaceId,
        scope.connectionId,
        polled.resourceId,
        command.calendarData,
      ],
    );
    await source.query(
      `INSERT INTO calendar_sync."calendarImportPreview" ("inboxId","configurationVersion",decision,candidate) VALUES ($1,1,'READY',$2::jsonb)`,
      [inbox[0].id, JSON.stringify({ uid: command.uid })],
    );
    expect(
      await new CalendarCrmReconciliationStore(source, scope).claimNext(),
    ).toBeNull();
    expect(
      (
        await source.query(
          'SELECT decision FROM calendar_sync."calendarCrmReconciliation" WHERE "inboxId" = $1',
          [inbox[0].id],
        )
      )[0].decision,
    ).toBe('LINKED');
    expect(
      (
        await source.query(
          'SELECT state FROM calendar_sync."calendarInbox" WHERE id = $1',
          [inbox[0].id],
        )
      )[0].state,
    ).toBe('APPLIED');
  });
  test('failed finalization rolls back link, merge base and inbox acknowledgement together', async () => {
    const current = await lease();
    await store.recordVerified(current, '"one"', command.calendarData);
    const polled = await pollResource();
    await source.query(
      `ALTER TABLE calendar_sync."calendarDescriptionRefresh" ADD CONSTRAINT test_export_failure CHECK (uid <> '${command.uid}')`,
    );
    try {
      await expect(store.finalize(current, command.session)).rejects.toThrow();
    } finally {
      await source.query(
        'ALTER TABLE calendar_sync."calendarDescriptionRefresh" DROP CONSTRAINT test_export_failure',
      );
    }
    expect(
      await source.query('SELECT * FROM calendar_sync."calendarSessionLink"'),
    ).toEqual([]);
    expect(
      (
        await source.query(
          'SELECT state FROM calendar_sync."calendarInbox" WHERE id=$1',
          [polled.inboxId],
        )
      )[0].state,
    ).toBe('PENDING');
    expect(
      (
        await source.query(
          'SELECT state FROM calendar_sync."calendarCrmExportIntent"',
        )
      )[0].state,
    ).toBe('RUNNING');
  });
  test('CRM change or mismatching live body cannot establish a false base', async () => {
    const current = await lease();
    expect(
      await store.recordVerified(
        current,
        '"one"',
        command.calendarData.replace('SUMMARY:Test', 'SUMMARY:Changed'),
      ),
    ).toBe(false);
    await pollResource();
    expect(
      await store.finalize(current, { ...command.session, name: 'Changed' }),
    ).toBe('review');
    expect(
      await source.query('SELECT * FROM calendar_sync."calendarSessionLink"'),
    ).toEqual([]);
  });
  test('command tampering and stale generation cannot record verification', async () => {
    const current = await lease();
    expect(
      await store.authorize({
        ...current,
        command: { ...current.command, uid: 'changed' },
      }),
    ).toBe(false);
    expect(
      await store.recordVerified(
        { ...current, leaseGeneration: current.leaseGeneration + 1 },
        '"one"',
        command.calendarData,
      ),
    ).toBe(false);
  });
});
