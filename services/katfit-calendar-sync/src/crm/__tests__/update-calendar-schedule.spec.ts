import { createScheduleCapabilityFixture } from './fixtures/calendar-schedule-capability-fixture';

import {
  createCalendarScheduleUpdater,
  recoverCalendarScheduleUpdate,
  type CalendarScheduleUpdate,
} from '../update-calendar-schedule';

const command: CalendarScheduleUpdate = {
  expected: {
    id: 'd7559474-49ce-4881-8ed1-d994ef52d1b5',
    recordingKey: `session-create:calendar-create:${'a'.repeat(64)}`,
    name: 'До переноса',
    startsAt: '2099-01-10T09:00:00Z',
    endsAt: '2099-01-10T10:00:00Z',
    sessionFormat: 'GROUP_REFORMER',
    capacity: 6,
    status: 'PLANNED',
  },
  target: {
    name: 'После переноса',
    startsAt: '2099-01-11T09:00:00Z',
    endsAt: '2099-01-11T10:00:00Z',
  },
};
const targetSession = { ...command.expected, ...command.target };
const now = () => new Date('2099-01-01T00:00:00Z');
const configuration = { baseUrl: 'https://crm.example.test', apiToken: 'test' };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const success = {
  success: true,
  classSessionId: command.expected.id,
  duplicate: false,
};
const gatewayFetch = (body: unknown = success, status = 200) =>
  jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response(createScheduleCapabilityFixture().metadata))
    .mockResolvedValueOnce(response(body, status));

