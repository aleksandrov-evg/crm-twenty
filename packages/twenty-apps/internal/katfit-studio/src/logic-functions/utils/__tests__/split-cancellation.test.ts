import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateSplitCancellation } from '../split-cancellation.ts';

test('does not consume a visit for a cancellation at least twelve hours before the slot', () => {
  assert.deepEqual(
    evaluateSplitCancellation('2026-10-12T18:00:00.000Z', '2026-10-12T06:00:00.000Z', null),
    { success: true, status: 'CANCELLED_IN_TIME', consumesVisit: false },
  );
});

test('consumes one joint visit for a late cancellation', () => {
  assert.deepEqual(
    evaluateSplitCancellation('2026-10-12T18:00:00.000Z', '2026-10-12T06:01:00.000Z', null),
    { success: true, status: 'LATE_CANCEL', consumesVisit: true },
  );
});

test('limits the pair to one timely cancellation per thirty days', () => {
  const result = evaluateSplitCancellation('2026-10-20T18:00:00.000Z', '2026-10-20T06:00:00.000Z', '2026-10-01T06:00:00.000Z');
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'RESCHEDULE_LIMIT_REACHED');
});
