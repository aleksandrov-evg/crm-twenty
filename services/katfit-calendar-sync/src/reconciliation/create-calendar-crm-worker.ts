import { type DataSource } from 'typeorm';
import { z } from 'zod';

import { readCalendarCrmEnvironment } from '../crm/read-calendar-crm-environment';
import { createCalendarSessionLookup } from '../crm/find-calendar-session';
import { CalendarCrmReconciliationStore } from '../storage/calendar-crm-reconciliation.store';
import { CalendarCrmReconciler } from './calendar-crm-reconciler';

export const configureCalendarCrmWorker = (environment: NodeJS.ProcessEnv) => {
  const enabled = z
    .enum(['true', 'false'])
    .default('false')
    .parse(environment.CALENDAR_CRM_LOOKUP_ENABLED);
  if (enabled === 'false') return null;
  const configuration = readCalendarCrmEnvironment(environment);
  const lookup = createCalendarSessionLookup({
    baseUrl: configuration.TWENTY_API_URL,
    apiToken: configuration.TWENTY_API_TOKEN,
    allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  });
  return (source: DataSource) =>
    new CalendarCrmReconciler(
      new CalendarCrmReconciliationStore(source, {
        workspaceId: configuration.TWENTY_WORKSPACE_ID,
        connectionId: configuration.CALENDAR_CONNECTION_ID,
      }),
      lookup,
    );
};
