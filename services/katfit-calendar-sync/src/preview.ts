import { open } from 'node:fs/promises';

import { z } from 'zod';

import { createCalendarSessionLookup } from './crm/find-calendar-session';
import { previewCalendarSession } from './domain/preview-calendar-session';
import { SESSION_FORMATS } from './domain/prepare-calendar-session';

const configurationSchema = z.object({
  CALENDAR_EVENT_FILE: z.string().min(1),
  TWENTY_WORKSPACE_ID: z.uuid(),
  CALENDAR_CONNECTION_ID: z.uuid(),
  CALENDAR_TIMEZONE: z.string().default('Europe/Moscow'),
  CALENDAR_DEFAULT_FORMAT: z.enum(SESSION_FORMATS).optional(),
  CALENDAR_DEFAULT_CAPACITY: z.coerce.number().int().min(1).max(100).optional(),
  TWENTY_API_URL: z.url().optional(),
  TWENTY_API_TOKEN: z.string().min(1).optional(),
  TWENTY_ALLOW_INSECURE_HTTP: z.enum(['true', 'false']).optional(),
});

const preview = async (): Promise<void> => {
  const configuration = configurationSchema.parse(process.env);
  if (
    Boolean(configuration.TWENTY_API_URL) !==
    Boolean(configuration.TWENTY_API_TOKEN)
  )
    throw new Error('INCOMPLETE_CRM_CONFIGURATION');
  const file = await open(configuration.CALENDAR_EVENT_FILE, 'r');
  let calendarData: string;
  try {
    const maximumBytes = 2 * 1024 * 1024;
    const information = await file.stat();
    if (!information.isFile() || information.size > maximumBytes)
      throw new Error('INVALID_EVENT_FILE');
    const buffer = Buffer.alloc(maximumBytes + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await file.read(
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        null,
      );
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    if (bytesRead > maximumBytes) throw new Error('EVENT_FILE_TOO_LARGE');
    calendarData = buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await file.close();
  }
  const lookup =
    configuration.TWENTY_API_URL && configuration.TWENTY_API_TOKEN
      ? createCalendarSessionLookup({
          baseUrl: configuration.TWENTY_API_URL,
          apiToken: configuration.TWENTY_API_TOKEN,
          allowInsecureHttp:
            configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
        })
      : undefined;
  const result = await previewCalendarSession(
    {
      workspaceId: configuration.TWENTY_WORKSPACE_ID,
      connectionId: configuration.CALENDAR_CONNECTION_ID,
      calendarData,
      now: new Date(),
      options: {
        timezone: configuration.CALENDAR_TIMEZONE,
        defaults: {
          sessionFormat: configuration.CALENDAR_DEFAULT_FORMAT,
          capacity: configuration.CALENDAR_DEFAULT_CAPACITY,
        },
      },
    },
    lookup,
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.decision === 'NEEDS_REVIEW') process.exitCode = 1;
};

void preview().catch(() => {
  process.stderr.write(
    'Calendar preview failed; check configuration and event file\n',
  );
  process.exitCode = 1;
});
