import { createHash } from 'node:crypto';

import { checkCalendarResource } from '../check-calendar-resource';

const body =
  'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:one\r\nEND:VEVENT\r\nEND:VCALENDAR';
const source = {
  calendarUrl: 'https://caldav.yandex.ru/calendars/test/classes/',
  resourceUrl: 'https://caldav.yandex.ru/calendars/test/classes/one.ics',
  etag: '"version-1"',
  contentHash: createHash('sha256').update(body).digest('hex'),
};
const response = () =>
  new Response(body, {
    headers: {
      ETag: source.etag,
      'Content-Type': 'text/calendar; charset=utf-8',
    },
  });
const request = () =>
  jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

describe('live CalDAV resource check', () => {
  it('checks exact content using an authenticated injected conditional GET', async () => {
    const fetch = request().mockResolvedValue(response());
    expect(await checkCalendarResource(source, fetch)).toEqual({
      status: 'verified',
      resourceUrl: source.resourceUrl,
      etag: source.etag,
      contentHash: source.contentHash,
    });
    expect(fetch).toHaveBeenCalledWith(
      source.resourceUrl,
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'text/calendar',
          'If-Match': source.etag,
          'Cache-Control': 'no-cache',
        },
      }),
    );
  });
  it.each([
    [body.replaceAll('\r\n', '\n'), body],
    [body, body.replaceAll('\r\n', '\n')],
  ])(
    'accepts line-ending normalization between REPORT and GET',
    async (stored, received) => {
      const expected = {
        ...source,
        contentHash: createHash('sha256').update(stored).digest('hex'),
      };
      const response = new Response(received, {
        headers: { ETag: source.etag, 'Content-Type': 'text/calendar' },
      });
      expect(
        await checkCalendarResource(
          expected,
          request().mockResolvedValue(response),
        ),
      ).toMatchObject({
        status: 'verified',
        contentHash: expected.contentHash,
      });
    },
  );
  it.each([
    [404, 'changed'],
    [410, 'changed'],
    [412, 'changed'],
    [401, 'auth-required'],
    [403, 'forbidden'],
    [429, 'unavailable'],
    [500, 'unavailable'],
    [304, 'invalid-source'],
    [302, 'invalid-source'],
  ] as const)('handles response %s', async (status, expected) => {
    expect(
      await checkCalendarResource(
        source,
        request().mockResolvedValue(new Response(null, { status })),
      ),
    ).toEqual({ status: expected });
  });
  it.each([
    new Response(body + 'changed', {
      headers: { ETag: source.etag, 'Content-Type': 'text/calendar' },
    }),
    new Response(body, {
      headers: { ETag: '"different"', 'Content-Type': 'text/calendar' },
    }),
    new Response(body, {
      headers: { ETag: 'W/"version-1"', 'Content-Type': 'text/calendar' },
    }),
  ])('rejects content or ETag changes', async (result) => {
    expect(
      await checkCalendarResource(source, request().mockResolvedValue(result)),
    ).toEqual({ status: 'changed' });
  });
  it.each([
    new Response(body, {
      headers: { ETag: source.etag, 'Content-Type': 'text/html' },
    }),
    new Response('x'.repeat(2 * 1024 * 1024 + 1), {
      headers: { ETag: source.etag, 'Content-Type': 'text/calendar' },
    }),
  ])('rejects invalid or oversized responses', async (result) => {
    expect(
      await checkCalendarResource(source, request().mockResolvedValue(result)),
    ).toEqual({ status: 'invalid-source' });
  });
  it.each([
    { ...source, resourceUrl: 'https://evil.test/one.ics' },
    {
      ...source,
      resourceUrl: 'https://caldav.yandex.ru/calendars/other/one.ics',
    },
    { ...source, etag: 'W/"weak"' },
    { ...source, contentHash: 'bad' },
  ])(
    'rejects invalid targets or preconditions before network access',
    async (invalid) => {
      const fetch = request();
      expect(await checkCalendarResource(invalid, fetch)).toEqual({
        status: 'invalid-source',
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('returns a sanitized network failure', async () => {
    expect(
      await checkCalendarResource(
        source,
        request().mockRejectedValue(new Error('secret')),
      ),
    ).toEqual({ status: 'unavailable' });
  });
});
