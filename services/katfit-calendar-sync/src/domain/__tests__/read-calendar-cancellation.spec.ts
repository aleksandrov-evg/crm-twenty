import { readCalendarCancellation } from '../read-calendar-cancellation';

const data = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:one',
  'SUMMARY:Занятие',
  'DTSTART:20990110T090000Z',
  'DURATION:PT1H',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
it('recognizes a strict cancelled single event', () => {
  expect(readCalendarCancellation(data, 'one', 'UTC')).toEqual({
    status: 'cancelled',
    startsAt: '2099-01-10T09:00:00.000Z',
    endsAt: '2099-01-10T10:00:00.000Z',
  });
});
it('does not classify an ordinary event as cancelled', () => {
  expect(
    readCalendarCancellation(
      data.replace('STATUS:CANCELLED', 'STATUS:CONFIRMED'),
      'one',
      'UTC',
    ),
  ).toEqual({ status: 'not-cancelled' });
});
it.each([
  data.replace('UID:one', 'UID:other'),
  data.replace('UID:one', 'UID:one\r\nRRULE:FREQ=WEEKLY'),
  data.replace('STATUS:CANCELLED', 'STATUS:CANCELLED\r\nSTATUS:CONFIRMED'),
  data.replace('20990110T090000Z', '20990230T090000Z'),
])(
  'requires review for invalid identity, recurrence, duplicate status or time',
  (calendarData) => {
    expect(readCalendarCancellation(calendarData, 'one', 'UTC').status).toBe(
      'needs-review',
    );
  },
);
