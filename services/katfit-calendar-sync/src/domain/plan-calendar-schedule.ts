import { type CalendarCrmSession } from '../crm/find-calendar-session';
import {
  mergeSessionSchedule,
  type SessionScheduleSnapshot,
} from './merge-session-schedule';
import { prepareCalendarSession } from './prepare-calendar-session';

export type CalendarSchedulePlan =
  | { status: 'needs-review'; reason: string }
  | {
      status: 'planned';
      snapshot: SessionScheduleSnapshot;
      updateCrm: boolean;
      updateCalendar: boolean;
      expectedCrm: Pick<
        CalendarCrmSession,
        | 'id'
        | 'recordingKey'
        | 'name'
        | 'startsAt'
        | 'endsAt'
        | 'sessionFormat'
        | 'capacity'
        | 'status'
      >;
    };

export const planCalendarSchedule = (input: {
  workspaceId: string;
  connectionId: string;
  uid: string;
  classSessionId: string;
  recordingKey: string;
  timezone: string;
  base: SessionScheduleSnapshot;
  calendarData: string;
  session: CalendarCrmSession;
  now: Date;
}): CalendarSchedulePlan => {
  const session = input.session;
  if (
    session.id !== input.classSessionId ||
    session.recordingKey !== input.recordingKey
  )
    return { status: 'needs-review', reason: 'CRM_IDENTITY_CHANGED' };
  if (!['PLANNED', 'CONFIRMED'].includes(session.status))
    return { status: 'needs-review', reason: 'CRM_STATUS_NOT_EDITABLE' };
  if (
    !Number.isFinite(input.now.getTime()) ||
    Date.parse(session.startsAt) <= input.now.getTime()
  )
    return { status: 'needs-review', reason: 'PAST_OR_CURRENT_SESSION' };
  const prepared = prepareCalendarSession({
    ...input,
    options: { timezone: input.timezone },
  });
  if (prepared.decision !== 'READY')
    return { status: 'needs-review', reason: prepared.reason };
  const candidate = prepared.candidate;
  if (candidate.uid !== input.uid)
    return { status: 'needs-review', reason: 'CALENDAR_IDENTITY_CHANGED' };
  if (
    candidate.sessionFormat !== session.sessionFormat ||
    candidate.capacity !== session.capacity
  )
    return { status: 'needs-review', reason: 'FORMAT_OR_CAPACITY_CHANGED' };
  // CRM stores instants without a zone; the agreed base supplies its display zone.
  const merged = mergeSessionSchedule({
    base: input.base,
    local: {
      name: session.name,
      interval: {
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        timezone: input.base.interval.timezone,
      },
    },
    remote: {
      name: candidate.name,
      interval: {
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        timezone: candidate.timezone,
      },
    },
  });
  if (merged.status !== 'merged')
    return {
      status: 'needs-review',
      reason:
        merged.status === 'conflict'
          ? `SCHEDULE_CONFLICT:${merged.fields.join(',')}`
          : `INVALID_SCHEDULE:${merged.source}`,
    };
  const duration =
    (Date.parse(merged.snapshot.interval.endsAt) -
      Date.parse(merged.snapshot.interval.startsAt)) /
    60000;
  if (
    Date.parse(merged.snapshot.interval.startsAt) <= input.now.getTime() ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 1440 ||
    merged.snapshot.name.length > 200
  )
    return { status: 'needs-review', reason: 'INVALID_TARGET_SCHEDULE' };
  return {
    status: 'planned',
    snapshot: merged.snapshot,
    updateCrm: merged.updateLocal,
    updateCalendar: merged.updateRemote,
    expectedCrm: {
      id: session.id,
      recordingKey: session.recordingKey,
      name: session.name,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      sessionFormat: session.sessionFormat,
      capacity: session.capacity,
      status: session.status,
    },
  };
};
