import { readCalendarResource } from '../read-calendar-resource';

const collection = 'https://caldav.yandex.ru/calendars/test/classes/';
const url = `${collection}one.ics`;
const body = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
const request = () =>
  jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
describe('bounded CalDAV resource read', () => {
  it('reads text and a strong ETag without following redirects', async () => {
    const fetch = request().mockResolvedValue(
      new Response(body, {
        headers: { ETag: '"one"', 'Content-Type': 'text/calendar' },
      }),
    );
    expect(await readCalendarResource(collection, url, fetch)).toEqual({
      status: 'read',
      etag: '"one"',
      calendarData: body,
    });
    expect(fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
  });
  it.each([
    new Response(body, {
      headers: { ETag: 'W/"one"', 'Content-Type': 'text/calendar' },
    }),
    new Response(body, {
      headers: { ETag: '"one"', 'Content-Type': 'text/html' },
    }),
    new Response('x'.repeat(2 * 1024 * 1024 + 1), {
      headers: { ETag: '"one"', 'Content-Type': 'text/calendar' },
    }),
    new Response(new Uint8Array([255]), {
      headers: { ETag: '"one"', 'Content-Type': 'text/calendar' },
    }),
  ])('rejects invalid or oversized resources', async (response) => {
    expect(
      await readCalendarResource(
        collection,
        url,
        request().mockResolvedValue(response),
      ),
    ).toEqual({ status: 'invalid-resource' });
  });
  it('rejects another collection before network access', async () => {
    const fetch = request();
    expect(
      await readCalendarResource(
        collection,
        'https://caldav.yandex.ru/other/one.ics',
        fetch,
      ),
    ).toEqual({ status: 'invalid-resource' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not leak thrown network errors', async () => {
    expect(
      await readCalendarResource(
        collection,
        url,
        request().mockRejectedValue(new Error('secret')),
      ),
    ).toEqual({ status: 'unavailable' });
  });
});
