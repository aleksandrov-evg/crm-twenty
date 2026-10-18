import { z } from 'zod';

import { calendarScheduleUpdateSchema } from '../crm/update-calendar-schedule';
import { scheduleSchema } from '../domain/merge-session-schedule';
import { isStrongEtag } from '../transport/is-strong-etag';

export const calendarSchedulePayloadSchema = z.strictObject({
  kind: z.literal('SYNC_SCHEDULE'),
  resolution: z
    .strictObject({
      reviewToken: z.string().regex(/^\d{13}\.[a-f0-9]{64}$/),
      choice: z.enum(['crm', 'calendar']),
    })
    .optional(),
  uid: z.string().min(1).max(1024),
  configurationVersion: z.number().int().positive(),
  resourceId: z.uuid(),
  resourceVersion: z.number().int().positive(),
  calendarUrl: z.url(),
  resourceUrl: z.url(),
  expectedEtag: z.string().refine(isStrongEtag),
  sourceData: z.string().max(2 * 1024 * 1024),
  calendarData: z.string().max(2 * 1024 * 1024),
  base: scheduleSchema,
  snapshot: scheduleSchema,
  command: calendarScheduleUpdateSchema,
});
export type CalendarSchedulePayload = z.infer<
  typeof calendarSchedulePayloadSchema
>;
export const normalizeCalendarScheduleData = (value: string): string =>
  value.replace(/\r\n|\r/g, '\n');
