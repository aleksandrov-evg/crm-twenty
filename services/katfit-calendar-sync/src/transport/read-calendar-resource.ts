import { isCalendarEtag } from './is-calendar-etag';
import { calendarLogger } from '../observability/calendar-logger';
import { describeCalendarNetworkError } from '../observability/describe-calendar-network-error';
import { readBoundedBody } from './read-bounded-body';
import { isCalendarResourceUrl } from './is-calendar-resource-url';

export type CalendarResourceRead =
  | { status: 'read'; etag: string; calendarData: string }
  | {
      status:
        | 'not-found'
        | 'auth-required'
        | 'forbidden'
        | 'unavailable'
        | 'invalid-resource';
    };
export const readCalendarResource = async (
  calendarUrl: string,
  resourceUrl: string,
  fetch: typeof globalThis.fetch,
  context: { attemptId?: string } = {},
): Promise<CalendarResourceRead> => {
  if (!isCalendarResourceUrl(calendarUrl, resourceUrl))
    return { status: 'invalid-resource' };
  let response: Response;
  try {
    response = await fetch(resourceUrl, {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'text/calendar', 'Cache-Control': 'no-cache' },
    });
  } catch (error: unknown) {
    calendarLogger.event('error', 'calendar.request.failed', {
      ...context, requestMethod: 'GET', reason: describeCalendarNetworkError(error),
    });
    return { status: 'unavailable' };
  }
  if (response.status !== 200) {
    calendarLogger.event('error', 'calendar.request.failed', {
      ...context, requestMethod: 'GET', httpStatus: response.status, reason: 'CALDAV_HTTP_REJECTED',
    });
    await response.body?.cancel().catch(() => undefined);
    if ([404, 410].includes(response.status)) return { status: 'not-found' };
    if (response.status === 401) return { status: 'auth-required' };
    if (response.status === 403) return { status: 'forbidden' };
    return {
      status:
        response.status >= 500 || response.status === 429
          ? 'unavailable'
          : 'invalid-resource',
    };
  }
  try {
    const body = await readBoundedBody(
      response.body,
      2 * 1024 * 1024,
      'CALDAV_RESOURCE_TOO_LARGE',
    );
    const etag = response.headers.get('etag');
    if (
      !body ||
      !etag ||
      !isCalendarEtag(etag) ||
      !response.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('text/calendar')
    )
      return { status: 'invalid-resource' };
    const calendarData = new TextDecoder('utf-8', { fatal: true }).decode(body);
    if (
      !calendarData.startsWith('BEGIN:VCALENDAR') ||
      !calendarData.trimEnd().endsWith('END:VCALENDAR')
    )
      return { status: 'invalid-resource' };
    return { status: 'read', etag, calendarData };
  } catch (error: unknown) {
    const networkReason = describeCalendarNetworkError(error);
    calendarLogger.event('error', 'calendar.request.failed', {
      ...context, requestMethod: 'GET', httpStatus: response.status,
      reason: networkReason === 'CALDAV_NETWORK_UNCLASSIFIED' ? 'CALDAV_RESPONSE_READ_FAILED' : networkReason,
    });
    return { status: 'invalid-resource' };
  }
};
