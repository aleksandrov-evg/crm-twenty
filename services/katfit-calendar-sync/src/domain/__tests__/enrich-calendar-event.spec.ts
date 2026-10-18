import ICAL from 'ical.js';

import { enrichCalendarEvent } from '../enrich-calendar-event';

const classSessionId = 'd7559474-49ce-4881-8ed1-d994ef52d1b5';
const participants = [
  { personId: 'f4071e4f-93a5-49be-afcd-3d319c116eb7', name: 'Анна Иванова' },
  { personId: '2fb80061-5573-46b6-9c69-e2673d523776', name: 'Анна Иванова' },
];
const data = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:phone-uid',
  'SUMMARY:Занятие',
  'DTSTART;TZID=Europe/Moscow:20990110T120000',
  'DTEND;TZID=Europe/Moscow:20990110T130000',
  'DESCRIPTION:Комментарий тренера\\n\\nKATFIT:\\nformat=GROUP_REFORMER\\ncapacity=6',
  'ATTENDEE;CN=Existing:mailto:original@example.test',
  'X-CUSTOM-FIELD:preserve',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'TRIGGER:-PT15M',
  'DESCRIPTION:Напоминание',
  'END:VALARM',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('calendar description enrichment', () => {
  it('preserves UID, notes, metadata, attendees, alarms and custom properties', () => {
    const result = enrichCalendarEvent({
      calendarData: data,
      uid: 'phone-uid',
      classSessionId,
      participants,
    });
    if (result.status !== 'rendered') throw Error('Expected patch');
    const original =
      ICAL.Component.fromString(data).getFirstSubcomponent('vevent')!;
    const event = ICAL.Component.fromString(
      result.calendarData,
    ).getFirstSubcomponent('vevent')!;
    for (const property of [
      'uid',
      'summary',
      'dtstart',
      'dtend',
      'attendee',
      'x-custom-field',
    ])
      expect(event.getFirstProperty(property)?.toJSON()).toEqual(
        original.getFirstProperty(property)?.toJSON(),
      );
    expect(
      event.getAllSubcomponents('valarm').map((alarm) => alarm.toJSON()),
    ).toEqual(
      original.getAllSubcomponents('valarm').map((alarm) => alarm.toJSON()),
    );
    expect(event.getFirstPropertyValue('x-katfit-session-id')).toBe(
      classSessionId,
    );
    const description = String(event.getFirstPropertyValue('description'));
    expect(description).toContain(
      'Комментарий тренера\n\nKATFIT:\nformat=GROUP_REFORMER\ncapacity=6',
    );
    expect(description).toContain(
      'Участники (2):\n- Анна Иванова\n- Анна Иванова',
    );
    expect(
      enrichCalendarEvent({
        calendarData: result.calendarData,
        uid: 'phone-uid',
        classSessionId,
        participants,
      }),
    ).toEqual({
      status: 'rendered',
      calendarData: result.calendarData,
      changed: false,
    });
  });
  it('replaces only the generated block after a booking changes', () => {
    const first = enrichCalendarEvent({
      calendarData: data,
      uid: 'phone-uid',
      classSessionId,
      participants,
    });
    if (first.status !== 'rendered') throw Error('Expected patch');
    const second = enrichCalendarEvent({
      calendarData: first.calendarData,
      uid: 'phone-uid',
      classSessionId,
      participants: [],
    });
    if (second.status !== 'rendered') throw Error('Expected patch');
    const description = String(
      ICAL.Component.fromString(second.calendarData)
        .getFirstSubcomponent('vevent')!
        .getFirstPropertyValue('description'),
    );
    expect(description).toContain('Участники (0):');
    expect(description).not.toContain('Анна');
    expect(description).toContain('Комментарий тренера');
  });
  it.each([
    { ...participants[0], name: ' ' },
    { ...participants[0], name: 'Имя\nподмена' },
    { ...participants[0], name: '--- KATFIT:GENERATED:BEGIN ---' },
  ])(
    'rejects invalid participant names without editing the event',
    (person) => {
      expect(
        enrichCalendarEvent({
          calendarData: data,
          uid: 'phone-uid',
          classSessionId,
          participants: [person],
        }),
      ).toMatchObject({ status: 'needs-review' });
    },
  );
  it('rejects a different UID and a different CRM marker', () => {
    expect(
      enrichCalendarEvent({
        calendarData: data,
        uid: 'other',
        classSessionId,
        participants,
      }),
    ).toMatchObject({ status: 'needs-review' });
    const changed = data.replace(
      'END:VEVENT',
      `X-KATFIT-SESSION-ID:${participants[0].personId}\r\nEND:VEVENT`,
    );
    expect(
      enrichCalendarEvent({
        calendarData: changed,
        uid: 'phone-uid',
        classSessionId,
        participants,
      }),
    ).toMatchObject({
      status: 'needs-review',
      reason: 'CALENDAR_CRM_ID_MISMATCH',
    });
  });
});
