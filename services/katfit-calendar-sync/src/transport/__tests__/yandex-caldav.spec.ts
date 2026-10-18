import { type LookupAddress } from 'node:dns';

import {
  createYandexCalDavTransport,
  type YandexCalDavTransport,
} from '../create-yandex-caldav-transport';
import { discoverYandexCalendars } from '../discover-yandex-calendars';
import { createYandexCalDavLookup } from '../yandex-caldav-lookup';
import { writeCalDavResource } from '../write-caldav-resource';

const credentials = {
  username: 'trainer@yandex.ru',
  appPassword: 'test-app-password',
};
const multistatus = (href: string, properties: string) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>${href}</d:href><d:propstat><d:prop>${properties}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;

const discoveryResponse: typeof globalThis.fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  let xml: string;
  switch (url.pathname) {
    case '/.well-known/caldav':
      return new Response(null, {
        status: 301,
        headers: { Location: '/' },
      });
    case '/':
      xml = multistatus(
        '/',
        '<d:current-user-principal><d:href>/principals/test/</d:href></d:current-user-principal>',
      );
      break;
    case '/principals/test/':
      xml = multistatus(
        '/principals/test/',
        '<c:calendar-home-set><d:href>/calendars/test/</d:href></c:calendar-home-set>',
      );
      break;
    case '/calendars/test/':
      xml = multistatus(
        '/calendars/test/classes/',
        '<d:displayname>Тренировки KATfit</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>',
      );
      break;
    case '/calendars/test/classes/':
      xml = multistatus(
        '/calendars/test/classes/',
        '<d:supported-report-set><d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report></d:supported-report-set>',
      );
      break;
    default:
      throw new Error('Unexpected discovery target');
  }
  return new Response(xml, {
    status: 207,
    headers: { 'Content-Type': 'application/xml' },
  });
};

