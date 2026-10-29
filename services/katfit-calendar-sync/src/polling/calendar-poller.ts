import { createYandexAuthorizationObserver } from '../observability/yandex-authorization-observer';
import { calendarLogger } from '../observability/calendar-logger';
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
  private readonly observeAuthorization = createYandexAuthorizationObserver();

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
      this.observeAuthorization(snapshot.status, lease.id);
      if (snapshot.status === 'snapshot') {
        const committed = await this.store.commitSnapshot(
          lease,
          snapshot.resources,
          snapshot.skippedResourceUrls,
        );
        calendarLogger.event(snapshot.skippedResourceUrls?.length ? 'error' : 'debug', 'calendar.snapshot', {
          connectionId: lease.id,
          result: committed ? (snapshot.skippedResourceUrls?.length ? 'partial-snapshot' : 'saved') : 'stale',
          count: snapshot.resources.length,
          skippedCount: snapshot.skippedResourceUrls?.length ?? 0,
        });
        return committed ? 'saved' : 'stale';
      }
      const saved = await this.store.fail(lease, snapshot.status);
      calendarLogger.event('error', 'calendar.snapshot', {
        connectionId: lease.id,
        result: saved ? 'failed' : 'stale',
        reason: snapshot.status,
      });
      return saved ? 'failed' : 'stale';
    } catch {
      const saved = await this.store.fail(lease, 'unavailable');
      calendarLogger.event('error', 'calendar.snapshot', {
        connectionId: lease.id,
        result: saved ? 'failed' : 'stale',
        reason: 'unavailable',
      });
      return saved ? 'failed' : 'stale';
    }
  }
}
