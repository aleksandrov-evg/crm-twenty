import { type DataSource } from 'typeorm';
import { z } from 'zod';

import { calendarCrmBinding } from '../crm/check-calendar-crm-capabilities';
import { createCalendarSessionLookup } from '../crm/find-calendar-session';
import { createCalendarRosterReader } from '../crm/read-calendar-roster';
import { readCalendarCrmEnvironment } from '../crm/read-calendar-crm-environment';
import { CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { CalendarDescriptionStore } from '../storage/calendar-description.store';
import { CalendarCreationFinalizer } from './calendar-creation-finalizer';
import { CalendarDescriptionPreparer } from './calendar-description-preparer';
import { CalendarDescriptionPublisher } from './calendar-description-publisher';

export const configureCalendarEnrichment = (environment: NodeJS.ProcessEnv) => {
  const flag = (name: string) =>
    z.enum(['true', 'false']).default('false').parse(environment[name]) ===
    'true';
  const finalizationEnabled = flag('CALENDAR_CREATION_RECOVERY_ENABLED');
  const preparationEnabled = flag('CALENDAR_DESCRIPTION_PREPARATION_ENABLED');
  const sendEnabled = flag('CALENDAR_EXPORT_SEND_ENABLED');
  if (sendEnabled && !preparationEnabled)
    throw new Error('CALENDAR_EXPORT_REQUIRES_DESCRIPTION_PREPARATION');
  if (!finalizationEnabled && !preparationEnabled && !sendEnabled) return null;
  const configuration = readCalendarCrmEnvironment(environment);
  const scope = {
    workspaceId: configuration.TWENTY_WORKSPACE_ID,
    connectionId: configuration.CALENDAR_CONNECTION_ID,
  };
  const crm = {
    baseUrl: configuration.TWENTY_API_URL,
    apiToken: configuration.TWENTY_API_TOKEN,
    allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  };
  const lookup = createCalendarSessionLookup(crm),
    roster = createCalendarRosterReader(crm);
  const keyId = environment.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
  const cipher = sendEnabled
    ? new CalendarCredentialCipher(keyId, {
        [keyId]: environment.CALENDAR_ENCRYPTION_KEY ?? '',
      })
    : null;
  return {
    finalizationEnabled,
    preparationEnabled,
    sendEnabled,
    create: (source: DataSource): { runOnce: () => Promise<unknown> }[] => {
      const workers: { runOnce: () => Promise<unknown> }[] = [];
      if (finalizationEnabled)
        workers.push(new CalendarCreationFinalizer(source, scope, lookup));
      if (preparationEnabled)
        workers.push(
          new CalendarDescriptionPreparer(
            new CalendarDescriptionStore(source, scope),
            roster,
          ),
        );
      if (cipher)
        workers.push(
          new CalendarDescriptionPublisher(
            source,
            scope,
            calendarCrmBinding(crm, scope.workspaceId),
            cipher,
            lookup,
            roster,
          ),
        );
      return workers;
    },
  };
};
