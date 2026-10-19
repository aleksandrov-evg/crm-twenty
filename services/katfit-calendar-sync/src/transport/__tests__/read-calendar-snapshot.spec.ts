import { calendarLogger } from '../../observability/calendar-logger';
import { readCalendarSnapshot } from '../read-calendar-snapshot';

const calendarUrl = 'https://caldav.yandex.ru/calendars/test/classes/';
const calendarData =
  'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:one\r\nSUMMARY:Класс\r\n продолжение\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const member = (href = 'one.ics', etag = '&quot;v1&quot;', status = '200 OK') =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:getetag>${etag}</d:getetag><c:calendar-data><![CDATA[${calendarData}]]></c:calendar-data></d:prop><d:status>HTTP/1.1 ${status}</d:status></d:propstat></d:response>`;
const multistatus = (body: string) =>
  `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${body}</d:multistatus>`;

describe('readCalendarSnapshot', () => {
  const fetch = jest.fn<
    ReturnType<typeof globalThis.fetch>,
    Parameters<typeof globalThis.fetch>
  >();
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    fetch.mockReset();
  });
  const respond = (body: string, status = 207) =>
    fetch.mockResolvedValue(
      new Response(body, {
        status,
        headers: { 'Content-Type': 'application/xml' },
      }),
    );

  it('reads unexpanded raw resources and strong ETags without writes', async () => {
    respond(multistatus(member()));
    expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
      status: 'snapshot',
      resources: [{ url: `${calendarUrl}one.ics`, etag: '"v1"', calendarData }],
    });
    expect(fetch.mock.calls[0][1]?.method).toBe('REPORT');
    expect(fetch.mock.calls[0][1]?.body).not.toContain('time-range');
    expect(fetch.mock.calls[0][1]?.body).not.toContain('expand');
  });

  it.each([
    [multistatus(member('one.ics', 'W/&quot;weak&quot;')), 207, 'CALDAV_SNAPSHOT_WEAK_ETAG'],
    [multistatus(member('../outside.ics')), 207, 'CALDAV_SNAPSHOT_RESOURCE_URL'],
    ['<html>private-content</html>', 207, 'CALDAV_SNAPSHOT_MULTISTATUS'],
    ['private-content', 404, 'CALDAV_SNAPSHOT_HTTP_STATUS'],
  ])('logs a safe diagnostic for rejected responses', async (body, status, reason) => {
    const event = jest.spyOn(calendarLogger, 'event').mockImplementation();
    respond(String(body), Number(status));
    expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({ status: 'invalid-snapshot' });
    expect(event).toHaveBeenCalledWith('error', 'calendar.snapshot.rejected', {
      reason, httpStatus: status,
    });
    expect(JSON.stringify(event.mock.calls)).not.toContain('private-content');
    expect(JSON.stringify(event.mock.calls)).not.toContain(calendarUrl);
  });

  it.each(['v1', 'W/&quot;v1&quot;'])(
    'obtains a genuine strong validator via GET when REPORT returns %s', async (etag) => {
      fetch.mockResolvedValueOnce(new Response(multistatus(member('one.ics', etag)), {
        status: 207, headers: { 'Content-Type': 'application/xml' },
      })).mockResolvedValueOnce(new Response(calendarData, {
        headers: { 'Content-Type': 'text/calendar', ETag: '"verified"' },
      }));
      expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
        status: 'snapshot', resources: [{ url: `${calendarUrl}one.ics`, etag: '"verified"', calendarData }],
      });
      expect(fetch.mock.calls.map((call) => call[1]?.method)).toEqual(['REPORT', 'GET']);
    },
  );

  it('uses the bare HTTP validator when it differs from REPORT', async () => {
    fetch.mockResolvedValueOnce(new Response(multistatus(member('one.ics', '1234567890123')), {
      status: 207, headers: { 'Content-Type': 'application/xml' },
    })).mockResolvedValueOnce(new Response(calendarData, {
      headers: { 'Content-Type': 'text/calendar', ETag: '1234567890123-123456' },
    }));
    expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
      status: 'snapshot', resources: [{ url: `${calendarUrl}one.ics`, etag: '1234567890123-123456', calendarData }],
    });
  });

  it.each([true, false])('accepts different line endings and preserves the GET body (REPORT CRLF: %s)', async (reportUsesCrLf) => {
    const reportData = reportUsesCrLf ? calendarData : calendarData.replace(/\r\n/g, '\n');
    const resourceData = reportUsesCrLf ? calendarData.replace(/\r\n/g, '\n') : calendarData;
    fetch.mockResolvedValueOnce(new Response(multistatus(member('one.ics', 'unquoted').replace(calendarData, reportData)), {
      status: 207, headers: { 'Content-Type': 'application/xml' },
    })).mockResolvedValueOnce(new Response(resourceData, {
      headers: { 'Content-Type': 'text/calendar', ETag: '"verified"' },
    }));
    expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
      status: 'snapshot', resources: [{ url: `${calendarUrl}one.ics`, etag: '"verified"', calendarData: resourceData }],
    });
  });

  it('rejects changes between REPORT and GET instead of mixing versions', async () => {
    fetch.mockResolvedValueOnce(new Response(multistatus(member('one.ics', 'unquoted')), {
      status: 207, headers: { 'Content-Type': 'application/xml' },
    })).mockResolvedValueOnce(new Response(calendarData.replace('UID:one', 'UID:changed'), {
      headers: { 'Content-Type': 'text/calendar', ETag: '"verified"' },
    }));
    expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({ status: 'invalid-snapshot' });
  });

  it('does not promote a weak GET validator into a strong one', async () => {
    fetch.mockResolvedValueOnce(new Response(multistatus(member('one.ics', 'unquoted')), {
      status: 207, headers: { 'Content-Type': 'application/xml' },
    })).mockResolvedValueOnce(new Response(calendarData, {
      headers: { 'Content-Type': 'text/calendar', ETag: 'W/"weak"' },
    }));
    expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({ status: 'invalid-snapshot' });
  });

  it('accepts a valid empty inventory', async () => {
    respond(multistatus(''));
    expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
      status: 'snapshot',
      resources: [],
    });
  });

  it.each([
    member('one.ics') + member('two.ics', '&quot;v2&quot;', '403 Forbidden'),
    member('one.ics') + member('one.ics'),
    member('../outside.ics'),
    member('https://other.example/one.ics'),
    member('nested%2fone.ics'),
    member('one.ics', 'W/&quot;weak&quot;'),
  ])(
    'rejects the entire partial, duplicate or unsafe inventory',
    async (body) => {
      respond(multistatus(body));
      expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
        status: 'invalid-snapshot',
      });
    },
  );

  it.each([
    '<broken>',
    '<html>not a calendar</html>',
    '<!DOCTYPE test><d:multistatus xmlns:d="DAV:"/>',
  ])(
    'does not interpret malformed or unsafe XML as empty: %s',
    async (body) => {
      respond(body);
      expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
        status: 'invalid-snapshot',
      });
    },
  );

  it.each([
    [401, 'auth-required'],
    [403, 'forbidden'],
    [429, 'unavailable'],
    [503, 'unavailable'],
    [404, 'invalid-snapshot'],
    [200, 'invalid-snapshot'],
  ] as const)(
    'classifies HTTP %s without interpreting it as deletion',
    async (status, expected) => {
      respond('', status);
      expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
        status: expected,
      });
    },
  );

  it('rejects another server before the request and distinguishes network failure', async () => {
    expect(await readCalendarSnapshot('https://other.example/', fetch)).toEqual(
      { status: 'invalid-snapshot' },
    );
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRejectedValue(new Error('network failure'));
    expect(await readCalendarSnapshot(calendarUrl, fetch)).toEqual({
      status: 'unavailable',
    });
  });
});
