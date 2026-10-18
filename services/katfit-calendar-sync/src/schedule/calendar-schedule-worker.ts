import { calendarLogger } from '../observability/calendar-logger';
import { type DataSource } from 'typeorm';

import { type CalendarSessionLookup } from '../crm/find-calendar-session';
import {
  matchesCalendarScheduleTarget,
  recoverCalendarScheduleUpdate,
  type CalendarScheduleUpdate,
  type CalendarScheduleUpdateResult,
} from '../crm/update-calendar-schedule';
import { renderCalendarSchedule } from '../domain/render-calendar-schedule';
import { type CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { CalendarScheduleStore } from '../storage/calendar-schedule.store';
import { StudioCalendarOperationStore } from '../storage/studio-calendar-operation.store';
import {
  createYandexCalDavTransport,
  type YandexCalDavTransport,
} from '../transport/create-yandex-caldav-transport';
import { readCalendarResource } from '../transport/read-calendar-resource';
import { writeCalDavResource } from '../transport/write-caldav-resource';
import {
  calendarSchedulePayloadSchema,
  normalizeCalendarScheduleData,
} from './calendar-schedule-payload';

export class CalendarSchedulePreparer {
  constructor(
    private readonly store: CalendarScheduleStore,
    private readonly lookup: (key: string) => Promise<CalendarSessionLookup>,
  ) {}
  async runOnce(): Promise<'idle' | 'saved' | 'stale' | 'unchanged'> {
    const candidate = await this.store.takeCandidate();
    if (!candidate) return 'idle';
    const result = await this.lookup(candidate.recordingKey);
    if (result.status !== 'matched') return 'idle';
    return this.store.prepare(candidate, result.session);
  }
}

export class CalendarScheduleWorker {
  private readonly operations: StudioCalendarOperationStore;
  constructor(
    source: DataSource,
    private readonly store: CalendarScheduleStore,
    private readonly cipher: CalendarCredentialCipher,
    private readonly lookup: (key: string) => Promise<CalendarSessionLookup>,
    private readonly send: (
      command: CalendarScheduleUpdate,
    ) => Promise<CalendarScheduleUpdateResult>,
    private readonly transport: typeof createYandexCalDavTransport = createYandexCalDavTransport,
  ) {
    this.operations = new StudioCalendarOperationStore(source);
  }

  async runOnce(): Promise<'idle' | 'saved' | 'stale'> {
    if (!(await this.store.active())) return 'idle';
    const operation = await this.operations.claimNext(
      this.store.scope,
      300,
      'RECONCILE_RESOURCE',
    );
    if (!operation) return 'idle';
    const lease = {
      ...this.store.scope,
      id: operation.id,
      leaseGeneration: operation.leaseGeneration,
    };
    const retry = async () =>
      (await this.operations.settle(lease, {
        state: 'RETRY',
        delaySeconds: 60,
        requiresReconciliation: true,
        errorCode: 'SCHEDULE_UNCONFIRMED',
      }))
        ? ('saved' as const)
        : ('stale' as const);
    const parsed = calendarSchedulePayloadSchema.safeParse(operation.payload);
    if (!parsed.success) {
      await this.operations.settle(lease, {
        state: 'FAILED',
        errorCode: 'INVALID_SCHEDULE_OPERATION',
      });
      return 'saved';
    }
    const payload = parsed.data;
    const review = async (reason: string) => {
      await this.store.review(operation, payload, reason);
      calendarLogger.event('info', 'schedule.review_required', {
        worker: 'schedule',
        operationId: operation.id,
        connectionId: this.store.scope.connectionId,
        classSessionId: payload.command.expected.id,
        result: 'needs-review',
        reason,
      });
      return 'saved' as const;
    };
    const same = (left: string, right: string) =>
      normalizeCalendarScheduleData(left) ===
      normalizeCalendarScheduleData(right);
    let transport: YandexCalDavTransport | undefined;
    try {
      const rendered = renderCalendarSchedule({
        calendarData: payload.sourceData,
        uid: payload.uid,
        snapshot: payload.snapshot,
      });
      if (
        rendered.status !== 'rendered' ||
        !same(rendered.calendarData, payload.calendarData) ||
        payload.command.target.name !== payload.snapshot.name ||
        payload.command.target.startsAt !==
          payload.snapshot.interval.startsAt ||
        payload.command.target.endsAt !== payload.snapshot.interval.endsAt
      )
        return review('INVALID_SCHEDULE_PATCH');
      const context = await this.store.context(operation, payload);
      if (!context) return review('SCHEDULE_CONTEXT_CHANGED');
      transport = this.transport({
        username: context.username,
        appPassword: this.cipher.open(
          { ...this.store.scope, username: context.username },
          context.encryptedAppPassword,
        ),
      });
      const request = transport.fetch;
      const read = () =>
        readCalendarResource(payload.calendarUrl, payload.resourceUrl, request);
      const allowed = (remote: Awaited<ReturnType<typeof read>>) =>
        remote.status === 'read' &&
        (same(remote.calendarData, payload.calendarData) ||
          (remote.etag === payload.expectedEtag &&
            same(remote.calendarData, payload.sourceData)));
      let remote = await read();
      if (remote.status === 'unavailable') return retry();
      if (!allowed(remote)) return review('CALENDAR_CHANGED_BEFORE_TRANSFER');
      const recovered = await recoverCalendarScheduleUpdate(payload.command, {
        lookup: this.lookup,
        send: async (command) => {
          const result = await this.send(command);
          calendarLogger.event('debug', 'crm.schedule.send_result', {
            worker: 'schedule',
            operationId: operation.id,
            connectionId: this.store.scope.connectionId,
            result: result.status,
          });
          return result;
        },
        authorizeSend: async () => {
          if (!(await this.store.context(operation, payload))) return false;
          remote = await read();
          return allowed(remote);
        },
      });
      if (recovered.status === 'unconfirmed') return retry();
      if (recovered.status !== 'applied')
        return review(
          `CRM_SCHEDULE_${recovered.status.toUpperCase().replaceAll('-', '_')}`,
        );
      remote = await read();
      if (remote.status === 'unavailable') return retry();
      if (remote.status !== 'read' || !allowed(remote))
        return review('CALENDAR_CHANGED_AFTER_CRM_TRANSFER');
      if (!same(remote.calendarData, payload.calendarData)) {
        if (Date.parse(payload.snapshot.interval.startsAt) <= Date.now())
          return review('SCHEDULE_TARGET_ALREADY_STARTED');
        const session = await this.lookup(
          payload.command.expected.recordingKey,
        );
        if (
          session.status !== 'matched' ||
          !matchesCalendarScheduleTarget(session.session, payload.command)
        )
          return review('CRM_CHANGED_BEFORE_CALDAV_TRANSFER');
        if (!(await this.store.context(operation, payload)))
          return review('SCHEDULE_CONTEXT_CHANGED');
        const result = await writeCalDavResource({
          calendarUrl: payload.calendarUrl,
          resourceUrl: payload.resourceUrl,
          operation: {
            action: 'update',
            expectedEtag: remote.etag,
            calendarData: payload.calendarData,
          },
          fetch: request,
        });
        if (result.status === 'conflict' || result.status === 'not-found')
          return review('CALDAV_SCHEDULE_WRITE_CONFLICT');
        if (!['written', 'unconfirmed', 'retryable'].includes(result.status))
          return review('CALDAV_SCHEDULE_WRITE_REJECTED');
      }
      const verified = await read();
      if (verified.status === 'unavailable') return retry();
      if (
        verified.status !== 'read' ||
        !same(verified.calendarData, payload.calendarData)
      )
        return review('CALDAV_SCHEDULE_VERIFICATION_CHANGED');
      const session = await this.lookup(payload.command.expected.recordingKey);
      if (session.status === 'unavailable') return retry();
      if (
        session.status !== 'matched' ||
        !matchesCalendarScheduleTarget(session.session, payload.command)
      )
        return review('CRM_SCHEDULE_VERIFICATION_CHANGED');
      if (
        !(await this.store.finish(
          operation,
          payload,
          session.session,
          verified.calendarData,
          verified.etag,
        ))
      )
        return retry();
      calendarLogger.event('info', 'schedule.synchronization.confirmed', {
        worker: 'schedule',
        operationId: operation.id,
        connectionId: this.store.scope.connectionId,
        classSessionId: session.session.id,
        result: 'both-sides-verified',
      });
      return 'saved';
    } catch {
      return retry();
    } finally {
      await transport?.close().catch(() => undefined);
    }
  }
}
