import { configureCalendarEnrichment } from '../configure-calendar-enrichment';

const configuration = {
  TWENTY_WORKSPACE_ID: 'd7559474-49ce-4881-8ed1-d994ef52d1b5',
  CALENDAR_CONNECTION_ID: 'f4071e4f-93a5-49be-afcd-3d319c116eb7',
  TWENTY_API_URL: 'https://crm.test',
  TWENTY_API_TOKEN: 'test-only',
};

describe('reverse enrichment configuration', () => {
  it('is disabled by default', () => {
    expect(configureCalendarEnrichment({})).toBeNull();
  });
  it('allows local draft preparation without calendar credentials', () => {
    expect(
      configureCalendarEnrichment({
        ...configuration,
        CALENDAR_DESCRIPTION_PREPARATION_ENABLED: 'true',
      }),
    ).toMatchObject({ preparationEnabled: true, sendEnabled: false });
  });
  it('requires preparation and an encryption key for sending', () => {
    expect(() =>
      configureCalendarEnrichment({
        ...configuration,
        CALENDAR_EXPORT_SEND_ENABLED: 'true',
      }),
    ).toThrow('CALENDAR_EXPORT_REQUIRES_DESCRIPTION_PREPARATION');
    expect(() =>
      configureCalendarEnrichment({
        ...configuration,
        CALENDAR_EXPORT_SEND_ENABLED: 'true',
        CALENDAR_DESCRIPTION_PREPARATION_ENABLED: 'true',
      }),
    ).toThrow('CALENDAR_ENCRYPTION_KEY_INVALID');
  });
  it('enables backfill together with creation recovery', () => {
    expect(
      configureCalendarEnrichment({
        ...configuration,
        CALENDAR_CREATION_RECOVERY_ENABLED: 'true',
      }),
    ).toMatchObject({ finalizationEnabled: true, sendEnabled: false });
  });
  it('rejects invalid flags', () => {
    expect(() =>
      configureCalendarEnrichment({ CALENDAR_EXPORT_SEND_ENABLED: 'yes' }),
    ).toThrow();
  });
});
