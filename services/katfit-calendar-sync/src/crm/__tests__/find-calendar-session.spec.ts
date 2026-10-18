import { createCalendarSessionLookup } from '../find-calendar-session';

const key = `session-create:calendar-create:${'a'.repeat(64)}`;
const session = {
  id: 'd7559474-49ce-4881-8ed1-d994ef52d1b5',
  recordingKey: key,
  name: 'Тренировка',
  startsAt: '2027-01-10T09:00:00Z',
  endsAt: '2027-01-10T10:00:00Z',
  capacity: 6,
  sessionFormat: 'GROUP_REFORMER',
  status: 'PLANNED',
};
const response = (sessions: unknown[], hasNextPage = false) =>
  Response.json({
    data: { classSessions: sessions },
    pageInfo: { hasNextPage },
  });
const setup = (result: Response) => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(result);
  return {
    request,
    lookup: createCalendarSessionLookup({
      baseUrl: 'https://crm.example.test',
      apiToken: 'secret',
      fetch: request,
    }),
  };
};

describe('CRM calendar session lookup', () => {
  it('finds a session using the public API and stable key only', async () => {
    const { lookup, request } = setup(response([session]));
    expect(await lookup(key)).toEqual({ status: 'matched', session });
    const [url, options] = request.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('filter')).toBe(
      `recordingKey[eq]:${key}`,
    );
    expect(options).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: 'Bearer secret' },
    });
  });
  it('reports absence without creating a session', async () => {
    const { lookup, request } = setup(response([]));
    expect(await lookup(key)).toEqual({ status: 'not-found' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([response([session, session]), response([session], true)])(
    'rejects ambiguous matches',
    async (result) => {
      expect(await setup(result).lookup(key)).toEqual({ status: 'ambiguous' });
    },
  );
  it.each([
    response([{ ...session, recordingKey: 'other' }]),
    response([{ ...session, id: 'bad' }]),
    Response.json({ data: {} }),
    new Response('<html>login</html>'),
    new Response('x'.repeat(2 * 1024 * 1024 + 1)),
  ])('rejects invalid or unfiltered responses', async (result) => {
    expect(await setup(result).lookup(key)).toEqual({
      status: 'invalid-response',
    });
  });
  it.each([
    [401, 'auth-required'],
    [403, 'forbidden'],
    [429, 'unavailable'],
    [500, 'unavailable'],
  ])('maps HTTP status %s', async (status, expected) => {
    expect(
      await setup(new Response(null, { status: Number(status) })).lookup(key),
    ).toEqual({ status: expected });
  });
  it('does not expose network errors or tokens', async () => {
    const lookup = createCalendarSessionLookup({
      baseUrl: 'https://crm.example.test',
      apiToken: 'secret',
      fetch: jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockRejectedValue(new Error('secret')),
    });
    expect(await lookup(key)).toEqual({ status: 'unavailable' });
  });
  it('rejects filter injection before sending a request', async () => {
    const { lookup, request } = setup(response([]));
    await expect(lookup('injected[or]:value')).rejects.toThrow(
      'INVALID_CALENDAR_RECORDING_KEY',
    );
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    'http://crm.test',
    'https://user:password@crm.test',
    'https://crm.test/path',
    'https://crm.test?token=x',
    'https://crm.test#fragment',
  ])('rejects unsafe configuration %s', (baseUrl) => {
    expect(() =>
      createCalendarSessionLookup({ baseUrl, apiToken: 'secret' }),
    ).toThrow('INVALID_CRM_CONFIGURATION');
  });
  it('supports explicitly configured internal HTTP endpoints', () => {
    expect(() =>
      createCalendarSessionLookup({
        baseUrl: 'http://twenty:3000',
        apiToken: 'secret',
        allowInsecureHttp: true,
      }),
    ).not.toThrow();
  });
});
