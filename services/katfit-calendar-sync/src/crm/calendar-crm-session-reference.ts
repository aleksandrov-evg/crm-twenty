import { z } from 'zod';

export const calendarCrmRecordingKeySchema = z
  .string()
  .max(128)
  .refine(
    (value) =>
      /^session-create:calendar-create:[a-f0-9]{64}$/.test(value) ||
      (value.startsWith('session-create:') &&
        z.uuid().safeParse(value.slice('session-create:'.length)).success),
  );
