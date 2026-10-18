import { type CalendarPollStore } from '../storage/calendar-poll.store';
import { createYandexCalDavTransport } from '../transport/create-yandex-caldav-transport';
import {
  type CalendarSnapshotResult,
  readCalendarSnapshot,
} from '../transport/read-calendar-snapshot';

type SnapshotReader = (
  calendarUrl: string,
  credentials: { username: string; appPassword: string },
) => Promise<CalendarSnapshotResult>;

const readSnapshot: SnapshotReader = async (calendarUrl, credentials) => {
  const transport = createYandexCalDavTransport(credentials);
  try {
    return await readCalendarSnapshot(calendarUrl, transport.fetch);
  } finally {
    await transport.close();
  }
};

export class CalendarPoller {
  constructor(
    private readonly store: CalendarPollStore,
    private readonly reader: SnapshotReader = readSnapshot,
  ) {}

  async runOnce(): Promise<'idle' | 'saved' | 'failed' | 'stale'> {
    const lease = await this.store.claimNext();
    if (!lease) return 'idle';
    try {
      const credentials = await this.store.readCredentials(lease);
      if (!credentials) return 'stale';
      const snapshot = await this.reader(lease.calendarUrl, credentials);
      if (snapshot.status === 'snapshot')
        return (await this.store.commitSnapshot(lease, snapshot.resources))
          ? 'saved'
          : 'stale';
      return (await this.store.fail(lease, snapshot.status))
        ? 'failed'
        : 'stale';
    } catch {
      return (await this.store.fail(lease, 'unavailable')) ? 'failed' : 'stale';
    }
  }
}
