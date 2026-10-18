import { executeCalendarCancellation } from '../execute-calendar-cancellation';
import {
  CalendarCancellationExecutionStore,
  type CancellationExecutionSource,
  type CancellationExecution,
} from '../../storage/calendar-cancellation-execution.store';
import { type CalendarCrmSession } from '../../crm/find-calendar-session';
import { CalendarCredentialCipher } from '../../security/calendar-credential-cipher';
const sessionId = 'e213e7be-858f-4ede-b965-7e1874f173e5';
const bookingId = 'f66b60fc-6836-465d-b34e-2ffb6bf3bec0';
const data =
  'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:one\r\nSUMMARY:Test\r\nDTSTART:20990101T090000Z\r\nDURATION:PT1H\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const captured: CancellationExecutionSource = {
  reviewId: sessionId,
  uid: 'one',
  kind: 'CANCELLED',
  classSessionId: sessionId,
  recordingKey: 'key',
  configurationVersion: 1,
  resourceVersion: 1,
  timezone: 'UTC',
  username: 'test',
  encryptedAppPassword: '',
  calendarUrl: 'https://caldav.yandex.ru/calendars/test/classes/',
  resourceUrl: 'https://caldav.yandex.ru/calendars/test/classes/one',
  etag: '"one"',
  calendarData: data,
  missing: false,
  missingMature: false,
  initialBookingIds: [bookingId],
  seenBookingIds: [bookingId],
  readGeneration: 1,
};
const session: CalendarCrmSession = {
  id: sessionId,
  recordingKey: 'key',
  name: 'Test',
  startsAt: '2099-01-01T09:00:00.000Z',
  endsAt: '2099-01-01T10:00:00.000Z',
  status: 'PLANNED',
  capacity: 1,
  sessionFormat: 'GROUP_REFORMER',
};
const make = () => {
  let execution: CancellationExecution | null = null;
  let cancelled = false;
  const store = {
    scope: { workspaceId: sessionId, connectionId: bookingId },
    get: jest.fn(async () => execution),
    capture: jest.fn(async () => captured),
    presentResources: jest.fn(async () => [{ calendarData: data }]),
    prepare: jest.fn(
      async () =>
        (execution ??= {
          state: 'PREPARED',
          command: {
            classSessionId: sessionId,
            expectedBookingIds: [bookingId],
            idempotencyKey: `calendar-cancel:${'a'.repeat(64)}`,
            cancelledAt: '2026-01-01T00:00:00.000Z',
            expectedSession: {
              name: session.name,
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              sessionFormat: session.sessionFormat,
              capacity: session.capacity,
              status: 'PLANNED',
              recordingKey: session.recordingKey,
            },
          },
        }),
    ),
    beginSend: jest.fn(async () => {
      if (!execution || execution.state !== 'PREPARED') return false;
      execution.state = 'SENDING';
      return true;
    }),
    settle: jest.fn(async (_id: string, confirmed: boolean) => {
      if (execution) execution.state = confirmed ? 'CONFIRMED' : 'NEEDS_REVIEW';
    }),
  };
  return {
    store,
    options: {
      store: store as unknown as CalendarCancellationExecutionStore,
      reviewId: sessionId,
      expectedConfigurationVersion: 1,
      mode: 'execute' as const,
      enabled: true,
      cipher: new CalendarCredentialCipher('primary', {
        primary: 'ab'.repeat(32),
      }),
      capabilities: jest.fn(async () => true),
      liveCheck: jest.fn(async () => true),
      lookup: jest.fn(async () => ({
        status: 'matched' as const,
        session: {
          ...session,
          status: cancelled ? 'CANCELLED_BY_STUDIO' : 'PLANNED',
        },
      })),
      impact: jest.fn(async () => ({
        status: 'read' as const,
        bookingIds: [bookingId],
        totalBookings: 1,
        activeBookings: cancelled ? 0 : 1,
        attendedBookings: 0,
        expectedPayments: cancelled ? 0 : 1,
        paidBookings: 0,
        consumingBookings: 0,
      })),
      send: jest.fn(async () => {
        cancelled = true;
      }),
      receipt: jest.fn(async () =>
        cancelled ? ('confirmed' as const) : ('unconfirmed' as const),
      ),
    },
  };
};
test('explicit execution persists intent, sends once and confirms durable receipt plus CRM inventory', async () => {
  const { options, store } = make();
  expect(await executeCalendarCancellation(options)).toEqual({
    status: 'confirmed',
  });
  expect(options.send).toHaveBeenCalledTimes(1);
  expect(store.beginSend).toHaveBeenCalledTimes(1);
  expect(await executeCalendarCancellation(options)).toEqual({
    status: 'confirmed',
  });
  expect(options.send).toHaveBeenCalledTimes(1);
});
test('prepare and disabled execution do not send', async () => {
  const { options } = make();
  expect(
    (await executeCalendarCancellation({ ...options, mode: 'prepare' })).status,
  ).toBe('prepared');
  expect(
    (await executeCalendarCancellation({ ...options, enabled: false })).status,
  ).toBe('disabled');
  expect(options.send).not.toHaveBeenCalled();
});
test('lost POST response is read-confirmed without a second POST', async () => {
  const { options } = make();
  const send = options.send;
  options.send = jest.fn(async () => {
    await send();
    throw Error('Lost reply');
  });
  expect((await executeCalendarCancellation(options)).status).toBe('confirmed');
  expect((await executeCalendarCancellation(options)).status).toBe('confirmed');
  expect(options.send).toHaveBeenCalledTimes(1);
});
test('uncertain POST remains for review and subsequent invocation never sends again', async () => {
  const { options } = make();
  options.send = jest.fn(async () => {
    throw Error('Unknown');
  });
  expect((await executeCalendarCancellation(options)).status).toBe(
    'needs-review',
  );
  expect((await executeCalendarCancellation(options)).status).toBe(
    'needs-review',
  );
  expect(options.send).toHaveBeenCalledTimes(1);
});
test('calendar restored, capabilities absent, or configuration changed cannot send', async () => {
  for (const change of ['calendar', 'capability', 'configuration']) {
    const { options } = make();
    if (change === 'calendar') options.liveCheck.mockResolvedValue(false);
    if (change === 'capability') options.capabilities.mockResolvedValue(false);
    if (change === 'configuration') options.expectedConfigurationVersion = 2;
    expect((await executeCalendarCancellation(options)).status).toBe(
      'needs-review',
    );
    expect(options.send).not.toHaveBeenCalled();
  }
});
test('paid, consumed, or changed booking inventory needs review before send', async () => {
  for (const field of [
    'paidBookings',
    'consumingBookings',
    'attendedBookings',
  ]) {
    const { options } = make();
    const impact = await options.impact();
    options.impact.mockResolvedValue({ ...impact, [field]: 1 });
    expect((await executeCalendarCancellation(options)).status).toBe(
      'needs-review',
    );
    expect(options.send).not.toHaveBeenCalled();
  }
  const { options } = make();
  options.impact.mockResolvedValue({
    ...(await options.impact()),
    bookingIds: [],
    totalBookings: 0,
  });
  expect((await executeCalendarCancellation(options)).status).toBe(
    'needs-review',
  );
  expect(options.send).not.toHaveBeenCalled();
});

test('CRM move after preparation blocks cancellation without another send', async () => {
  const { options } = make();
  expect(
    (await executeCalendarCancellation({ ...options, mode: 'prepare' })).status,
  ).toBe('prepared');
  options.lookup.mockResolvedValue({
    status: 'matched',
    session: { ...session, startsAt: '2099-01-01T11:00:00.000Z' },
  });
  expect((await executeCalendarCancellation(options)).status).toBe(
    'needs-review',
  );
  expect(options.send).not.toHaveBeenCalled();
});
