import { CoreApiClient } from 'twenty-client-sdk/core';

import { type CreateSplitBookingInput, type SplitSession, validateSplitBooking } from 'src/logic-functions/utils/split-booking';

type RelatedRecord = { id: string } | null;
type Pair = { id: string; firstPerson: RelatedRecord; secondPerson: RelatedRecord };
type Membership = { id: string; status: string; visitsAvailable: number; visitsReserved: number; pair: RelatedRecord; product: RelatedRecord };

export type CreateSplitBookingResult =
  | { success: true; duplicate: boolean; bookingIds: string[] }
  | { success: false; status: number; code: string; message: string };

const first = async <TData>(client: CoreApiClient, key: string, args: object, fields: object): Promise<TData | null> => {
  const result = await client.query({ [key]: { __args: args, edges: { node: fields } } } as never) as unknown as Record<string, { edges?: Array<{ node: TData }> }>;
  return result[key]?.edges?.[0]?.node ?? null;
};
const fail = (status: number, code: string, message: string): CreateSplitBookingResult => ({ success: false, status, code, message });

export const createSplitBooking = async (rawInput: CreateSplitBookingInput, client = new CoreApiClient()): Promise<CreateSplitBookingResult> => {
  const input = { pairId: String(rawInput.pairId ?? '').trim(), membershipId: String(rawInput.membershipId ?? '').trim(), classSessionId: String(rawInput.classSessionId ?? '').trim(), idempotencyKey: String(rawInput.idempotencyKey ?? '').trim() };
  const [pair, membership, session] = await Promise.all([
    first<Pair>(client, 'studioPairs', { filter: { id: { eq: input.pairId } }, first: 1 }, { id: true, firstPerson: { id: true }, secondPerson: { id: true } }),
    first<Membership>(client, 'studioMemberships', { filter: { id: { eq: input.membershipId } }, first: 1 }, { id: true, status: true, visitsAvailable: true, visitsReserved: true, pair: { id: true }, product: { id: true } }),
    first<SplitSession>(client, 'classSessions', { filter: { id: { eq: input.classSessionId } }, first: 1 }, { id: true, sessionFormat: true, status: true, startsAt: true, capacity: true, bookedCount: true }),
  ]);
  if (!pair) return fail(404, 'PAIR_NOT_FOUND', 'Пара не найдена.');
  if (!membership || membership.pair?.id !== input.pairId || membership.status !== 'ACTIVE') return fail(409, 'MEMBERSHIP_NOT_ACTIVE', 'У пары нет активного общего блока.');
  if (!session) return fail(404, 'SESSION_NOT_FOUND', 'Слот не найден.');
  const validation = validateSplitBooking(input, session, membership.visitsAvailable);
  if (!validation.success) return { ...validation, status: 409 };
  if (!pair.firstPerson || !pair.secondPerson) return fail(409, 'INVALID_PAIR', 'В паре должны быть два участника.');
  const bookingKey = `split-booking:${input.idempotencyKey}`;
  const existing = (await client.query({ studioBookings: { __args: { filter: { externalId: { startsWith: bookingKey } }, first: 2 }, edges: { node: { id: true } } } } as never)) as unknown as { studioBookings?: { edges?: Array<{ node: { id: string } }> } };
  const bookingIds = existing.studioBookings?.edges?.map(({ node }) => node.id) ?? [];
  if (bookingIds.length === 2) return { success: true, duplicate: true, bookingIds };
  const personIds = [pair.firstPerson.id, pair.secondPerson.id];
  for (const [index, personId] of personIds.entries()) {
    const created = (await client.mutation({ createStudioBooking: { __args: { data: { name: `Сплит · ${session.startsAt.slice(0, 16)}`, bookingType: 'SPLIT', status: 'BOOKED', bookedAt: new Date().toISOString(), consumesVisit: false, externalId: `${bookingKey}:${index}`, personId, membershipId: membership.id, productId: membership.product?.id, pairId: pair.id, classSessionId: session.id } }, id: true } } as never)) as unknown as { createStudioBooking: { id: string } };
    bookingIds.push(created.createStudioBooking.id);
  }
  await client.mutation({ createMembershipTransaction: { __args: { data: { name: `Резерв сплита · ${session.startsAt.slice(0, 16)}`, transactionType: 'RESERVE', visitDelta: -1, daysDelta: 0, occurredAt: new Date().toISOString(), idempotencyKey: `split-reserve:${input.idempotencyKey}`, reason: 'Запись пары на совместный слот', membershipId: membership.id, bookingId: bookingIds[0] } }, id: true } } as never);
  await client.mutation({ updateStudioMembership: { __args: { id: membership.id, data: { visitsReserved: membership.visitsReserved + 1, visitsAvailable: membership.visitsAvailable - 1 } }, id: true } } as never);
  await client.mutation({ updateClassSession: { __args: { id: session.id, data: { bookedCount: session.bookedCount + 2 } }, id: true } } as never);
  return { success: true, duplicate: false, bookingIds };
};
