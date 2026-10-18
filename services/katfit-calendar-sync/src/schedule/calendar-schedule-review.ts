import { createHash } from 'node:crypto';

import { type CalendarSessionLookup } from '../crm/find-calendar-session';
import { calendarScheduleUpdateSchema } from '../crm/update-calendar-schedule';
import { scheduleSchema } from '../domain/merge-session-schedule';
import { prepareCalendarSession } from '../domain/prepare-calendar-session';
import { renderCalendarSchedule } from '../domain/render-calendar-schedule';
import { type CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { CalendarScheduleReviewStore } from '../storage/calendar-schedule-review.store';
import {
  createYandexCalDavTransport,
  type YandexCalDavTransport,
} from '../transport/create-yandex-caldav-transport';
import { readCalendarResource } from '../transport/read-calendar-resource';
import {
  calendarSchedulePayloadSchema,
  normalizeCalendarScheduleData,
} from './calendar-schedule-payload';

export class CalendarScheduleReview {
  constructor(
    private readonly store: CalendarScheduleReviewStore,
    private readonly cipher: CalendarCredentialCipher,
    private readonly lookup: (key: string) => Promise<CalendarSessionLookup>,
    private readonly transport: typeof createYandexCalDavTransport = createYandexCalDavTransport,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async capture(uid: string, issuedAt: number) {
    const source = await this.store.read(uid);
    if (!source)
      return {
        status: 'blocked' as const,
        reason: 'SCHEDULE_REVIEW_NOT_AVAILABLE',
      };
    const base = scheduleSchema.safeParse(source.commonBase);
    if (!base.success)
      return { status: 'blocked' as const, reason: 'SCHEDULE_BASE_INVALID' };
    const found = await this.lookup(source.recordingKey);
    if (found.status !== 'matched')
      return {
        status: 'blocked' as const,
        reason: `CRM_${found.status.toUpperCase().replaceAll('-', '_')}`,
      };
    const session = found.session;
    if (
      session.id !== source.classSessionId ||
      session.recordingKey !== source.recordingKey
    )
      return { status: 'blocked' as const, reason: 'CRM_IDENTITY_CHANGED' };
    let transport: YandexCalDavTransport | undefined;
    try {
      transport = this.transport({
        username: source.username,
        appPassword: this.cipher.open(
          { ...this.store.scope, username: source.username },
          source.encryptedAppPassword,
        ),
      });
      const remote = await readCalendarResource(
        source.calendarUrl,
        source.resourceUrl,
        transport.fetch,
      );
      if (remote.status !== 'read')
        return {
          status: 'blocked' as const,
          reason: `CALDAV_${remote.status.toUpperCase().replaceAll('-', '_')}`,
        };
      if (
        remote.etag !== source.etag ||
        normalizeCalendarScheduleData(remote.calendarData) !==
          normalizeCalendarScheduleData(source.calendarData)
      )
        return {
          status: 'blocked' as const,
          reason: 'CALENDAR_SNAPSHOT_NOT_CURRENT',
        };
      const prepared = prepareCalendarSession({
        ...this.store.scope,
        calendarData: remote.calendarData,
        options: { timezone: source.timezone },
        now: this.now(),
      });
      if (prepared.decision !== 'READY' || prepared.candidate.uid !== uid)
        return {
          status: 'blocked' as const,
          reason:
            prepared.decision === 'READY'
              ? 'CALENDAR_IDENTITY_CHANGED'
              : prepared.reason,
        };
      const candidate = prepared.candidate;
      if (
        candidate.capacity !== session.capacity ||
        candidate.sessionFormat !== session.sessionFormat
      )
        return {
          status: 'blocked' as const,
          reason: 'FORMAT_OR_CAPACITY_CHANGED',
        };
      // The API session contains extra read-only fields; project only mutable preconditions.
      const command = calendarScheduleUpdateSchema.safeParse({
        expected: {
          id: session.id,
          recordingKey: session.recordingKey,
          name: session.name,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          capacity: session.capacity,
          sessionFormat: session.sessionFormat,
          status: session.status,
        },
        target: {
          name: session.name,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
        },
      });
      if (
        !command.success ||
        Date.parse(session.startsAt) <= this.now().getTime()
      )
        return {
          status: 'blocked' as const,
          reason: 'CRM_SCHEDULE_NOT_EDITABLE',
        };
      const crm = scheduleSchema.parse({
        name: session.name,
        interval: {
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          timezone: base.data.interval.timezone,
        },
      });
      const calendar = scheduleSchema.parse({
        name: candidate.name,
        interval: {
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          timezone: candidate.timezone,
        },
      });
      const fingerprint = {
        ...this.store.scope,
        uid,
        classSessionId: source.classSessionId,
        recordingKey: source.recordingKey,
        configurationVersion: source.configurationVersion,
        state: source.state,
        reason: source.scheduleReviewReason,
        calendarUrl: source.calendarUrl,
        resourceId: source.resourceId,
        resourceUrl: source.resourceUrl,
        resourceVersion: source.resourceVersion,
        etag: source.etag,
        sourceHash: createHash('sha256')
          .update(source.calendarData)
          .digest('hex'),
        base: base.data,
        expected: command.data.expected,
        crm,
        calendar,
      };
      const token = `${issuedAt}.${createHash('sha256')
        .update(JSON.stringify([issuedAt, fingerprint]))
        .digest('hex')}`;
      return {
        status: 'captured' as const,
        source,
        command: command.data,
        token,
        report: {
          ...this.store.scope,
          uid,
          reason: source.scheduleReviewReason,
          connectionState: source.state,
          configurationVersion: source.configurationVersion,
          resourceVersion: source.resourceVersion,
          classSessionId: source.classSessionId,
          base: base.data,
          crm,
          calendar,
          reviewToken: token,
          expiresAt: new Date(issuedAt + 120000).toISOString(),
        },
      };
    } finally {
      await transport?.close().catch(() => undefined);
    }
  }

  async inspect(uid: string) {
    const result = await this.capture(uid, this.now().getTime());
    return result.status === 'captured'
      ? { status: 'review' as const, ...result.report }
      : result;
  }

  async resolve(uid: string, token: string, choice: 'crm' | 'calendar') {
    if (
      !/^\d{13}\.[a-f0-9]{64}$/.test(token) ||
      !['crm', 'calendar'].includes(choice)
    )
      return { status: 'blocked' as const, reason: 'INVALID_REVIEW_SELECTION' };
    const existing = await this.store.existing(token);
    if (existing)
      return existing.uid === uid && existing.choice === choice
        ? {
            status: 'queued' as const,
            operationId: existing.id,
            operationState: existing.state,
          }
        : { status: 'blocked' as const, reason: 'REVIEW_ALREADY_USED' };
    const issuedAt = Number(token.split('.')[0]);
    const age = this.now().getTime() - issuedAt;
    if (!Number.isFinite(age) || age < 0 || age > 120000)
      return { status: 'blocked' as const, reason: 'REVIEW_EXPIRED' };
    const captured = await this.capture(uid, issuedAt);
    if (captured.status !== 'captured') return captured;
    if (captured.token !== token)
      return { status: 'blocked' as const, reason: 'REVIEW_CHANGED' };
    const target = captured.report[choice];
    const rendered = renderCalendarSchedule({
      calendarData: captured.source.calendarData,
      uid,
      snapshot: target,
    });
    if (rendered.status !== 'rendered')
      return { status: 'blocked' as const, reason: rendered.reason };
    const payload = calendarSchedulePayloadSchema.parse({
      kind: 'SYNC_SCHEDULE',
      resolution: { reviewToken: token, choice },
      uid,
      configurationVersion: captured.source.configurationVersion,
      resourceId: captured.source.resourceId,
      resourceVersion: captured.source.resourceVersion,
      calendarUrl: captured.source.calendarUrl,
      resourceUrl: captured.source.resourceUrl,
      expectedEtag: captured.source.etag,
      sourceData: captured.source.calendarData,
      calendarData: rendered.calendarData,
      base: captured.report.base,
      snapshot: target,
      command: {
        expected: captured.command.expected,
        target: {
          name: target.name,
          startsAt: target.interval.startsAt,
          endsAt: target.interval.endsAt,
        },
      },
    });
    if (this.now().getTime() - issuedAt > 120000)
      return { status: 'blocked' as const, reason: 'REVIEW_EXPIRED' };
    return this.store.resolve(captured.source, payload);
  }
}
