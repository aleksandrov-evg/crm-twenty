import { discoverYandexCalendars } from '../transport/discover-yandex-calendars';
import { calendarLogger } from './calendar-logger';

export const checkYandexStartupAuthorization = async (
  environment: NodeJS.ProcessEnv,
  discover: typeof discoverYandexCalendars = discoverYandexCalendars,
): Promise<void> => {
  const username = environment.YANDEX_CALDAV_USERNAME ?? '';
  const appPassword = environment.YANDEX_CALDAV_APP_PASSWORD ?? '';
  if (!username.trim() || !appPassword) {
    calendarLogger.event('error', 'yandex.startup_check', {
      result: 'not-ready',
      reason: 'CALDAV_CREDENTIALS_REQUIRED',
    });
    return;
  }

  try {
    const result = await discover({ username, appPassword });
    calendarLogger.event(
      result.status === 'discovered' ? 'info' : 'error',
      'yandex.startup_check',
      {
        result: result.status === 'discovered' ? 'authorized' : result.status,
        ...(result.status === 'discovered'
          ? { count: result.calendars.length }
          : {}),
      },
    );
  } catch {
    calendarLogger.event('error', 'yandex.startup_check', {
      result: 'unavailable',
    });
  }
};
