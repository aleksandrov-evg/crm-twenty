import { type DataSource } from 'typeorm';
import { z } from 'zod';

import { calendarCrmBinding } from '../crm/check-calendar-crm-capabilities';
import { createCalendarSessionLookup } from '../crm/find-calendar-session';
import { readCalendarCrmEnvironment } from '../crm/read-calendar-crm-environment';
import { createCalendarScheduleUpdater } from '../crm/update-calendar-schedule';
import { CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { CalendarScheduleStore } from '../storage/calendar-schedule.store';
import {
  CalendarSchedulePreparer,
  CalendarScheduleWorker,
} from './calendar-schedule-worker';

export const configureCalendarSchedule = (environment: NodeJS.ProcessEnv) => {
  const flag = (name: string) =>
    z.enum(['true', 'false']).default('false').parse(environment[name]) ===
    'true';
  const preparationEnabled = flag('CALENDAR_SCHEDULE_PREPARATION_ENABLED');
  const sendEnabled = flag('CALENDAR_SCHEDULE_SEND_ENABLED');
  if (sendEnabled && !preparationEnabled)
    throw new Error('CALENDAR_SCHEDULE_SEND_REQUIRES_PREPARATION');
  if (sendEnabled && environment.CALENDAR_POLLING_ENABLED !== 'true')
    throw new Error('CALENDAR_SCHEDULE_SEND_REQUIRES_POLLING');
  if (!preparationEnabled) return null;
  const environmentConfiguration = readCalendarCrmEnvironment(environment);
  const scope = {
    workspaceId: environmentConfiguration.TWENTY_WORKSPACE_ID,
    connectionId: environmentConfiguration.CALENDAR_CONNECTION_ID,
  };
  const configuration = {
    baseUrl: environmentConfiguration.TWENTY_API_URL,
    apiToken: environmentConfiguration.TWENTY_API_TOKEN,
    allowInsecureHttp:
      environmentConfiguration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  };
  const lookup = createCalendarSessionLookup(configuration);
  const keyId = environment.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
  const cipher = sendEnabled
    ? new CalendarCredentialCipher(keyId, {
        [keyId]: environment.CALENDAR_ENCRYPTION_KEY ?? '',
      })
    : null;
  return {
    preparationEnabled,
    sendEnabled,
    create: (source: DataSource): { runOnce: () => Promise<unknown> }[] => {
      const store = new CalendarScheduleStore(
        source,
        scope,
        calendarCrmBinding(configuration, scope.workspaceId),
      );
      return [
        new CalendarSchedulePreparer(store, lookup),
        ...(cipher
          ? [
              new CalendarScheduleWorker(
                source,
                store,
                cipher,
                lookup,
                createCalendarScheduleUpdater(configuration),
              ),
            ]
          : []),
      ];
    },
  };
};
