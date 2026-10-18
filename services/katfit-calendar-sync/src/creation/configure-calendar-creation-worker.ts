import {
  calendarCrmBinding,
  createCalendarCrmCapabilityCheck,
} from '../crm/check-calendar-crm-capabilities';
import { createCalendarSessionSender } from '../crm/create-calendar-session';
import { CalendarActivationStore } from '../storage/calendar-activation.store';
import { type DataSource } from 'typeorm';
import { z } from 'zod';

import { createCalendarCreationInspector } from '../crm/inspect-calendar-session-creation';
import { readCalendarCrmEnvironment } from '../crm/read-calendar-crm-environment';
import { CalendarCreationExecutionStore } from '../storage/calendar-creation-execution.store';
import { CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { CalendarLiveSourceGuard } from './calendar-live-source-guard';
import { CalendarCreationWorker } from './calendar-creation-worker';

export const configureCalendarCreationWorker = (
  environment: NodeJS.ProcessEnv,
) => {
  const sendEnabled =
    z
      .enum(['true', 'false'])
      .default('false')
      .parse(environment.CALENDAR_CREATE_SEND_ENABLED) === 'true';
  const liveCheckEnabled =
    z
      .enum(['true', 'false'])
      .default('false')
      .parse(environment.CALENDAR_LIVE_SOURCE_CHECK_ENABLED) === 'true';
  const recoveryEnabled =
    z
      .enum(['true', 'false'])
      .default('false')
      .parse(environment.CALENDAR_CREATION_RECOVERY_ENABLED) === 'true';
  if (sendEnabled && (!recoveryEnabled || !liveCheckEnabled))
    throw new Error('CREATION_SEND_REQUIRES_RECOVERY_AND_LIVE_CHECK');
  if (!recoveryEnabled) {
    if (liveCheckEnabled)
      throw new Error('LIVE_SOURCE_CHECK_REQUIRES_RECOVERY');
    return null;
  }
  const configuration = readCalendarCrmEnvironment(environment);
  const inspect = createCalendarCreationInspector({
    baseUrl: configuration.TWENTY_API_URL,
    apiToken: configuration.TWENTY_API_TOKEN,
    allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  });
  const keyId = environment.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
  const cipher = liveCheckEnabled
    ? new CalendarCredentialCipher(keyId, {
        [keyId]: environment.CALENDAR_ENCRYPTION_KEY ?? '',
      })
    : null;
  const crmConfiguration = {
    baseUrl: configuration.TWENTY_API_URL,
    apiToken: configuration.TWENTY_API_TOKEN,
    allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
  };
  const binding = calendarCrmBinding(
    crmConfiguration,
    configuration.TWENTY_WORKSPACE_ID,
  );
  const capabilities = createCalendarCrmCapabilityCheck(
    crmConfiguration,
    configuration.TWENTY_WORKSPACE_ID,
  );
  const sender = sendEnabled
    ? createCalendarSessionSender(crmConfiguration)
    : undefined;
  return (source: DataSource) => {
    const store = new CalendarCreationExecutionStore(
      source,
      {
        workspaceId: configuration.TWENTY_WORKSPACE_ID,
        connectionId: configuration.CALENDAR_CONNECTION_ID,
      },
      binding,
    );
    const activations = new CalendarActivationStore(
      source,
      {
        workspaceId: configuration.TWENTY_WORKSPACE_ID,
        connectionId: configuration.CALENDAR_CONNECTION_ID,
      },
      binding,
    );
    const guard = cipher ? new CalendarLiveSourceGuard(store, cipher) : null;
    return new CalendarCreationWorker(
      store,
      inspect,
      sender,
      guard ? (lease) => guard.check(lease) : undefined,
      async (lease) => {
        if (!(await activations.getActive()))
          return { status: 'needs-review', reason: 'CRM_ACTIVATION_REQUIRED' };
        const result = await capabilities();
        if (result.status === 'not-ready')
          return { status: 'needs-review', reason: result.reason };
        if (result.status !== 'ready') return { status: result.status };
        return (await store.recordCapabilities(lease, result.evidence))
          ? null
          : {
              status: 'needs-review',
              reason: 'CRM_ACTIVATION_CAPABILITIES_CHANGED',
            };
      },
    );
  };
};