describe('Yandex CalDAV DNS lookup', () => {
  const resolver = jest.fn<Promise<LookupAddress[]>, [string, { all: true }]>();
  const resolve = (hostname = 'caldav.yandex.ru', all = true) =>
    new Promise((accept, reject) => {
      createYandexCalDavLookup(resolver)(
        hostname,
        { all },
        (error, address, family) => {
          if (error) reject(error);
          else accept(all ? address : { address, family });
        },
      );
    });

  beforeEach(() => {
    resolver.mockReset();
    resolver.mockResolvedValue([{ address: '77.88.21.125', family: 4 }]);
  });

  it('returns the validated address to the actual socket lookup', async () => {
    await expect(resolve()).resolves.toEqual([
      { address: '77.88.21.125', family: 4 },
    ]);
    await expect(resolve('caldav.yandex.ru', false)).resolves.toEqual({
      address: '77.88.21.125',
      family: 4,
    });
  });

  it('rejects another hostname before DNS resolution', async () => {
    await expect(resolve('other.example')).rejects.toThrow(
      'CALDAV_HOST_REJECTED',
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('rejects nonpublic address %s', async (address) => {
    resolver.mockResolvedValue([
      { address, family: address.includes(':') ? 6 : 4 },
    ]);
    await expect(resolve()).rejects.toThrow('CALDAV_ADDRESS_REJECTED');
  });

  it('rejects mixed public/private answers, empty answers and resolver errors', async () => {
    resolver.mockResolvedValue([
      { address: '77.88.21.125', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(resolve()).rejects.toThrow('CALDAV_ADDRESS_REJECTED');
    resolver.mockResolvedValue([]);
    await expect(resolve()).rejects.toThrow('CALDAV_ADDRESS_REJECTED');
    resolver.mockRejectedValue(new Error('Internal DNS details'));
    await expect(resolve()).rejects.toThrow('CALDAV_DNS_FAILED');
  });
});

describe('Yandex transport and real tsdav discovery', () => {
  const transports: YandexCalDavTransport[] = [];
  const create = () => {
    const transport = createYandexCalDavTransport(credentials);
    transports.push(transport);
    return transport;
  };
  let fetch: jest.SpyInstance<
    ReturnType<typeof globalThis.fetch>,
    Parameters<typeof globalThis.fetch>
  >;

  beforeEach(() => {
    fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('<result/>', { status: 207 }));
  });

  afterEach(async () => {
    await Promise.all(
      transports.splice(0).map((transport) => transport.close()),
    );
    fetch.mockRestore();
  });

  it('injects credentials, strips cookies and pins DNS through its dispatcher', async () => {
    const response = await create().fetch('https://caldav.yandex.ru/', {
      method: 'PROPFIND',
      body: '<query/>',
      headers: {
        Cookie: 'secret',
        Authorization: 'Bearer other',
        'Proxy-Authorization': 'secret',
      },
    });
    const [, options] = fetch.mock.calls[0];
    const headers = new Headers(options?.headers);

    expect(headers.get('Authorization')).toBe(
      `Basic ${Buffer.from('trainer@yandex.ru:test-app-password').toString('base64')}`,
    );
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('proxy-authorization')).toBe(false);
    expect(options).toMatchObject({
      method: 'PROPFIND',
      body: '<query/>',
      redirect: 'manual',
      dispatcher: expect.anything(),
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(await response.text()).toBe('<result/>');
  });

  it.each([
    'https://other.example/',
    'http://caldav.yandex.ru/',
    'https://caldav.yandex.ru:8443/',
    'https://user:password@caldav.yandex.ru/',
    'https://caldav.yandex.ru/?secret=1',
    'https://caldav.yandex.ru/#fragment',
    'https://caldav.yandex.ru.other.example/',
    'https://127.0.0.1/',
  ])('rejects target before sending credentials: %s', async (url) => {
    await expect(create().fetch(url)).rejects.toThrow('CALDAV_TARGET_REJECTED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods and oversized requests before sending', async () => {
    const transport = create();
    await expect(
      transport.fetch('https://caldav.yandex.ru/', { method: 'POST' }),
    ).rejects.toThrow('CALDAV_TARGET_REJECTED');
    await expect(
      transport.fetch('https://caldav.yandex.ru/', {
        method: 'PUT',
        body: 'x'.repeat(2 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow('CALDAV_REQUEST_TOO_LARGE');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an allowed discovery redirect without following it', async () => {
    fetch.mockResolvedValue(
      new Response(null, { status: 301, headers: { Location: '/' } }),
    );
    expect(
      (
        await create().fetch('https://caldav.yandex.ru/.well-known/caldav', {
          redirect: 'manual',
        })
      ).status,
    ).toBe(301);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-origin redirects and redirects on conditional writes', async () => {
    fetch.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://other.example/' },
      }),
    );
    await expect(create().fetch('https://caldav.yandex.ru/')).rejects.toThrow(
      'CALDAV_REDIRECT_REJECTED',
    );
    fetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: '/' } }),
    );
    await expect(
      create().fetch('https://caldav.yandex.ru/', { redirect: 'error' }),
    ).rejects.toThrow('CALDAV_REDIRECT_REJECTED');
  });

  it('bounds responses and refuses XML entity declarations', async () => {
    fetch.mockResolvedValue(new Response('x'.repeat(2 * 1024 * 1024 + 1)));
    await expect(create().fetch('https://caldav.yandex.ru/')).rejects.toThrow(
      'CALDAV_RESPONSE_TOO_LARGE',
    );
    fetch.mockResolvedValue(
      new Response(
        '<!DOCTYPE data [<!ENTITY token SYSTEM "file:///etc/passwd">]><data/>',
      ),
    );
    await expect(create().fetch('https://caldav.yandex.ru/')).rejects.toThrow(
      'CALDAV_XML_ENTITIES_REJECTED',
    );
  });

  it('preserves a bodyless response', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await create().fetch('https://caldav.yandex.ru/', {
      method: 'DELETE',
    });
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('combines the conditional writer with authenticated transport', async () => {
    fetch.mockResolvedValue(
      new Response(null, { status: 201, headers: { ETag: '"v1"' } }),
    );
    const transport = create();
    expect(
      await writeCalDavResource({
        calendarUrl: 'https://caldav.yandex.ru/calendars/test/',
        resourceUrl: 'https://caldav.yandex.ru/calendars/test/class.ics',
        operation: {
          action: 'create',
          calendarData: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
        },
        fetch: transport.fetch,
      }),
    ).toEqual({ status: 'written', etag: '"v1"' });
    const [, options] = fetch.mock.calls[0];
    expect(new Headers(options?.headers).get('If-None-Match')).toBe('*');
    expect(new Headers(options?.headers).get('Authorization')).toMatch(
      /^Basic /,
    );
  });

  it('does not send an already aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      create().fetch('https://caldav.yandex.ru/', {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not send credentials to a principal on another server', async () => {
    fetch.mockImplementation(
      async () =>
        new Response(
          multistatus(
            '/',
            '<d:current-user-principal><d:href>https://other.example/principal/</d:href></d:current-user-principal>',
          ),
          { status: 207, headers: { 'Content-Type': 'application/xml' } },
        ),
    );
    expect(await discoverYandexCalendars(credentials)).toEqual({
      status: 'discovery-failed',
    });
    expect(
      fetch.mock.calls.every(
        ([input]) =>
          new URL(input instanceof Request ? input.url : input.toString())
            .origin === 'https://caldav.yandex.ru',
      ),
    ).toBe(true);
  });

  it('discovers principal, home and calendars without assuming write access', async () => {
    fetch.mockImplementation(discoveryResponse);

    expect(await discoverYandexCalendars(credentials)).toEqual({
      status: 'discovered',
      calendars: [
        {
          url: 'https://caldav.yandex.ru/calendars/test/classes/',
          displayName: 'Тренировки KATfit',
          reports: ['syncCollection'],
          writeAccess: 'unverified',
        },
      ],
    });
    expect(
      fetch.mock.calls.every(([, options]) => options?.method === 'PROPFIND'),
    ).toBe(true);
  });

  it.each([
    [401, 'auth-required'],
    [403, 'forbidden'],
    [429, 'unavailable'],
    [503, 'unavailable'],
  ] as const)(
    'reports HTTP %s without private error details',
    async (status, expected) => {
      fetch.mockImplementation(
        async () => new Response('Private error details', { status }),
      );
      expect(await discoverYandexCalendars(credentials)).toEqual({
        status: expected,
      });
    },
  );

  it('rejects empty credentials without making requests', async () => {
    expect(
      await discoverYandexCalendars({ ...credentials, appPassword: '' }),
    ).toEqual({ status: 'auth-required' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects corrupted calendar inventory after a successful login', async () => {
    fetch.mockImplementation(async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      return url.pathname === '/calendars/test/'
        ? new Response('<broken>', {
            status: 207,
            headers: { 'Content-Type': 'application/xml' },
          })
        : discoveryResponse(input, init);
    });
    expect(await discoverYandexCalendars(credentials)).toEqual({
      status: 'discovery-failed',
    });
  });

  it('does not interpret malformed XML as an empty calendar list', async () => {
    fetch.mockImplementation(
      async () =>
        new Response('<broken>', {
          status: 207,
          headers: { 'Content-Type': 'application/xml' },
        }),
    );
    expect(await discoverYandexCalendars(credentials)).toEqual({
      status: 'discovery-failed',
    });
  });
});
