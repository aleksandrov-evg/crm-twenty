import { z } from 'zod';

export const readCalendarCrmEnvironment = (environment: NodeJS.ProcessEnv) =>
  z
    .object({
      TWENTY_WORKSPACE_ID: z.uuid(),
      CALENDAR_CONNECTION_ID: z.uuid(),
      TWENTY_API_URL: z.url(),
      TWENTY_API_TOKEN: z.string().min(1),
      TWENTY_ALLOW_INSECURE_HTTP: z.enum(['true', 'false']).optional(),
    })
    .parse(environment);
