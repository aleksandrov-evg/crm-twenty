import { z } from 'zod';

import { CalendarConnectionStore } from './storage/calendar-connection.store';
import { createCalendarDataSource } from './storage/create-calendar-data-source';

const pause = async (): Promise<void> => {
  const configuration = z
    .object({
      TWENTY_WORKSPACE_ID: z.uuid(),
      CALENDAR_CONNECTION_ID: z.uuid(),
      CALENDAR_EXPECTED_CONFIGURATION_VERSION: z.coerce
        .number()
        .int()
        .positive(),
    })
    .parse(process.env);
  const source = await createCalendarDataSource(
    process.env.CALENDAR_DATABASE_URL,
  ).initialize();
  try {
    const result = await new CalendarConnectionStore(source).pause(
      {
        workspaceId: configuration.TWENTY_WORKSPACE_ID,
        id: configuration.CALENDAR_CONNECTION_ID,
      },
      configuration.CALENDAR_EXPECTED_CONFIGURATION_VERSION,
    );
    if (!result) {
      process.stdout.write('{"status":"state-changed"}\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'paused',
          workspaceId: result.workspaceId,
          connectionId: result.id,
          configurationVersion: result.configurationVersion,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await source.destroy();
  }
};
void pause().catch(() => {
  process.stderr.write(
    'Calendar pause failed; check scope and configuration version\n',
  );
  process.exitCode = 1;
});
