import ICAL from 'ical.js';

import { parseCalendarEvent } from './parse-calendar-event';

export const readCalendarCancellation = (
  calendarData: string,
  uid: string,
  timezone: string,
):
  | { status: 'not-cancelled' }
  | { status: 'cancelled'; startsAt: string; endsAt: string }
  | { status: 'needs-review'; reason: string } => {
  if (Buffer.byteLength(calendarData) > 2 * 1024 * 1024)
    return { status: 'needs-review', reason: 'RESOURCE_TOO_LARGE' };
  try {
    const calendar = ICAL.Component.fromString(calendarData);
    const events = calendar.getAllSubcomponents('vevent');
    if (
      calendar.name === 'vcalendar' &&
      !events.some((event) =>
        event
          .getAllProperties('status')
          .some((property) => property.getFirstValue() === 'CANCELLED'),
      )
    )
      return { status: 'not-cancelled' };
    if (calendar.name !== 'vcalendar' || events.length !== 1)
      return {
        status: 'needs-review',
        reason: 'UNSUPPORTED_CANCELLATION_SHAPE',
      };
    const event = events[0];
    const statuses = event.getAllProperties('status');
    if (statuses.length > 1)
      return { status: 'needs-review', reason: 'DUPLICATE_STATUS' };
    if (event.getFirstPropertyValue('uid') !== uid)
      return { status: 'needs-review', reason: 'CANCELLATION_UID_CHANGED' };
    if (event.getFirstPropertyValue('status') !== 'CANCELLED')
      return { status: 'not-cancelled' };
    // Only the cancellation flag is removed to reuse the strict single-event validator.
    event.removeAllProperties('status');
    const parsed = parseCalendarEvent(calendar.toString(), { timezone });
    return parsed.status === 'parsed' && parsed.event.uid === uid
      ? {
          status: 'cancelled',
          startsAt: parsed.event.startsAt,
          endsAt: parsed.event.endsAt,
        }
      : {
          status: 'needs-review',
          reason:
            parsed.status === 'parsed'
              ? 'CANCELLATION_UID_CHANGED'
              : parsed.reason,
        };
  } catch {
    return { status: 'needs-review', reason: 'INVALID_CANCELLATION_RESOURCE' };
  }
};
