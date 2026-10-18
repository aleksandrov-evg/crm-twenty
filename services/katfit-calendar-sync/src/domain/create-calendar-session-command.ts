import { z } from 'zod';

import {
  type CalendarSessionCandidate,
  SESSION_FORMATS,
} from './prepare-calendar-session';

export const calendarSessionCommandSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    sessionFormat: z.enum(SESSION_FORMATS),
    startsAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().min(1).max(1440),
    capacity: z.number().int().min(1).max(100),
    status: z.literal('PLANNED'),
    idempotencyKey: z.string().regex(/^calendar-create:[a-f0-9]{64}$/),
    participants: z.tuple([]),
  })
  .strict()
  .refine(
    (value) =>
      value.sessionFormat !== 'PERSONAL_EQUIPMENT' || value.capacity === 1,
  );
export type CalendarSessionCommand = z.infer<
  typeof calendarSessionCommandSchema
>;

export const createCalendarSessionCommand = (
  candidate: CalendarSessionCandidate,
): CalendarSessionCommand => {
  if (
    candidate.recordingKey !== `session-create:${candidate.idempotencyKey}` ||
    Date.parse(candidate.endsAt) - Date.parse(candidate.startsAt) !==
      candidate.durationMinutes * 60000
  )
    throw new Error('INVALID_CALENDAR_SESSION_CANDIDATE');
  return calendarSessionCommandSchema.parse({
    name: candidate.name,
    sessionFormat: candidate.sessionFormat,
    startsAt: candidate.startsAt,
    durationMinutes: candidate.durationMinutes,
    capacity: candidate.capacity,
    status: 'PLANNED',
    idempotencyKey: candidate.idempotencyKey,
    participants: [],
  });
};
