import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';

export const calendarCancellationSessionSchema = z
  .object({
    name: z.string().min(1),
    startsAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    endsAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    sessionFormat: z.string().min(1),
    capacity: z.number().int().positive(),
    status: z.enum(['PLANNED', 'CONFIRMED']),
    recordingKey: z.string().min(1),
  })
  .strict();
export const calendarCancellationCommandSchema = z
  .object({
    classSessionId: z.uuid(),
    cancelledAt: z.iso.datetime({ offset: true }),
    idempotencyKey: z.string().regex(/^calendar-cancel:[a-f0-9]{64}$/),
    expectedBookingIds: z.array(z.uuid()).max(999),
    expectedSession: calendarCancellationSessionSchema,
  })
  .strict();
export type CalendarCancellationCommand = z.infer<
  typeof calendarCancellationCommandSchema
>;
export const calendarCancellationOperationKey = (
  command: CalendarCancellationCommand,
) =>
  `cancel-session:${createHash('sha256')
    .update(JSON.stringify([command.classSessionId, command.idempotencyKey]))
    .digest('hex')}`;
const successSchema = z.object({
  success: z.literal(true),
  duplicate: z.boolean(),
  classSessionId: z.uuid(),
  bookingIds: z.array(z.uuid()).max(999),
});
export const createCalendarCancellationCommandClient = (
  configuration: CalendarCrmConfiguration,
) => {
  const request = createCalendarCrmRequest(configuration);
  return {
    send: async (command: CalendarCancellationCommand): Promise<void> => {
      calendarCancellationCommandSchema.parse(command);
      await request('/s/studio/sessions/cancel', {
        method: 'POST',
        body: JSON.stringify(command),
      });
    },
    receipt: async (
      command: CalendarCancellationCommand,
    ): Promise<'confirmed' | 'unconfirmed'> => {
      const operationKey = calendarCancellationOperationKey(command);
      const parameters = new URLSearchParams({
        limit: '2',
        depth: '0',
        filter: `operationKey[eq]:${operationKey}`,
      });
      const response = await request(
        `/rest/studioSessionOperations?${parameters}`,
        { method: 'GET' },
      );
      if (response.status !== 'received' || response.httpStatus !== 200)
        return 'unconfirmed';
      const parsed = z
        .object({
          errors: z.array(z.unknown()).max(0).optional(),
          data: z.object({
            studioSessionOperations: z
              .array(
                z.object({
                  classSessionId: z.uuid(),
                  operationKey: z.string(),
                  state: z.literal('SUCCEEDED'),
                  request: z.string(),
                  result: z.string(),
                  ownerToken: z.string().min(1),
                }),
              )
              .length(1),
          }),
          pageInfo: z.object({ hasNextPage: z.literal(false) }),
        })
        .safeParse(response.body);
      if (!parsed.success) return 'unconfirmed';
      const row = parsed.data.data.studioSessionOperations[0];
      if (
        row.classSessionId !== command.classSessionId ||
        row.operationKey !== operationKey
      )
        return 'unconfirmed';
      try {
        const recorded = z
          .object({
            command: calendarCancellationCommandSchema,
            membershipIds: z.array(z.uuid()),
          })
          .parse(JSON.parse(row.request));
        const result = successSchema.parse(JSON.parse(row.result));
        return JSON.stringify(recorded.command) === JSON.stringify(command) &&
          result.classSessionId === command.classSessionId &&
          JSON.stringify([...result.bookingIds].sort()) ===
            JSON.stringify(command.expectedBookingIds)
          ? 'confirmed'
          : 'unconfirmed';
      } catch {
        return 'unconfirmed';
      }
    },
  };
};
