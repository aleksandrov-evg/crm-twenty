import { createCalendarCreationInspector } from '../inspect-calendar-session-creation';
import { type CalendarSessionCommand } from '../../domain/create-calendar-session-command';

const command: CalendarSessionCommand = {
  name: 'Тренировка',
  sessionFormat: 'GROUP_REFORMER',
  startsAt: '2099-01-10T09:00:00Z',
  durationMinutes: 60,
  capacity: 6,
  status: 'PLANNED',
  idempotencyKey: `calendar-create:${'a'.repeat(64)}`,
  participants: [],
};
const sessionId = 'd7559474-49ce-4881-8ed1-d994ef52d1b5';
const requestDetails = {
  status: 'PLANNED',
  participants: [],
  attendanceReason: '',
};
const session = {
  id: sessionId,
  recordingKey: `session-create:${command.idempotencyKey}`,
  name: command.name,
  startsAt: command.startsAt,
  endsAt: '2099-01-10T10:00:00Z',
  sessionFormat: command.sessionFormat,
  capacity: 6,
  status: 'PLANNED',
  creationRequest: JSON.stringify(requestDetails),
};
const details = {
  ...requestDetails,
  name: command.name,
  startsAt: command.startsAt,
  endsAt: session.endsAt,
  capacity: 6,
};
const audit = {
  id: sessionId,
  classSessionId: sessionId,
  eventType: 'SESSION_CREATED',
  outcome: 'SUCCESS',
  idempotencyKey: command.idempotencyKey,
  details: JSON.stringify(details),
};
const page = (object: string, values: unknown[], more = false) =>
  Response.json({
    data: { [object]: values },
    pageInfo: { hasNextPage: more },
  });
const setup = (record = session, events: unknown[] = [audit], more = false) => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(page('classSessions', [record]))
    .mockResolvedValueOnce(page('studioEvents', events, more));
  return {
    request,
    inspect: createCalendarCreationInspector({
      baseUrl: 'https://crm.test',
      apiToken: 'secret',
      fetch: request,
    }),
  };
};

describe('creation inspection', () => {
  it('confirms the matching session and immutable creation audit', async () => {
    const { request, inspect } = setup();
    expect(await inspect(command)).toEqual({
      status: 'confirmed',
      classSessionId: sessionId,
      recordingKey: session.recordingKey,
      session,
    });
    expect(
      new URL(String(request.mock.calls[1][0])).searchParams.get('filter'),
    ).toBe(`id[eq]:${sessionId}`);
    expect(
      request.mock.calls.every(([, options]) => options?.method === 'GET'),
    ).toBe(true);
  });
  it('requires review when the format differs because the audit does not record format', async () => {
    expect(
      await setup({ ...session, sessionFormat: 'MAT_PILATES' }).inspect(
        command,
      ),
    ).toMatchObject({
      status: 'needs-review',
      reason: 'UNVERIFIED_SESSION_FORMAT',
    });
  });
  it('reports partial creation when the audit is missing', async () => {
    expect(await setup(session, []).inspect(command)).toEqual({
      status: 'incomplete',
      classSessionId: sessionId,
    });
  });
  it('does not treat missing audit after a schedule change as safe to replay', async () => {
    expect(
      await setup({ ...session, capacity: 8 }, []).inspect(command),
    ).toMatchObject({
      status: 'needs-review',
      reason: 'SESSION_CHANGED_WITHOUT_CREATION_AUDIT',
    });
  });
  it('can confirm historical creation after an audited later status change', async () => {
    expect(
      await setup({ ...session, status: 'COMPLETED' }).inspect(command),
    ).toMatchObject({ status: 'confirmed' });
  });
  it.each([
    { ...audit, id: 'f4071e4f-93a5-49be-afcd-3d319c116eb7' },
    { ...audit, classSessionId: 'f4071e4f-93a5-49be-afcd-3d319c116eb7' },
    { ...audit, eventType: 'BOOKING_CREATED' },
    { ...audit, outcome: 'FAILURE' },
    { ...audit, idempotencyKey: 'other-key' },
    { ...audit, details: JSON.stringify({ ...details, capacity: 8 }) },
    {
      ...audit,
      details: JSON.stringify({
        ...details,
        participants: [{ personId: 'client' }],
      }),
    },
    { ...audit, details: 'broken-json' },
  ])('requires review for an audit mismatch', async (event) => {
    expect(await setup(session, [event]).inspect(command)).toMatchObject({
      status: 'needs-review',
    });
  });
  it.each([
    undefined,
    'bad-json',
    JSON.stringify({ ...requestDetails, status: 'COMPLETED' }),
  ])('rejects unverified creationRequest', async (creationRequest) => {
    const { inspect, request } = setup({
      ...session,
      creationRequest: creationRequest as string,
    });
    expect(await inspect(command)).toMatchObject({
      status: 'needs-review',
      reason: 'UNVERIFIED_CREATION_REQUEST',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects a partial audit page', async () => {
    expect(await setup(session, [audit], true).inspect(command)).toMatchObject({
      status: 'needs-review',
    });
  });
  it('reports absence without an audit request', async () => {
    const { request, inspect } = setup();
    request.mockReset().mockResolvedValue(page('classSessions', []));
    expect(await inspect(command)).toEqual({ status: 'absent' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, 'auth-required'],
    [403, 'forbidden'],
    [500, 'unavailable'],
  ] as const)('reports audit HTTP error %s', async (status, expected) => {
    const { request, inspect } = setup();
    request
      .mockReset()
      .mockResolvedValueOnce(page('classSessions', [session]))
      .mockResolvedValueOnce(new Response(null, { status }));
    expect(await inspect(command)).toEqual({ status: expected });
  });
});
