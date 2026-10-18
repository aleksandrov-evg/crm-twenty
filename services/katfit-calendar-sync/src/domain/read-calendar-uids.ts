import { isString } from '@sniptt/guards';
import ICAL from 'ical.js';

export const readCalendarUids = (calendarData: string): string[] | null => {
  try {
    const calendar = ICAL.Component.fromString(calendarData);
    if (calendar.name !== 'vcalendar') return null;
    const events = calendar.getAllSubcomponents('vevent');
    if (!events.length) return null;
    const identifiers: string[] = [];
    for (const event of events) {
      if (event.getAllProperties('uid').length !== 1) return null;
      const uid = event.getFirstPropertyValue('uid');
      if (
        !isString(uid) ||
        !uid.trim() ||
        Buffer.byteLength(uid) > 1024 ||
        /[\x00-\x1f\x7f]/.test(uid)
      )
        return null;
      identifiers.push(uid);
    }
    return identifiers;
  } catch {
    return null;
  }
};
