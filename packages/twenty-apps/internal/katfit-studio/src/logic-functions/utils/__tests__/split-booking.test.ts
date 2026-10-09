import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSplitBooking } from '../split-booking.ts';

const input = { pairId: 'pair-1', membershipId: 'block-1', classSessionId: 'session-1', idempotencyKey: 'booking-1' };
const session = { id: 'session-1', sessionFormat: 'SPLIT_EQUIPMENT', status: 'CONFIRMED', startsAt: '2026-11-01T10:00:00.000Z', capacity: 4, bookedCount: 2 };

test('accepts a future split booking with two free places', () => {
  assert.equal(validateSplitBooking(input, session, 4, new Date('2026-10-01')).success, true);
});

test('requires two free places for a pair', () => {
  const result = validateSplitBooking(input, { ...session, bookedCount: 3 }, 4, new Date('2026-10-01'));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'INSUFFICIENT_CAPACITY');
});
