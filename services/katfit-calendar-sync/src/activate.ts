import { z } from 'zod';

import {
  calendarCrmBinding,
  createCalendarCrmCapabilityCheck,
} from './crm/check-calendar-crm-capabilities';
import { readCalendarCrmEnvironment } from './crm/read-calendar-crm-environment';
import { CalendarActivationStore } from './storage/calendar-activation.store';
import { createCalendarDataSource } from './storage/create-calendar-data-source';

const activate = async (): Promise<void> => {
  const configuration = readCalendarCrmEnvironment(process.env);
  const expectedVersion = z.coerce
    .number()
    .int()
    .positive()
    .parse(process.env.CALENDAR_EXPECTED_CONFIGURATION_VERSION);
  const crmConfiguration = {
    baseUrl: configuration.TWENTY_API_URL,
    apiToken: configuration.TWENTY_API_TOKEN,
    allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  };
  const result = await createCalendarCrmCapabilityCheck(
    crmConfiguration,
    configuration.TWENTY_WORKSPACE_ID,
  )();
  if (result.status !== 'ready') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const source = await createCalendarDataSource(
    process.env.CALENDAR_DATABASE_URL,
  ).initialize();
  try {
    const activation = await new CalendarActivationStore(
      source,
      {
        workspaceId: configuration.TWENTY_WORKSPACE_ID,
        connectionId: configuration.CALENDAR_CONNECTION_ID,
      },
      calendarCrmBinding(crmConfiguration, configuration.TWENTY_WORKSPACE_ID),
    ).activate(expectedVersion, result.evidence);
    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'active',
          activationId: activation.id,
          workspaceId: activation.workspaceId,
          connectionId: activation.connectionId,
          configurationVersion: activation.configurationVersion,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await source.destroy();
  }
};
void activate().catch((error) => {
  const code =
    error instanceof Error &&
    /^CALENDAR_ACTIVATION_[A-Z_]+$/.test(error.message)
      ? error.message
      : 'CALENDAR_ACTIVATION_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
