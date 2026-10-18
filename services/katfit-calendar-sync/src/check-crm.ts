import { createCalendarCrmCapabilityCheck } from './crm/check-calendar-crm-capabilities';
import { readCalendarCrmEnvironment } from './crm/read-calendar-crm-environment';

const check = async (): Promise<void> => {
  const configuration = readCalendarCrmEnvironment(process.env);
  const result = await createCalendarCrmCapabilityCheck(
    {
      baseUrl: configuration.TWENTY_API_URL,
      apiToken: configuration.TWENTY_API_TOKEN,
      allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
    },
    configuration.TWENTY_WORKSPACE_ID,
  )();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'ready') process.exitCode = 1;
};
void check().catch(() => {
  process.stderr.write('CRM capability check failed\n');
  process.exitCode = 1;
});
