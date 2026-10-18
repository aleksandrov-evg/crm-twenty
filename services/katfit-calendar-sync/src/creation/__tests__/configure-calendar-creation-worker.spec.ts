import { configureCalendarCreationWorker } from '../configure-calendar-creation-worker';

const configuration = {
  CALENDAR_CREATION_RECOVERY_ENABLED: 'true',
  TWENTY_WORKSPACE_ID: 'd7559474-49ce-4881-8ed1-d994ef52d1b5',
  CALENDAR_CONNECTION_ID: 'f4071e4f-93a5-49be-afcd-3d319c116eb7',
  TWENTY_API_URL: 'https://crm.test',
  TWENTY_API_TOKEN: 'test-secret',
};

describe('durable creation recovery configuration', () => {
  it('is disabled by default', () => {
    expect(configureCalendarCreationWorker({})).toBeNull();
  });
  it('accepts explicit single-workspace configuration', () => {
    expect(configureCalendarCreationWorker(configuration)).toBeInstanceOf(
      Function,
    );
  });
  it.each([
    'TWENTY_WORKSPACE_ID',
    'CALENDAR_CONNECTION_ID',
    'TWENTY_API_URL',
    'TWENTY_API_TOKEN',
  ])('requires %s', (field) => {
    expect(() =>
      configureCalendarCreationWorker({ ...configuration, [field]: undefined }),
    ).toThrow();
  });
  it('requires recovery when a live check is enabled', () => {
    expect(() =>
      configureCalendarCreationWorker({
        CALENDAR_LIVE_SOURCE_CHECK_ENABLED: 'true',
      }),
    ).toThrow('LIVE_SOURCE_CHECK_REQUIRES_RECOVERY');
  });
  it('requires the credential encryption key for live checks', () => {
    expect(() =>
      configureCalendarCreationWorker({
        ...configuration,
        CALENDAR_LIVE_SOURCE_CHECK_ENABLED: 'true',
      }),
    ).toThrow('CALENDAR_ENCRYPTION_KEY_INVALID');
  });
  it('accepts read-only live validation with an explicit encryption key', () => {
    expect(
      configureCalendarCreationWorker({
        ...configuration,
        CALENDAR_LIVE_SOURCE_CHECK_ENABLED: 'true',
        CALENDAR_ENCRYPTION_KEY: 'ab'.repeat(32),
      }),
    ).toBeInstanceOf(Function);
  });
  it.each([
    { CALENDAR_CREATE_SEND_ENABLED: 'true' },
    { ...configuration, CALENDAR_CREATE_SEND_ENABLED: 'true' },
  ])('requires recovery and live source checking for writes', (environment) => {
    expect(() => configureCalendarCreationWorker(environment)).toThrow(
      'CREATION_SEND_REQUIRES_RECOVERY_AND_LIVE_CHECK',
    );
  });
  it('accepts explicit write configuration without activating a connection or making network calls', () => {
    expect(
      configureCalendarCreationWorker({
        ...configuration,
        CALENDAR_CREATE_SEND_ENABLED: 'true',
        CALENDAR_LIVE_SOURCE_CHECK_ENABLED: 'true',
        CALENDAR_ENCRYPTION_KEY: 'ab'.repeat(32),
      }),
    ).toBeInstanceOf(Function);
  });
  it('rejects invalid flags and HTTP without explicit configuration', () => {
    expect(() =>
      configureCalendarCreationWorker({
        CALENDAR_CREATION_RECOVERY_ENABLED: 'yes',
      }),
    ).toThrow();
    expect(() =>
      configureCalendarCreationWorker({
        ...configuration,
        TWENTY_API_URL: 'http://crm.test',
      }),
    ).toThrow();
  });
});
