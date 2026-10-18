import { z } from 'zod';

import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';

const bookingSchema = z.object({
  id: z.uuid(),
  classSession: z.object({ id: z.uuid() }),
  status: z.enum([
    'BOOKED',
    'ATTENDED',
    'CANCELLED_IN_TIME',
    'LATE_CANCEL',
    'NO_SHOW',
    'CANCELLED_BY_STUDIO',
  ]),
  paymentStatus: z.enum(['NOT_REQUIRED', 'EXPECTED', 'PAID', 'WAIVED']),
  consumesVisit: z.boolean(),
});
const responseSchema = z.object({
  errors: z.array(z.unknown()).max(0).optional(),
  data: z.object({
    studioBookings: z.object({
      edges: z.array(z.object({ node: bookingSchema })).max(1000),
      pageInfo: z.object({ hasNextPage: z.literal(false) }),
    }),
  }),
});
export type CalendarCancellationImpact =
  | {
      status: 'read';
      bookingIds?: string[];
      totalBookings: number;
      activeBookings: number;
      attendedBookings: number;
      expectedPayments: number;
      paidBookings: number;
      consumingBookings: number;
    }
  | { status: 'needs-review'; reason: string }
  | { status: 'unavailable' | 'auth-required' | 'forbidden' };

export const createCalendarCancellationImpactReader = (
  configuration: CalendarCrmConfiguration,
) => {
  const request = createCalendarCrmRequest(configuration);
  return async (
    classSessionId: string,
  ): Promise<CalendarCancellationImpact> => {
    z.uuid().parse(classSessionId);
    const result = await request('/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: `query CalendarCancellationImpact($sessionId: UUID!) {
        studioBookings(filter: {classSessionId: {eq: $sessionId}}, first: 1000) {
          edges { node { id status paymentStatus consumesVisit classSession { id } } } pageInfo { hasNextPage }
        }
      }`,
        variables: { sessionId: classSessionId },
      }),
    });
    if (result.status !== 'received') return { status: 'unavailable' };
    if (result.httpStatus === 401) return { status: 'auth-required' };
    if (result.httpStatus === 403) return { status: 'forbidden' };
    if (result.httpStatus !== 200) return { status: 'unavailable' };
    const parsed = responseSchema.safeParse(result.body);
    if (!parsed.success)
      return {
        status: 'needs-review',
        reason: 'INCOMPLETE_CANCELLATION_IMPACT',
      };
    const bookings = parsed.data.data.studioBookings.edges.map(
      (edge) => edge.node,
    );
    if (
      new Set(bookings.map((booking) => booking.id)).size !== bookings.length ||
      bookings.some((booking) => booking.classSession.id !== classSessionId)
    )
      return {
        status: 'needs-review',
        reason: 'CANCELLATION_IMPACT_IDENTITY_MISMATCH',
      };
    return {
      status: 'read',
      bookingIds: bookings.map((booking) => booking.id).sort(),
      totalBookings: bookings.length,
      activeBookings: bookings.filter((booking) => booking.status === 'BOOKED')
        .length,
      attendedBookings: bookings.filter(
        (booking) => booking.status === 'ATTENDED',
      ).length,
      expectedPayments: bookings.filter(
        (booking) => booking.paymentStatus === 'EXPECTED',
      ).length,
      paidBookings: bookings.filter(
        (booking) => booking.paymentStatus === 'PAID',
      ).length,
      consumingBookings: bookings.filter((booking) => booking.consumesVisit)
        .length,
    };
  };
};
