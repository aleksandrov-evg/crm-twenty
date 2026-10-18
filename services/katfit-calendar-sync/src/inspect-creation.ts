import { z } from 'zod';

import { createCalendarCreationInspector } from './crm/inspect-calendar-session-creation';
import { calendarSessionCommandSchema } from './domain/create-calendar-session-command';
import { createCalendarDataSource } from './storage/create-calendar-data-source';

const inspect = async (): Promise<void> => {
  const configuration = z
    .object({
      TWENTY_WORKSPACE_ID: z.uuid(),
      CALENDAR_CONNECTION_ID: z.uuid(),
      CALENDAR_EVENT_UID: z.string().min(1).max(1024),
      TWENTY_API_URL: z.url(),
      TWENTY_API_TOKEN: z.string().min(1),
      TWENTY_ALLOW_INSECURE_HTTP: z.enum(['true', 'false']).optional(),
    })
    .parse(process.env);
  const inspector = createCalendarCreationInspector({
    baseUrl: configuration.TWENTY_API_URL,
    apiToken: configuration.TWENTY_API_TOKEN,
    allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  });
  const source = await createCalendarDataSource(
    process.env.CALENDAR_DATABASE_URL,
  ).initialize();
  try {
    const rows: { payload: unknown }[] = await source.query(
      `SELECT payload FROM calendar_sync."calendarSessionCreateIntent"
      WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND "recurrenceKey" = 'single'`,
      [
        configuration.TWENTY_WORKSPACE_ID,
        configuration.CALENDAR_CONNECTION_ID,
        configuration.CALENDAR_EVENT_UID,
      ],
    );
    if (!rows[0]) throw new Error('INTENT_NOT_FOUND');
    const result = await inspector(
      calendarSessionCommandSchema.parse(rows[0].payload),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'confirmed') process.exitCode = 1;
  } finally {
    await source.destroy();
  }
};

void inspect().catch(() => {
  process.stderr.write(
    'Creation inspection failed; check configuration and saved intent\n',
  );
  process.exitCode = 1;
});
