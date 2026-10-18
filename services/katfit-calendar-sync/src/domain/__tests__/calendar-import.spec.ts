import { parseCalendarEvent } from '../parse-calendar-event';
import { prepareCalendarSession } from '../prepare-calendar-session';

const calendar = (properties: string[]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:phone-event',
    'SUMMARY:Тренировка',
    ...properties,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
const interval = ['DTSTART:20270110T090000Z', 'DTEND:20270110T100000Z'];
const options = { timezone: 'Europe/Moscow' };
const prepare = (properties: string[], workspaceId = 'workspace') =>
  prepareCalendarSession({
    workspaceId,
    connectionId: 'connection',
    calendarData: calendar(properties),
    options: {
      ...options,
      defaults: { sessionFormat: 'GROUP_REFORMER', capacity: 6 },
    },
    now: new Date('2026-10-17T00:00:00Z'),
  });

describe('calendar event import', () => {
  it('preserves UID and normalizes UTC times', () => {
    expect(parseCalendarEvent(calendar(interval), options)).toEqual({
      status: 'parsed',
      event: {
        uid: 'phone-event',
        name: 'Тренировка',
        description: '',
        startsAt: '2027-01-10T09:00:00.000Z',
        endsAt: '2027-01-10T10:00:00.000Z',
        timezone: 'UTC',
      },
    });
  });
  it('converts named timezones', () => {
    expect(
      parseCalendarEvent(
        calendar([
          'DTSTART;TZID=Europe/Moscow:20270110T120000',
          'DURATION:PT1H',
        ]),
        options,
      ),
    ).toMatchObject({
      status: 'parsed',
      event: {
        startsAt: '2027-01-10T09:00:00.000Z',
        endsAt: '2027-01-10T10:00:00.000Z',
      },
    });
  });
  it.each([
    [['DTSTART:20270110T090000', 'DURATION:PT1H'], 'FLOATING_TIME'],
    [
      ['DTSTART;VALUE=DATE:20270110', 'DTEND;VALUE=DATE:20270111'],
      'ALL_DAY_EVENT',
    ],
    [
      ['DTSTART:20270230T090000Z', 'DURATION:PT1H'],
      'INVALID_OR_AMBIGUOUS_TIME',
    ],
    [
      ['DTSTART;TZID=Europe/Berlin:20270328T023000', 'DURATION:PT1H'],
      'INVALID_OR_AMBIGUOUS_TIME',
    ],
    [
      ['DTSTART;TZID=Europe/Berlin:20271031T023000', 'DURATION:PT1H'],
      'INVALID_OR_AMBIGUOUS_TIME',
    ],
    [[...interval, 'RRULE:FREQ=WEEKLY'], 'RECURRENCE_REQUIRES_REVIEW'],
    [[...interval, 'STATUS:CANCELLED'], 'CANCELLATION_REQUIRES_REVIEW'],
    [[...interval, 'UID:another'], 'DUPLICATE_PROPERTY'],
    [['DTSTART:20270110T090000Z', 'DURATION:P1D'], 'UNSUPPORTED_DURATION'],
    [
      ['DTSTART:20270110T090000Z', 'DTEND:20270110T080000Z'],
      'INVALID_DURATION',
    ],
  ])(
    'routes unsupported or unsafe events to review: %s',
    (properties, reason) => {
      expect(parseCalendarEvent(calendar(properties), options)).toMatchObject({
        status: 'needs-review',
        reason,
      });
    },
  );
  it('accepts floating time only with explicit configuration', () => {
    expect(
      parseCalendarEvent(
        calendar(['DTSTART:20270110T120000', 'DURATION:PT1H']),
        { ...options, allowFloating: true },
      ),
    ).toMatchObject({
      status: 'parsed',
      event: { startsAt: '2027-01-10T09:00:00.000Z' },
    });
  });
  it('uses explicit metadata over defaults', () => {
    expect(
      prepare([
        ...interval,
        'DESCRIPTION:KATFIT:\\nformat=MAT_PILATES\\ncapacity=8',
      ]),
    ).toMatchObject({
      decision: 'READY',
      candidate: {
        capacity: 8,
        sessionFormat: 'MAT_PILATES',
        durationMinutes: 60,
      },
    });
  });
  it.each([
    ['KATFIT:\\ncapacity=0', 'MISSING_OR_INVALID_METADATA'],
    ['KATFIT:\\ncapacity=8\\ncapacity=9', 'INVALID_METADATA'],
    ['KATFIT:\\ngroup=morning', 'GROUP_MAPPING_REQUIRED'],
    ['KATFIT:\\nformat=PERSONAL_EQUIPMENT', 'PERSONAL_CAPACITY'],
  ])('requires review for invalid metadata %s', (description, reason) => {
    expect(prepare([...interval, `DESCRIPTION:${description}`])).toMatchObject({
      decision: 'NEEDS_REVIEW',
      reason,
    });
  });
  it('never interprets generated participant text as import instructions', () => {
    expect(
      prepare([
        ...interval,
        'DESCRIPTION:--- KATFIT:GENERATED:BEGIN ---\\nKATFIT:\\ncapacity=99\\n--- KATFIT:GENERATED:END ---',
      ]),
    ).toMatchObject({ decision: 'READY', candidate: { capacity: 6 } });
  });
  it('keeps identity stable after rescheduling and scopes it by workspace', () => {
    const first = prepare(interval);
    const moved = prepare(['DTSTART:20270111T090000Z', 'DURATION:PT1H']);
    const other = prepare(interval, 'other-workspace');
    if (
      first.decision !== 'READY' ||
      moved.decision !== 'READY' ||
      other.decision !== 'READY'
    )
      throw new Error('Expected import candidates');
    expect(first.candidate.idempotencyKey).toBe(moved.candidate.idempotencyKey);
    expect(first.candidate.idempotencyKey).not.toBe(
      other.candidate.idempotencyKey,
    );
  });
});
