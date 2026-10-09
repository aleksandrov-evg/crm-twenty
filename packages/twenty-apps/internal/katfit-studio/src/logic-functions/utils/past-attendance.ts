export type AttendanceSource = 'TRAINER' | 'ATTENDANCE_LOG' | 'CLIENT' | 'ADMIN' | 'OTHER';

export type RecordPastAttendanceInput = {
  personId: string;
  membershipId: string;
  startsAt: string;
  endsAt: string;
  existingClassSessionId?: string;
  reason: string;
  source: AttendanceSource;
  sourceDetails?: string;
  idempotencyKey: string;
  previewOnly?: boolean;
};

export type AttendanceValidation =
  | { success: true; startsAt: string; endsAt: string }
  | { success: false; code: string; message: string };

export type LedgerEntry = { id: string; transactionType: string; visitDelta: number; occurredAt: string };
export type AttendanceBooking = { id: string; status: string; classSession: { id: string } | null };

export const getAttendanceEndsAt = (
  startsAt: string,
  durationMinutes: number,
): string | null => {
  const startsAtDate = new Date(startsAt);

  if (
    Number.isNaN(startsAtDate.getTime()) ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }

  return new Date(
    startsAtDate.getTime() + durationMinutes * 60_000,
  ).toISOString();
};

export const findDuplicateAttendance = <TBooking extends AttendanceBooking>(
  bookings: TBooking[],
  classSessionIds: Set<string>,
  replayBookingId?: string,
): TBooking | undefined => bookings.find((booking) =>
  booking.id !== replayBookingId &&
  ['BOOKED', 'ATTENDED'].includes(booking.status) &&
  booking.classSession !== null &&
  classSessionIds.has(booking.classSession.id),
);

export const validateAttendanceInput = (
  input: RecordPastAttendanceInput,
  now = new Date(),
): AttendanceValidation => {
  if (!input.personId || !input.membershipId || !input.idempotencyKey || !input.reason) {
    return { success: false, code: 'INVALID_INPUT', message: 'Клиент, пакет, причина и ключ операции обязательны.' };
  }
  if (!['TRAINER', 'ATTENDANCE_LOG', 'CLIENT', 'ADMIN', 'OTHER'].includes(input.source)) {
    return { success: false, code: 'INVALID_SOURCE', message: 'Выберите источник сведений.' };
  }
  if (input.source === 'OTHER' && !input.sourceDetails?.trim()) {
    return { success: false, code: 'INVALID_SOURCE', message: 'Поясните источник «Другое».' };
  }
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return { success: false, code: 'INVALID_ATTENDANCE_DATE', message: 'Укажите корректное начало и окончание занятия.' };
  }
  if (startsAt >= now || endsAt >= now) {
    return { success: false, code: 'FUTURE_ATTENDANCE', message: 'Занятие должно полностью завершиться до текущего времени.' };
  }
  return { success: true, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
};

export const calculateLedgerBalance = (entries: LedgerEntry[]) => {
  const sorted = [...entries].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt) ||
    Number(right.transactionType === 'GRANT') - Number(left.transactionType === 'GRANT') ||
    left.id.localeCompare(right.id),
  );
  let available = 0;
  let granted = 0;
  let consumed = 0;
  let reserved = 0;
  for (const entry of sorted) {
    available += entry.visitDelta;
    if (available < 0) {
      return { success: false as const, code: 'INSUFFICIENT_HISTORICAL_BALANCE' };
    }
    if (entry.transactionType === 'GRANT') granted += entry.visitDelta;
    if (entry.transactionType === 'CONSUME') consumed -= entry.visitDelta;
    if (entry.transactionType === 'RESERVE') reserved -= entry.visitDelta;
    if (entry.transactionType === 'RELEASE') reserved -= entry.visitDelta;
  }
  return { success: true as const, available, granted, consumed, reserved };
};
