import { Temporal } from '@js-temporal/polyfill';
import ICAL from 'ical.js';
import {
  mergeSessionSchedule,
  type SessionScheduleSnapshot,
} from './merge-session-schedule';
import { parseCalendarEvent } from './parse-calendar-event';

export const renderCalendarSchedule = (input: {
  calendarData: string;
  uid: string;
  snapshot: SessionScheduleSnapshot;
}):
  | { status: 'rendered'; calendarData: string; changed: boolean }
  | { status: 'needs-review'; reason: string } => {
  const validated = mergeSessionSchedule({
    base: input.snapshot,
    local: input.snapshot,
    remote: input.snapshot,
  });
  if (validated.status !== 'merged')
    return { status: 'needs-review', reason: 'INVALID_TARGET_SCHEDULE' };
  const snapshot = validated.snapshot;
  const durationMinutes =
    (Date.parse(snapshot.interval.endsAt) -
      Date.parse(snapshot.interval.startsAt)) /
    60000;
  if (
    snapshot.name.length > 200 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 1440
  )
    return { status: 'needs-review', reason: 'INVALID_TARGET_SCHEDULE' };
  const parsed = parseCalendarEvent(input.calendarData, {
    timezone: snapshot.interval.timezone,
  });
  if (parsed.status !== 'parsed' || parsed.event.uid !== input.uid)
    return {
      status: 'needs-review',
      reason: 'EVENT_IDENTITY_OR_SHAPE_CHANGED',
    };
  if (
    parsed.event.name === snapshot.name &&
    parsed.event.startsAt === snapshot.interval.startsAt &&
    parsed.event.endsAt === snapshot.interval.endsAt &&
    parsed.event.timezone === snapshot.interval.timezone
  )
    return {
      status: 'rendered',
      calendarData: input.calendarData,
      changed: false,
    };
  try {
    const calendar = ICAL.Component.fromString(input.calendarData);
    const event = calendar.getFirstSubcomponent('vevent')!;
    event.updatePropertyWithValue('summary', snapshot.name);
    event.removeAllProperties('duration');
    for (const [propertyName, instant] of [
      ['dtstart', snapshot.interval.startsAt],
      ['dtend', snapshot.interval.endsAt],
    ] as const) {
      const local = Temporal.Instant.from(instant)
        .toZonedDateTimeISO(snapshot.interval.timezone)
        .toPlainDateTime()
        .toString({ smallestUnit: 'second' });
      const property = new ICAL.Property(propertyName);
      property.setValue(
        ICAL.Time.fromDateTimeString(
          `${local}${snapshot.interval.timezone === 'UTC' ? 'Z' : ''}`,
        ),
      );
      if (snapshot.interval.timezone !== 'UTC')
        property.setParameter('tzid', snapshot.interval.timezone);
      event.removeAllProperties(propertyName);
      event.addProperty(property);
    }
    const calendarData = `${calendar.toString()}\r\n`;
    const result = parseCalendarEvent(calendarData, {
      timezone: snapshot.interval.timezone,
    });
    if (
      result.status !== 'parsed' ||
      result.event.startsAt !== snapshot.interval.startsAt ||
      result.event.endsAt !== snapshot.interval.endsAt
    )
      return {
        status: 'needs-review',
        reason: 'TARGET_TIME_NOT_REPRESENTABLE',
      };
    return { status: 'rendered', calendarData, changed: true };
  } catch {
    return { status: 'needs-review', reason: 'TARGET_TIME_NOT_REPRESENTABLE' };
  }
};
