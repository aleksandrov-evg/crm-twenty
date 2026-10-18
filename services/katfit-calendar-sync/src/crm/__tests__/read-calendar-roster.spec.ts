import { randomUUID } from 'node:crypto';

import { createCalendarRosterReader } from '../read-calendar-roster';

const sessionId = randomUUID();
const booking = (firstName = 'Анна', lastName = 'Иванова') => ({
  id: randomUUID(),
  classSession: { id: sessionId },
  status: 'BOOKED',
  person: { id: randomUUID(), name: { firstName, lastName } },
});
const page = (bookings: unknown[], hasNextPage = false) =>
  Response.json({
    data: {
      studioBookings: {
        edges: bookings.map((node) => ({ node })),
        pageInfo: { hasNextPage },
      },
    },
  });
const read = (response: Response) =>
  createCalendarRosterReader({
    baseUrl: 'https://crm.test',
    apiToken: 'test-only',
    fetch: jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response),
  })(sessionId);

describe('CRM participant roster', () => {
  it('keeps distinct clients with identical names and omits cancellations', async () => {
    const first = booking(),
      second = booking();
    const result = await read(
      page([first, second, { ...booking(), status: 'CANCELLED_IN_TIME' }]),
    );
    expect(result).toMatchObject({
      status: 'read',
      participants: expect.arrayContaining([
        { personId: first.person.id, name: 'Анна Иванова' },
        { personId: second.person.id, name: 'Анна Иванова' },
      ]),
    });
    if (result.status === 'read') expect(result.participants).toHaveLength(2);
  });
  it('preserves stored spelling and an empty surname', async () => {
    expect(await read(page([booking('Анна-Мария', '')]))).toMatchObject({
      status: 'read',
      participants: [{ name: 'Анна-Мария' }],
    });
  });
  it('accepts an explicitly empty complete roster', async () => {
    expect(await read(page([]))).toMatchObject({
      status: 'read',
      participants: [],
    });
  });
  it.each([
    page([booking('', '')]),
    page([{ ...booking(), person: null }]),
    page([{ ...booking(), classSession: { id: randomUUID() } }]),
    page([booking()], true),
    Response.json({
      data: { studioBookings: null },
      errors: [{ message: 'denied' }],
    }),
  ])(
    'never clears participants on incomplete or invalid data',
    async (response) => {
      expect(await read(response)).toMatchObject({ status: 'needs-review' });
    },
  );
  it('rejects duplicate active bookings for one person', async () => {
    const first = booking();
    expect(
      await read(page([first, { ...first, id: randomUUID() }])),
    ).toMatchObject({
      status: 'needs-review',
      reason: 'DUPLICATE_OR_EXCESSIVE_PARTICIPANTS',
    });
  });
});
