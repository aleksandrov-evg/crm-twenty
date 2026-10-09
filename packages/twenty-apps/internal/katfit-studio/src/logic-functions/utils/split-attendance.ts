export type RecordSplitAttendanceInput = {
  pairId: string;
  membershipId: string;
  classSessionId: string;
  idempotencyKey: string;
};

export const validateSplitAttendance = (
  input: RecordSplitAttendanceInput,
  startsAt: string,
  endsAt: string,
  now = new Date(),
): { success: true } | { success: false; code: string; message: string } => {
  if (!input.pairId.trim() || !input.membershipId.trim() || !input.classSessionId.trim() || !input.idempotencyKey.trim()) {
    return { success: false, code: 'INVALID_INPUT', message: 'Пара, блок, слот и ключ операции обязательны.' };
  }
  if (
    Number.isNaN(new Date(startsAt).getTime()) ||
    Number.isNaN(new Date(endsAt).getTime()) ||
    new Date(endsAt) > now
  ) {
    return { success: false, code: 'SESSION_NOT_FINISHED', message: 'Проведённым можно отметить только завершившийся слот.' };
  }
  return { success: true };
};
