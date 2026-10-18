import { calendarSchedulePayloadSchema } from '../calendar-schedule-payload';
import { CalendarScheduleReview } from '../calendar-schedule-review';
import { CalendarScheduleReviewStore } from '../../storage/calendar-schedule-review.store';
import { CalendarCancellationStore } from '../../storage/calendar-cancellation.store';
import { CalendarCancellationWorker } from '../../cancellation/calendar-cancellation-worker';
import { type CalendarCancellationImpact } from '../../crm/read-calendar-cancellation-impact';
import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { createCalendarSessionCommand } from '../../domain/create-calendar-session-command';
import { prepareCalendarSession } from '../../domain/prepare-calendar-session';
import {
  type CalendarSessionLookup,
  type CalendarCrmSession,
} from '../../crm/find-calendar-session';
import { createCapabilityFixture } from '../../crm/__tests__/fixtures/calendar-capability-fixture';
import { CalendarPoller } from '../../polling/calendar-poller';
import { CalendarCredentialCipher } from '../../security/calendar-credential-cipher';
import { CalendarActivationStore } from '../../storage/calendar-activation.store';
import { CalendarConnectionStore } from '../../storage/calendar-connection.store';
import { CalendarPollStore } from '../../storage/calendar-poll.store';
import { CalendarScheduleStore } from '../../storage/calendar-schedule.store';
import { createCalendarDataSource } from '../../storage/create-calendar-data-source';
import { StudioCalendarOperationStore } from '../../storage/studio-calendar-operation.store';
import { type CalendarSnapshotResult } from '../../transport/read-calendar-snapshot';
import { type createYandexCalDavTransport } from '../../transport/create-yandex-caldav-transport';
import {
  CalendarSchedulePreparer,
  CalendarScheduleWorker,
} from '../calendar-schedule-worker';

const socketPath = process.env.STUDIO_CALENDAR_TEST_SOCKET;
const describeWithDatabase = socketPath ? describe : describe.skip;

