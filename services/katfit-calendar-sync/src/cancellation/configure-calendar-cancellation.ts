import { type DataSource } from 'typeorm';
import { z } from 'zod';

import { createCalendarSessionLookup } from '../crm/find-calendar-session';
import { createCalendarCancellationImpactReader } from '../crm/read-calendar-cancellation-impact';
import { readCalendarCrmEnvironment } from '../crm/read-calendar-crm-environment';
import { CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { CalendarCancellationStore } from '../storage/calendar-cancellation.store';
import { CalendarCancellationWorker } from './calendar-cancellation-worker';

export const configureCalendarCancellation = (
  environment: NodeJS.ProcessEnv,
) => {
  const enabled =
    z
      .enum(['true', 'false'])
      .default('false')
      .parse(environment.CALENDAR_CANCELLATION_REVIEW_ENABLED) === 'true';
  if (!enabled) return null;
  if (environment.CALENDAR_POLLING_ENABLED !== 'true')
    throw new Error('CALENDAR_CANCELLATION_REVIEW_REQUIRES_POLLING');
  const values = readCalendarCrmEnvironment(environment);
  const scope = {
    workspaceId: values.TWENTY_WORKSPACE_ID,
    connectionId: values.CALENDAR_CONNECTION_ID,
  };
  const configuration = {
    baseUrl: values.TWENTY_API_URL,
    apiToken: values.TWENTY_API_TOKEN,
    allowInsecureHttp: values.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  };
  const keyId = environment.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
  const cipher = new CalendarCredentialCipher(keyId, {
    [keyId]: environment.CALENDAR_ENCRYPTION_KEY ?? '',
  });
  return (source: DataSource) =>
    new CalendarCancellationWorker(
      new CalendarCancellationStore(source, scope),
      cipher,
      createCalendarSessionLookup(configuration),
      createCalendarCancellationImpactReader(configuration),
    );
};
