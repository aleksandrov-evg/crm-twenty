export type CreateSplitBookingInput = {
  pairId: string;
  membershipId: string;
  classSessionId: string;
  idempotencyKey: string;
};

export type SplitSession = {
  id: string;
  sessionFormat: string;
  status: string;
  startsAt: string;
  capacity: number;
  bookedCount: number;
};

export const validateSplitBooking = (
  input: CreateSplitBookingInput,
  session: SplitSession,
  visitsAvailable: number,
  now = new Date(),
): { success: true } | { success: false; code: string; message: string } => {
  if (
    !input.pairId.trim() ||
    !input.membershipId.trim() ||
    !input.classSessionId.trim() ||
    !input.idempotencyKey.trim()
  ) {
    return { success: false, code: 'INVALID_INPUT', message: 'Пара, блок, слот и ключ операции обязательны.' };
  }
  if (session.sessionFormat !== 'SPLIT_EQUIPMENT') {
    return { success: false, code: 'INVALID_SESSION_FORMAT', message: 'Для пары доступен только сплит-слот на оборудовании.' };
  }
  if (!['PLANNED', 'CONFIRMED'].includes(session.status)) {
    return { success: false, code: 'SESSION_NOT_BOOKABLE', message: 'На этот слот нельзя записаться.' };
  }
  if (new Date(session.startsAt) <= now) {
    return { success: false, code: 'SESSION_IN_PAST', message: 'Запись возможна только на будущий слот.' };
  }
  if (visitsAvailable < 1) {
    return { success: false, code: 'INSUFFICIENT_BALANCE', message: 'В общем сплит-блоке нет доступных тренировок.' };
  }
  if (!Number.isInteger(session.capacity) || session.capacity - session.bookedCount < 2) {
    return { success: false, code: 'INSUFFICIENT_CAPACITY', message: 'Для пары нужно два свободных места в слоте.' };
  }
  return { success: true };
};
