import { createCalendarCancellationImpactReader } from '../read-calendar-cancellation-impact';

const sessionId = 'd7559474-49ce-4881-8ed1-d994ef52d1b5';
const booking = {
  id: 'f4071e4f-93a5-49be-afcd-3d319c116eb7',
  classSession: { id: sessionId },
  status: 'BOOKED',
  paymentStatus: 'PAID',
  consumesVisit: true,
};
const body = (bookings: unknown[] = [booking], hasNextPage = false) => ({
  data: {
    studioBookings: {
      edges: bookings.map((node) => ({ node })),
      pageInfo: { hasNextPage },
    },
  },
});
const reader = (response: unknown, httpStatus = 200) => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(
      new Response(JSON.stringify(response), { status: httpStatus }),
    );
  return {
    request,
    read: createCalendarCancellationImpactReader({
      baseUrl: 'https://crm.example.test',
      apiToken: 'test',
      fetch: request,
    }),
  };
};
it('reads booking impact without requesting names or issuing a mutation', async () => {
  const { read, request } = reader(body());
  expect(await read(sessionId)).toEqual({
    status: 'read',
    bookingIds: [booking.id],
    totalBookings: 1,
    activeBookings: 1,
    attendedBookings: 0,
    expectedPayments: 0,
    paidBookings: 1,
    consumingBookings: 1,
  });
  const payload = JSON.parse(String(request.mock.calls[0][1]?.body));
  expect(payload.query).toContain('query CalendarCancellationImpact');
  expect(payload.query).not.toContain('mutation');
  expect(payload.query).not.toContain('person');
  expect(payload.variables.sessionId).toBe(sessionId);
});
it('accepts only a complete empty result as no bookings', async () => {
  expect(await reader(body([])).read(sessionId)).toMatchObject({
    status: 'read',
    totalBookings: 0,
  });
});
it.each([
  body([booking], true),
  body([booking, booking]),
  body([{ ...booking, classSession: { id: booking.id } }]),
  body([{ ...booking, status: 'UNKNOWN' }]),
  body([{ ...booking, paymentStatus: 'UNKNOWN' }]),
  { ...body(), errors: [{ message: 'Partial result' }] },
  {},
])(
  'does not convert an invalid or incomplete response to no bookings',
  async (value) => {
    expect((await reader(value).read(sessionId)).status).toBe('needs-review');
  },
);
it.each([401, 403, 500])(
  'handles HTTP %s without assuming an empty impact',
  async (status) => {
    expect((await reader({}, status).read(sessionId)).status).toBe(
      status === 401
        ? 'auth-required'
        : status === 403
          ? 'forbidden'
          : 'unavailable',
    );
  },
);
