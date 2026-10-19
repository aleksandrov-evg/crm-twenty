import { CALENDAR_DIFFERENCE_FIELDS } from '../transport/describe-calendar-data-difference';
import {
  CALENDAR_CONFIGURATION_CODES,
  CALENDAR_CONFIGURATION_FIELDS,
} from './describe-calendar-startup-error';
export type CalendarLogLevel = 'silent' | 'error' | 'info' | 'debug';
type EventLevel = Exclude<CalendarLogLevel, 'silent'>;
type Fields = {
  differenceFields?: string[];
  stage?: string;
  configurationFields?: string[];
  worker?: string;
  operationId?: string;
  connectionId?: string;
  classSessionId?: string;
  result?: string;
  reason?: string;
  count?: number;
  durationMs?: number;
  httpStatus?: number;
};
const PRIORITY = { silent: 0, error: 1, info: 2, debug: 3 };
const IDENTIFIER =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EVENTS = new Set([
  'yandex.authorization',
  'yandex.startup_check',
  'crm.export.scan',
  'crm.export.review',
  'crm.export.confirmed',
  'crm.creation.send_result',
  'crm.creation.confirmed',
  'crm.creation.observed',
  'caldav.description.confirmed',
  'caldav.description.review',
  'crm.schedule.send_result',
  'schedule.review_required',
  'schedule.synchronization.confirmed',
  'worker.cycle',
  'worker.failed',
  'service.started',
  'service.stopped',
  'service.failed',
  'calendar.snapshot',
  'calendar.snapshot.rejected',
  'calendar.snapshot.comparison',
  'crm.creation',
  'calendar.description',
  'calendar.schedule',
]);
const LABELS = new Set([
  'trailing-newline',
  'line-folding',
  'content-different',
  'serialization-different',
  'discovery-failed',
  'authorized',
  'both-sides-verified',
  'write-verified',
  'already-matching',
  'incomplete',
  'absent',
  'RETRY',
  'CONFLICT',
  'NEEDS_REVIEW',
  'FAILED',
  'invalid-snapshot',
  'invalid-command',
  'past-session',
  'not-ready',
  'auth-required',
  'idle',
  'saved',
  'stale',
  'unchanged',
  'failed',
  'started',
  'stopped',
  'snapshot',
  'applied',
  'confirmed',
  'linked',
  'updated',
  'created',
  'conflict',
  'needs-review',
  'unconfirmed',
  'unavailable',
  'auth-required',
  'forbidden',
  'invalid-response',
  'invalid-source',
  'changed',
  'sent',
  'prepared',
  'retry',
  'exception',
  'no-work',
  'source-changed',
  'not-active',
  'rate-limited',
]);
const REASONS = new Set<string>([
  ...CALENDAR_CONFIGURATION_CODES,
  'CALDAV_SNAPSHOT_ETAG_READ_LIMIT',
  'CALDAV_SNAPSHOT_CHANGED_DURING_READ',
  'CALDAV_SNAPSHOT_TARGET',
  'CALDAV_SNAPSHOT_RESPONSE_BODY',
  'CALDAV_SNAPSHOT_HTTP_STATUS',
  'CALDAV_SNAPSHOT_CONTENT_TYPE',
  'CALDAV_SNAPSHOT_UNSAFE_XML',
  'CALDAV_SNAPSHOT_XML',
  'CALDAV_SNAPSHOT_MULTISTATUS',
  'CALDAV_SNAPSHOT_RESOURCE_LIMIT',
  'CALDAV_SNAPSHOT_MEMBER',
  'CALDAV_SNAPSHOT_MEMBER_STATUS',
  'CALDAV_SNAPSHOT_PROPERTY_STATUS',
  'CALDAV_SNAPSHOT_RESOURCE_URL',
  'CALDAV_SNAPSHOT_ETAG_PROPERTY',
  'CALDAV_SNAPSHOT_DATA_PROPERTY',
  'CALDAV_SNAPSHOT_DUPLICATE_URL',
  'CALDAV_SNAPSHOT_WEAK_ETAG',
  'CALDAV_SNAPSHOT_ICALENDAR',

  'CALDAV_CREDENTIALS_REQUIRED',
  'CRM_EXPORT_REFERENCE_REQUIRED',
  'CRM_EXPORT_FINALIZATION_REVIEW',
  'CRM_EXPORT_CAPABILITIES_UNAVAILABLE',
  'CRM_EXPORT_CRM_UNAVAILABLE',
  'CRM_EXPORT_SESSION_CHANGED',
  'CRM_EXPORT_NOT_AUTHORIZED',
  'CRM_EXPORT_WRITE_UNCONFIRMED',
  'CRM_EXPORT_WAITING_FOR_POLL',
  'CRM_EXPORT_UNAVAILABLE',
  'CRM_EXPORT_CONFLICT',
  'CRM_EXPORT_AUTH_REQUIRED',
  'CRM_EXPORT_FORBIDDEN',
  'CRM_EXPORT_INVALID_COMMAND',
  'CRM_EXPORT_PAST_SESSION',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  '28P01',
  '28000',
  '3D000',
  '42501',
  '53300',
  'ERR_INVALID_URL',
  'DATABASE_ERROR_UNCLASSIFIED',
  'CALENDAR_DATABASE_URL_REQUIRED',
  'CALENDAR_DATABASE_URL_INVALID',
  'CALENDAR_LOG_LEVEL_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ACTIVE',
  'CALDAV_CONDITIONAL_WRITE_CONFLICT',
  'CALDAV_SCHEDULE_VERIFICATION_CHANGED',
  'CALDAV_SCHEDULE_WRITE_CONFLICT',
  'CALDAV_SCHEDULE_WRITE_REJECTED',
  'CALDAV_WRITE_REJECTED',
  'CALENDAR_CHANGED_AFTER_CRM_TRANSFER',
  'CALENDAR_CHANGED_BEFORE_TRANSFER',
  'CALENDAR_RESOURCE_CHANGED',
  'CONFIRMED',
  'CONFLICT',
  'CRM_ACTIVATION_CHECK_REQUIRED',
  'CRM_CHANGED_BEFORE_CALDAV_TRANSFER',
  'CRM_RECORDING_KEY_MISMATCH',
  'CRM_ROSTER_UNAVAILABLE',
  'CRM_SCHEDULE_VERIFICATION_CHANGED',
  'CRM_SESSION_IDENTITY_CHANGED',
  'DESCRIPTION_PATCH_NO_LONGER_MATCHES',
  'DESCRIPTION_PUBLICATION_UNCONFIRMED',
  'EXPORT_EVENT',
  'FAILED',
  'INVALID_DESCRIPTION_OPERATION',
  'INVALID_SCHEDULE_OPERATION',
  'INVALID_SCHEDULE_PATCH',
  'KNOWN_CRM_IDENTITY_MISSING_OR_CHANGED',
  'LIVE_SOURCE_CHECK_REQUIRED',
  'PLANNED',
  'PUBLICATION_CONTEXT_CHANGED',
  'READY',
  'RECONCILE_RESOURCE',
  'RETRY',
  'ROSTER_CHANGED',
  'RUNNING',
  'SCHEDULE_CHANGED_BEFORE_ENRICHMENT',
  'SCHEDULE_CONTEXT_CHANGED',
  'SCHEDULE_TARGET_ALREADY_STARTED',
  'SCHEDULE_UNCONFIRMED',
  'STALE_CREATION_ATTEMPT',
  'STALE_LIVE_SOURCE_CHECK',
  'SUCCEEDED',
  'SUPERSEDED',
  'UTC',
]);
const WORKERS = new Set([
  'crm-export',
  'polling',
  'preview',
  'crm-lookup',
  'creation-intent',
  'creation',
  'enrichment-finalizer',
  'description-prepare',
  'description-publish',
  'description-publisher',
  'schedule-prepare',
  'schedule',
  'cancellation-review',
]);

