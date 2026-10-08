import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateLedgerBalance, findDuplicateAttendance, getAttendanceEndsAt, type RecordPastAttendanceInput, validateAttendanceInput } from '../past-attendance.ts';

const input: RecordPastAttendanceInput = {
  personId: 'person-1', membershipId: 'membership-1',
  startsAt: '2026-01-08T10:00:00.000Z', endsAt: '2026-01-08T11:00:00.000Z',
  reason: 'Подтверждено тренером', source: 'TRAINER', idempotencyKey: 'attendance-1',
};

test('accepts a completed past class and rejects a future or unfinished class', () => {
  const now = new Date('2026-01-09T00:00:00.000Z');
  assert.equal(validateAttendanceInput(input, now).success, true);
  assert.equal(validateAttendanceInput({ ...input, endsAt: '2026-01-08T09:00:00.000Z' }, now).success, false);
  assert.deepEqual(validateAttendanceInput({ ...input, endsAt: '2026-01-09T00:00:00.000Z' }, now), {
    success: false, code: 'FUTURE_ATTENDANCE', message: 'Занятие должно полностью завершиться до текущего времени.',
  });
});

test('requires an explanation for another source', () => {
  assert.equal(validateAttendanceInput({ ...input, source: 'OTHER' }).success, false);
  assert.equal(validateAttendanceInput({ ...input, source: 'OTHER', sourceDetails: 'Письмо клиента' }).success, true);
});

test('calculates attendance end from the product duration', () => {
  assert.equal(
    getAttendanceEndsAt('2026-01-08T10:00:00.000Z', 55),
    '2026-01-08T10:55:00.000Z',
  );
  assert.equal(getAttendanceEndsAt('invalid', 55), null);
  assert.equal(getAttendanceEndsAt('2026-01-08T10:00:00.000Z', 0), null);
});

test('orders ledger by occurrence and rejects a backdated negative intermediate balance', () => {
  const grant = { id: 'grant', transactionType: 'GRANT', visitDelta: 1, occurredAt: '2026-01-08T09:00:00.000Z' };
  const consume = { id: 'consume', transactionType: 'CONSUME', visitDelta: -1, occurredAt: '2026-01-08T10:00:00.000Z' };
  assert.deepEqual(calculateLedgerBalance([consume, grant]), { success: true, available: 0, granted: 1, consumed: 1, reserved: 0 });
  assert.equal(calculateLedgerBalance([{ ...consume, occurredAt: grant.occurredAt }, grant]).success, true);
  assert.equal(calculateLedgerBalance([{ ...consume, occurredAt: '2026-01-08T08:00:00.000Z' }, grant]).success, false);
  assert.equal(calculateLedgerBalance([grant, consume, { ...consume, id: 'second' }]).success, false);
});

test('finds active or attended duplicate bookings and excludes the current replay', () => {
  const bookings = [
    { id: 'cancelled', status: 'CANCELLED_IN_TIME', classSession: { id: 'session-1' } },
    { id: 'replay', status: 'ATTENDED', classSession: { id: 'session-1' } },
    { id: 'duplicate', status: 'BOOKED', classSession: { id: 'session-1' } },
  ];
  assert.equal(findDuplicateAttendance(bookings, new Set(['session-1']), 'replay')?.id, 'duplicate');
  assert.equal(findDuplicateAttendance(bookings, new Set(['session-2'])), undefined);
});
