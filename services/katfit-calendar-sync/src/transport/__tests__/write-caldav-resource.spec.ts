import { writeCalDavResource } from '../write-caldav-resource';

describe('writeCalDavResource', () => {
  const calendarUrl = 'https://caldav.yandex.ru/calendars/test/events/';
  const resourceUrl = `${calendarUrl}training.ics`;
  const calendarData = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';
  const fetch = jest.fn<
    ReturnType<typeof globalThis.fetch>,
    Parameters<typeof globalThis.fetch>
  >();

  beforeEach(() => {
    fetch.mockReset();
    fetch.mockResolvedValue(
      new Response(null, { status: 201, headers: { ETag: '"version-2"' } }),
    );
  });

  it.each([
    'opaque-resource',
    '%D1%82%D1%80%D0%B5%D0%BD%D0%B8%D1%80%D0%BE%D0%B2%D0%BA%D0%B0.ics',
    'event%40phone.ics',
  ])('updates a valid opaque or encoded resource name: %s', async (name) => {
    const fetch = jest
      .fn<
        ReturnType<typeof globalThis.fetch>,
        Parameters<typeof globalThis.fetch>
      >()
      .mockResolvedValue(new Response(null, { status: 204 }));
    expect(
      await writeCalDavResource({
        calendarUrl,
        resourceUrl: `${calendarUrl}${name}`,
        operation: {
          action: 'update',
          calendarData: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
          expectedEtag: '"one"',
        },
        fetch,
      }),
    ).toMatchObject({ status: 'written' });
  });

  it.each(['update', 'delete'] as const)('preserves a bare server ETag for %s', async (action) => {
    await writeCalDavResource({ calendarUrl, resourceUrl,
      operation: { action, expectedEtag: '1234567890123-123456', calendarData }, fetch });
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('If-Match')).toBe('1234567890123-123456');
  });

  it('creates the same resource conditionally without overwriting an existing event', async () => {
    const result = await writeCalDavResource({
      calendarUrl,
      resourceUrl,
      operation: { action: 'create', calendarData },
      fetch,
    });

    expect(result).toEqual({ status: 'written', etag: '"version-2"' });
    const [url, options] = fetch.mock.calls[0];

    expect(url).toBe(resourceUrl);
    expect(options?.method).toBe('PUT');
    expect(new Headers(options?.headers).get('If-None-Match')).toBe('*');
    expect(options?.body).toBe(calendarData);
    expect(options?.redirect).toBe('error');
  });

  it.each(['update', 'delete'] as const)(
    'protects %s with the expected resource ETag',
    async (action) => {
      await writeCalDavResource({
        calendarUrl,
        resourceUrl,
        operation: { action, expectedEtag: '"version-1"', calendarData },
        fetch,
      });

      const [, options] = fetch.mock.calls[0];

      expect(options?.method).toBe(action === 'delete' ? 'DELETE' : 'PUT');
      expect(new Headers(options?.headers).get('If-Match')).toBe('"version-1"');
    },
  );

  it.each([
    [401, 'auth-required'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [412, 'conflict'],
    [429, 'retryable'],
    [503, 'retryable'],
    [400, 'rejected'],
  ])(
    'reports HTTP %s without retrying or discarding the conflict',
    async (httpStatus, status) => {
      fetch.mockResolvedValue(
        new Response(null, { status: Number(httpStatus) }),
      );

      expect(
        await writeCalDavResource({
          calendarUrl,
          resourceUrl,
          operation: { action: 'create', calendarData },
          fetch,
        }),
      ).toEqual({ status, httpStatus });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves a lost write response unconfirmed for subsequent reconciliation', async () => {
    fetch.mockRejectedValue(new Error('response lost'));

    expect(
      await writeCalDavResource({
        calendarUrl,
        resourceUrl,
        operation: { action: 'create', calendarData },
        fetch,
      }),
    ).toEqual({ status: 'unconfirmed' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['', '*', 'W/"version-1"', 'Wed, 15 Nov 2023 10:00:00 GMT'])(
    'rejects an unsafe conditional version: %s',
    async (expectedEtag) => {
      expect(
        await writeCalDavResource({
          calendarUrl,
          resourceUrl,
          operation: { action: 'delete', expectedEtag },
          fetch,
        }),
      ).toEqual({ status: 'invalid-etag' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    'https://other.example/calendars/training.ics',
    'http://caldav.yandex.ru/calendars/test/events/training.ics',
    `${calendarUrl}../training.ics`,
    `${calendarUrl}nested/training.ics`,
    `${resourceUrl}?token=secret`,
    `${calendarUrl}child%2Fevent.ics`,
    `${calendarUrl}child%252Fevent.ics`,
    `${calendarUrl}bad%ZZ.ics`,
    'not a URL',
  ])('rejects a target outside the selected collection: %s', async (target) => {
    expect(
      await writeCalDavResource({
        calendarUrl,
        resourceUrl: target,
        operation: { action: 'create', calendarData },
        fetch,
      }),
    ).toEqual({ status: 'invalid-target' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not invent a confirmed ETag when the server omits it', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));

    expect(
      await writeCalDavResource({
        calendarUrl,
        resourceUrl,
        operation: { action: 'create', calendarData },
        fetch,
      }),
    ).toEqual({ status: 'written', etag: null });
  });
});
