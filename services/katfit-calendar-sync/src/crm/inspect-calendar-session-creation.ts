import { z } from 'zod';

import {
  calendarSessionCommandSchema,
  type CalendarSessionCommand,
} from '../domain/create-calendar-session-command';
import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';
import { type CalendarCrmSession } from './find-calendar-session';
import { createCalendarSessionLookup } from './find-calendar-session';

const auditResponseSchema = z.object({
  data: z.object({
    studioEvents: z
      .array(
        z.object({
          id: z.uuid(),
          classSessionId: z.uuid(),
          eventType: z.string(),
          outcome: z.string(),
          idempotencyKey: z.string(),
          details: z.string(),
        }),
      )
      .max(2),
  }),
  pageInfo: z.object({ hasNextPage: z.boolean() }),
});
const creationRequestSchema = z.object({
  status: z.literal('PLANNED'),
  participants: z.tuple([]),
  attendanceReason: z.literal(''),
});
const auditDetailsSchema = creationRequestSchema.extend({
  name: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  capacity: z.number().int(),
});

export type CalendarCreationInspection =
  | {
      status: 'confirmed';
      classSessionId: string;
      recordingKey: string;
      session?: CalendarCrmSession;
    }
  | { status: 'incomplete'; classSessionId: string }
  | { status: 'absent' | 'unavailable' | 'auth-required' | 'forbidden' }
  | { status: 'needs-review'; reason: string };

export const createCalendarCreationInspector = (
  configuration: CalendarCrmConfiguration,
) => {
  const lookup = createCalendarSessionLookup(configuration);
  const request = createCalendarCrmRequest(configuration);
  return async (
    rawCommand: CalendarSessionCommand,
  ): Promise<CalendarCreationInspection> => {
    const command = calendarSessionCommandSchema.parse(rawCommand);
    const recordingKey = `session-create:${command.idempotencyKey}`;
    const result = await lookup(recordingKey);
    if (result.status === 'not-found') return { status: 'absent' };
    if (
      result.status === 'unavailable' ||
      result.status === 'auth-required' ||
      result.status === 'forbidden'
    )
      return { status: result.status };
    if (result.status !== 'matched')
      return {
        status: 'needs-review',
        reason: `CRM_${result.status.toUpperCase().replaceAll('-', '_')}`,
      };
    const session = result.session;
    if (session.sessionFormat !== command.sessionFormat)
      return { status: 'needs-review', reason: 'UNVERIFIED_SESSION_FORMAT' };
    try {
      if (
        !creationRequestSchema.safeParse(
          JSON.parse(session.creationRequest ?? ''),
        ).success
      )
        return {
          status: 'needs-review',
          reason: 'UNVERIFIED_CREATION_REQUEST',
        };
    } catch {
      return { status: 'needs-review', reason: 'UNVERIFIED_CREATION_REQUEST' };
    }
    const query = new URLSearchParams({
      limit: '2',
      depth: '0',
      filter: `id[eq]:${session.id}`,
    });
    const response = await request(`/rest/studioEvents?${query}`, {
      method: 'GET',
    });
    if (response.status === 'unconfirmed') return { status: 'unavailable' };
    if (response.httpStatus === 401) return { status: 'auth-required' };
    if (response.httpStatus === 403) return { status: 'forbidden' };
    if (response.httpStatus !== 200) return { status: 'unavailable' };
    const parsed = auditResponseSchema.safeParse(response.body);
    if (!parsed.success)
      return { status: 'needs-review', reason: 'INVALID_AUDIT_RESPONSE' };
    const events = parsed.data.data.studioEvents;
    if (parsed.data.pageInfo.hasNextPage || events.length > 1)
      return { status: 'needs-review', reason: 'AMBIGUOUS_CREATION_AUDIT' };
    const endsAt = new Date(
      Date.parse(command.startsAt) + command.durationMinutes * 60000,
    ).toISOString();
    const event = events[0];
    if (event) {
      if (
        event.id !== session.id ||
        event.classSessionId !== session.id ||
        event.eventType !== 'SESSION_CREATED' ||
        event.outcome !== 'SUCCESS' ||
        event.idempotencyKey !== command.idempotencyKey
      )
        return {
          status: 'needs-review',
          reason: 'CREATION_AUDIT_IDENTITY_MISMATCH',
        };
      try {
        const details = auditDetailsSchema.safeParse(JSON.parse(event.details));
        if (
          !details.success ||
          details.data.name !== command.name ||
          details.data.capacity !== command.capacity ||
          Date.parse(details.data.startsAt) !== Date.parse(command.startsAt) ||
          Date.parse(details.data.endsAt) !== Date.parse(endsAt)
        )
          return {
            status: 'needs-review',
            reason: 'CREATION_AUDIT_PAYLOAD_MISMATCH',
          };
      } catch {
        return { status: 'needs-review', reason: 'INVALID_AUDIT_DETAILS' };
      }
      return {
        status: 'confirmed',
        classSessionId: session.id,
        recordingKey,
        session,
      };
    }
    if (
      session.name !== command.name ||
      session.sessionFormat !== command.sessionFormat ||
      session.capacity !== command.capacity ||
      session.status !== 'PLANNED' ||
      Date.parse(session.startsAt) !== Date.parse(command.startsAt) ||
      Date.parse(session.endsAt) !== Date.parse(endsAt)
    )
      return {
        status: 'needs-review',
        reason: 'SESSION_CHANGED_WITHOUT_CREATION_AUDIT',
      };
    return { status: 'incomplete', classSessionId: session.id };
  };
};
