import ICAL from 'ical.js';

import {
  renderCrmOriginExport,
  isSameCrmOriginCalendarData,
} from '../render-crm-origin-export';
import { prepareCalendarSession } from '../prepare-calendar-session';

const input = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  connectionId: '00000000-0000-4000-8000-000000000002',
  calendarUrl: 'https://caldav.yandex.ru/calendars/user/private/',
  session: {
    id: '00000000-0000-4000-8000-000000000003',
    recordingKey: 'session-create:crm-ui',
    name: 'Пилатес · Иванова',
    startsAt: '2099-01-01T12:00:00.000Z',
    endsAt: '2099-01-01T13:00:00.000Z',
    sessionFormat: 'GROUP_REFORMER' as const,
    capacity: 4,
    status: 'PLANNED',
  },
};
const render = () => {
  const result = renderCrmOriginExport(input);
  if (result.status !== 'prepared') throw Error('Not prepared');
  return result.command;
};
describe('CRM-origin export rendering', () => {
  it('preserves CRM identity and renders importable UTC event metadata with deterministic scoped identity', () => {
    const command = render();
    expect(render()).toEqual(command);
    const event = ICAL.Component.fromString(
      command.calendarData,
    ).getFirstSubcomponent('vevent');
    expect(event?.getFirstPropertyValue('x-katfit-session-id')).toBe(
      input.session.id,
    );
    expect(event?.getFirstPropertyValue('uid')).toBe(command.uid);
    expect(event?.getFirstPropertyValue('summary')).toBe(input.session.name);
    const prepared = prepareCalendarSession({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      calendarData: command.calendarData,
      options: { timezone: 'UTC' },
      now: new Date('2098-01-01'),
    });
    expect(prepared).toMatchObject({
      decision: 'READY',
      candidate: {
        startsAt: input.session.startsAt,
        endsAt: input.session.endsAt,
        sessionFormat: input.session.sessionFormat,
        capacity: input.session.capacity,
      },
    });
    const other = renderCrmOriginExport({
      ...input,
      connectionId: '00000000-0000-4000-8000-000000000004',
    });
    expect(other.status === 'prepared' && other.command.uid).not.toBe(
      command.uid,
    );
  });
  it('permits serialization normalization while rejecting note and identity changes', () => {
    const command = render();
    expect(
      isSameCrmOriginCalendarData(
        command.calendarData,
        `${command.calendarData}\r\n${command.calendarData}`,
      ),
    ).toBe(false);
    expect(
      isSameCrmOriginCalendarData(
        command.calendarData,
        command.calendarData.replace(/\r\n/g, '\n'),
      ),
    ).toBe(true);
    const calendar = ICAL.Component.fromString(command.calendarData);
    const event = calendar.getFirstSubcomponent('vevent')!;
    const properties = [...event.getAllProperties()];
    event.removeAllProperties();
    for (const property of [...properties].reverse())
      event.addProperty(property);
    expect(
      isSameCrmOriginCalendarData(command.calendarData, calendar.toString()),
    ).toBe(true);
    event.updatePropertyWithValue('description', 'Private note');
    expect(
      isSameCrmOriginCalendarData(command.calendarData, calendar.toString()),
    ).toBe(false);
  });
  it.each([
    { status: 'COMPLETED' },
    { name: 'bad\nBEGIN:VEVENT' },
    { startsAt: '2020-01-01T00:00:00Z' },
    { startsAt: '2099-01-01T12:00:00.123Z' },
    { capacity: 0 },
  ])('rejects unsupported or lossy source %p', (change) => {
    expect(
      renderCrmOriginExport({
        ...input,
        session: { ...input.session, ...change },
      }).status,
    ).toBe('needs-review');
  });
});
