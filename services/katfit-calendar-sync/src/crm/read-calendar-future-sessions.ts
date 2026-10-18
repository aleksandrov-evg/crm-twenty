import { z } from 'zod';

import { calendarCrmRecordingKeySchema } from './calendar-crm-session-reference';
import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';
import {
  calendarCrmSessionSchema,
  type CalendarCrmSession,
  type CalendarSessionLookup,
} from './find-calendar-session';

const fields =
  'id recordingKey name startsAt endsAt capacity sessionFormat status creationRequest mutationLock';
const sessionWithOptionalReferenceSchema = calendarCrmSessionSchema.extend({
  recordingKey: z.string().nullable(),
  mutationLock: z.string().nullable(),
});
const cursorSchema = z.string().min(1).max(4096);
const pageSchema = z.object({
  errors: z.array(z.unknown()).max(0).optional(),
  data: z.object({
    classSessions: z.object({
      edges: z
        .array(z.object({ node: sessionWithOptionalReferenceSchema }))
        .max(100),
      pageInfo: z.object({
        hasNextPage: z.boolean(),
        endCursor: cursorSchema.nullable(),
      }),
    }),
  }),
});
export type CalendarFutureSessions =
  | {
      status: 'read';
      sessions: CalendarCrmSession[];
      needsReview: {
        id: string;
        reason: 'MISSING_RECORDING_KEY' | 'UNSUPPORTED_RECORDING_KEY';
      }[];
    }
  | {
      status:
        | 'auth-required'
        | 'forbidden'
        | 'unavailable'
        | 'invalid-response'
        | 'limit-exceeded';
    };
const query = `query CalendarFutureSessions($filter: ClassSessionFilterInput!, $after: String) {
  classSessions(filter: $filter, first: 100, after: $after) { edges { node { ${fields} } } pageInfo { hasNextPage endCursor } }
}`;
const isFutureEditable = (
  session: z.infer<typeof sessionWithOptionalReferenceSchema>,
  now: Date,
): boolean => {
  const minutes =
    (Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60000;
  return (
    (session.mutationLock === null || session.mutationLock === '') &&
    Number.isFinite(now.getTime()) &&
    Date.parse(session.startsAt) > now.getTime() &&
    ['PLANNED', 'CONFIRMED'].includes(session.status) &&
    session.name.trim().length > 0 &&
    session.name.length <= 200 &&
    Number.isInteger(minutes) &&
    minutes >= 1 &&
    minutes <= 1440
  );
};
export const createCalendarFutureSessionsReader = (
  configuration: CalendarCrmConfiguration,
  now: () => Date = () => new Date(),
) => {
  const request = createCalendarCrmRequest(configuration);
  return async (): Promise<CalendarFutureSessions> => {
    const startedAt = now();
    if (!Number.isFinite(startedAt.getTime()))
      return { status: 'invalid-response' };
    const sessions: CalendarCrmSession[] = [];
    const needsReview: {
      id: string;
      reason: 'MISSING_RECORDING_KEY' | 'UNSUPPORTED_RECORDING_KEY';
    }[] = [];
    const identifiers = new Set<string>(),
      keys = new Set<string>(),
      cursors = new Set<string>();
    let after: string | null = null;
    for (let page = 0; page < 20; page++) {
      const response = await request('/graphql', {
        method: 'POST',
        body: JSON.stringify({
          query,
          variables: {
            filter: {
              and: [
                { startsAt: { gt: startedAt.toISOString() } },
                { status: { in: ['PLANNED', 'CONFIRMED'] } },
                {
                  or: [
                    { mutationLock: { is: 'NULL' } },
                    { mutationLock: { eq: '' } },
                  ],
                },
              ],
            },
            after,
          },
        }),
      });
      if (response.status === 'unconfirmed') return { status: 'unavailable' };
      if (response.httpStatus === 401) return { status: 'auth-required' };
      if (response.httpStatus === 403) return { status: 'forbidden' };
      if (response.httpStatus !== 200) return { status: 'unavailable' };
      const parsed = pageSchema.safeParse(response.body);
      if (!parsed.success) return { status: 'invalid-response' };
      const connection = parsed.data.data.classSessions;
      for (const { node } of connection.edges) {
        if (
          !isFutureEditable(node, now()) ||
          identifiers.has(node.id.toLowerCase())
        )
          return { status: 'invalid-response' };
        identifiers.add(node.id.toLowerCase());
        const recordingKey = calendarCrmRecordingKeySchema.safeParse(
          node.recordingKey,
        );
        if (!recordingKey.success) {
          needsReview.push({
            id: node.id,
            reason:
              node.recordingKey === null || node.recordingKey === ''
                ? 'MISSING_RECORDING_KEY'
                : 'UNSUPPORTED_RECORDING_KEY',
          });
          continue;
        }
        if (keys.has(recordingKey.data)) return { status: 'invalid-response' };
        keys.add(recordingKey.data);
        sessions.push(
          calendarCrmSessionSchema.parse({
            ...node,
            recordingKey: recordingKey.data,
          }),
        );
      }
      if (!connection.pageInfo.hasNextPage)
        return { status: 'read', sessions, needsReview };
      const cursor = connection.pageInfo.endCursor;
      if (!cursor || cursors.has(cursor) || connection.edges.length === 0)
        return { status: 'invalid-response' };
      cursors.add(cursor);
      after = cursor;
    }
    return { status: 'limit-exceeded' };
  };
};

export const createCalendarSessionByIdLookup = (
  configuration: CalendarCrmConfiguration,
) => {
  const request = createCalendarCrmRequest(configuration);
  return async (id: string): Promise<CalendarSessionLookup> => {
    if (!z.uuid().safeParse(id).success)
      throw Error('INVALID_CALENDAR_SESSION_ID');
    const response = await request('/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: `query CalendarSessionById($id: UUID!) { classSessions(filter: {id: {eq: $id}}, first: 2) { edges { node { ${fields} } } pageInfo { hasNextPage } } }`,
        variables: { id },
      }),
    });
    if (response.status === 'unconfirmed') return { status: 'unavailable' };
    if (response.httpStatus === 401) return { status: 'auth-required' };
    if (response.httpStatus === 403) return { status: 'forbidden' };
    if (response.httpStatus !== 200) return { status: 'unavailable' };
    const parsed = z
      .object({
        errors: z.array(z.unknown()).max(0).optional(),
        data: z.object({
          classSessions: z.object({
            edges: z
              .array(
                z.object({
                  node: calendarCrmSessionSchema.extend({
                    mutationLock: z.string().nullable(),
                  }),
                }),
              )
              .max(2),
            pageInfo: z.object({ hasNextPage: z.boolean() }),
          }),
        }),
      })
      .safeParse(response.body);
    if (!parsed.success) return { status: 'invalid-response' };
    const connection = parsed.data.data.classSessions;
    if (
      connection.edges.some(
        ({ node }) =>
          node.id.toLowerCase() !== id.toLowerCase() ||
          !calendarCrmRecordingKeySchema.safeParse(node.recordingKey).success,
      )
    )
      return { status: 'invalid-response' };
    if (
      connection.edges.some(
        ({ node }) => node.mutationLock !== null && node.mutationLock !== '',
      )
    )
      return { status: 'unavailable' };
    if (connection.pageInfo.hasNextPage || connection.edges.length > 1)
      return { status: 'ambiguous' };
    return connection.edges.length === 0
      ? { status: 'not-found' }
      : {
          status: 'matched',
          session: calendarCrmSessionSchema.parse(connection.edges[0].node),
        };
  };
};
