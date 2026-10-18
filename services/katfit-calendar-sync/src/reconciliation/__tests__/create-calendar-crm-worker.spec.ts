import { configureCalendarCrmWorker } from '../create-calendar-crm-worker';

const environment = {
  CALENDAR_CRM_LOOKUP_ENABLED: 'true',
  TWENTY_WORKSPACE_ID: 'd7559474-49ce-4881-8ed1-d994ef52d1b5',
  CALENDAR_CONNECTION_ID: 'f4071e4f-93a5-49be-afcd-3d319c116eb7',
  TWENTY_API_URL: 'https://crm.test',
  TWENTY_API_TOKEN: 'secret',
};

describe('CRM worker configuration', () => {
  it('disables network access by default', () => {
    expect(configureCalendarCrmWorker({})).toBeNull();
  });
  it('accepts explicit workspace and connection scope', () => {
    expect(configureCalendarCrmWorker(environment)).toBeInstanceOf(Function);
  });
  it.each([
    'TWENTY_WORKSPACE_ID',
    'CALENDAR_CONNECTION_ID',
    'TWENTY_API_URL',
    'TWENTY_API_TOKEN',
  ])('requires %s when enabled', (field) => {
    expect(() =>
      configureCalendarCrmWorker({ ...environment, [field]: undefined }),
    ).toThrow();
  });
  it('rejects invalid enable flags and insecure transport by default', () => {
    expect(() =>
      configureCalendarCrmWorker({ CALENDAR_CRM_LOOKUP_ENABLED: 'yes' }),
    ).toThrow();
    expect(() =>
      configureCalendarCrmWorker({
        ...environment,
        TWENTY_API_URL: 'http://twenty:3000',
      }),
    ).toThrow();
  });
});
