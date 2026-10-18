import { type CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import {
  type CalendarCreationExecutionStore,
  type CalendarCreationLease,
} from '../storage/calendar-creation-execution.store';
import {
  checkCalendarResource,
  type CalendarResourceCheck,
  type CalendarResourceCheckResult,
} from '../transport/check-calendar-resource';
import { createYandexCalDavTransport } from '../transport/create-yandex-caldav-transport';

export type CalendarLiveSourceResult =
  | CalendarResourceCheckResult
  | { status: 'stale' };
type ResourceReader = (
  source: CalendarResourceCheck,
  credentials: { username: string; appPassword: string },
) => Promise<CalendarResourceCheckResult>;

const readResource: ResourceReader = async (source, credentials) => {
  const transport = createYandexCalDavTransport(credentials);
  try {
    return await checkCalendarResource(source, transport.fetch);
  } finally {
    await transport.close();
  }
};

export class CalendarLiveSourceGuard {
  constructor(
    private readonly store: CalendarCreationExecutionStore,
    private readonly cipher: CalendarCredentialCipher,
    private readonly reader: ResourceReader = readResource,
  ) {}

  async check(lease: CalendarCreationLease): Promise<CalendarLiveSourceResult> {
    let result: CalendarResourceCheckResult;
    let expectedSource:
      | { resourceId: string; resourceVersion: number }
      | undefined;
    try {
      const context = await this.store.readSourceForCheck(lease, this.cipher);
      if (!context) return { status: 'stale' };
      expectedSource = context.source;
      result = await this.reader(context.source, context.credentials);
    } catch {
      result = { status: 'unavailable' };
    }
    return (await this.store.recordLiveSourceCheck(
      lease,
      result,
      expectedSource,
      new Date(),
    ))
      ? result
      : { status: 'stale' };
  }
}
