import { createCalendarSessionSender } from '../create-calendar-session';
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
const configuration = { baseUrl: 'https://crm.test', apiToken: 'test-secret' };
const sessionId = 'd7559474-49ce-4881-8ed1-d994ef52d1b5';

describe('calendar session command transport', () => {
  it.each([true, false])(
    'accepts validated success, duplicate=%s',
    async (duplicate) => {
      const request = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          Response.json({
            success: true,
            classSessionId: sessionId,
            duplicate,
          }),
        );
      const sender = createCalendarSessionSender({
        ...configuration,
        fetch: request,
      });
      expect(await sender(command)).toEqual({
        status: 'confirmed',
        classSessionId: sessionId,
        duplicate,
      });
      const [url, options] = request.mock.calls[0];
      expect(String(url)).toBe('https://crm.test/s/studio/sessions/create');
      expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
      expect(JSON.parse(String(options?.body))).toEqual(command);
    },
  );
  it.each([
    Response.json({ success: true, classSessionId: 'bad', duplicate: false }),
    Response.json(
      { success: false, code: 'IDEMPOTENCY_CONFLICT' },
      { status: 409 },
    ),
    Response.json({ success: false }, { status: 400 }),
    Response.json({ success: false }, { status: 500 }),
    new Response('<html>login</html>'),
    new Response('x'.repeat(2 * 1024 * 1024 + 1)),
  ])(
    'requires reconciliation for an unconfirmed response',
    async (response) => {
      const request = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(response);
      expect(
        await createCalendarSessionSender({ ...configuration, fetch: request })(
          command,
        ),
      ).toEqual({ status: 'unconfirmed' });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [401, 'auth-required'],
    [403, 'forbidden'],
  ] as const)('reports access error %s', async (status, expected) => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response(null, { status }));
    expect(
      await createCalendarSessionSender({ ...configuration, fetch: request })(
        command,
      ),
    ).toEqual({ status: expected });
  });
  it('does not automatically retry after a lost response', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('test-secret'));
    expect(
      await createCalendarSessionSender({ ...configuration, fetch: request })(
        command,
      ),
    ).toEqual({ status: 'unconfirmed' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects attendance and participant instructions before sending', async () => {
    const request = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    const sender = createCalendarSessionSender({
      ...configuration,
      fetch: request,
    });
    await expect(
      sender({
        ...command,
        status: 'COMPLETED',
      } as unknown as CalendarSessionCommand),
    ).rejects.toThrow();
    await expect(
      sender({
        ...command,
        participants: [{ personId: 'client' }],
      } as unknown as CalendarSessionCommand),
    ).rejects.toThrow();
    await expect(
      sender({
        ...command,
        attendanceReason: 'extra',
      } as unknown as CalendarSessionCommand),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
