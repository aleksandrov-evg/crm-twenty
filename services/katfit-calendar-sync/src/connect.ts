import { z } from 'zod';

import { CalendarCredentialCipher } from './security/calendar-credential-cipher';
import { CalendarConnectionStore } from './storage/calendar-connection.store';
import { createCalendarDataSource } from './storage/create-calendar-data-source';
import { discoverYandexCalendars } from './transport/discover-yandex-calendars';

const connect = async (): Promise<void> => {
  const workspaceId = z.uuid().parse(process.env.TWENTY_WORKSPACE_ID);
  const id = z.uuid().parse(process.env.CALENDAR_CONNECTION_ID);
  const username = process.env.YANDEX_CALDAV_USERNAME ?? '';
  const appPassword = process.env.YANDEX_CALDAV_APP_PASSWORD ?? '';
  const keyId = process.env.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
  const cipher = new CalendarCredentialCipher(keyId, {
    [keyId]: process.env.CALENDAR_ENCRYPTION_KEY ?? '',
  });
  const discovery = await discoverYandexCalendars({ username, appPassword });
  if (discovery.status !== 'discovered')
    throw new Error('CALENDAR_DISCOVERY_FAILED');
  const calendar = discovery.calendars.find(
    (value) => value.url === process.env.YANDEX_CALDAV_CALENDAR_URL,
  );
  if (!calendar) throw new Error('CALENDAR_NOT_DISCOVERED');
  const source = await createCalendarDataSource(
    process.env.CALENDAR_DATABASE_URL,
  ).initialize();

  try {
    const connection = await new CalendarConnectionStore(
      source,
      cipher,
    ).createPreview({
      workspaceId,
      id,
      username,
      appPassword,
      calendar,
      timezone: process.env.CALENDAR_TIMEZONE ?? 'Europe/Moscow',
    });
    process.stdout.write(`${JSON.stringify(connection, null, 2)}\n`);
  } finally {
    await source.destroy();
  }
};

void connect().catch(() => {
  process.stderr.write(
    'Calendar connection could not be saved; check configuration, discovery and database migrations\n',
  );
  process.exitCode = 1;
});
