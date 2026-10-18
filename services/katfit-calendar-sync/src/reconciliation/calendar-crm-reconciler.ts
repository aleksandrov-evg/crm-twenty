import { type CalendarSessionLookup } from '../crm/find-calendar-session';
import { type CalendarCrmReconciliationStore } from '../storage/calendar-crm-reconciliation.store';

export class CalendarCrmReconciler {
  constructor(
    private readonly store: CalendarCrmReconciliationStore,
    private readonly lookup: (
      recordingKey: string,
    ) => Promise<CalendarSessionLookup>,
  ) {}

  async runOnce(): Promise<'idle' | 'saved' | 'stale'> {
    const lease = await this.store.claimNext();
    if (!lease) return 'idle';
    let result: CalendarSessionLookup;
    try {
      result = await this.lookup(lease.candidate.recordingKey);
    } catch {
      result = { status: 'unavailable' };
    }
    return (await this.store.settle(lease, result)) ? 'saved' : 'stale';
  }
}
