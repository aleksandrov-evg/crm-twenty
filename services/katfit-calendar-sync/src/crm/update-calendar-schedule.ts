import { createHash } from 'node:crypto';

import { z } from 'zod';

import { createCalendarScheduleCapabilityCheck } from './check-calendar-schedule-capabilities';

import { SESSION_FORMATS } from '../domain/prepare-calendar-session';
import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';
import {
  type CalendarCrmSession,
  type CalendarSessionLookup,
} from './find-calendar-session';

const instantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const scheduleSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200),
    startsAt: instantSchema,
    endsAt: instantSchema,
  })
  .refine((value) => {
    const minutes =
      (Date.parse(value.endsAt) - Date.parse(value.startsAt)) / 60000;
    return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440;
  });
export const calendarScheduleUpdateSchema = z.strictObject({
  expected: z.strictObject({
    id: z.uuid(),
    recordingKey: z
      .string()
      .regex(/^session-create:calendar-create:[a-f0-9]{64}$/),
    name: z.string().min(1).max(200),
    startsAt: instantSchema,
    endsAt: instantSchema,
    sessionFormat: z.enum(SESSION_FORMATS),
    capacity: z.number().int().min(1).max(100),
    status: z.enum(['PLANNED', 'CONFIRMED']),
  }),
  target: scheduleSchema,
});
export type CalendarScheduleUpdate = z.input<
  typeof calendarScheduleUpdateSchema
>;
export type CalendarScheduleUpdateResult = {
  status:
    | 'applied'
    | 'conflict'
    | 'auth-required'
    | 'forbidden'
    | 'unconfirmed'
    | 'invalid-command'
    | 'past-session';
};

const responseSchema = z.object({
  success: z.literal(true),
  classSessionId: z.uuid(),
  duplicate: z.boolean(),
});
const conflictSchema = z.object({
  success: z.literal(false),
  code: z.enum([
    'SESSION_SNAPSHOT_CONFLICT',
    'SESSION_BOOKINGS_INCOMPATIBLE',
    'SESSION_MEMBERSHIP_DATE_CONFLICT',
    'SESSION_ALREADY_STARTED',
  ]),
});

export const matchesCalendarScheduleTarget = (
  session: CalendarCrmSession,
  command: CalendarScheduleUpdate,
): boolean =>
  session.id === command.expected.id &&
  session.recordingKey === command.expected.recordingKey &&
  session.sessionFormat === command.expected.sessionFormat &&
  session.capacity === command.expected.capacity &&
  session.status === command.expected.status &&
  session.name === command.target.name &&
  Date.parse(session.startsAt) === Date.parse(command.target.startsAt) &&
  Date.parse(session.endsAt) === Date.parse(command.target.endsAt);

export const createCalendarScheduleUpdater = (
  configuration: CalendarCrmConfiguration,
  now: () => Date = () => new Date(),
) => {
  const request = createCalendarCrmRequest(configuration);
  const checkCapabilities =
    createCalendarScheduleCapabilityCheck(configuration);
  return async (
    input: CalendarScheduleUpdate,
  ): Promise<CalendarScheduleUpdateResult> => {
    const parsed = calendarScheduleUpdateSchema.safeParse(input);
    if (!parsed.success) return { status: 'invalid-command' };
    const command = parsed.data;
    const currentTime = now();
    if (
      !Number.isFinite(currentTime.getTime()) ||
      Date.parse(command.expected.startsAt) <= currentTime.getTime() ||
      Date.parse(command.target.startsAt) <= currentTime.getTime()
    )
      return { status: 'past-session' };
    const capabilities = await checkCapabilities();
    if (capabilities !== 'ready') return { status: capabilities };
    const response = await request('/s/studio/sessions/update', {
      method: 'POST',
      body: JSON.stringify({
        classSessionId: command.expected.id,
        idempotencyKey: `calendar-schedule:${createHash('sha256').update(JSON.stringify(command)).digest('hex')}`,
        expected: {
          recordingKey: command.expected.recordingKey,
          name: command.expected.name,
          startsAt: command.expected.startsAt,
          endsAt: command.expected.endsAt,
          sessionFormat: command.expected.sessionFormat,
          capacity: command.expected.capacity,
          status: command.expected.status,
        },
        target: {
          ...command.target,
          sessionFormat: command.expected.sessionFormat,
          capacity: command.expected.capacity,
        },
      }),
    });
    if (response.status === 'unconfirmed') return response;
    if (response.httpStatus === 401) return { status: 'auth-required' };
    if (response.httpStatus === 403) return { status: 'forbidden' };
    if (
      response.httpStatus === 409 &&
      conflictSchema.safeParse(response.body).success
    )
      return { status: 'conflict' };
    const body = responseSchema.safeParse(response.body);
    if (
      response.httpStatus !== 200 ||
      !body.success ||
      body.data.classSessionId !== command.expected.id
    )
      return { status: 'unconfirmed' };
    return { status: 'applied' };
  };
};

export const recoverCalendarScheduleUpdate = async (
  input: CalendarScheduleUpdate,
  dependencies: {
    lookup: (recordingKey: string) => Promise<CalendarSessionLookup>;
    send: (
      command: CalendarScheduleUpdate,
    ) => Promise<CalendarScheduleUpdateResult>;
    authorizeSend: () => Promise<boolean>;
  },
): Promise<CalendarScheduleUpdateResult> => {
  const parsed = calendarScheduleUpdateSchema.safeParse(input);
  if (!parsed.success) return { status: 'invalid-command' };
  // Detach the frozen command from caller-owned objects before awaiting network IO.
  const command = parsed.data;
  const inspect = async (): Promise<CalendarScheduleUpdateResult | null> => {
    const found = await dependencies.lookup(command.expected.recordingKey);
    if (found.status === 'auth-required' || found.status === 'forbidden')
      return { status: found.status };
    if (found.status !== 'matched')
      return {
        status:
          found.status === 'not-found' || found.status === 'ambiguous'
            ? 'conflict'
            : 'unconfirmed',
      };
    if (matchesCalendarScheduleTarget(found.session, command))
      return { status: 'applied' };
    if (
      !Object.entries(command.expected).every(([field, value]) => {
        const actual = found.session[field as keyof typeof command.expected];
        return field === 'startsAt' || field === 'endsAt'
          ? Date.parse(String(actual)) === Date.parse(String(value))
          : actual === value;
      })
    )
      return { status: 'conflict' };
    return null;
  };
  try {
    const before = await inspect();
    const needsGatewayReceipt =
      command.expected.name !== command.target.name ||
      Date.parse(command.expected.startsAt) !==
        Date.parse(command.target.startsAt) ||
      Date.parse(command.expected.endsAt) !== Date.parse(command.target.endsAt);
    if (before && (before.status !== 'applied' || !needsGatewayReceipt))
      return before;
    if (!(await dependencies.authorizeSend())) return { status: 'unconfirmed' };
    const sent = await dependencies.send(command);
    // A matching target can precede a failed audit; only the durable gateway receipt confirms completion.
    if (sent.status !== 'applied') return sent;
    return (await inspect()) ?? { status: 'unconfirmed' };
  } catch {
    return { status: 'unconfirmed' };
  }
};
