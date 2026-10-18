import { calendarCrmRecordingKeySchema } from '../calendar-crm-session-reference';
import {
  createCalendarFutureSessionsReader,
  createCalendarSessionByIdLookup,
} from '../read-calendar-future-sessions';

const session = {
  id: 'd7559474-49ce-4881-8ed1-d994ef52d1b5',
  recordingKey: 'session-create:d7559474-49ce-4881-8ed1-d994ef52d1b5',
  name: 'Тренировка',
  startsAt: '2099-01-10T09:00:00Z',
  endsAt: '2099-01-10T10:00:00Z',
  capacity: 6,
  sessionFormat: 'GROUP_REFORMER',
  status: 'PLANNED',
  creationRequest: null,
};
const another = {
  ...session,
  id: 'f4071e4f-93a5-49be-afcd-3d319c116eb7',
  recordingKey: `session-create:calendar-create:${'a'.repeat(64)}`,
};
const now = () => new Date('2099-01-01T00:00:00Z');
const configuration = {
  baseUrl: 'https://crm.example.test',
  apiToken: 'secret',
};
const page = (
  records: unknown[],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  data: {
    classSessions: {
      edges: records.map((node) => ({
        node: { mutationLock: null, ...(node as Record<string, unknown>) },
      })),
      pageInfo: { hasNextPage, endCursor },
    },
  },
});
const setup = (bodies: unknown[]) => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  for (const body of bodies) request.mockResolvedValueOnce(Response.json(body));
  return {
    request,
    read: createCalendarFutureSessionsReader(
      { ...configuration, fetch: request },
      now,
    ),
    byId: createCalendarSessionByIdLookup({ ...configuration, fetch: request }),
  };
};
describe('future CRM sessions reader', () => {
  it('reads all bounded pages with server filters and opaque cursor, preserving actual keys', async () => {
    const { read, request } = setup([
      page([session], true, 'cursor-1'),
      page([another]),
    ]);
    expect(await read()).toEqual({
      status: 'read',
      sessions: [session, another],
      needsReview: [],
    });
    const first = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(first.query).toMatch(/^query CalendarFutureSessions/);
    expect(first.variables.filter).toEqual({
      and: [
        { startsAt: { gt: now().toISOString() } },
        { status: { in: ['PLANNED', 'CONFIRMED'] } },
        {
          or: [{ mutationLock: { is: 'NULL' } }, { mutationLock: { eq: '' } }],
        },
      ],
    });
    expect(
      JSON.parse(String(request.mock.calls[1][1]?.body)).variables.after,
    ).toBe('cursor-1');
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: 'Bearer secret' },
    });
  });
  it('returns legacy missing and unsupported keys as explicit reviews without title matching', async () => {
    const missing = { ...session, recordingKey: null };
    const unsupported = { ...another, recordingKey: 'custom key' };
    expect(await setup([page([missing, unsupported])]).read()).toEqual({
      status: 'read',
      sessions: [],
      needsReview: [
        { id: session.id, reason: 'MISSING_RECORDING_KEY' },
        { id: another.id, reason: 'UNSUPPORTED_RECORDING_KEY' },
      ],
    });
  });
  it.each([
    page([{ ...session, status: 'COMPLETED' }]),
    page([{ ...session, startsAt: '2098-01-01T00:00:00Z' }]),
    page([{ ...session, endsAt: session.startsAt }]),
    page([{ ...session, capacity: 0 }]),
    page([{ ...session, name: ' ' }]),
    page([session, session]),
    page([session, { ...another, recordingKey: session.recordingKey }]),
    page([], true, 'cursor'),
    page([session], true, null),
    { ...page([session]), errors: [{ message: 'partial' }] },
  ])(
    'rejects unfiltered, partial, duplicate or malformed records: %j',
    async (body) => {
      expect(await setup([body]).read()).toEqual({
        status: 'invalid-response',
      });
    },
  );
  it('rejects duplicate identifiers and cursor loops across pages without partial success', async () => {
    expect(
      await setup([page([session], true, 'one'), page([session])]).read(),
    ).toEqual({ status: 'invalid-response' });
    expect(
      await setup([
        page([{ ...session, recordingKey: null }], true, 'one'),
        page([{ ...another, recordingKey: null }], true, 'one'),
      ]).read(),
    ).toEqual({ status: 'invalid-response' });
  });
  it('bounds pagination and never returns a truncated successful snapshot', async () => {
    const pages = Array.from({ length: 20 }, (_, index) =>
      page(
        [
          {
            ...session,
            id: `d7559474-49ce-4881-8ed1-${index.toString(16).padStart(12, '0')}`,
            recordingKey: null,
          },
        ],
        true,
        `cursor-${index}`,
      ),
    );
    const { read, request } = setup(pages);
    expect(await read()).toEqual({ status: 'limit-exceeded' });
    expect(request).toHaveBeenCalledTimes(20);
  });
  it('revalidates future time when rows arrive rather than trusting the initial filter', async () => {
    const clock = jest
      .fn()
      .mockReturnValueOnce(now())
      .mockReturnValue(new Date('2099-01-11T00:00:00Z'));
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(Response.json(page([session])));
    expect(
      await createCalendarFutureSessionsReader(
        { ...configuration, fetch: request },
        clock,
      )(),
    ).toEqual({ status: 'invalid-response' });
  });
  it.each([401, 403, 500])(
    'handles HTTP %s without partial records',
    async (status) => {
      const request = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(new Response('{}', { status }));
      expect(
        await createCalendarFutureSessionsReader(
          { ...configuration, fetch: request },
          now,
        )(),
      ).toEqual({
        status:
          status === 401
            ? 'auth-required'
            : status === 403
              ? 'forbidden'
              : 'unavailable',
      });
    },
  );
});
describe('exact CRM session by ID', () => {
  it('looks up actual UUID identity and stable reference using query-only API', async () => {
    const { byId, request } = setup([page([session])]);
    expect(await byId(session.id)).toEqual({ status: 'matched', session });
    expect(
      JSON.parse(String(request.mock.calls[0][1]?.body)).variables,
    ).toEqual({ id: session.id });
  });
  it.each([
    page([another]),
    page([{ ...session, recordingKey: null }]),
    page([{ ...session, recordingKey: 'bad' }]),
  ])('rejects ignored ID filter or unstable reference: %j', async (body) => {
    expect(await setup([body]).byId(session.id)).toEqual({
      status: 'invalid-response',
    });
  });
  it('distinguishes missing and ambiguous records', async () => {
    expect(await setup([page([])]).byId(session.id)).toEqual({
      status: 'not-found',
    });
    expect(await setup([page([session, session])]).byId(session.id)).toEqual({
      status: 'ambiguous',
    });
  });
  it('rejects invalid ID without a request', async () => {
    const { byId, request } = setup([]);
    await expect(byId('id[eq]:bad')).rejects.toThrow(
      'INVALID_CALENDAR_SESSION_ID',
    );
    expect(request).not.toHaveBeenCalled();
  });
});
it('accepts only supported immutable recording namespaces, never filter syntax', () => {
  for (const value of [session.recordingKey, another.recordingKey])
    expect(calendarCrmRecordingKeySchema.safeParse(value).success).toBe(true);
  for (const value of [
    '',
    null,
    'session-create:plain',
    'session-create:uuid,or:id[is]:NULL',
    'session-create:../',
    `session-create:calendar-create:${'a'.repeat(65)}`,
  ])
    expect(calendarCrmRecordingKeySchema.safeParse(value).success).toBe(false);
});

