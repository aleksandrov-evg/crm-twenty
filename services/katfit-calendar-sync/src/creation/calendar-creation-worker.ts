import { calendarLogger } from '../observability/calendar-logger';
import { type CalendarLiveSourceResult } from './calendar-live-source-guard';
import { type CalendarCreationLease } from '../storage/calendar-creation-execution.store';
import { type CalendarSessionCreationResult } from '../crm/create-calendar-session';
import { type CalendarCreationInspection } from '../crm/inspect-calendar-session-creation';
import { type CalendarSessionCommand } from '../domain/create-calendar-session-command';
import { type CalendarCreationExecutionStore } from '../storage/calendar-creation-execution.store';
import { recoverCalendarSessionCreation } from './recover-calendar-session-creation';

export class CalendarCreationWorker {
  constructor(
    private readonly store: CalendarCreationExecutionStore,
    private readonly inspect: (
      command: CalendarSessionCommand,
    ) => Promise<CalendarCreationInspection>,
    private readonly sender?: (
      command: CalendarSessionCommand,
    ) => Promise<CalendarSessionCreationResult>,
    private readonly sourceGuard?: (
      lease: CalendarCreationLease,
    ) => Promise<CalendarLiveSourceResult>,
    private readonly beforeSend?: (
      lease: CalendarCreationLease,
    ) => Promise<CalendarCreationInspection | null>,
  ) {}

  async runOnce(): Promise<'idle' | 'saved' | 'stale'> {
    const lease = await this.store.claimNext();
    if (!lease) return 'idle';
    let stale = false;
    const inspect = async (
      command: CalendarSessionCommand,
    ): Promise<CalendarCreationInspection> => {
      let result: CalendarCreationInspection;
      try {
        result = await this.inspect(command);
      } catch {
        result = { status: 'unavailable' };
      }
      if (
        result.status === 'confirmed' &&
        result.recordingKey !== `session-create:${lease.command.idempotencyKey}`
      )
        result = {
          status: 'needs-review',
          reason: 'CRM_RECORDING_KEY_MISMATCH',
        };
      if (
        lease.knownClassSessionId &&
        (result.status === 'absent' ||
          ((result.status === 'confirmed' || result.status === 'incomplete') &&
            result.classSessionId !== lease.knownClassSessionId))
      )
        result = {
          status: 'needs-review',
          reason: 'KNOWN_CRM_IDENTITY_MISSING_OR_CHANGED',
        };
      if (!(await this.store.recordInspection(lease, result))) {
        stale = true;
        return { status: 'needs-review', reason: 'STALE_CREATION_ATTEMPT' };
      }
      return result;
    };
    const checkSource =
      async (): Promise<CalendarCreationInspection | null> => {
        if (!this.sourceGuard)
          return {
            status: 'needs-review',
            reason: 'LIVE_SOURCE_CHECK_REQUIRED',
          };
        let result: CalendarLiveSourceResult;
        try {
          result = await this.sourceGuard(lease);
        } catch {
          result = { status: 'unavailable' };
        }
        if (result.status === 'verified') return null;
        if (result.status === 'stale') {
          stale = true;
          return { status: 'needs-review', reason: 'STALE_LIVE_SOURCE_CHECK' };
        }
        if (
          result.status === 'unavailable' ||
          result.status === 'auth-required' ||
          result.status === 'forbidden'
        )
          return { status: result.status };
        return {
          status: 'needs-review',
          reason: `CALDAV_SOURCE_${result.status.toUpperCase().replaceAll('-', '_')}`,
        };
      };
    let sourceFailure: CalendarCreationInspection | null = null;
    const sender = lease.connectionState === 'ACTIVE' ? this.sender : undefined;
    let result = sender
      ? await recoverCalendarSessionCreation({
          command: lease.command,
          expectedClassSessionId: lease.knownClassSessionId ?? undefined,
          inspect,
          authorizeSend: async () => {
            if (stale) return false;
            const beforeSend = this.beforeSend;
            if (!beforeSend) {
              sourceFailure = {
                status: 'needs-review',
                reason: 'CRM_ACTIVATION_CHECK_REQUIRED',
              };
              return false;
            }
            sourceFailure = await beforeSend(lease);
            if (sourceFailure) return false;
            sourceFailure = await checkSource();
            return !sourceFailure && (await this.store.beginSend(lease));
          },
          send: async (command) => {
            let result: CalendarSessionCreationResult;
            try {
              result = await sender(command);
            } catch {
              result = { status: 'unconfirmed' };
            }
            calendarLogger.event('debug', 'crm.creation.send_result', {
              worker: 'creation',
              connectionId: lease.connectionId,
              result: result.status,
            });
            if (!(await this.store.recordSendResult(lease, result))) {
              stale = true;
              return { status: 'unconfirmed' };
            }
            return result;
          },
        })
      : await inspect(lease.command);
    if (
      !sender &&
      this.sourceGuard &&
      (result.status === 'absent' || result.status === 'incomplete')
    )
      sourceFailure = await checkSource();
    if (sourceFailure) result = sourceFailure;
    if (stale) return 'stale';
    const saved = await this.store.settle(lease, result);
    if (saved)
      calendarLogger.event(
        result.status === 'confirmed' ? 'info' : 'debug',
        result.status === 'confirmed'
          ? 'crm.creation.confirmed'
          : 'crm.creation.observed',
        {
          worker: 'creation',
          connectionId: lease.connectionId,
          classSessionId:
            result.status === 'confirmed' || result.status === 'incomplete'
              ? result.classSessionId
              : undefined,
          result: result.status,
          reason: result.status === 'needs-review' ? result.reason : undefined,
        },
      );
    return saved ? 'saved' : 'stale';
  }
}
