import ICAL from 'ical.js';

import {
  type CrmOriginExportCommand,
  crmOriginExportCommandSchema,
  isSameCrmOriginCalendarData,
} from '../domain/render-crm-origin-export';
import { parseCalendarEvent } from '../domain/parse-calendar-event';
import { prepareCalendarSession } from '../domain/prepare-calendar-session';
import { isCalendarResourceUrl } from './read-calendar-snapshot';
import { readCalendarResource } from './read-calendar-resource';
import { writeCalDavResource } from './write-caldav-resource';

export type CrmOriginExportResult =
  | { status: 'confirmed'; etag: string; calendarData: string }
  | {
      status:
        | 'conflict'
        | 'auth-required'
        | 'forbidden'
        | 'unconfirmed'
        | 'invalid-command'
        | 'past-session'
        | 'not-authorized';
    };
export const executeCrmOriginExport = async (
  command: CrmOriginExportCommand,
  dependencies: {
    calendarUrl: string;
    fetch: typeof globalThis.fetch;
    authorizeCreate?: () => Promise<boolean>;
    now?: () => Date;
  },
): Promise<CrmOriginExportResult> => {
  try {
    if (!crmOriginExportCommandSchema.safeParse(command).success)
      return { status: 'invalid-command' };
    const digest = /^katfit-crm-([a-f0-9]{64})@katfit$/.exec(command.uid)?.[1];
    const currentTime = () => dependencies.now?.() ?? new Date();
    if (
      !digest ||
      !isCalendarResourceUrl(dependencies.calendarUrl, command.resourceUrl) ||
      !new URL(command.resourceUrl).pathname.endsWith(
        `/katfit-crm-${digest}.ics`,
      ) ||
      Buffer.byteLength(command.calendarData) > 2 * 1024 * 1024
    )
      return { status: 'invalid-command' };
    const parsed = parseCalendarEvent(command.calendarData, {
      timezone: 'UTC',
    });
    const prepared = prepareCalendarSession({
      calendarData: command.calendarData,
      workspaceId: '00000000-0000-4000-8000-000000000000',
      connectionId: '00000000-0000-4000-8000-000000000001',
      options: { timezone: 'UTC' },
      now: new Date(Date.parse(command.session.startsAt) - 1),
    });
    const calendar = ICAL.Component.fromString(command.calendarData);
    const event = calendar.getFirstSubcomponent('vevent');
    if (
      parsed.status !== 'parsed' ||
      parsed.event.uid !== command.uid ||
      prepared.decision !== 'READY' ||
      !event ||
      event.getAllProperties('x-katfit-session-id').length !== 1 ||
      event.getFirstPropertyValue('x-katfit-session-id') !==
        command.session.id ||
      parsed.event.name !== command.session.name ||
      Date.parse(parsed.event.startsAt) !==
        Date.parse(command.session.startsAt) ||
      Date.parse(parsed.event.endsAt) !== Date.parse(command.session.endsAt) ||
      prepared.candidate.sessionFormat !== command.session.sessionFormat ||
      prepared.candidate.capacity !== command.session.capacity ||
      !['PLANNED', 'CONFIRMED'].includes(command.session.status)
    )
      return { status: 'invalid-command' };
    const inspect = async (): Promise<
      CrmOriginExportResult | { status: 'not-found' }
    > => {
      const read = await readCalendarResource(
        dependencies.calendarUrl,
        command.resourceUrl,
        dependencies.fetch,
      );
      if (read.status === 'read')
        return isSameCrmOriginCalendarData(
          command.calendarData,
          read.calendarData,
        )
          ? {
              status: 'confirmed',
              etag: read.etag,
              calendarData: read.calendarData,
            }
          : { status: 'conflict' };
      if (
        read.status === 'not-found' ||
        read.status === 'auth-required' ||
        read.status === 'forbidden'
      )
        return { status: read.status };
      return {
        status: read.status === 'invalid-resource' ? 'conflict' : 'unconfirmed',
      };
    };
    const before = await inspect();
    if (before.status !== 'not-found') return before;
    const now = currentTime();
    if (
      !Number.isFinite(now.getTime()) ||
      Date.parse(command.session.startsAt) <= now.getTime()
    )
      return { status: 'past-session' };
    if (dependencies.authorizeCreate && !(await dependencies.authorizeCreate()))
      return { status: 'not-authorized' };
    const sendTime = currentTime();
    if (
      !Number.isFinite(sendTime.getTime()) ||
      Date.parse(command.session.startsAt) <= sendTime.getTime()
    )
      return { status: 'past-session' };
    const written = await writeCalDavResource({
      calendarUrl: dependencies.calendarUrl,
      resourceUrl: command.resourceUrl,
      operation: { action: 'create', calendarData: command.calendarData },
      fetch: dependencies.fetch,
    });
    const after = await inspect();
    if (after.status !== 'not-found') return after;
    if (written.status === 'auth-required' || written.status === 'forbidden')
      return { status: written.status };
    return {
      status: written.status === 'conflict' ? 'conflict' : 'unconfirmed',
    };
  } catch {
    return { status: 'unconfirmed' };
  }
};
