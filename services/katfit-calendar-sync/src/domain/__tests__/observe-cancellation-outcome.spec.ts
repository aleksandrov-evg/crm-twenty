import { observeCancellationOutcome } from '../observe-cancellation-outcome';
import { type CalendarCancellationImpact } from '../../crm/read-calendar-cancellation-impact';

const empty = {
  status: 'read' as const,
  bookingIds: [],
  totalBookings: 0,
  activeBookings: 0,
  attendedBookings: 0,
  expectedPayments: 0,
  paidBookings: 0,
  consumingBookings: 0,
};
const id = 'd7559474-49ce-4881-8ed1-d994ef52d1b5';
it('recognizes only a preserved, empty baseline and complete empty current result', () => {
  expect(
    observeCancellationOutcome({ initialBookingIds: [], impact: empty }),
  ).toEqual({ status: 'observed' });
});
it.each([null, undefined, [id, id], ['not-a-uuid']])(
  'requires a trustworthy baseline: %j',
  (initialBookingIds) => {
    expect(
      observeCancellationOutcome({ initialBookingIds, impact: empty }),
    ).toMatchObject({
      status: 'needs-review',
      reason: 'CANCELLATION_HISTORY_BASELINE_MISSING',
    });
  },
);
it('detects a booking deleted after initial observation', () => {
  expect(
    observeCancellationOutcome({ initialBookingIds: [id], impact: empty }),
  ).toMatchObject({
    status: 'needs-review',
    reason: 'CANCELLATION_BOOKING_HISTORY_MISSING',
  });
});
it.each([
  'activeBookings',
  'attendedBookings',
  'expectedPayments',
  'paidBookings',
  'consumingBookings',
] as const)('requires review for non-zero %s', (field) => {
  expect(
    observeCancellationOutcome({
      initialBookingIds: [],
      impact: { ...empty, [field]: 1 },
    }),
  ).toMatchObject({
    status: 'needs-review',
    reason: 'CRM_CANCELLED_WITH_UNSETTLED_BOOKINGS',
  });
});
it('does not equate settled booking flags with reconciled financial ledgers', () => {
  expect(
    observeCancellationOutcome({
      initialBookingIds: [id],
      impact: { ...empty, totalBookings: 1, bookingIds: [id] },
    }),
  ).toMatchObject({
    status: 'needs-review',
    reason: 'CRM_CANCELLED_FINANCIAL_RECONCILIATION_REQUIRED',
  });
});
it.each([
  { status: 'unavailable' },
  { status: 'needs-review', reason: 'partial' },
] as CalendarCancellationImpact[])(
  'requires review when impact is unavailable',
  (impact) => {
    expect(
      observeCancellationOutcome({ initialBookingIds: [], impact }),
    ).toMatchObject({
      status: 'needs-review',
      reason: 'CANCELLATION_IMPACT_UNCONFIRMED',
    });
  },
);
it('rejects an empty count without the actual complete ID list', () => {
  expect(
    observeCancellationOutcome({
      initialBookingIds: [],
      impact: { ...empty, bookingIds: undefined },
    }),
  ).toMatchObject({
    status: 'needs-review',
    reason: 'CANCELLATION_HISTORY_UNCONFIRMED',
  });
});
