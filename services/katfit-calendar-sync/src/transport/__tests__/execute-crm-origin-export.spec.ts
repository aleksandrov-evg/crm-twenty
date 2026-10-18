import { renderCrmOriginExport } from '../../domain/render-crm-origin-export';
import { executeCrmOriginExport } from '../execute-crm-origin-export';

const calendarUrl = 'https://caldav.yandex.ru/calendars/user/private/';
const rendered = renderCrmOriginExport({
  workspaceId: '00000000-0000-4000-8000-000000000001',
  connectionId: '00000000-0000-4000-8000-000000000002',
  calendarUrl,
  session: {
    id: '00000000-0000-4000-8000-000000000003',
    recordingKey: 'session-create:crm-ui',
    name: 'Пилатес · Private name',
    startsAt: '2099-01-01T12:00:00.000Z',
    endsAt: '2099-01-01T13:00:00.000Z',
    sessionFormat: 'GROUP_REFORMER',
    capacity: 4,
    status: 'PLANNED',
  },
});
if (rendered.status !== 'prepared') throw Error('Not prepared');
const command = rendered.command;
const resource = (body: string) =>
  new Response(body, {
    status: 200,
    headers: {
      etag: '"event-v1"',
      'Content-Type': 'text/calendar; charset=utf-8',
    },
  });
describe('CRM-origin initial CalDAV export', () => {
  it('creates once with If-None-Match and confirms only by GET', async () => {
    let saved: string | null = null;
    let writes = 0;
    const authorization = jest.fn(async () => true);
    const fetch: typeof globalThis.fetch = async (_url, options) => {
      if (options?.method === 'PUT') {
        expect(authorization).toHaveBeenCalledTimes(1);
        expect(new Headers(options.headers).get('If-None-Match')).toBe('*');
        writes++;
        saved = String(options.body);
        return new Response(null, { status: 201 });
      }
      return saved ? resource(saved) : new Response(null, { status: 404 });
    };
    expect(
      await executeCrmOriginExport(command, {
        calendarUrl,
        fetch,
        authorizeCreate: authorization,
      }),
    ).toMatchObject({ status: 'confirmed', etag: '"event-v1"' });
    expect(
      await executeCrmOriginExport(command, {
        calendarUrl,
        fetch,
        authorizeCreate: authorization,
      }),
    ).toMatchObject({ status: 'confirmed' });
    expect(writes).toBe(1);
    expect(authorization).toHaveBeenCalledTimes(1);
  });
  it.each(['lost', 'precondition'])(
    'recovers %s create response by GET without replacing resource',
    async (mode) => {
      let calls = 0;
      let writes = 0;
      const fetch: typeof globalThis.fetch = async (_url, options) => {
        if (options?.method === 'PUT') {
          writes++;
          if (mode === 'lost') throw Error('Authorization: secret');
          return new Response(null, { status: 412 });
        }
        calls++;
        return calls === 1
          ? new Response(null, { status: 404 })
          : resource(command.calendarData);
      };
      expect(
        await executeCrmOriginExport(command, { calendarUrl, fetch }),
      ).toMatchObject({ status: 'confirmed' });
      expect(writes).toBe(1);
    },
  );
  it('never overwrites a foreign or changed resource', async () => {
    const fetch = jest.fn(async () =>
      resource(command.calendarData.replace('Private name', 'Changed name')),
    );
    expect(
      await executeCrmOriginExport(command, { calendarUrl, fetch }),
    ).toEqual({ status: 'conflict' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not claim success after PUT alone or expose request errors', async () => {
    let requests = 0;
    const fetch: typeof globalThis.fetch = async (_url, options) => {
      requests++;
      if (options?.method === 'PUT') return new Response(null, { status: 201 });
      if (requests === 1) return new Response(null, { status: 404 });
      throw Error('Authorization: secret; Private name');
    };
    expect(
      await executeCrmOriginExport(command, { calendarUrl, fetch }),
    ).toEqual({ status: 'unconfirmed' });
  });
  it('fences creation after preflight and permits matching recovery after start', async () => {
    const fetch = jest.fn(async () => new Response(null, { status: 404 }));
    expect(
      await executeCrmOriginExport(command, {
        calendarUrl,
        fetch,
        authorizeCreate: async () => false,
      }),
    ).toEqual({ status: 'not-authorized' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      await executeCrmOriginExport(command, {
        calendarUrl,
        fetch: async () => resource(command.calendarData),
        now: () => new Date('2100-01-01'),
      }),
    ).toMatchObject({ status: 'confirmed' });
    expect(
      await executeCrmOriginExport(command, {
        calendarUrl,
        fetch,
        now: () => new Date('2100-01-01'),
      }),
    ).toEqual({ status: 'past-session' });
  });
});
