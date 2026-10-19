import { isCalendarResourceUrl } from './is-calendar-resource-url';
import { readCalendarResource } from './read-calendar-resource';
import { calendarLogger } from '../observability/calendar-logger';
import { isCalendarEtag } from './is-calendar-etag';
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

export { isCalendarResourceUrl } from './is-calendar-resource-url';

export const readCalendarSnapshot = async (
  calendarUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<CalendarSnapshotResult> => {
  let httpStatus: number | undefined;
  const reject = (reason: string): CalendarSnapshotResult => {
    calendarLogger.event('error', 'calendar.snapshot.rejected', { reason, httpStatus });
    return { status: 'invalid-snapshot' };
  };
  if (!isYandexCalDavTarget(calendarUrl)) return reject('CALDAV_SNAPSHOT_TARGET');
  let validationStage = 'CALDAV_SNAPSHOT_RESPONSE_BODY';
  let receivedResponse = false;
  try {
    const response = await fetch(calendarUrl, {
      method: 'REPORT',
      redirect: 'error',
      headers: { 'Content-Type': 'application/xml; charset=utf-8', Depth: '1' },
      body: '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>',
    });
    receivedResponse = true;
    httpStatus = response.status;
    if (response.status === 401) return { status: 'auth-required' };
    if (response.status === 403) return { status: 'forbidden' };
    if (response.status === 429 || response.status >= 500)
      return { status: 'unavailable' };
    if (response.status !== 207) return reject('CALDAV_SNAPSHOT_HTTP_STATUS');
    if (!response.headers.get('content-type')?.toLowerCase().includes('xml'))
      return reject('CALDAV_SNAPSHOT_CONTENT_TYPE');
    const text = await response.text();
    if (
      Buffer.byteLength(text) > 2 * 1024 * 1024 ||
      /<!\s*(DOCTYPE|ENTITY)\b/i.test(text)
    )
      return reject('CALDAV_SNAPSHOT_UNSAFE_XML');
    validationStage = 'CALDAV_SNAPSHOT_XML';
    const document: unknown = xml2js(text, {
      compact: true,
      ignoreDeclaration: true,
      elementNameFn: (name) => name.replace(/^.*:/, ''),
    });
    validationStage = 'CALDAV_SNAPSHOT_MULTISTATUS';
    const parsed = z
      .object({ multistatus: z.object({ response: z.unknown().optional() }) })
      .parse(document);
    const entries =
      parsed.multistatus.response === undefined
        ? []
        : Array.isArray(parsed.multistatus.response)
          ? parsed.multistatus.response
          : [parsed.multistatus.response];
    if (entries.length > 2000) return reject('CALDAV_SNAPSHOT_RESOURCE_LIMIT');
    const resources: CalendarResourceSnapshot[] = [];
    const urls = new Set<string>();
    let fallbackReads = 0;

    for (const entry of entries) {
      validationStage = 'CALDAV_SNAPSHOT_MEMBER';
      const member = responseSchema.parse(entry);
      if (
        member.status &&
        !/^HTTP\/\d(?:\.\d)? 2\d\d(?: |$)/.test(member.status)
      )
        return reject('CALDAV_SNAPSHOT_MEMBER_STATUS');
      const properties = new Map<string, unknown>();
      for (const property of Array.isArray(member.propstat)
        ? member.propstat
        : [member.propstat]) {
        if (!/^HTTP\/\d(?:\.\d)? 200(?: |$)/.test(property.status))
          return reject('CALDAV_SNAPSHOT_PROPERTY_STATUS');
        for (const [key, value] of Object.entries(property.prop))
          properties.set(key, value);
      }
      validationStage = 'CALDAV_SNAPSHOT_RESOURCE_URL';
      const url = new URL(member.href, calendarUrl).href;
      validationStage = 'CALDAV_SNAPSHOT_ETAG_PROPERTY';
      let etag = xmlText.parse(properties.get('getetag'));
      validationStage = 'CALDAV_SNAPSHOT_DATA_PROPERTY';
      let calendarData = xmlText.parse(properties.get('calendar-data'));
      if (!isCalendarResourceUrl(calendarUrl, url))
        return reject('CALDAV_SNAPSHOT_RESOURCE_URL');
      if (urls.has(url)) return reject('CALDAV_SNAPSHOT_DUPLICATE_URL');
      if (!isCalendarEtag(etag) || !etag.startsWith('"')) {
        if (++fallbackReads > 50) return reject('CALDAV_SNAPSHOT_ETAG_READ_LIMIT');
        // REPORT and HTTP validators may differ; confirm the HTTP value with matching content.
        const resource = await readCalendarResource(calendarUrl, url, fetch);
        if (resource.status === 'auth-required' || resource.status === 'forbidden' || resource.status === 'unavailable')
          return { status: resource.status };
        if (resource.status !== 'read') return reject('CALDAV_SNAPSHOT_WEAK_ETAG');
        // XML calendar-data may use LF while the HTTP resource uses CRLF.
        if (resource.calendarData.replace(/\r\n/g, '\n') !== calendarData.replace(/\r\n/g, '\n'))
          return reject('CALDAV_SNAPSHOT_CHANGED_DURING_READ');
        etag = resource.etag;
        calendarData = resource.calendarData;
      }
      if (
        !/^BEGIN:VCALENDAR(?:\r\n|\r|\n)/.test(calendarData) ||
        !/(?:\r\n|\r|\n)END:VCALENDAR(?:\r\n|\r|\n)?$/.test(calendarData)
      )
        return reject('CALDAV_SNAPSHOT_ICALENDAR');
      urls.add(url);
      resources.push({ url, etag, calendarData });
    }
    return { status: 'snapshot', resources };
  } catch {
    return receivedResponse ? reject(validationStage) : { status: 'unavailable' };
  }
};
