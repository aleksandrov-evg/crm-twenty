import { z } from 'zod';
import { calendarCrmBinding } from './crm/check-calendar-crm-capabilities';
import { createCalendarCancellationCapabilityCheck } from './crm/check-calendar-cancellation-capabilities';
import { createCalendarCancellationCommandClient } from './crm/cancel-calendar-session';
import { createCalendarSessionLookup } from './crm/find-calendar-session';
import { createCalendarCancellationImpactReader } from './crm/read-calendar-cancellation-impact';
import { readCalendarCrmEnvironment } from './crm/read-calendar-crm-environment';
import { executeCalendarCancellation } from './cancellation/execute-calendar-cancellation';
import { CalendarCredentialCipher } from './security/calendar-credential-cipher';
import { CalendarCancellationExecutionStore } from './storage/calendar-cancellation-execution.store';
import { createCalendarDataSource } from './storage/create-calendar-data-source';

const execute = async (): Promise<void> => {
  const configuration = readCalendarCrmEnvironment(process.env);
  const reviewId = z.uuid().parse(process.env.CALENDAR_CANCELLATION_REVIEW_ID);
  const expectedConfigurationVersion = z.coerce
    .number()
    .int()
    .positive()
    .parse(process.env.CALENDAR_EXPECTED_CONFIGURATION_VERSION);
  const mode = z
    .enum(['prepare', 'execute'])
    .default('prepare')
    .parse(process.env.CALENDAR_CANCELLATION_EXECUTION_MODE);
  const enabled =
    z
      .enum(['true', 'false'])
      .default('false')
      .parse(process.env.CALENDAR_CANCELLATION_SEND_ENABLED) === 'true';
  const crm = {
    baseUrl: configuration.TWENTY_API_URL,
    apiToken: configuration.TWENTY_API_TOKEN,
    allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  };
  const source = await createCalendarDataSource(
    process.env.CALENDAR_DATABASE_URL,
  ).initialize();
  try {
    const keyId = process.env.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
    const client = createCalendarCancellationCommandClient(crm);
    const result = await executeCalendarCancellation({
      store: new CalendarCancellationExecutionStore(
        source,
        {
          workspaceId: configuration.TWENTY_WORKSPACE_ID,
          connectionId: configuration.CALENDAR_CONNECTION_ID,
        },
        calendarCrmBinding(crm, configuration.TWENTY_WORKSPACE_ID),
      ),
      reviewId,
      expectedConfigurationVersion,
      mode,
      enabled,
      cipher: new CalendarCredentialCipher(keyId, {
        [keyId]: process.env.CALENDAR_ENCRYPTION_KEY ?? '',
      }),
      lookup: createCalendarSessionLookup(crm),
      impact: createCalendarCancellationImpactReader(crm),
      capabilities: createCalendarCancellationCapabilityCheck(crm),
      ...client,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!['prepared', 'confirmed'].includes(result.status))
      process.exitCode = 1;
  } finally {
    await source.destroy();
  }
};
void execute().catch(() => {
  process.stderr.write('CALENDAR_CANCELLATION_EXECUTION_UNCONFIRMED\n');
  process.exitCode = 1;
});
