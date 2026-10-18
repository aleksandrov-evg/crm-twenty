import { discoverYandexCalendars } from './transport/discover-yandex-calendars';

const discover = async (): Promise<void> => {
  const result = await discoverYandexCalendars({
    username: process.env.YANDEX_CALDAV_USERNAME ?? '',
    appPassword: process.env.YANDEX_CALDAV_APP_PASSWORD ?? '',
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'discovered') process.exitCode = 1;
};

void discover().catch(() => {
  process.stderr.write('Calendar discovery failed\n');
  process.exitCode = 1;
});