it('rejects a held lock returned despite the future-list filter', async () => {
  expect(
    await setup([page([{ ...session, mutationLock: 'owner' }])]).read(),
  ).toEqual({ status: 'invalid-response' });
});

it('exact by-ID lookup treats held locks as temporarily unavailable', async () => {
  const fixture = setup([page([{ ...session, mutationLock: 'owner' }])]);
  expect(await fixture.byId(session.id)).toEqual({ status: 'unavailable' });
});

it('does not expose lock metadata in the public session shape', async () => {
  const listed = await setup([page([session])]).read();
  expect(listed.status === 'read' && listed.sessions[0]).toEqual(session);
  const found = await setup([page([session])]).byId(session.id);
  expect(found.status === 'matched' && found.session).toEqual(session);
});

it('accepts an empty text field as an unlocked session in both readers', async () => {
  const listed = await setup([page([{ ...session, mutationLock: '' }])]).read();
  expect(listed).toEqual({
    status: 'read',
    sessions: [session],
    needsReview: [],
  });
  const found = await setup([page([{ ...session, mutationLock: '' }])]).byId(
    session.id,
  );
  expect(found).toEqual({ status: 'matched', session });
});
it('does not treat whitespace or another nonempty owner as a free lock', async () => {
  expect(
    await setup([page([{ ...session, mutationLock: ' ' }])]).read(),
  ).toEqual({ status: 'invalid-response' });
  expect(
    await setup([page([{ ...session, mutationLock: ' ' }])]).byId(session.id),
  ).toEqual({ status: 'unavailable' });
});
