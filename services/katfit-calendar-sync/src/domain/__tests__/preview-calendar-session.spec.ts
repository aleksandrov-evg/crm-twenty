import { previewCalendarSession } from '../preview-calendar-session';
import type { CalendarSessionLookup } from '../../crm/find-calendar-session';

const input = {
  workspaceId: 'workspace',
  connectionId: 'connection',
  now: new Date('2026-10-17T00:00:00Z'),
  options: {
    timezone: 'Europe/Moscow',
    defaults: { sessionFormat: 'GROUP_REFORMER' as const, capacity: 6 },
  },
  calendarData: [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:phone-event',
    'SUMMARY:Тренировка',
    'DTSTART:20270110T090000Z',
    'DURATION:PT1H',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'),
};
const createLookup = (result: CalendarSessionLookup) =>
  jest.fn<Promise<CalendarSessionLookup>, [string]>().mockResolvedValue(result);

describe('calendar import preview', () => {
  it('prepares an offline candidate without claiming absence in CRM', async () => {
    expect(await previewCalendarSession(input)).toMatchObject({
      decision: 'READY',
      crmLookup: 'not-configured',
    });
  });
  it('returns a creation candidate only after a successful empty lookup', async () => {
    const lookup = createLookup({ status: 'not-found' });
    expect(await previewCalendarSession(input, lookup)).toMatchObject({
      decision: 'CREATE_CANDIDATE',
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0]).toMatch(
      /^session-create:calendar-create:[a-f0-9]{64}$/,
    );
  });
  it.each([
    'auth-required',
    'forbidden',
    'unavailable',
    'invalid-response',
    'ambiguous',
  ] as const)('requires review after lookup failure %s', async (status) => {
    expect(
      await previewCalendarSession(input, createLookup({ status })),
    ).toMatchObject({ decision: 'NEEDS_REVIEW', uid: 'phone-event' });
  });
  it('returns the existing session even when its time differs', async () => {
    const session = {
      id: 'existing',
      recordingKey: 'key',
      name: 'Moved',
      startsAt: '2027-01-11T09:00:00Z',
      endsAt: '2027-01-11T10:00:00Z',
      capacity: 6,
      sessionFormat: 'GROUP_REFORMER' as const,
      status: 'PLANNED',
    };
    expect(
      await previewCalendarSession(
        input,
        createLookup({ status: 'matched', session }),
      ),
    ).toMatchObject({ decision: 'EXISTING_SESSION', session });
  });
  it('does not call CRM when the event needs review', async () => {
    const lookup = createLookup({ status: 'not-found' });
    expect(
      await previewCalendarSession(
        { ...input, calendarData: 'invalid' },
        lookup,
      ),
    ).toMatchObject({ decision: 'NEEDS_REVIEW' });
    expect(lookup).not.toHaveBeenCalled();
  });
});
