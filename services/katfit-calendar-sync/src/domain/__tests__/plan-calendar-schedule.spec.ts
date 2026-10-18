import ICAL from 'ical.js';
import { planCalendarSchedule } from '../plan-calendar-schedule';
import { renderCalendarSchedule } from '../render-calendar-schedule';
const base = {
  name: 'Занятие',
  interval: {
    startsAt: '2099-01-10T09:00:00.000Z',
    endsAt: '2099-01-10T10:00:00.000Z',
    timezone: 'Europe/Moscow',
  },
};
const calendarData = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:phone',
  'SUMMARY:Занятие',
  'DTSTART;TZID=Europe/Moscow:20990110T120000',
  'DURATION:PT1H',
  'DESCRIPTION:Заметка\\nKATFIT:\\nformat=GROUP_REFORMER\\ncapacity=6',
  'ATTENDEE:mailto:existing@example.test',
  'X-CUSTOM:preserved',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'TRIGGER:-PT15M',
  'DESCRIPTION:Reminder',
  'END:VALARM',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const input = {
  workspaceId: 'workspace',
  connectionId: 'connection',
  uid: 'phone',
  classSessionId: 'session',
  recordingKey: 'key',
  timezone: 'Europe/Moscow',
  base,
  calendarData,
  session: {
    id: 'session',
    recordingKey: 'key',
    name: base.name,
    ...base.interval,
    sessionFormat: 'GROUP_REFORMER' as const,
    capacity: 6,
    status: 'PLANNED',
  },
  now: new Date('2099-01-01T00:00:00Z'),
};
it('leaves unchanged schedules alone', () => {
  expect(planCalendarSchedule(input)).toMatchObject({
    status: 'planned',
    updateCrm: false,
    updateCalendar: false,
  });
});
it('combines independent CRM rename and calendar transfer', () => {
  expect(
    planCalendarSchedule({
      ...input,
      session: { ...input.session, name: 'Новое имя' },
      calendarData: calendarData.replace('20990110T120000', '20990110T140000'),
    }),
  ).toMatchObject({
    status: 'planned',
    updateCrm: true,
    updateCalendar: true,
    snapshot: {
      name: 'Новое имя',
      interval: { startsAt: '2099-01-10T11:00:00.000Z' },
    },
  });
});
it('refuses conflicting transfers', () => {
  expect(
    planCalendarSchedule({
      ...input,
      session: {
        ...input.session,
        startsAt: '2099-01-10T10:00:00Z',
        endsAt: '2099-01-10T11:00:00Z',
      },
      calendarData: calendarData.replace('20990110T120000', '20990110T140000'),
    }),
  ).toMatchObject({
    status: 'needs-review',
    reason: 'SCHEDULE_CONFLICT:interval',
  });
});
it.each([
  { id: 'other' },
  { status: 'COMPLETED' },
  { capacity: 7 },
  { startsAt: '2098-01-01T00:00:00Z' },
])('rejects changed identity, status, capacity or past: %j', (change) => {
  expect(
    planCalendarSchedule({ ...input, session: { ...input.session, ...change } })
      .status,
  ).toBe('needs-review');
});
it('preserves notes, UID, attendees and alarms, replaces duration and is idempotent', () => {
  const snapshot = {
    name: 'Перенос',
    interval: {
      ...base.interval,
      startsAt: '2099-01-11T09:00:00.000Z',
      endsAt: '2099-01-11T10:30:00.000Z',
    },
  };
  const result = renderCalendarSchedule({
    calendarData,
    uid: 'phone',
    snapshot,
  });
  if (result.status !== 'rendered') throw Error('Expected schedule');
  const original =
    ICAL.Component.fromString(calendarData).getFirstSubcomponent('vevent')!;
  const event = ICAL.Component.fromString(
    result.calendarData,
  ).getFirstSubcomponent('vevent')!;
  for (const property of ['uid', 'description', 'attendee', 'x-custom'])
    expect(event.getFirstProperty(property)?.toJSON()).toEqual(
      original.getFirstProperty(property)?.toJSON(),
    );
  expect(event.getFirstSubcomponent('valarm')?.toJSON()).toEqual(
    original.getFirstSubcomponent('valarm')?.toJSON(),
  );
  expect(event.getFirstProperty('duration')).toBeNull();
  expect(
    renderCalendarSchedule({
      calendarData: result.calendarData,
      uid: 'phone',
      snapshot,
    }),
  ).toEqual({
    status: 'rendered',
    calendarData: result.calendarData,
    changed: false,
  });
});
it('rejects wrong UID and series', () => {
  expect(
    renderCalendarSchedule({ calendarData, uid: 'other', snapshot: base })
      .status,
  ).toBe('needs-review');
  expect(
    planCalendarSchedule({
      ...input,
      calendarData: calendarData.replace(
        'UID:phone',
        'UID:phone\r\nRRULE:FREQ=WEEKLY',
      ),
    }).status,
  ).toBe('needs-review');
});
it('refuses target durations outside the training contract', () => {
  expect(
    renderCalendarSchedule({
      calendarData,
      uid: 'phone',
      snapshot: {
        ...base,
        interval: { ...base.interval, endsAt: '2099-01-12T10:00:00Z' },
      },
    }).status,
  ).toBe('needs-review');
});
it('round-trips UTC transfers', () => {
  const result = renderCalendarSchedule({
    calendarData,
    uid: 'phone',
    snapshot: { ...base, interval: { ...base.interval, timezone: 'UTC' } },
  });
  expect(result.status).toBe('rendered');
});
it('refuses ambiguous local times during a DST overlap', () => {
  const result = renderCalendarSchedule({
    calendarData,
    uid: 'phone',
    snapshot: {
      ...base,
      interval: {
        startsAt: '2099-10-25T00:30:00.000Z',
        endsAt: '2099-10-25T01:30:00.000Z',
        timezone: 'Europe/Berlin',
      },
    },
  });
  expect(result.status).toBe('needs-review');
});
