import { type CalendarCreationInspection } from '../crm/inspect-calendar-session-creation';
import { type CalendarSessionCreationResult } from '../crm/create-calendar-session';
import {
  calendarSessionCommandSchema,
  type CalendarSessionCommand,
} from '../domain/create-calendar-session-command';

export type CalendarCreationRecovery =
  | CalendarCreationInspection
  | { status: 'unconfirmed' }
  | { status: 'needs-review'; reason: string };

export const recoverCalendarSessionCreation = async (input: {
  command: CalendarSessionCommand;
  inspect: (
    command: CalendarSessionCommand,
  ) => Promise<CalendarCreationInspection>;
  send: (
    command: CalendarSessionCommand,
  ) => Promise<CalendarSessionCreationResult>;
  authorizeSend: () => Promise<boolean>;
  now?: Date;
  expectedClassSessionId?: string;
}): Promise<CalendarCreationRecovery> => {
  // Preserve one validated command across awaits; callers may change their source object.
  const command = calendarSessionCommandSchema.parse(input.command);
  Object.freeze(command.participants);
  Object.freeze(command);
  const before = await input.inspect(command);
  if (
    input.expectedClassSessionId &&
    (before.status === 'absent' ||
      ((before.status === 'confirmed' || before.status === 'incomplete') &&
        before.classSessionId !== input.expectedClassSessionId))
  )
    return {
      status: 'needs-review',
      reason: 'KNOWN_CRM_IDENTITY_MISSING_OR_CHANGED',
    };
  if (before.status !== 'absent' && before.status !== 'incomplete')
    return before;
  if (
    before.status === 'absent' &&
    (!Number.isFinite((input.now ?? new Date()).getTime()) ||
      Date.parse(command.startsAt) <= (input.now ?? new Date()).getTime())
  )
    return { status: 'needs-review', reason: 'PAST_OR_CURRENT_EVENT' };
  if (!(await input.authorizeSend()))
    return {
      status: 'needs-review',
      reason: 'SEND_NOT_AUTHORIZED_OR_SOURCE_CHANGED',
    };
  let sent: CalendarSessionCreationResult;
  try {
    sent = await input.send(command);
  } catch {
    return { status: 'unconfirmed' };
  }
  if (sent.status === 'auth-required' || sent.status === 'forbidden')
    return sent;
  const after = await input.inspect(command);
  if (after.status === 'confirmed') {
    if (
      (before.status === 'incomplete' &&
        before.classSessionId !== after.classSessionId) ||
      (sent.status === 'confirmed' &&
        sent.classSessionId !== after.classSessionId)
    )
      return {
        status: 'needs-review',
        reason: 'CRM_IDENTITY_CHANGED_DURING_CREATION',
      };
    return after;
  }
  if (
    after.status === 'needs-review' ||
    after.status === 'auth-required' ||
    after.status === 'forbidden'
  )
    return after;
  return { status: 'unconfirmed' };
};
