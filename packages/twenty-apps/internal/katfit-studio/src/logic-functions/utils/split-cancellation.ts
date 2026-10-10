export type SplitCancellationOutcome =
  | { success: true; status: 'CANCELLED_IN_TIME'; consumesVisit: false }
  | { success: true; status: 'LATE_CANCEL'; consumesVisit: true }
  | { success: false; code: string; message: string };

export type CancelSplitBookingInput = {
  pairId: string;
  membershipId: string;
  classSessionId: string;
  cancelledAt: string;
  idempotencyKey: string;
  cancelledByStudio?: boolean;
};

export type CancelSplitParticipantInput = CancelSplitBookingInput & {
  personId: string;
};

const CANCELLATION_WINDOW_MS = 12 * 60 * 60 * 1_000;
const RESCHEDULE_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

export const evaluateSplitCancellation = (
  startsAt: string,
  cancelledAt: string,
  previousTimelyCancellationAt: string | null,
): SplitCancellationOutcome => {
  const start = new Date(startsAt);
  const cancelled = new Date(cancelledAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(cancelled.getTime()) || cancelled >= start) {
    return { success: false, code: 'INVALID_CANCELLATION_DATE', message: 'Отмена должна быть зафиксирована до начала слота.' };
  }
  if (start.getTime() - cancelled.getTime() < CANCELLATION_WINDOW_MS) {
    return { success: true, status: 'LATE_CANCEL', consumesVisit: true };
  }
  if (previousTimelyCancellationAt !== null) {
    const previous = new Date(previousTimelyCancellationAt);
    if (!Number.isNaN(previous.getTime()) && cancelled.getTime() - previous.getTime() < RESCHEDULE_WINDOW_MS) {
      return { success: false, code: 'RESCHEDULE_LIMIT_REACHED', message: 'У пары уже был своевременный перенос за последние 30 дней.' };
    }
  }
  return { success: true, status: 'CANCELLED_IN_TIME', consumesVisit: false };
};
