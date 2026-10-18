import { type DataSource } from 'typeorm';
import { z } from 'zod';
import {
  calendarCrmBinding,
  createCalendarCrmCapabilityCheck,
  sameCalendarCrmCapabilities,
} from '../crm/check-calendar-crm-capabilities';
import {
  createCalendarFutureSessionsReader,
  createCalendarSessionByIdLookup,
} from '../crm/read-calendar-future-sessions';
import { readCalendarCrmEnvironment } from '../crm/read-calendar-crm-environment';
import { CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { CalendarActivationStore } from '../storage/calendar-activation.store';
import { CalendarCrmExportStore } from '../storage/calendar-crm-export.store';
import { executeCrmOriginExport } from '../transport/execute-crm-origin-export';
import { createYandexCalDavTransport } from '../transport/create-yandex-caldav-transport';
import { CalendarCrmExportWorker } from './calendar-crm-export-worker';

export const configureCalendarCrmExport = (environment: NodeJS.ProcessEnv) => {
  const flag = (name: string) =>
    z.enum(['true', 'false']).default('false').parse(environment[name]) ===
    'true';
  const preparationEnabled = flag('CALENDAR_CRM_EXPORT_PREPARATION_ENABLED');
  const sendEnabled = flag('CALENDAR_CRM_EXPORT_SEND_ENABLED');
  if (sendEnabled && (!preparationEnabled || !flag('CALENDAR_POLLING_ENABLED')))
    throw Error('CALENDAR_CRM_EXPORT_REQUIRES_PREPARATION_AND_POLLING');
  if (!preparationEnabled) return null;
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
  const binding = calendarCrmBinding(crm, scope.workspaceId);
  const keyId = environment.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
  const cipher = sendEnabled
    ? new CalendarCredentialCipher(keyId, {
        [keyId]: environment.CALENDAR_ENCRYPTION_KEY ?? '',
      })
    : null;
  return {
    preparationEnabled,
    sendEnabled,
    create: (source: DataSource) => {
      const activation = new CalendarActivationStore(source, scope, binding);
      const check = createCalendarCrmCapabilityCheck(crm, scope.workspaceId);
      return new CalendarCrmExportWorker(
        new CalendarCrmExportStore(source, scope, binding),
        {
          sendEnabled,
          list: createCalendarFutureSessionsReader(crm),
          lookup: createCalendarSessionByIdLookup(crm),
          checkCapabilities: async () => {
            const [active, current] = await Promise.all([
              activation.getActive(),
              check(),
            ]);
            return (
              active !== null &&
              current.status === 'ready' &&
              sameCalendarCrmCapabilities(active.evidence, current.evidence)
            );
          },
          execute: async (command, lease, authorizeCreate) => {
            if (!cipher) return { status: 'not-authorized' };
            const transport = createYandexCalDavTransport({
              username: lease.username,
              appPassword: cipher.open(
                { ...scope, username: lease.username },
                lease.encryptedAppPassword,
              ),
            });
            try {
              return await executeCrmOriginExport(command, {
                calendarUrl: lease.calendarUrl,
                fetch: transport.fetch,
                authorizeCreate,
              });
            } finally {
              await transport.close().catch(() => undefined);
            }
          },
        },
      );
    },
  };
};
