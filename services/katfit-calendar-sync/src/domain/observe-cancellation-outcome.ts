import { z } from 'zod';

import { type CalendarCancellationImpact } from '../crm/read-calendar-cancellation-impact';

export const observeCancellationOutcome = (input: {
  initialBookingIds: unknown;
  seenBookingIds?: unknown;
  impact: CalendarCancellationImpact;
}): { status: 'observed' } | { status: 'needs-review'; reason: string } => {
  const baseline = z
    .array(z.uuid())
    .max(1000)
    .safeParse(input.initialBookingIds);
  const current = input.impact;
  if (!baseline.success || new Set(baseline.data).size !== baseline.data.length)
    return {
      status: 'needs-review',
      reason: 'CANCELLATION_HISTORY_BASELINE_MISSING',
    };
  if (current.status !== 'read')
    return {
      status: 'needs-review',
      reason: 'CANCELLATION_IMPACT_UNCONFIRMED',
    };
  const identifiers = z.array(z.uuid()).max(1000).safeParse(current.bookingIds);
  if (
    !identifiers.success ||
    identifiers.data.length !== current.totalBookings ||
    new Set(identifiers.data).size !== identifiers.data.length
  )
    return {
      status: 'needs-review',
      reason: 'CANCELLATION_HISTORY_UNCONFIRMED',
    };
  const seen = z
    .array(z.uuid())
    .max(1000)
    .safeParse(
      input.seenBookingIds === undefined
        ? input.initialBookingIds
        : input.seenBookingIds,
    );
  if (!seen.success)
    return {
      status: 'needs-review',
      reason: 'CANCELLATION_HISTORY_UNCONFIRMED',
    };
  if (
    [...baseline.data, ...seen.data].some(
      (id) => !identifiers.data.includes(id),
    )
  )
    return {
      status: 'needs-review',
      reason: 'CANCELLATION_BOOKING_HISTORY_MISSING',
    };
  if (
    current.activeBookings ||
    current.attendedBookings ||
    current.expectedPayments ||
    current.paidBookings ||
    current.consumingBookings
  )
    return {
      status: 'needs-review',
      reason: 'CRM_CANCELLED_WITH_UNSETTLED_BOOKINGS',
    };
  // Booking flags cannot prove that package reservations and payment ledgers were reconciled.
  if (current.totalBookings > 0)
    return {
      status: 'needs-review',
      reason: 'CRM_CANCELLED_FINANCIAL_RECONCILIATION_REQUIRED',
    };
  return { status: 'observed' };
};
