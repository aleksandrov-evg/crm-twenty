import { type CalendarRoster } from '../crm/read-calendar-roster';
import { type CalendarDescriptionStore } from '../storage/calendar-description.store';

export class CalendarDescriptionPreparer {
  constructor(
    private readonly store: CalendarDescriptionStore,
    private readonly reader: (id: string) => Promise<CalendarRoster>,
  ) {}
  async runOnce(): Promise<'idle' | 'saved' | 'stale'> {
    const lease = await this.store.claimNext();
    if (!lease) return 'idle';
    let roster: CalendarRoster;
    try {
      roster = await this.reader(lease.classSessionId);
    } catch {
      roster = { status: 'unavailable' };
    }
    return (await this.store.settle(lease, roster)) ? 'saved' : 'stale';
  }
}