describe('guarded schedule update', () => {
  it('sends immutable expected and target through the gateway, never direct GraphQL mutation', async () => {
    const request = gatewayFetch();
    expect(
      await createCalendarScheduleUpdater(
        { ...configuration, fetch: request },
        now,
      )(command),
    ).toEqual({ status: 'applied' });
    const [url, options] = request.mock.calls[1];
    expect(String(url)).toBe(
      'https://crm.example.test/s/studio/sessions/update',
    );
    const body = JSON.parse(String(options?.body));
    expect(body.classSessionId).toBe(command.expected.id);
    expect(body.idempotencyKey).toMatch(/^calendar-schedule:[a-f0-9]{64}$/);
    expect(body.expected).toEqual({
      ...command.expected,
      id: undefined,
      startsAt: '2099-01-10T09:00:00.000Z',
      endsAt: '2099-01-10T10:00:00.000Z',
    });
    expect(body.target).toEqual({
      ...command.target,
      startsAt: '2099-01-11T09:00:00.000Z',
      endsAt: '2099-01-11T10:00:00.000Z',
      sessionFormat: command.expected.sessionFormat,
      capacity: command.expected.capacity,
    });
    expect(body.query).toBeUndefined();
    expect(options?.redirect).toBe('error');
  });
  it.each([401, 403, 500])(
    'handles gateway HTTP %s without automatic retry',
    async (status) => {
      const request = gatewayFetch({}, status);
      expect(
        await createCalendarScheduleUpdater(
          { ...configuration, fetch: request },
          now,
        )(command),
      ).toEqual({
        status:
          status === 401
            ? 'auth-required'
            : status === 403
              ? 'forbidden'
              : 'unconfirmed',
      });
      expect(request).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    'SESSION_SNAPSHOT_CONFLICT',
    'SESSION_BOOKINGS_INCOMPATIBLE',
    'SESSION_MEMBERSHIP_DATE_CONFLICT',
    'SESSION_ALREADY_STARTED',
  ])('maps confirmed business conflict %s', async (code) => {
    expect(
      await createCalendarScheduleUpdater(
        {
          ...configuration,
          fetch: gatewayFetch({ success: false, code }, 409),
        },
        now,
      )(command),
    ).toEqual({ status: 'conflict' });
  });
  it.each([
    {},
    { ...success, classSessionId: 'f4071e4f-93a5-49be-afcd-3d319c116eb7' },
    { success: true, classSessionId: command.expected.id },
    { data: { updateClassSessions: [targetSession] } },
  ])('requires exact gateway receipt: %j', async (body) => {
    expect(
      await createCalendarScheduleUpdater(
        { ...configuration, fetch: gatewayFetch(body) },
        now,
      )(command),
    ).toEqual({ status: 'unconfirmed' });
  });
  it('does not send invalid commands or past sessions', async () => {
    const request = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    const update = createCalendarScheduleUpdater(
      { ...configuration, fetch: request },
      now,
    );
    expect(
      await update({
        ...command,
        target: { ...command.target, endsAt: command.target.startsAt },
      }),
    ).toEqual({ status: 'invalid-command' });
    expect(
      await update({
        ...command,
        expected: { ...command.expected, startsAt: '2098-01-01T00:00:00Z' },
      }),
    ).toEqual({ status: 'past-session' });
    expect(request).not.toHaveBeenCalled();
  });
  it('does not write when gateway metadata is missing', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response({}));
    expect(
      await createCalendarScheduleUpdater(
        { ...configuration, fetch: request },
        now,
      )(command),
    ).toEqual({ status: 'unconfirmed' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('uses a stable command key across retries and a new key for changed target', async () => {
    const keys: string[] = [];
    for (const input of [
      command,
      structuredClone(command),
      { ...command, target: { ...command.target, name: 'another' } },
    ]) {
      const request = gatewayFetch();
      await createCalendarScheduleUpdater(
        { ...configuration, fetch: request },
        now,
      )(input);
      keys.push(
        JSON.parse(String(request.mock.calls[1][1]?.body)).idempotencyKey,
      );
    }
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});

describe('schedule update recovery', () => {
  it('recovers a lost response and does not resend after restart', async () => {
    let session = { ...command.expected };
    const lookup = jest.fn(async () => ({
      status: 'matched' as const,
      session,
    }));
    let sends = 0;
    const send = jest.fn(async () => {
      sends++;
      session = targetSession;
      return {
        status: (sends === 1 ? 'unconfirmed' : 'applied') as
          | 'unconfirmed'
          | 'applied',
      };
    });
    const dependencies = { lookup, send, authorizeSend: async () => true };
    expect(await recoverCalendarScheduleUpdate(command, dependencies)).toEqual({
      status: 'unconfirmed',
    });
    expect(await recoverCalendarScheduleUpdate(command, dependencies)).toEqual({
      status: 'applied',
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not send over an intervening edit', async () => {
    const send = jest.fn();
    expect(
      await recoverCalendarScheduleUpdate(command, {
        lookup: async () => ({
          status: 'matched',
          session: { ...command.expected, name: 'Правка пользователя' },
        }),
        send,
        authorizeSend: async () => true,
      }),
    ).toEqual({ status: 'conflict' });
    expect(send).not.toHaveBeenCalled();
  });
  it('respects the last authorization check', async () => {
    const send = jest.fn();
    expect(
      await recoverCalendarScheduleUpdate(command, {
        lookup: async () => ({ status: 'matched', session: command.expected }),
        send,
        authorizeSend: async () => false,
      }),
    ).toEqual({ status: 'unconfirmed' });
    expect(send).not.toHaveBeenCalled();
  });
  it('does not trust mutation success without a confirming read', async () => {
    const lookup = jest
      .fn()
      .mockResolvedValueOnce({ status: 'matched', session: command.expected })
      .mockResolvedValueOnce({ status: 'unavailable' });
    expect(
      await recoverCalendarScheduleUpdate(command, {
        lookup,
        send: async () => ({ status: 'applied' }),
        authorizeSend: async () => true,
      }),
    ).toEqual({ status: 'unconfirmed' });
  });
});
it('freezes the command before awaiting the lookup', async () => {
  const mutable = structuredClone(command);
  const send = jest.fn(async (received: CalendarScheduleUpdate) => {
    expect(received.target.name).toBe(command.target.name);
    return { status: 'unconfirmed' as const };
  });
  await recoverCalendarScheduleUpdate(mutable, {
    lookup: async () => {
      mutable.target.name = 'Подмена';
      return { status: 'matched', session: command.expected };
    },
    send,
    authorizeSend: async () => true,
  });
  expect(send).toHaveBeenCalledTimes(1);
});

it('does not confirm a target written before a failed audit or retained NEEDS_REVIEW journal', async () => {
  const send = jest.fn(async () => ({ status: 'unconfirmed' as const }));
  expect(
    await recoverCalendarScheduleUpdate(command, {
      lookup: async () => ({ status: 'matched', session: targetSession }),
      send,
      authorizeSend: async () => true,
    }),
  ).toEqual({ status: 'unconfirmed' });
  expect(send).toHaveBeenCalledTimes(1);
});

it('accepts a genuine CRM-origin no-op without manufacturing a gateway write', async () => {
  const send = jest.fn();
  expect(
    await recoverCalendarScheduleUpdate(
      { ...command, expected: targetSession },
      {
        lookup: async () => ({ status: 'matched', session: targetSession }),
        send,
        authorizeSend: async () => false,
      },
    ),
  ).toEqual({ status: 'applied' });
  expect(send).not.toHaveBeenCalled();
});

it('accepts a CRM-origin recording key in the frozen schedule command', async () => {
  const request = gatewayFetch();
  expect(
    await createCalendarScheduleUpdater(
      { ...configuration, fetch: request },
      now,
    )({
      ...command,
      expected: {
        ...command.expected,
        recordingKey: `session-create:${command.expected.id}`,
      },
    }),
  ).toEqual({ status: 'applied' });
  expect(
    JSON.parse(String(request.mock.calls[1][1]?.body)).expected.recordingKey,
  ).toBe(`session-create:${command.expected.id}`);
});