describeWithDatabase(
  'Durable schedule transfers with isolated PostgreSQL',
  () => {
    const workspaceId = randomUUID(),
      connectionId = randomUUID();
    const scope = { workspaceId, connectionId };
    const database = `calendar_schedule_${randomUUID().replaceAll('-', '')}`;
    const cipher = new CalendarCredentialCipher('primary', {
      primary: 'ab'.repeat(32),
    });
    const calendarUrl = 'https://caldav.yandex.ru/calendars/test/classes/';
    const resourceUrl = `${calendarUrl}one.ics`;
    const original = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:one',
      'SUMMARY:Тренировка',
      'DTSTART:20990110T090000Z',
      'DURATION:PT1H',
      'DESCRIPTION:Заметка\\nKATFIT:\\nformat=GROUP_REFORMER\\ncapacity=6',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const base = {
      name: 'Тренировка',
      interval: {
        startsAt: '2099-01-10T09:00:00.000Z',
        endsAt: '2099-01-10T10:00:00.000Z',
        timezone: 'UTC',
      },
    };
    const evidence = createCapabilityFixture(workspaceId).evidence;
    let admin: DataSource,
      source: DataSource,
      store: CalendarScheduleStore,
      poller: CalendarPoller;
    let remote: string,
      etag: string,
      session: CalendarCrmSession,
      putCount: number,
      sendCount: number,
      loseWrite: boolean,
      unavailableAfterPut: boolean;
    let missingRemote = false,
      cancellationGetCount = 0,
      cancellationReadStatus = 0;
    let cancellationImpact: CalendarCancellationImpact = {
      status: 'read',
      totalBookings: 0,
      activeBookings: 0,
      attendedBookings: 0,
      expectedPayments: 0,
      paidBookings: 0,
      consumingBookings: 0,
    };
    let loseCrmReply = false,
      failLookupAfterSend = false;
    const reader = async (): Promise<CalendarSnapshotResult> => ({
      status: 'snapshot',
      resources: missingRemote
        ? []
        : [{ url: resourceUrl, etag, calendarData: remote }],
    });
    const lookup = async (): Promise<CalendarSessionLookup> =>
      failLookupAfterSend && sendCount > 0
        ? { status: 'unavailable' }
        : { status: 'matched', session: { ...session } };
    const request: typeof fetch = async (url, options) => {
      const request = new Request(url, options);
      if (request.method === 'PUT') {
        putCount++;
        if (request.headers.get('If-Match') !== etag)
          return new Response(null, { status: 412 });
        remote = await request.text();
        etag = '"written"';
        if (loseWrite) throw Error('Lost response');
        return new Response(null, { status: 204 });
      }
      cancellationGetCount++;
      if (cancellationReadStatus)
        return new Response(null, { status: cancellationReadStatus });
      if (missingRemote) return new Response(null, { status: 404 });
      if (unavailableAfterPut && putCount > 0)
        throw Error('Temporary GET outage');
      return new Response(remote, {
        headers: { ETag: etag, 'Content-Type': 'text/calendar' },
      });
    };
    const transport: typeof createYandexCalDavTransport = () => ({
      fetch: request,
      close: async () => undefined,
    });
    const confirmedGatewayCommands = new Set<string>();
    const worker = () =>
      new CalendarScheduleWorker(
        source,
        store,
        cipher,
        lookup,
        async (command) => {
          const commandKey = JSON.stringify(command);
          if (confirmedGatewayCommands.has(commandKey))
            return { status: 'applied' };
          sendCount++;
          if (
            session.name !== command.expected.name ||
            Date.parse(session.startsAt) !==
              Date.parse(command.expected.startsAt)
          )
            return { status: 'conflict' };
          session = { ...session, ...command.target };
          confirmedGatewayCommands.add(commandKey);
          return { status: loseCrmReply ? 'unconfirmed' : 'applied' };
        },
        transport,
      );
    const prepare = () => new CalendarSchedulePreparer(store, lookup).runOnce();
    const activate = () =>
      new CalendarActivationStore(source, scope, evidence.binding).activate(
        1,
        evidence,
      );
    const poll = async () => {
      await source.query(
        'UPDATE calendar_sync."calendarConnection" SET "nextPollAt" = now()',
      );
      await poller.runOnce();
    };
    const retryNow = () =>
      source.query(
        `UPDATE calendar_sync."studioCalendarOperation" SET "nextAttemptAt" = now() WHERE state = 'RETRY'`,
      );
    const operation = async () =>
      (
        await source.query(
          'SELECT * FROM calendar_sync."studioCalendarOperation"',
        )
      )[0];
    const link = async () =>
      (
        await source.query('SELECT * FROM calendar_sync."calendarSessionLink"')
      )[0];

    beforeAll(async () => {
      if (!socketPath?.startsWith('/tmp/studio-caldav-postgres.'))
        throw Error('Isolated socket required');
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
        migrations: createCalendarDataSource('postgres://localhost/test')
          .options.migrations,
      }).initialize();
      await source.query('CREATE SCHEMA calendar_sync');
      await source.runMigrations({ transaction: 'all' });
      store = new CalendarScheduleStore(source, scope, evidence.binding);
      poller = new CalendarPoller(
        new CalendarPollStore(source, cipher),
        reader,
      );
    });
    beforeEach(async () => {
      missingRemote = false;
      cancellationGetCount = 0;
      cancellationReadStatus = 0;
      cancellationImpact = {
        status: 'read',
        totalBookings: 0,
        activeBookings: 0,
        attendedBookings: 0,
        expectedPayments: 0,
        paidBookings: 0,
        consumingBookings: 0,
      };
      remote = original;
      etag = '"v1"';
      putCount = 0;
      sendCount = 0;
      confirmedGatewayCommands.clear();
      loseWrite = false;
      unavailableAfterPut = false;
      loseCrmReply = false;
      failLookupAfterSend = false;
      await new CalendarConnectionStore(source, cipher).createPreview({
        id: connectionId,
        workspaceId,
        username: 'test@yandex.ru',
        appPassword: 'test-secret',
        timezone: 'UTC',
        calendar: {
          url: calendarUrl,
          displayName: 'Тренировки',
          reports: [],
          writeAccess: 'unverified',
        },
      });
      await poll();
      const candidate = prepareCalendarSession({
        ...scope,
        calendarData: remote,
        options: { timezone: 'UTC' },
        now: new Date(),
      });
      if (candidate.decision !== 'READY') throw Error('Expected candidate');
      const command = createCalendarSessionCommand(candidate.candidate);
      session = {
        id: randomUUID(),
        recordingKey: candidate.candidate.recordingKey,
        name: command.name,
        startsAt: base.interval.startsAt,
        endsAt: base.interval.endsAt,
        capacity: command.capacity,
        sessionFormat: command.sessionFormat,
        status: 'PLANNED',
      };
      const resource = (
        await source.query('SELECT id FROM calendar_sync."calendarResource"')
      )[0];
      await source.query(
        `INSERT INTO calendar_sync."calendarSessionLink" ("workspaceId", "connectionId", uid, "recurrenceKey", "classSessionId", "resourceId", "recordingKey", "observedSession", "commonBase", "baseResourceVersion", "baseEtag") VALUES ($1,$2,'one','single',$3,$4,$5,$6::jsonb,$7::jsonb,1,$8)`,
        [
          workspaceId,
          connectionId,
          session.id,
          resource.id,
          session.recordingKey,
          JSON.stringify(session),
          JSON.stringify(base),
          etag,
        ],
      );
      await source.query(
        `UPDATE calendar_sync."calendarInbox" SET state = 'APPLIED'`,
      );
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

    it('persists a CRM transfer in PREVIEW, then resumes and advances base only after polling confirms the PUT', async () => {
      session = {
        ...session,
        startsAt: '2099-01-11T09:00:00Z',
        endsAt: '2099-01-11T10:00:00Z',
      };
      expect(await prepare()).toBe('saved');
      const frozen = (await operation()).payload;
      expect(await worker().runOnce()).toBe('idle');
      expect(putCount).toBe(0);
      await activate();
      expect(await worker().runOnce()).toBe('saved');
      expect((await operation()).state).toBe('RETRY');
      expect((await link()).commonBase).toEqual(base);
      await poll();
      await retryNow();
      expect(await worker().runOnce()).toBe('saved');
      expect((await operation()).state).toBe('SUCCEEDED');
      expect((await operation()).payload).toEqual(frozen);
      expect((await link()).commonBase.interval.startsAt).toBe(
        '2099-01-11T09:00:00.000Z',
      );
      expect(putCount).toBe(1);
      expect(sendCount).toBe(0);
    });
    it('imports a calendar transfer without rewriting the unchanged calendar', async () => {
      await activate();
      remote = original.replace('20990110T090000', '20990111T090000');
      etag = '"v2"';
      await poll();
      expect(await prepare()).toBe('saved');
      expect(await worker().runOnce()).toBe('saved');
      expect((await operation()).state).toBe('SUCCEEDED');
      expect(session.startsAt).toBe('2099-01-11T09:00:00.000Z');
      expect(sendCount).toBe(1);
      expect(putCount).toBe(0);
    });
    it('recovers a lost PUT response after a restart without a second PUT', async () => {
      await activate();
      session.name = 'Новое название';
      await prepare();
      loseWrite = true;
      unavailableAfterPut = true;
      await worker().runOnce();
      expect((await operation()).state).toBe('RETRY');
      expect((await link()).commonBase).toEqual(base);
      unavailableAfterPut = false;
      await poll();
      await retryNow();
      await worker().runOnce();
      expect((await operation()).state).toBe('SUCCEEDED');
      expect(putCount).toBe(1);
    });
    it('blocks further planning after a concurrent calendar edit without overwriting notes', async () => {
      await activate();
      session.name = 'Новое название';
      await prepare();
      remote = original.replace('Заметка', 'Новая заметка');
      etag = '"edited"';
      await worker().runOnce();
      expect((await operation()).state).toBe('CONFLICT');
      expect((await link()).scheduleReviewReason).toBeTruthy();
      expect((await link()).commonBase).toEqual(base);
      expect(putCount).toBe(0);
      expect(sendCount).toBe(0);
      expect(remote).toContain('Новая заметка');
    });
    it('refuses a concurrent CRM change after an intent was saved', async () => {
      await activate();
      remote = original.replace('20990110T090000', '20990111T090000');
      etag = '"v2"';
      await poll();
      await prepare();
      session.name = 'Правка пользователя';
      await worker().runOnce();
      expect((await operation()).state).toBe('CONFLICT');
      expect(sendCount).toBe(0);
      expect(putCount).toBe(0);
    });
    it('does not consume intents after a pause', async () => {
      await activate();
      session.name = 'Новое название';
      await prepare();
      await new CalendarConnectionStore(source).pause(
        { workspaceId, id: connectionId },
        1,
      );
      expect(await worker().runOnce()).toBe('idle');
      expect((await operation()).state).toBe('PENDING');
    });
    it('fences a stale worker after lease reclamation', async () => {
      await activate();
      session.name = 'Новое название';
      await prepare();
      const operations = new StudioCalendarOperationStore(source);
      const claimed = (await operations.claimNext(
        scope,
        300,
        'RECONCILE_RESOURCE',
      ))!;
      await source.query(
        `UPDATE calendar_sync."studioCalendarOperation" SET "leaseUntil" = now() - interval '1 second'`,
      );
      const reclaimed = (await operations.claimNext(
        scope,
        300,
        'RECONCILE_RESOURCE',
      ))!;
      expect(reclaimed.leaseGeneration).toBeGreaterThan(
        claimed.leaseGeneration,
      );
      expect(
        await store.context(
          claimed,
          calendarSchedulePayloadSchema.parse(claimed.payload),
        ),
      ).toBeNull();
      expect((await link()).commonBase).toEqual(base);
    });
    it('ignores unchanged schedules and detects stale preparation', async () => {
      expect(await prepare()).toBe('unchanged');
      await source.query(
        'UPDATE calendar_sync."calendarSessionLink" SET "nextScheduleCheckAt" = now()',
      );
      const candidate = (await store.takeCandidate())!;
      remote = original.replace('Заметка', 'Новая заметка');
      etag = '"v2"';
      await poll();
      session.name = 'Новое имя';
      expect(await store.prepare(candidate, session)).toBe('stale');
      expect(await operation()).toBeUndefined();
    });
    it('recovers an uncertain CRM response without sending the same transfer twice', async () => {
      await activate();
      remote = original.replace('20990110T090000', '20990111T090000');
      etag = '"v2"';
      await poll();
      await prepare();
      loseCrmReply = true;
      failLookupAfterSend = true;
      await worker().runOnce();
      expect((await operation()).state).toBe('RETRY');
      expect((await link()).commonBase).toEqual(base);
      failLookupAfterSend = false;
      await retryNow();
      await worker().runOnce();
      expect((await operation()).state).toBe('SUCCEEDED');
      expect(sendCount).toBe(1);
      expect(putCount).toBe(0);
    });
    it('merges independent calendar transfer and CRM rename through both sides', async () => {
      await activate();
      session.name = 'Новое имя';
      remote = original.replace('20990110T090000', '20990111T090000');
      etag = '"v2"';
      await poll();
      await prepare();
      await worker().runOnce();
      expect(session.name).toBe('Новое имя');
      expect(session.startsAt).toBe('2099-01-11T09:00:00.000Z');
      await poll();
      await retryNow();
      await worker().runOnce();
      expect((await operation()).state).toBe('SUCCEEDED');
      expect((await link()).commonBase.name).toBe('Новое имя');
      expect(putCount).toBe(1);
      expect(sendCount).toBe(1);
    });
    it('serializes competing claims across connection workers', async () => {
      await activate();
      session.name = 'Новое имя';
      await prepare();
      const operations = new StudioCalendarOperationStore(source);
      const claimed = await Promise.all([
        operations.claimNext(scope, 300, 'RECONCILE_RESOURCE'),
        operations.claimNext(scope, 300, 'RECONCILE_RESOURCE'),
      ]);
      expect(claimed.filter(Boolean)).toHaveLength(1);
    });
    it('rolls back operation success when base persistence fails', async () => {
      await activate();
      remote = original.replace('20990110T090000', '20990111T090000');
      etag = '"v2"';
      await poll();
      await prepare();
      await source.query(
        `ALTER TABLE calendar_sync."calendarSessionLink" ADD CONSTRAINT test_schedule_base_failure CHECK ("baseEtag" = '"v1"')`,
      );
      try {
        await worker().runOnce();
        expect((await operation()).state).toBe('RETRY');
        expect((await link()).commonBase).toEqual(base);
        expect(sendCount).toBe(1);
      } finally {
        await source.query(
          'ALTER TABLE calendar_sync."calendarSessionLink" DROP CONSTRAINT test_schedule_base_failure',
        );
      }
      await retryNow();
      await worker().runOnce();
      expect((await operation()).state).toBe('SUCCEEDED');
      expect(sendCount).toBe(1);
    });
    it('rejects ambiguous duplicate UIDs during planning', async () => {
      session.name = 'Новое имя';
      await source.query(`INSERT INTO calendar_sync."calendarResource" ("workspaceId", "connectionId", url, etag, "contentHash", "calendarData", "lastSeenGeneration")
      SELECT "workspaceId", "connectionId", url || '-duplicate', etag, "contentHash", "calendarData", "lastSeenGeneration" FROM calendar_sync."calendarResource"`);
      await prepare();
      expect((await link()).scheduleReviewReason).toBe(
        'SCHEDULE_DUPLICATE_OR_UNVERIFIABLE_UID',
      );
      expect(await operation()).toBeUndefined();
    });

    const conflictingNames = async () => {
      session.name = 'Название CRM';
      remote = original.replace(
        'SUMMARY:Тренировка',
        'SUMMARY:Название календаря',
      );
      etag = '"conflicting"';
      await poll();
      await prepare();
      expect((await link()).scheduleReviewReason).toBe(
        'SCHEDULE_CONFLICT:name',
      );
    };
    const reviewer = (now?: () => Date) =>
      new CalendarScheduleReview(
        new CalendarScheduleReviewStore(source, scope),
        cipher,
        lookup,
        transport,
        now,
      );
    const inspectConflict = async () => {
      const report = await reviewer().inspect('one');
      if (report.status !== 'review') throw Error('Expected review');
      return report;
    };
    it('lists scoped conflicts and queues an audited CRM choice without changing the common base', async () => {
      await activate();
      await conflictingNames();
      const report = await inspectConflict();
      expect(report.crm.name).toBe('Название CRM');
      expect(report.calendar.name).toBe('Название календаря');
      const store = new CalendarScheduleReviewStore(source, scope);
      expect(await store.list()).toHaveLength(1);
      expect(JSON.stringify(report)).not.toContain('test-secret');
      expect(JSON.stringify(report)).not.toContain('encryptedAppPassword');
      const result = await reviewer().resolve('one', report.reviewToken, 'crm');
      expect(result.status).toBe('queued');
      expect((await link()).commonBase).toEqual(base);
      expect((await operation()).payload.resolution).toEqual({
        reviewToken: report.reviewToken,
        choice: 'crm',
      });
      expect((await link()).scheduleReviewReason).toBeNull();
      await worker().runOnce();
      await poll();
      await retryNow();
      await worker().runOnce();
      expect((await operation()).state).toBe('SUCCEEDED');
      expect((await link()).commonBase.name).toBe('Название CRM');
      expect(putCount).toBe(1);
      expect(sendCount).toBe(0);
    });
    it('uses the calendar choice to update only CRM and keeps notes', async () => {
      await activate();
      await conflictingNames();
      const report = await inspectConflict();
      expect(
        (await reviewer().resolve('one', report.reviewToken, 'calendar'))
          .status,
      ).toBe('queued');
      await worker().runOnce();
      expect(session.name).toBe('Название календаря');
      expect((await operation()).state).toBe('SUCCEEDED');
      expect(sendCount).toBe(1);
      expect(putCount).toBe(0);
      expect(remote).toContain('Заметка');
    });
    it('rejects a decision after a fresh CRM edit', async () => {
      await conflictingNames();
      const report = await inspectConflict();
      session.name = 'Ещё одна правка';
      expect(
        await reviewer().resolve('one', report.reviewToken, 'crm'),
      ).toMatchObject({ status: 'blocked', reason: 'REVIEW_CHANGED' });
      expect(await operation()).toBeUndefined();
      expect((await link()).scheduleReviewReason).toBeTruthy();
    });
    it('requires a current polled resource before resolving changed calendar notes', async () => {
      await conflictingNames();
      const report = await inspectConflict();
      remote = remote.replace('Заметка', 'Изменённая заметка');
      etag = '"notes-edited"';
      expect(
        await reviewer().resolve('one', report.reviewToken, 'crm'),
      ).toMatchObject({
        status: 'blocked',
        reason: 'CALENDAR_SNAPSHOT_NOT_CURRENT',
      });
      await poll();
      expect(
        await reviewer().resolve('one', report.reviewToken, 'crm'),
      ).toMatchObject({ status: 'blocked', reason: 'REVIEW_CHANGED' });
      expect(await operation()).toBeUndefined();
    });
    it('rejects expired tokens and replay with a different choice', async () => {
      await conflictingNames();
      const report = await inspectConflict();
      const future = reviewer(() => new Date(Date.now() + 121000));
      expect(
        await future.resolve('one', report.reviewToken, 'crm'),
      ).toMatchObject({ status: 'blocked', reason: 'REVIEW_EXPIRED' });
      const first = await reviewer().resolve('one', report.reviewToken, 'crm');
      expect(first.status).toBe('queued');
      expect(
        await reviewer().resolve('one', report.reviewToken, 'crm'),
      ).toMatchObject({ status: 'queued' });
      expect(
        await reviewer().resolve('one', report.reviewToken, 'calendar'),
      ).toMatchObject({ status: 'blocked', reason: 'REVIEW_ALREADY_USED' });
      expect(
        await source.query(
          'SELECT id FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toHaveLength(1);
    });
    it('does not resolve across workspace scope or while an operation is running', async () => {
      await conflictingNames();
      const report = await inspectConflict();
      const other = new CalendarScheduleReviewStore(source, {
        workspaceId: randomUUID(),
        connectionId,
      });
      expect(await other.list()).toHaveLength(0);
      expect(await other.read('one')).toBeNull();
      await new StudioCalendarOperationStore(source).enqueue({
        ...scope,
        resourceKey: 'other',
        idempotencyKey: 'running-other',
        action: 'EXPORT_EVENT',
        payload: {},
      });
      await new StudioCalendarOperationStore(source).claimNext(
        scope,
        300,
        'EXPORT_EVENT',
      );
      expect(
        await reviewer().resolve('one', report.reviewToken, 'crm'),
      ).toEqual({ status: 'busy' });
      expect((await link()).scheduleReviewReason).toBeTruthy();
    });
    it('retains a historical failed operation when queuing its replacement', async () => {
      await activate();
      session.name = 'Название CRM';
      await prepare();
      remote = original.replace(
        'SUMMARY:Тренировка',
        'SUMMARY:Название календаря',
      );
      etag = '"conflicting"';
      await worker().runOnce();
      await poll();
      const old = await operation();
      expect(old.state).toBe('CONFLICT');
      const report = await inspectConflict();
      expect(
        (await reviewer().resolve('one', report.reviewToken, 'crm')).status,
      ).toBe('queued');
      const history = await source.query(
        'SELECT id, state, payload FROM calendar_sync."studioCalendarOperation" ORDER BY "createdAt"',
      );
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        id: old.id,
        state: 'CONFLICT',
        payload: old.payload,
      });
      expect(history[1].state).toBe('PENDING');
    });
    it('rolls back the resolution and outbox when clearing the review flag fails', async () => {
      await conflictingNames();
      const report = await inspectConflict();
      await source.query(
        'ALTER TABLE calendar_sync."calendarSessionLink" ADD CONSTRAINT test_review_flag CHECK ("scheduleReviewReason" IS NOT NULL)',
      );
      try {
        await expect(
          reviewer().resolve('one', report.reviewToken, 'crm'),
        ).rejects.toThrow();
        expect(await operation()).toBeUndefined();
        expect((await link()).scheduleReviewReason).toBeTruthy();
      } finally {
        await source.query(
          'ALTER TABLE calendar_sync."calendarSessionLink" DROP CONSTRAINT test_review_flag',
        );
      }
    });

    it('rejects decisions after connection configuration changed', async () => {
      await conflictingNames();
      const report = await inspectConflict();
      await new CalendarConnectionStore(source).pause(
        { workspaceId, id: connectionId },
        1,
      );
      expect(
        await reviewer().resolve('one', report.reviewToken, 'crm'),
      ).toMatchObject({ status: 'blocked', reason: 'REVIEW_CHANGED' });
      expect(await operation()).toBeUndefined();
      expect((await link()).scheduleReviewReason).toBeTruthy();
    });
    it('refuses to resolve completed or metadata-incompatible sessions', async () => {
      await conflictingNames();
      session.status = 'COMPLETED';
      expect(await reviewer().inspect('one')).toMatchObject({
        status: 'blocked',
        reason: 'CRM_SCHEDULE_NOT_EDITABLE',
      });
      session.status = 'PLANNED';
      session.capacity = 7;
      expect(await reviewer().inspect('one')).toMatchObject({
        status: 'blocked',
        reason: 'FORMAT_OR_CAPACITY_CHANGED',
      });
      expect(await operation()).toBeUndefined();
    });
    it('still catches a fresh edit after an operator has queued a decision', async () => {
      await activate();
      await conflictingNames();
      const report = await inspectConflict();
      await reviewer().resolve('one', report.reviewToken, 'calendar');
      session.name = 'Правка после решения';
      await worker().runOnce();
      expect((await operation()).state).toBe('CONFLICT');
      expect(sendCount).toBe(0);
      expect(putCount).toBe(0);
      expect(session.name).toBe('Правка после решения');
      expect((await link()).commonBase).toEqual(base);
    });
    it('accepts only one of two competing choices for the same review', async () => {
      await conflictingNames();
      const report = await inspectConflict();
      const results = await Promise.all([
        reviewer().resolve('one', report.reviewToken, 'crm'),
        reviewer().resolve('one', report.reviewToken, 'calendar'),
      ]);
      expect(
        results.filter((result) => result.status === 'queued'),
      ).toHaveLength(1);
      expect(
        await source.query(
          'SELECT id FROM calendar_sync."studioCalendarOperation"',
        ),
      ).toHaveLength(1);
    });

    const cancellationStore = () =>
      new CalendarCancellationStore(source, scope);
    const cancellationWorker = () =>
      new CalendarCancellationWorker(
        cancellationStore(),
        cipher,
        lookup,
        async () => cancellationImpact,
        transport,
      );
    const cancellationCheckNow = () =>
      source.query(
        'UPDATE calendar_sync."calendarSessionLink" SET "nextCancellationCheckAt" = now()',
      );
    const cancellationRequest = async () =>
      (
        await source.query(
          'SELECT * FROM calendar_sync."calendarCancellationReview" ORDER BY "createdAt" DESC',
        )
      )[0];
    const missingTwice = async () => {
      missingRemote = true;
      await poll();
      await poll();
      await source.query(
        `UPDATE calendar_sync."calendarInbox" SET "createdAt" = now() - interval '61 seconds' WHERE kind = 'MISSING_CANDIDATE'`,
      );
    };
    it('keeps a first missing snapshot awaiting confirmation without external requests', async () => {
      missingRemote = true;
      await poll();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).state).toBe('AWAITING_CONFIRMATION');
      expect((await cancellationRequest()).evidence.calendarConfirmed).toBe(
        false,
      );
      expect(cancellationGetCount).toBe(0);
      expect(sendCount).toBe(0);
      expect(putCount).toBe(0);
    });
    it('requires a minimum delay even after two successful missing inventories', async () => {
      missingRemote = true;
      await poll();
      await poll();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).reason).toBe(
        'SECOND_INVENTORY_AND_DELAY_REQUIRED',
      );
      expect(cancellationGetCount).toBe(0);
    });
    it('confirms deletion with GET but preserves bookings and financial history for domain review', async () => {
      await missingTwice();
      cancellationImpact = {
        status: 'read',
        totalBookings: 3,
        activeBookings: 1,
        attendedBookings: 1,
        expectedPayments: 1,
        paidBookings: 1,
        consumingBookings: 1,
      };
      await cancellationWorker().runOnce();
      const request = await cancellationRequest();
      expect(request.state).toBe('NEEDS_REVIEW');
      expect(request.reason).toBe('CANCELLATION_WITH_BOOKING_HISTORY');
      expect(request.evidence.calendarConfirmed).toBe(true);
      expect(request.evidence.impact).toEqual(cancellationImpact);
      expect(session.status).toBe('PLANNED');
      expect(sendCount).toBe(0);
      expect(putCount).toBe(0);
      expect((await link()).scheduleReviewReason).toBe(
        'CALENDAR_CANCELLATION_REQUIRES_REVIEW',
      );
      expect((await link()).commonBase).toEqual(base);
    });
    it('never auto-cancels even a session with no bookings', async () => {
      await missingTwice();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).reason).toBe(
        'CANCELLATION_REQUIRES_DOMAIN_COMMAND',
      );
      expect(session.status).toBe('PLANNED');
      expect(sendCount).toBe(0);
      expect(putCount).toBe(0);
    });
    it('does not turn an authorization failure into a confirmed deletion', async () => {
      await missingTwice();
      cancellationReadStatus = 401;
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).state).toBe('AWAITING_CONFIRMATION');
      expect((await cancellationRequest()).evidence.calendarConfirmed).toBe(
        false,
      );
    });
    it('recognizes STATUS:CANCELLED without treating it as an ordinary schedule edit', async () => {
      remote = original.replace('UID:one', 'UID:one\r\nSTATUS:CANCELLED');
      etag = '"cancelled"';
      await poll();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).kind).toBe('CANCELLED');
      expect((await cancellationRequest()).evidence.calendarConfirmed).toBe(
        true,
      );
      expect((await cancellationRequest()).state).toBe('NEEDS_REVIEW');
      expect(sendCount).toBe(0);
      expect(putCount).toBe(0);
    });
    it('supersedes a request when the same event reappears and clears only its own block', async () => {
      await missingTwice();
      await cancellationWorker().runOnce();
      missingRemote = false;
      await poll();
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).state).toBe('SUPERSEDED');
      expect((await link()).scheduleReviewReason).toBeNull();
      expect(await cancellationStore().list()).toHaveLength(0);
    });
    it('preserves an unrelated schedule conflict when a deleted event returns', async () => {
      await source.query(
        `UPDATE calendar_sync."calendarSessionLink" SET "scheduleReviewReason" = 'SCHEDULE_CONFLICT:name'`,
      );
      await missingTwice();
      await cancellationWorker().runOnce();
      missingRemote = false;
      await poll();
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
      expect((await link()).scheduleReviewReason).toBe(
        'SCHEDULE_CONFLICT:name',
      );
    });
    it('recognizes a UID relocated to another resource instead of confirming deletion', async () => {
      await missingTwice();
      await source.query(`INSERT INTO calendar_sync."calendarResource" ("workspaceId", "connectionId", url, etag, "contentHash", "calendarData", "lastSeenGeneration")
        SELECT "workspaceId", "connectionId", url || '-moved', etag, "contentHash", "calendarData", "lastSeenGeneration" FROM calendar_sync."calendarResource"`);
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).reason).toBe(
        'UID_RELOCATED_OR_DUPLICATE',
      );
      expect((await cancellationRequest()).evidence.calendarConfirmed).toBe(
        false,
      );
      expect(cancellationGetCount).toBe(0);
    });
    it('does not assume an empty booking list when the impact read fails', async () => {
      await missingTwice();
      cancellationImpact = { status: 'unavailable' };
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).reason).toBe(
        'CANCELLATION_IMPACT_UNCONFIRMED',
      );
      expect(session.status).toBe('PLANNED');
    });
    it('refuses stale confirmation after a poll or a pause', async () => {
      await missingTwice();
      const captured = (await cancellationStore().takeCandidate())!;
      await poll();
      expect(
        await cancellationStore().save(captured, {
          kind: 'MISSING',
          state: 'NEEDS_REVIEW',
          reason: 'test',
          evidence: {},
        }),
      ).toBe('stale');
      await cancellationCheckNow();
      const current = (await cancellationStore().takeCandidate())!;
      await new CalendarConnectionStore(source).pause(
        { workspaceId, id: connectionId },
        1,
      );
      expect(
        await cancellationStore().save(current, {
          kind: 'MISSING',
          state: 'NEEDS_REVIEW',
          reason: 'test',
          evidence: {},
        }),
      ).toBe('stale');
      expect(await cancellationRequest()).toBeUndefined();
    });
    it('keeps cancellation evidence and its schedule block atomic', async () => {
      await missingTwice();
      await source.query(
        'ALTER TABLE calendar_sync."calendarSessionLink" ADD CONSTRAINT test_cancellation_flag CHECK ("scheduleReviewReason" IS NULL)',
      );
      try {
        await expect(cancellationWorker().runOnce()).rejects.toThrow();
        expect(await cancellationRequest()).toBeUndefined();
        expect((await link()).scheduleReviewReason).toBeNull();
      } finally {
        await source.query(
          'ALTER TABLE calendar_sync."calendarSessionLink" DROP CONSTRAINT test_cancellation_flag',
        );
      }
    });

    const emptyImpact = (): Extract<
      CalendarCancellationImpact,
      { status: 'read' }
    > => ({
      status: 'read',
      bookingIds: [],
      totalBookings: 0,
      activeBookings: 0,
      attendedBookings: 0,
      expectedPayments: 0,
      paidBookings: 0,
      consumingBookings: 0,
    });
    const observeEmptyCancellation = async () => {
      await missingTwice();
      cancellationImpact = emptyImpact();
      await cancellationWorker().runOnce();
      session.status = 'CANCELLED_BY_STUDIO';
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
    };
    it('observes a manually cancelled empty session and retains the original baseline', async () => {
      await observeEmptyCancellation();
      const request = await cancellationRequest();
      expect(request.state).toBe('CRM_CANCELLED_OBSERVED');
      expect(request.initialBookingIds).toEqual([]);
      expect(request.outcomeObservedAt).toBeTruthy();
      expect(sendCount).toBe(0);
      expect(putCount).toBe(0);
      expect(session.status).toBe('CANCELLED_BY_STUDIO');
      const history = await cancellationStore().history(request.id);
      expect(history.map((item) => item.state)).toEqual([
        'CRM_CANCELLED_OBSERVED',
        'NEEDS_REVIEW',
      ]);
    });
    it('continues monitoring and reopens the request if a late booking appears', async () => {
      await observeEmptyCancellation();
      const bookingId = randomUUID();
      cancellationImpact = {
        ...emptyImpact(),
        status: 'read',
        bookingIds: [bookingId],
        totalBookings: 1,
        activeBookings: 1,
      };
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
      const request = await cancellationRequest();
      expect(request.state).toBe('NEEDS_REVIEW');
      expect(request.reason).toBe('CRM_CANCELLED_WITH_UNSETTLED_BOOKINGS');
      expect(request.outcomeObservedAt).toBeNull();
      expect(request.initialBookingIds).toEqual([]);
      expect(
        (await cancellationStore().history(request.id)).map(
          (item) => item.state,
        ),
      ).toEqual(['NEEDS_REVIEW', 'CRM_CANCELLED_OBSERVED', 'NEEDS_REVIEW']);
    });
    it('does not mark deleted booking history as successful cancellation', async () => {
      const bookingId = randomUUID();
      await missingTwice();
      cancellationImpact = {
        ...emptyImpact(),
        status: 'read',
        bookingIds: [bookingId],
        totalBookings: 1,
        activeBookings: 1,
      };
      await cancellationWorker().runOnce();
      session.status = 'CANCELLED_BY_STUDIO';
      cancellationImpact = emptyImpact();
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
      const request = await cancellationRequest();
      expect(request.initialBookingIds).toEqual([bookingId]);
      expect(request.state).toBe('NEEDS_REVIEW');
      expect(request.reason).toBe('CANCELLATION_BOOKING_HISTORY_MISSING');
    });
    it('does not infer financial reconciliation from cancellation flags on bookings', async () => {
      const bookingId = randomUUID();
      await missingTwice();
      cancellationImpact = {
        ...emptyImpact(),
        status: 'read',
        bookingIds: [bookingId],
        totalBookings: 1,
      };
      await cancellationWorker().runOnce();
      session.status = 'CANCELLED_BY_STUDIO';
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).reason).toBe(
        'CRM_CANCELLED_FINANCIAL_RECONCILIATION_REQUIRED',
      );
      expect((await cancellationRequest()).state).toBe('NEEDS_REVIEW');
    });
    it('refuses to replace a missing historical baseline with a post-cancellation empty list', async () => {
      await missingTwice();
      session.status = 'CANCELLED_BY_STUDIO';
      cancellationImpact = emptyImpact();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).initialBookingIds).toBeNull();
      expect((await cancellationRequest()).reason).toBe(
        'CANCELLATION_HISTORY_BASELINE_MISSING',
      );
    });
    it('deduplicates unchanged observations while preserving later state transitions', async () => {
      await observeEmptyCancellation();
      const request = await cancellationRequest();
      await poll();
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
      expect(await cancellationStore().history(request.id)).toHaveLength(2);
      const otherScope = new CalendarCancellationStore(source, {
        workspaceId: randomUUID(),
        connectionId,
      });
      expect(await otherScope.history(request.id)).toHaveLength(0);
    });
    it('persists outcome state and the appended observation in one transaction', async () => {
      await missingTwice();
      cancellationImpact = emptyImpact();
      await cancellationWorker().runOnce();
      const request = await cancellationRequest();
      await source.query(
        `ALTER TABLE calendar_sync."calendarCancellationObservation" ADD CONSTRAINT test_cancellation_observation_failure CHECK (reason = 'CANCELLATION_REQUIRES_DOMAIN_COMMAND')`,
      );
      try {
        session.status = 'CANCELLED_BY_STUDIO';
        await cancellationCheckNow();
        await expect(cancellationWorker().runOnce()).rejects.toThrow();
        expect((await cancellationRequest()).state).toBe('NEEDS_REVIEW');
        expect((await cancellationRequest()).outcomeObservedAt).toBeNull();
        expect(await cancellationStore().history(request.id)).toHaveLength(1);
      } finally {
        await source.query(
          'ALTER TABLE calendar_sync."calendarCancellationObservation" DROP CONSTRAINT test_cancellation_observation_failure',
        );
      }
    });
    it('retains late booking IDs so their deletion cannot produce a false observed cancellation', async () => {
      await observeEmptyCancellation();
      const bookingId = randomUUID();
      cancellationImpact = {
        ...emptyImpact(),
        bookingIds: [bookingId],
        totalBookings: 1,
        activeBookings: 1,
      };
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).seenBookingIds).toEqual([bookingId]);
      cancellationImpact = emptyImpact();
      await cancellationCheckNow();
      await cancellationWorker().runOnce();
      expect((await cancellationRequest()).reason).toBe(
        'CANCELLATION_BOOKING_HISTORY_MISSING',
      );
      expect((await cancellationRequest()).state).toBe('NEEDS_REVIEW');
    });
    it('reverses and reapplies the service-only migration', async () => {
      await source.undoLastMigration({ transaction: 'all' });
      await source.undoLastMigration({ transaction: 'all' });
      await source.undoLastMigration({ transaction: 'all' });
      await source.undoLastMigration({ transaction: 'all' });
      await expect(
        source.query(
          'SELECT "nextScheduleCheckAt" FROM calendar_sync."calendarSessionLink"',
        ),
      ).rejects.toThrow();
      await source.runMigrations({ transaction: 'all' });
      expect((await link()).scheduleReviewReason).toBeNull();
    });
  },
);
