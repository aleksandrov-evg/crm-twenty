import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';

export const calendarParticipantSchema = z.object({
  personId: z.uuid(),
  name: z
    .string()
    .min(1)
    .max(401)
    .refine(
      (value) =>
        /\S/.test(value) &&
        !/[\x00-\x1f\x7f]/.test(value) &&
        !value.includes('--- KATFIT:GENERATED:'),
    ),
});
export type CalendarParticipant = z.infer<typeof calendarParticipantSchema>;
export type CalendarRoster =
  | { status: 'read'; participants: CalendarParticipant[]; rosterHash: string }
  | { status: 'needs-review'; reason: string }
  | { status: 'auth-required' | 'forbidden' | 'unavailable' };
const responseSchema = z.object({
  errors: z.array(z.unknown()).max(0).optional(),
  data: z.object({
    studioBookings: z.object({
      edges: z
        .array(
          z.object({
            node: z.object({
              id: z.uuid(),
              status: z.enum([
                'BOOKED',
                'ATTENDED',
                'CANCELLED_IN_TIME',
                'LATE_CANCEL',
                'NO_SHOW',
                'CANCELLED_BY_STUDIO',
              ]),
              classSession: z.object({ id: z.uuid() }),
              person: z
                .object({
                  id: z.uuid(),
                  name: z.object({
                    firstName: z.string().max(200),
                    lastName: z.string().max(200),
                  }),
                })
                .nullable(),
            }),
          }),
        )
        .max(1000),
      pageInfo: z.object({ hasNextPage: z.literal(false) }),
    }),
  }),
});
const query = `query CalendarRoster($sessionId: UUID!) {
  studioBookings(filter: {classSessionId: {eq: $sessionId}}, first: 1000) {
    edges { node { id status classSession { id } person { id name { firstName lastName } } } } pageInfo { hasNextPage }
  }
}`;

export const createCalendarRosterReader = (
  configuration: CalendarCrmConfiguration,
) => {
  const request = createCalendarCrmRequest(configuration);
  return async (classSessionId: string): Promise<CalendarRoster> => {
    z.uuid().parse(classSessionId);
    const result = await request('/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables: { sessionId: classSessionId } }),
    });
    if (result.status === 'unconfirmed') return { status: 'unavailable' };
    if (result.httpStatus === 401) return { status: 'auth-required' };
    if (result.httpStatus === 403) return { status: 'forbidden' };
    if (result.httpStatus !== 200) return { status: 'unavailable' };
    const parsed = responseSchema.safeParse(result.body);
    if (!parsed.success)
      return { status: 'needs-review', reason: 'INVALID_OR_INCOMPLETE_ROSTER' };
    const bookings = parsed.data.data.studioBookings.edges.map(
      (edge) => edge.node,
    );
    if (
      new Set(bookings.map((booking) => booking.id)).size !== bookings.length ||
      bookings.some((booking) => booking.classSession.id !== classSessionId)
    )
      return { status: 'needs-review', reason: 'ROSTER_IDENTITY_MISMATCH' };
    const participants: CalendarParticipant[] = [];
    for (const booking of bookings.filter((booking) =>
      ['BOOKED', 'ATTENDED'].includes(booking.status),
    )) {
      if (!booking.person)
        return { status: 'needs-review', reason: 'PARTICIPANT_MISSING' };
      const participant = calendarParticipantSchema.safeParse({
        personId: booking.person.id,
        name: [booking.person.name.firstName, booking.person.name.lastName]
          .filter((value) => value !== '')
          .join(' '),
      });
      if (!participant.success)
        return { status: 'needs-review', reason: 'PARTICIPANT_NAME_INVALID' };
      participants.push(participant.data);
    }
    if (
      participants.length > 100 ||
      new Set(participants.map((person) => person.personId)).size !==
        participants.length
    )
      return {
        status: 'needs-review',
        reason: 'DUPLICATE_OR_EXCESSIVE_PARTICIPANTS',
      };
    participants.sort((first, second) =>
      first.personId.localeCompare(second.personId),
    );
    return {
      status: 'read',
      participants,
      rosterHash: createHash('sha256')
        .update(JSON.stringify(participants))
        .digest('hex'),
    };
  };
};
