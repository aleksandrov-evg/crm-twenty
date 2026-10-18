import { ZodError } from 'zod';

import { describeCalendarDatabaseError } from '../storage/describe-calendar-database-error';

export const CALENDAR_CONFIGURATION_CODES = [
  'CALENDAR_CONFIGURATION_INVALID',
  'SERVICE_STARTUP_FAILED',
  'CALENDAR_LOG_LEVEL_INVALID',
  'CALENDAR_ENCRYPTION_KEY_INVALID',
  'CALENDAR_CRM_EXPORT_REQUIRES_PREPARATION_AND_POLLING',
  'CALENDAR_SCHEDULE_SEND_REQUIRES_PREPARATION',
  'CALENDAR_SCHEDULE_SEND_REQUIRES_POLLING',
  'CALENDAR_EXPORT_REQUIRES_DESCRIPTION_PREPARATION',
  'CALENDAR_CANCELLATION_REVIEW_REQUIRES_POLLING',
  'CREATION_SEND_REQUIRES_RECOVERY_AND_LIVE_CHECK',
  'LIVE_SOURCE_CHECK_REQUIRES_RECOVERY',
  'CALENDAR_PORT_INVALID',
  'CALENDAR_POLLING_CONFIG_INVALID',
  'CALENDAR_PREVIEW_CONFIG_INVALID',
  'CALENDAR_HTTP_START_FAILED',
  'INVALID_CRM_CONFIGURATION',
] as const;
export const CALENDAR_CONFIGURATION_FIELDS = [
  'PORT',
  'CALENDAR_CONNECTION_ID',
  'TWENTY_WORKSPACE_ID',
  'TWENTY_API_URL',
  'TWENTY_API_TOKEN',
  'TWENTY_ALLOW_INSECURE_HTTP',
  'CALENDAR_ENCRYPTION_KEY',
  'CALENDAR_ENCRYPTION_KEY_ID',
  'CALENDAR_LOG_LEVEL',
  'CALENDAR_DATABASE_URL',
  'CALENDAR_POLLING_ENABLED',
  'CALENDAR_PREVIEW_ENABLED',
  'CALENDAR_CRM_EXPORT_PREPARATION_ENABLED',
  'CALENDAR_CRM_EXPORT_SEND_ENABLED',
  'CALENDAR_CRM_LOOKUP_ENABLED',
  'CALENDAR_CREATION_RECOVERY_ENABLED',
  'CALENDAR_CREATE_PREPARATION_ENABLED',
  'CALENDAR_CREATE_SEND_ENABLED',
  'CALENDAR_LIVE_SOURCE_CHECK_ENABLED',
  'CALENDAR_SCHEDULE_PREPARATION_ENABLED',
  'CALENDAR_SCHEDULE_SEND_ENABLED',
  'CALENDAR_DESCRIPTION_PREPARATION_ENABLED',
  'CALENDAR_EXPORT_SEND_ENABLED',
  'CALENDAR_CANCELLATION_REVIEW_ENABLED',
] as const;
export const describeCalendarStartupError = (
  error: unknown,
): { reason: string; configurationFields?: string[] } => {
  if (error instanceof ZodError) {
    const allowed = new Set<string>(CALENDAR_CONFIGURATION_FIELDS);
    return {
      reason: 'CALENDAR_CONFIGURATION_INVALID',
      configurationFields: [
        ...new Set(
          error.issues
            .map((issue) => issue.path[0])
            .filter(
              (field): field is string =>
                typeof field === 'string' && allowed.has(field),
            ),
        ),
      ],
    };
  }
  if (
    error instanceof Error &&
    (CALENDAR_CONFIGURATION_CODES as readonly string[]).includes(error.message)
  )
    return { reason: error.message };
  const database = describeCalendarDatabaseError(error);
  return {
    reason:
      database.code === 'DATABASE_ERROR_UNCLASSIFIED'
        ? 'SERVICE_STARTUP_FAILED'
        : database.code,
  };
};
