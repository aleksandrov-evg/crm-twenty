import { isStrongEtag } from './is-strong-etag';
import { xml2js } from 'xml-js';
import { z } from 'zod';

import { isYandexCalDavTarget } from './yandex-caldav-target';

export type CalendarResourceSnapshot = {
  url: string;
  etag: string;
  calendarData: string;
};
export type CalendarSnapshotResult =
  | { status: 'snapshot'; resources: CalendarResourceSnapshot[] }
  | {
      status:
        | 'auth-required'
        | 'forbidden'
        | 'unavailable'
        | 'invalid-snapshot';
    };

const xmlText = z
  .union([
    z.string(),
    z.object({ _text: z.string() }),
    z.object({ _cdata: z.string() }),
  ])
  .transform((value) =>
    typeof value === 'string'
      ? value
      : '_text' in value
        ? value._text
        : value._cdata,
  );
const propertyStatus = z.object({
  status: xmlText,
  prop: z.record(z.string(), z.unknown()),
});
const responseSchema = z.object({
  href: xmlText,
  status: xmlText.optional(),
  propstat: z.union([propertyStatus, z.array(propertyStatus)]),
});

export const isCalendarResourceUrl = (
  calendarUrl: string,
  resourceUrl: string,
): boolean => {
  if (!isYandexCalDavTarget(calendarUrl) || !isYandexCalDavTarget(resourceUrl))
    return false;
  const collection = new URL(calendarUrl);
  const resource = new URL(resourceUrl);
  const prefix = collection.pathname.endsWith('/')
    ? collection.pathname
    : `${collection.pathname}/`;
  if (!resource.pathname.startsWith(prefix)) return false;
  try {
    const filename = decodeURIComponent(resource.pathname.slice(prefix.length));
    return (
      filename.length > 0 &&
      filename !== '.' &&
      filename !== '..' &&
      !/[/\\\x00-\x1f]/.test(filename)
    );
  } catch {
    return false;
  }
};

export const readCalendarSnapshot = async (
  calendarUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<CalendarSnapshotResult> => {
  if (!isYandexCalDavTarget(calendarUrl)) return { status: 'invalid-snapshot' };
  let receivedResponse = false;
  try {
    const response = await fetch(calendarUrl, {
      method: 'REPORT',
      redirect: 'error',
      headers: { 'Content-Type': 'application/xml; charset=utf-8', Depth: '1' },
      body: '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>',
    });
    receivedResponse = true;
    if (response.status === 401) return { status: 'auth-required' };
    if (response.status === 403) return { status: 'forbidden' };
    if (response.status === 429 || response.status >= 500)
      return { status: 'unavailable' };
    if (
      response.status !== 207 ||
      !response.headers.get('content-type')?.toLowerCase().includes('xml')
    )
      return { status: 'invalid-snapshot' };
    const text = await response.text();
    if (
      Buffer.byteLength(text) > 2 * 1024 * 1024 ||
      /<!\s*(DOCTYPE|ENTITY)\b/i.test(text)
    )
      return { status: 'invalid-snapshot' };
    const document: unknown = xml2js(text, {
      compact: true,
      ignoreDeclaration: true,
      elementNameFn: (name) => name.replace(/^.*:/, ''),
    });
    const parsed = z
      .object({ multistatus: z.object({ response: z.unknown().optional() }) })
      .parse(document);
    const entries =
      parsed.multistatus.response === undefined
        ? []
        : Array.isArray(parsed.multistatus.response)
          ? parsed.multistatus.response
          : [parsed.multistatus.response];
    if (entries.length > 2000) return { status: 'invalid-snapshot' };
    const resources: CalendarResourceSnapshot[] = [];
    const urls = new Set<string>();

    for (const entry of entries) {
      const member = responseSchema.parse(entry);
      if (
        member.status &&
        !/^HTTP\/\d(?:\.\d)? 2\d\d(?: |$)/.test(member.status)
      )
        return { status: 'invalid-snapshot' };
      const properties = new Map<string, unknown>();
      for (const property of Array.isArray(member.propstat)
        ? member.propstat
        : [member.propstat]) {
        if (!/^HTTP\/\d(?:\.\d)? 200(?: |$)/.test(property.status))
          return { status: 'invalid-snapshot' };
        for (const [key, value] of Object.entries(property.prop))
          properties.set(key, value);
      }
      const url = new URL(member.href, calendarUrl).href;
      const etag = xmlText.parse(properties.get('getetag'));
      const calendarData = xmlText.parse(properties.get('calendar-data'));
      if (
        !isCalendarResourceUrl(calendarUrl, url) ||
        urls.has(url) ||
        !isStrongEtag(etag) ||
        !/^BEGIN:VCALENDAR(?:\r\n|\r|\n)/.test(calendarData) ||
        !/(?:\r\n|\r|\n)END:VCALENDAR(?:\r\n|\r|\n)?$/.test(calendarData)
      )
        return { status: 'invalid-snapshot' };
      urls.add(url);
      resources.push({ url, etag, calendarData });
    }
    return { status: 'snapshot', resources };
  } catch {
    return { status: receivedResponse ? 'invalid-snapshot' : 'unavailable' };
  }
};
