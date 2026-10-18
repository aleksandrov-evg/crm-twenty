import {
  createCalendarCancellationCommandClient,
  calendarCancellationOperationKey,
  type CalendarCancellationCommand,
} from '../cancel-calendar-session';
const command: CalendarCancellationCommand = {
  classSessionId: 'e213e7be-858f-4ede-b965-7e1874f173e5',
  cancelledAt: '2026-01-01T00:00:00.000Z',
  idempotencyKey: `calendar-cancel:${'a'.repeat(64)}`,
  expectedBookingIds: [],
  expectedSession: {
    name: 'Test',
    startsAt: '2099-01-01T09:00:00.000Z',
    endsAt: '2099-01-01T10:00:00.000Z',
    sessionFormat: 'GROUP_REFORMER',
    capacity: 1,
    status: 'PLANNED',
    recordingKey: 'key',
  },
};
const row = () => ({
  classSessionId: command.classSessionId,
  operationKey: calendarCancellationOperationKey(command),
  state: 'SUCCEEDED',
  ownerToken: 'owner',
  request: JSON.stringify({ command, membershipIds: [] }),
  result: JSON.stringify({
    success: true,
    duplicate: false,
    classSessionId: command.classSessionId,
    bookingIds: [],
  }),
});
const client = (body: unknown) =>
  createCalendarCancellationCommandClient({
    baseUrl: 'https://crm.example.com',
    apiToken: 'test',
    fetch: jest.fn(
      async () => new Response(JSON.stringify(body), { status: 200 }),
    ),
  });
test('only matching complete durable gateway receipt confirms a cancellation', async () => {
  expect(
    await client({
      data: { studioSessionOperations: [row()] },
      pageInfo: { hasNextPage: false },
    }).receipt(command),
  ).toBe('confirmed');
});
test.each([
  'request',
  'result',
  'state',
  'identity',
  'partial',
  'duplicate',
  'errors',
])('rejects ambiguous or changed %s receipt', async (change) => {
  const entry = row();
  const body = {
    data: { studioSessionOperations: [entry] },
    pageInfo: { hasNextPage: false },
    errors: [] as unknown[],
  };
  if (change === 'request')
    entry.request = JSON.stringify({
      command: { ...command, cancelledAt: '2026-01-02T00:00:00.000Z' },
      membershipIds: [],
    });
  if (change === 'result')
    entry.result = JSON.stringify({
      success: true,
      duplicate: false,
      classSessionId: command.classSessionId,
      bookingIds: [command.classSessionId],
    });
  if (change === 'state') entry.state = 'NEEDS_REVIEW';
  if (change === 'identity')
    entry.classSessionId = 'f66b60fc-6836-465d-b34e-2ffb6bf3bec0';
  if (change === 'partial') body.pageInfo.hasNextPage = true;
  if (change === 'duplicate') body.data.studioSessionOperations.push(row());
  if (change === 'errors') body.errors.push({ message: 'denied' });
  expect(await client(body).receipt(command)).toBe('unconfirmed');
});
test('sender issues one request and never retries an uncertain response', async () => {
  const fetcher = jest.fn(async (_url: string | URL | Request) => {
    throw Error('Lost response');
  });
  const sender = createCalendarCancellationCommandClient({
    baseUrl: 'https://crm.example.com',
    apiToken: 'test',
    fetch: fetcher,
  });
  await sender.send(command);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toBe(
    'https://crm.example.com/s/studio/sessions/cancel',
  );
});
