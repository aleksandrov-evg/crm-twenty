import { z } from 'zod';

import {
  createCalendarCrmBaseUrl,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';

import { SESSION_FORMATS } from '../domain/prepare-calendar-session';
import { readBoundedBody } from '../transport/read-bounded-body';

const sessionSchema = z.object({
  id: z.uuid(),
  recordingKey: z.string(),
  name: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  capacity: z.number().int().min(1).max(100),
  sessionFormat: z.enum(SESSION_FORMATS),
  status: z.string().min(1),
  creationRequest: z.string().nullable().optional(),
});
const responseSchema = z.object({
  data: z.object({ classSessions: z.array(sessionSchema).max(2) }),
  pageInfo: z.object({ hasNextPage: z.boolean() }),
});

export type CalendarCrmSession = z.infer<typeof sessionSchema>;
export type CalendarSessionLookup =
  | { status: 'matched'; session: CalendarCrmSession }
  | {
      status:
        | 'not-found'
        | 'ambiguous'
        | 'auth-required'
        | 'forbidden'
        | 'unavailable'
        | 'invalid-response';
    };

export const createCalendarSessionLookup = (
  configuration: CalendarCrmConfiguration,
): ((recordingKey: string) => Promise<CalendarSessionLookup>) => {
  const baseUrl = createCalendarCrmBaseUrl(configuration);
  const request = configuration.fetch ?? fetch;

  return async (recordingKey) => {
    // Only service-generated keys enter the filter grammar.
    if (!/^session-create:calendar-create:[a-f0-9]{64}$/.test(recordingKey))
      throw new Error('INVALID_CALENDAR_RECORDING_KEY');
    const url = new URL('/rest/classSessions', baseUrl);
    url.searchParams.set('limit', '2');
    url.searchParams.set('depth', '0');
    url.searchParams.set('filter', `recordingKey[eq]:${recordingKey}`);
    let response: Response;
    try {
      response = await request(url, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${configuration.apiToken}`,
          Accept: 'application/json',
        },
      });
    } catch {
      return { status: 'unavailable' };
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401) return { status: 'auth-required' };
      if (response.status === 403) return { status: 'forbidden' };
      return { status: 'unavailable' };
    }
    try {
      const body = await readBoundedBody(
        response.body,
        2 * 1024 * 1024,
        'CRM_RESPONSE_TOO_LARGE',
      );
      const parsed = responseSchema.safeParse(
        JSON.parse(body?.toString('utf8') ?? ''),
      );
      if (!parsed.success) return { status: 'invalid-response' };
      const sessions = parsed.data.data.classSessions;
      // Detect an ignored server filter instead of matching by title or start time.
      if (sessions.some((session) => session.recordingKey !== recordingKey))
        return { status: 'invalid-response' };
      if (parsed.data.pageInfo.hasNextPage || sessions.length > 1)
        return { status: 'ambiguous' };
      return sessions.length === 0
        ? { status: 'not-found' }
        : { status: 'matched', session: sessions[0] };
    } catch {
      return { status: 'invalid-response' };
    }
  };
};