export const readCalendarLogLevel = (
  environment: NodeJS.ProcessEnv,
): CalendarLogLevel => {
  const value = environment.CALENDAR_LOG_LEVEL ?? 'info';
  if (!Object.hasOwn(PRIORITY, value))
    throw new Error('CALENDAR_LOG_LEVEL_INVALID');
  return value as CalendarLogLevel;
};
export const createCalendarLogger = (
  level: CalendarLogLevel,
  write: (line: string, severity: EventLevel) => void = (line, severity) => {
    (severity === 'error' ? process.stderr : process.stdout).write(line);
  },
) => ({
  event: (severity: EventLevel, event: string, fields: Fields = {}): void => {
    if (PRIORITY[severity] > PRIORITY[level] || !EVENTS.has(event)) return;
    const safe: Record<string, string | number | string[]> = {};
    if (fields.differenceFields) {
      const allowed = new Set<string>(CALENDAR_DIFFERENCE_FIELDS);
      safe.differenceFields = fields.differenceFields.filter((field) => allowed.has(field)).slice(0, 30);
    }
    if (
      fields.stage &&
      ['configuration', 'database', 'http', 'workers'].includes(fields.stage)
    )
      safe.stage = fields.stage;
    if (Array.isArray(fields.configurationFields)) {
      const allowed = new Set<string>(CALENDAR_CONFIGURATION_FIELDS);
      safe.configurationFields = fields.configurationFields
        .filter((field) => typeof field === 'string' && allowed.has(field))
        .slice(0, 30);
    }
    for (const key of [
      'operationId',
      'connectionId',
      'classSessionId',
    ] as const) {
      const value = fields[key];
      if (typeof value === 'string' && IDENTIFIER.test(value))
        safe[key] = value;
    }
    if (fields.worker && WORKERS.has(fields.worker))
      safe.worker = fields.worker;
    for (const key of ['result', 'reason'] as const) {
      const value = fields[key];
      if (value !== undefined)
        safe[key] =
          LABELS.has(value) || (key === 'reason' && REASONS.has(value))
            ? value
            : 'redacted';
    }
    const httpStatus = fields.httpStatus;
    if (typeof httpStatus === 'number' && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599)
      safe.httpStatus = httpStatus;
    for (const key of ['count', 'durationMs'] as const) {
      const value = fields[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
        safe[key] = value;
    }
    // Only allowlisted scalar fields cross the log boundary, including in debug mode.
    try {
      write(
        `${JSON.stringify({ timestamp: new Date().toISOString(), level: severity, event, ...safe })}\n`,
        severity,
      );
    } catch {
      // Observability must not change the outcome of a committed synchronization action.
    }
  },
});
let configuredLogger = createCalendarLogger('info');
export const configureCalendarLogger = (
  environment: NodeJS.ProcessEnv,
): CalendarLogLevel => {
  const level = readCalendarLogLevel(environment);
  configuredLogger = createCalendarLogger(level);
  return level;
};
export const calendarLogger = {
  event: (severity: EventLevel, event: string, fields?: Fields): void =>
    configuredLogger.event(severity, event, fields),
};
