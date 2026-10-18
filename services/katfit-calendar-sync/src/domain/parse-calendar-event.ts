import { isString } from '@sniptt/guards';
import { Temporal } from '@js-temporal/polyfill';
import ICAL from 'ical.js';

import { isValidTimeZone } from './is-valid-time-zone';

export type ParsedCalendarEvent = {
  uid: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
};

export type CalendarEventParseResult =
  | { status: 'parsed'; event: ParsedCalendarEvent }
  | { status: 'needs-review'; reason: string; uid?: string };

const review = (reason: string, uid?: string): CalendarEventParseResult => ({
  status: 'needs-review',
  reason,
  ...(uid ? { uid } : {}),
});

const instant = (
  property: ICAL.Property,
  calendarTimezone: string,
  allowFloating: boolean,
): { instant: string; timezone: string } => {
  if (property.type !== 'date-time') throw new Error('ALL_DAY_EVENT');
  const raw: unknown = property.toJSON()[3];
  if (!isString(raw) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\dZ?$/.test(raw))
    throw new Error('INVALID_DATE_TIME');
  const parameter: unknown = property.getParameter('tzid');
  const utc = raw.endsWith('Z');
  if (utc && parameter !== undefined) throw new Error('CONFLICTING_TIMEZONE');
  if (!utc && parameter === undefined && !allowFloating)
    throw new Error('FLOATING_TIME');
  const timezone = utc
    ? 'UTC'
    : parameter === undefined
      ? calendarTimezone
      : parameter;
  if (!isString(timezone) || !isValidTimeZone(timezone))
    throw new Error('UNKNOWN_TIMEZONE');
  // Validate the original jCal value before ICAL.Time can normalize an invalid date.
  const local = Temporal.PlainDateTime.from(raw.replace(/Z$/, ''), {
    overflow: 'reject',
  });
  const zoned = local.toZonedDateTime(timezone, { disambiguation: 'reject' });
  return {
    instant: zoned.toInstant().toString({ smallestUnit: 'millisecond' }),
    timezone,
  };
};

export const parseCalendarEvent = (
  calendarData: string,
  options: { timezone: string; allowFloating?: boolean },
): CalendarEventParseResult => {
  if (Buffer.byteLength(calendarData) > 2 * 1024 * 1024)
    return review('RESOURCE_TOO_LARGE');
  try {
    const calendar = ICAL.Component.fromString(calendarData);
    if (calendar.name !== 'vcalendar') return review('INVALID_CALENDAR');
    const events = calendar.getAllSubcomponents('vevent');
    if (events.length !== 1)
      return review(
        events.length > 1 ? 'MULTIPLE_EVENTS_OR_RECURRENCE' : 'EVENT_MISSING',
      );
    const event = events[0];
    for (const field of [
      'uid',
      'summary',
      'description',
      'dtstart',
      'dtend',
      'duration',
      'status',
    ]) {
      if (event.getAllProperties(field).length > 1)
        return review('DUPLICATE_PROPERTY');
    }
    const uid = event.getFirstPropertyValue('uid');
    if (
      !isString(uid) ||
      !uid.trim() ||
      Buffer.byteLength(uid) > 1024 ||
      /[\x00-\x1f\x7f]/.test(uid)
    )
      return review('INVALID_UID');
    if (
      ['rrule', 'rdate', 'exdate', 'recurrence-id'].some((field) =>
        event.hasProperty(field),
      )
    )
      return review('RECURRENCE_REQUIRES_REVIEW', uid);
    if (event.getFirstPropertyValue('status') === 'CANCELLED')
      return review('CANCELLATION_REQUIRES_REVIEW', uid);
    const name = event.getFirstPropertyValue('summary');
    const description = event.getFirstPropertyValue('description');
    if (!isString(name) || !name.trim() || name.trim().length > 200)
      return review('INVALID_TITLE', uid);
    if (description !== null && !isString(description))
      return review('INVALID_DESCRIPTION', uid);
    const start = event.getFirstProperty('dtstart');
    const end = event.getFirstProperty('dtend');
    const duration = event.getFirstPropertyValue('duration');
    if (!start || (!end && duration === null) || (end && duration !== null))
      return review('INVALID_INTERVAL', uid);
    let startsAt: string;
    let endsAt: string;
    let timezone: string;
    try {
      const parsedStart = instant(
        start,
        options.timezone,
        options.allowFloating === true,
      );
      startsAt = parsedStart.instant;
      timezone = parsedStart.timezone;
      if (end) {
        endsAt = instant(
          end,
          options.timezone,
          options.allowFloating === true,
        ).instant;
      } else {
        if (
          !(duration instanceof ICAL.Duration) ||
          duration.days ||
          duration.weeks ||
          duration.isNegative
        )
          return review('UNSUPPORTED_DURATION', uid);
        endsAt = new Date(
          Date.parse(startsAt) + duration.toSeconds() * 1000,
        ).toISOString();
      }
    } catch (error) {
      const reason =
        error instanceof Error &&
        [
          'ALL_DAY_EVENT',
          'INVALID_DATE_TIME',
          'CONFLICTING_TIMEZONE',
          'FLOATING_TIME',
          'UNKNOWN_TIMEZONE',
        ].includes(error.message)
          ? error.message
          : 'INVALID_OR_AMBIGUOUS_TIME';
      return review(reason, uid);
    }
    const minutes = (Date.parse(endsAt) - Date.parse(startsAt)) / 60000;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
      return review('INVALID_DURATION', uid);
    return {
      status: 'parsed',
      event: {
        uid,
        name: name.trim(),
        description: description ?? '',
        startsAt,
        endsAt,
        timezone,
      },
    };
  } catch {
    return review('INVALID_CALENDAR');
  }
};
