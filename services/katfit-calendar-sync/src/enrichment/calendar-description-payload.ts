import { z } from 'zod';

export const calendarDescriptionPayloadSchema = z
  .object({
    kind: z.literal('ENRICH_DESCRIPTION'),
    uid: z.string().min(1),
    classSessionId: z.uuid(),
    recordingKey: z.string(),
    configurationVersion: z.number().int().positive(),
    resourceId: z.uuid(),
    resourceVersion: z.number().int().positive(),
    calendarUrl: z.url(),
    resourceUrl: z.url(),
    expectedEtag: z.string(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    rosterHash: z.string().regex(/^[a-f0-9]{64}$/),
    calendarData: z.string().max(2 * 1024 * 1024),
  })
  .strict();
export type CalendarDescriptionPayload = z.infer<
  typeof calendarDescriptionPayloadSchema
>;
