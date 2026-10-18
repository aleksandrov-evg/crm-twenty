import { calendarLogger } from '../calendar-logger';
import { checkYandexStartupAuthorization } from '../check-yandex-startup-authorization';
import { discoverYandexCalendars } from '../../transport/discover-yandex-calendars';

describe('startup Yandex authorization check', () => {
  const environment = {
    YANDEX_CALDAV_USERNAME: 'private-user',
    YANDEX_CALDAV_APP_PASSWORD: 'private-password',
  };
  afterEach(() => jest.restoreAllMocks());

  it('reports missing credentials without making a request', async () => {
    const event = jest.spyOn(calendarLogger, 'event').mockImplementation();
    const discover = jest.fn();
    await checkYandexStartupAuthorization({}, discover);
    expect(discover).not.toHaveBeenCalled();
    expect(event).toHaveBeenCalledWith('error', 'yandex.startup_check', {
      result: 'not-ready', reason: 'CALDAV_CREDENTIALS_REQUIRED',
    });
  });

  it.each(['discovered', 'auth-required', 'forbidden', 'unavailable', 'discovery-failed'] as const)(
    'reports %s without exposing credentials or calendar URLs', async (status) => {
      const event = jest.spyOn(calendarLogger, 'event').mockImplementation();
      const discover: typeof discoverYandexCalendars = jest.fn().mockResolvedValue(
        status === 'discovered'
          ? { status, calendars: [{ url: 'private-url', displayName: 'private-name' }] }
          : { status },
      );
      await checkYandexStartupAuthorization(environment, discover);
      expect(discover).toHaveBeenCalledWith({
        username: environment.YANDEX_CALDAV_USERNAME,
        appPassword: environment.YANDEX_CALDAV_APP_PASSWORD,
      });
      expect(event).toHaveBeenCalledWith(
        status === 'discovered' ? 'info' : 'error', 'yandex.startup_check',
        status === 'discovered' ? { result: 'authorized', count: 1 } : { result: status },
      );
      expect(JSON.stringify(event.mock.calls)).not.toContain('private-');
    },
  );

  it('does not fail service startup or log raw exceptions', async () => {
    const event = jest.spyOn(calendarLogger, 'event').mockImplementation();
    const discover = jest.fn().mockRejectedValue(new Error('private-password'));
    await expect(checkYandexStartupAuthorization(environment, discover)).resolves.toBeUndefined();
    expect(event).toHaveBeenCalledWith('error', 'yandex.startup_check', { result: 'unavailable' });
  });
});
