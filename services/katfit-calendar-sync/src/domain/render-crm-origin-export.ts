import { createHash } from 'node:crypto';

import ICAL from 'ical.js';
import { z } from 'zod';

import { type CalendarCrmSession } from '../crm/find-calendar-session';
import { isCalendarResourceUrl } from '../transport/read-calendar-snapshot';
import { SESSION_FORMATS } from './prepare-calendar-session';

const sessionSchema = z.object({
  id: z.uuid(),
  recordingKey: z.string(),
  name: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => value.trim().length > 0 && value === value.trim())
    .regex(/^[^\x00-\x1f\x7f]+$/),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  sessionFormat: z.enum(SESSION_FORMATS),
  capacity: z.number().int().min(1).max(100),
  status: z.enum(['PLANNED', 'CONFIRMED']),
  creationRequest: z.string().nullable().optional(),
});
export const crmOriginExportCommandSchema = z.strictObject({
  session: sessionSchema,
  uid: z.string().regex(/^katfit-crm-[a-f0-9]{64}@katfit$/),
  resourceUrl: z.url(),
  calendarData: z
    .string()
    .min(1)
    .max(2 * 1024 * 1024),
});
export type CrmOriginExportCommand = z.infer<
  typeof crmOriginExportCommandSchema
>;
export const renderCrmOriginExport = (
  input: {
    workspaceId: string;
    connectionId: string;
    calendarUrl: string;
    session: CalendarCrmSession;
  },
  now = new Date(),
):
  | { status: 'prepared'; command: CrmOriginExportCommand }
  | { status: 'needs-review'; reason: string } => {
  const parsed = sessionSchema.safeParse(input.session);
  if (
    !z.uuid().safeParse(input.workspaceId).success ||
    !z.uuid().safeParse(input.connectionId).success ||
    !parsed.success ||
    !Number.isFinite(now.getTime())
  )
    return { status: 'needs-review', reason: 'INVALID_CRM_ORIGIN_EXPORT' };
  const session = {
    ...parsed.data,
    startsAt: new Date(parsed.data.startsAt).toISOString(),
    endsAt: new Date(parsed.data.endsAt).toISOString(),
  };
  const minutes =
    (Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60000;
  if (
    Date.parse(session.startsAt) <= now.getTime() ||
    Date.parse(session.startsAt) % 1000 !== 0 ||
    Date.parse(session.endsAt) % 1000 !== 0 ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 1440 ||
    (session.sessionFormat === 'PERSONAL_EQUIPMENT' &&
      session.capacity !== 1) ||
    (session.sessionFormat === 'SPLIT_EQUIPMENT' && session.capacity !== 2)
  )
    return { status: 'needs-review', reason: 'INELIGIBLE_CRM_ORIGIN_SESSION' };
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        input.workspaceId.toLowerCase(),
        input.connectionId.toLowerCase(),
        session.id.toLowerCase(),
      ]),
    )
    .digest('hex');
  const uid = `katfit-crm-${digest}@katfit`;
  let resourceUrl: string;
  try {
    resourceUrl = new URL(
      `katfit-crm-${digest}.ics`,
      input.calendarUrl.endsWith('/')
        ? input.calendarUrl
        : `${input.calendarUrl}/`,
    ).toString();
  } catch {
    return { status: 'needs-review', reason: 'INVALID_CALENDAR_URL' };
  }
  if (!isCalendarResourceUrl(input.calendarUrl, resourceUrl))
    return { status: 'needs-review', reason: 'INVALID_CALENDAR_URL' };
  const calendar = new ICAL.Component(['vcalendar', [], []]);
  calendar.updatePropertyWithValue('version', '2.0');
  calendar.updatePropertyWithValue(
    'prodid',
    '-//KATFIT//CRM Calendar Sync//RU',
  );
  const event = new ICAL.Component('vevent');
  event.updatePropertyWithValue('uid', uid);
  event.updatePropertyWithValue('summary', session.name);
  event.updatePropertyWithValue(
    'dtstart',
    ICAL.Time.fromDateTimeString(session.startsAt.replace('.000Z', 'Z')),
  );
  event.updatePropertyWithValue(
    'dtend',
    ICAL.Time.fromDateTimeString(session.endsAt.replace('.000Z', 'Z')),
  );
  // A frozen event needs a stable timestamp across restarts and repeated preparation.
  event.updatePropertyWithValue(
    'dtstamp',
    ICAL.Time.fromDateTimeString(session.startsAt.replace('.000Z', 'Z')),
  );
  event.updatePropertyWithValue(
    'status',
    session.status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE',
  );
  event.updatePropertyWithValue('x-katfit-session-id', session.id);
  event.updatePropertyWithValue(
    'description',
    `KATFIT:\nformat=${session.sessionFormat}\ncapacity=${session.capacity}`,
  );
  calendar.addSubcomponent(event);
  return {
    status: 'prepared',
    command: { session, uid, resourceUrl, calendarData: calendar.toString() },
  };
};

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
};
const componentFingerprint = (component: ICAL.Component): string =>
  JSON.stringify([
    component.name,
    component
      .getAllProperties()
      .map((property) => JSON.stringify(canonical(property.toJSON())))
      .sort(),
    component.getAllSubcomponents().map(componentFingerprint).sort(),
  ]);
export const isSameCrmOriginCalendarData = (
  expected: string,
  actual: string,
): boolean => {
  try {
    for (const body of [expected, actual]) {
      if (
        (body.match(/^BEGIN:VCALENDAR\r?$/gim) ?? []).length !== 1 ||
        (body.match(/^END:VCALENDAR\r?$/gim) ?? []).length !== 1
      )
        return false;
    }
    return (
      componentFingerprint(ICAL.Component.fromString(expected)) ===
      componentFingerprint(ICAL.Component.fromString(actual))
    );
  } catch {
    return false;
  }
};
