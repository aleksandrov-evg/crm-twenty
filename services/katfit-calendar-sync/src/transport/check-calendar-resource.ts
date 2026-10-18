import { createHash } from 'node:crypto';

import { isStrongEtag } from './is-strong-etag';
import { readBoundedBody } from './read-bounded-body';
import { isCalendarResourceUrl } from './read-calendar-snapshot';

export type CalendarResourceCheck = {
  calendarUrl: string;
  resourceUrl: string;
  etag: string;
  contentHash: string;
};
export type CalendarResourceCheckResult =
  | {
      status: 'verified';
      resourceUrl: string;
      etag: string;
      contentHash: string;
    }
  | {
      status:
        | 'changed'
        | 'auth-required'
        | 'forbidden'
        | 'unavailable'
        | 'invalid-source';
    };

export const checkCalendarResource = async (
  source: CalendarResourceCheck,
  fetch: typeof globalThis.fetch,
): Promise<CalendarResourceCheckResult> => {
  if (
    !isCalendarResourceUrl(source.calendarUrl, source.resourceUrl) ||
    !isStrongEtag(source.etag) ||
    !/^[a-f0-9]{64}$/.test(source.contentHash)
  )
    return { status: 'invalid-source' };
  let response: Response;
  try {
    response = await fetch(source.resourceUrl, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'text/calendar',
        'If-Match': source.etag,
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return { status: 'unavailable' };
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    if ([404, 410, 412].includes(response.status)) return { status: 'changed' };
    if (response.status === 401) return { status: 'auth-required' };
    if (response.status === 403) return { status: 'forbidden' };
    return {
      status:
        response.status === 429 || response.status >= 500
          ? 'unavailable'
          : 'invalid-source',
    };
  }
  try {
    const body = await readBoundedBody(
      response.body,
      2 * 1024 * 1024,
      'CALDAV_RESOURCE_TOO_LARGE',
    );
    if (
      !body ||
      !response.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('text/calendar')
    )
      return { status: 'invalid-source' };
    const etag = response.headers.get('etag');
    if (etag !== source.etag || !isStrongEtag(etag))
      return { status: 'changed' };
    const rawContentHash = createHash('sha256').update(body).digest('hex');
    // XML calendar-data can normalize CRLF while a resource GET preserves it.
    const normalized = new TextDecoder('utf-8', { fatal: true })
      .decode(body)
      .replace(/\r\n|\r/g, '\n');
    const hashes = [
      rawContentHash,
      createHash('sha256').update(normalized).digest('hex'),
      createHash('sha256')
        .update(normalized.replace(/\n/g, '\r\n'))
        .digest('hex'),
    ];
    if (!hashes.includes(source.contentHash)) return { status: 'changed' };
    const contentHash = source.contentHash;
    return {
      status: 'verified',
      resourceUrl: source.resourceUrl,
      etag,
      contentHash,
    };
  } catch {
    return { status: 'invalid-source' };
  }
};
