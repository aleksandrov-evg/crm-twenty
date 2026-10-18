import { type CalendarFutureSessions } from '../crm/read-calendar-future-sessions';
import {
  type CalendarCrmSession,
  type CalendarSessionLookup,
} from '../crm/find-calendar-session';
import {
  renderCrmOriginExport,
  type CrmOriginExportCommand,
} from '../domain/render-crm-origin-export';
import { calendarLogger } from '../observability/calendar-logger';
import {
  type CalendarCrmExportLease,
  type CalendarCrmExportStore,
} from '../storage/calendar-crm-export.store';
import { type CrmOriginExportResult } from '../transport/execute-crm-origin-export';

export const sameCrmExportSession = (
  expected: CalendarCrmSession,
  actual: CalendarCrmSession,
): boolean =>
  ['id', 'recordingKey', 'name', 'sessionFormat', 'capacity', 'status'].every(
    (key) =>
      expected[key as keyof CalendarCrmSession] ===
      actual[key as keyof CalendarCrmSession],
  ) &&
  Date.parse(expected.startsAt) === Date.parse(actual.startsAt) &&
  Date.parse(expected.endsAt) === Date.parse(actual.endsAt);

type ExportStore = Pick<
  CalendarCrmExportStore,
  | 'scope'
  | 'getContext'
  | 'prepare'
  | 'claimNext'
  | 'authorize'
  | 'beginSend'
  | 'settleReview'
  | 'retry'
  | 'recordVerified'
  | 'finalize'
>;
export class CalendarCrmExportWorker {
  private nextScanAt = 0;
  constructor(
    private readonly store: ExportStore,
    private readonly dependencies: {
      sendEnabled: boolean;
      list: () => Promise<CalendarFutureSessions>;
      lookup: (id: string) => Promise<CalendarSessionLookup>;
      checkCapabilities: () => Promise<boolean>;
      execute: (
        command: CrmOriginExportCommand,
        lease: CalendarCrmExportLease,
        authorizeCreate: () => Promise<boolean>,
      ) => Promise<CrmOriginExportResult>;
      now?: () => Date;
    },
  ) {}

  async runOnce(): Promise<'idle' | 'saved' | 'stale' | 'failed'> {
    const now = this.dependencies.now?.() ?? new Date();
    if (!Number.isFinite(now.getTime())) return 'failed';
    const context = await this.store.getContext();
    if (!context) return 'idle';
    let prepared = false;
    if (now.getTime() >= this.nextScanAt) {
      this.nextScanAt = now.getTime() + 60000;
      const snapshot = await this.dependencies.list();
      if (snapshot.status !== 'read') {
        calendarLogger.event('error', 'crm.export.scan', {
          worker: 'crm-export',
          result: 'failed',
          reason: snapshot.status,
        });
        return 'failed';
      }
      for (const session of snapshot.sessions) {
        // Calendar-origin sessions already have an external identity, even before their link is finalized.
        if (session.recordingKey.startsWith('session-create:calendar-create:'))
          continue;
        const rendered = renderCrmOriginExport(
          { ...this.store.scope, calendarUrl: context.calendarUrl, session },
          now,
        );
        if (rendered.status !== 'prepared') continue;
        const result = await this.store.prepare(
          rendered.command,
          context.configurationVersion,
        );
        prepared = prepared || result === 'prepared';
      }
      calendarLogger.event('debug', 'crm.export.scan', {
        worker: 'crm-export',
        result: 'prepared',
        count: snapshot.sessions.length,
      });
      if (snapshot.needsReview.length)
        calendarLogger.event('info', 'crm.export.review', {
          worker: 'crm-export',
          reason: 'CRM_EXPORT_REFERENCE_REQUIRED',
          count: snapshot.needsReview.length,
        });
    }
    if (!this.dependencies.sendEnabled) return prepared ? 'saved' : 'idle';
    const lease = await this.store.claimNext();
    if (!lease) return prepared ? 'saved' : 'idle';
    const fields = {
      worker: 'crm-export',
      operationId: lease.id,
      connectionId: this.store.scope.connectionId,
      classSessionId: lease.command.session.id,
    };
    const review = async (reason: string) => {
      const saved = await this.store.settleReview(lease, reason);
      if (saved)
        calendarLogger.event('info', 'crm.export.review', {
          ...fields,
          result: 'needs-review',
          reason,
        });
      return saved ? ('saved' as const) : ('stale' as const);
    };
    try {
      const current = await this.dependencies.lookup(lease.command.session.id);
      if (current.status === 'unavailable')
        return (await this.store.retry(lease, 'CRM_EXPORT_CRM_UNAVAILABLE'))
          ? 'saved'
          : 'stale';
      if (
        current.status !== 'matched' ||
        !sameCrmExportSession(lease.command.session, current.session)
      )
        return review('CRM_EXPORT_SESSION_CHANGED');
      if (!(await this.store.authorize(lease))) return 'stale';
      if (!(await this.dependencies.checkCapabilities()))
        return (await this.store.retry(
          lease,
          'CRM_EXPORT_CAPABILITIES_UNAVAILABLE',
        ))
          ? 'saved'
          : 'stale';
      const result = await this.dependencies.execute(
        lease.command,
        lease,
        async () => {
          // Once a request may have been sent, recovery only reads the deterministic resource.
          if (lease.sendStartedAt !== null) return false;
          const fresh = await this.dependencies.lookup(
            lease.command.session.id,
          );
          return (
            fresh.status === 'matched' &&
            sameCrmExportSession(lease.command.session, fresh.session) &&
            (await this.store.beginSend(lease))
          );
        },
      );
      if (result.status === 'unconfirmed')
        return (await this.store.retry(lease, 'CRM_EXPORT_WRITE_UNCONFIRMED'))
          ? 'saved'
          : 'stale';
      if (result.status !== 'confirmed')
        return review(
          `CRM_EXPORT_${result.status.toUpperCase().replaceAll('-', '_')}`,
        );
      if (
        !(await this.store.recordVerified(
          lease,
          result.etag,
          result.calendarData,
        ))
      )
        return 'stale';
      const after = await this.dependencies.lookup(lease.command.session.id);
      if (after.status === 'unavailable')
        return (await this.store.retry(lease, 'CRM_EXPORT_CRM_UNAVAILABLE'))
          ? 'saved'
          : 'stale';
      if (
        after.status !== 'matched' ||
        !sameCrmExportSession(lease.command.session, after.session)
      )
        return review('CRM_EXPORT_SESSION_CHANGED');
      const finalized = await this.store.finalize(lease, after.session);
      if (finalized === 'waiting-for-poll')
        return (await this.store.retry(lease, 'CRM_EXPORT_WAITING_FOR_POLL'))
          ? 'saved'
          : 'stale';
      if (finalized === 'finalized') {
        calendarLogger.event('info', 'crm.export.confirmed', {
          ...fields,
          result: 'linked',
        });
        return 'saved';
      }
      if (finalized === 'review')
        calendarLogger.event('info', 'crm.export.review', {
          ...fields,
          result: 'needs-review',
          reason: 'CRM_EXPORT_FINALIZATION_REVIEW',
        });
      return finalized === 'review' ? 'saved' : 'stale';
    } catch {
      return (await this.store.retry(lease, 'CRM_EXPORT_UNAVAILABLE'))
        ? 'saved'
        : 'stale';
    }
  }
}
