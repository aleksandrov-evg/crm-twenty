import { configureCalendarSchedule } from '../configure-calendar-schedule';

const environment = {
  TWENTY_WORKSPACE_ID: 'd7559474-49ce-4881-8ed1-d994ef52d1b5',
  CALENDAR_CONNECTION_ID: 'f4071e4f-93a5-49be-afcd-3d319c116eb7',
  TWENTY_API_URL: 'https://crm.example.test',
  TWENTY_API_TOKEN: 'test',
};
it('keeps all schedule workers disabled by default', () => {
  expect(configureCalendarSchedule({})).toBeNull();
});
it('rejects send without preparation or polling', () => {
  expect(() =>
    configureCalendarSchedule({ CALENDAR_SCHEDULE_SEND_ENABLED: 'true' }),
  ).toThrow('CALENDAR_SCHEDULE_SEND_REQUIRES_PREPARATION');
  expect(() =>
    configureCalendarSchedule({
      CALENDAR_SCHEDULE_PREPARATION_ENABLED: 'true',
      CALENDAR_SCHEDULE_SEND_ENABLED: 'true',
    }),
  ).toThrow('CALENDAR_SCHEDULE_SEND_REQUIRES_POLLING');
});
it('allows readonly preparation without an encryption key', () => {
  expect(
    configureCalendarSchedule({
      ...environment,
      CALENDAR_SCHEDULE_PREPARATION_ENABLED: 'true',
    }),
  ).toMatchObject({ preparationEnabled: true, sendEnabled: false });
});
it('requires a valid encryption key for writes', () => {
  expect(() =>
    configureCalendarSchedule({
      ...environment,
      CALENDAR_SCHEDULE_PREPARATION_ENABLED: 'true',
      CALENDAR_SCHEDULE_SEND_ENABLED: 'true',
      CALENDAR_POLLING_ENABLED: 'true',
    }),
  ).toThrow();
});
it('validates flags rather than silently enabling misspelled values', () => {
  expect(() =>
    configureCalendarSchedule({ CALENDAR_SCHEDULE_SEND_ENABLED: 'yes' }),
  ).toThrow();
});
