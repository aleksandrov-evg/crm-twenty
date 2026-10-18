import { z } from 'zod';
import {
  calendarCancellationSessionSchema,
  type CalendarCancellationCommand,
} from '../crm/cancel-calendar-session';
import { type CalendarSessionLookup } from '../crm/find-calendar-session';
import { type CalendarCancellationImpact } from '../crm/read-calendar-cancellation-impact';
import { readCalendarCancellation } from '../domain/read-calendar-cancellation';
import { readCalendarUids } from '../domain/read-calendar-uids';
import { type CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import {
  CalendarCancellationExecutionStore,
  type CancellationExecutionSource,
} from '../storage/calendar-cancellation-execution.store';
import { normalizeCalendarScheduleData } from '../schedule/calendar-schedule-payload';
import { createYandexCalDavTransport } from '../transport/create-yandex-caldav-transport';
import { readCalendarResource } from '../transport/read-calendar-resource';

export const executeCalendarCancellation = async (input: {
  store: CalendarCancellationExecutionStore;
  reviewId: string;
  expectedConfigurationVersion: number;
  mode: 'prepare' | 'execute';
  enabled: boolean;
  cipher: CalendarCredentialCipher;
  lookup: (key: string) => Promise<CalendarSessionLookup>;
  impact: (id: string) => Promise<CalendarCancellationImpact>;
  capabilities: () => Promise<boolean>;
  send: (command: CalendarCancellationCommand) => Promise<void>;
  receipt: (
    command: CalendarCancellationCommand,
  ) => Promise<'confirmed' | 'unconfirmed'>;
  liveCheck?: (source: CancellationExecutionSource) => Promise<boolean>;
}): Promise<{
  status: 'prepared' | 'confirmed' | 'needs-review' | 'disabled';
  command?: CalendarCancellationCommand;
}> => {
  const { store } = input;
  const existing = await store.get(input.reviewId);
  if (existing && existing.state !== 'PREPARED') {
    const receipt = await input.receipt(existing.command);
    const source = await store.capture(input.reviewId);
    if (
      !source ||
      source.classSessionId !== existing.command.classSessionId ||
      source.configurationVersion !== input.expectedConfigurationVersion
    )
      return { status: 'needs-review' };
    const found = await input.lookup(source.recordingKey);
    const impact = await input.impact(existing.command.classSessionId);
    const confirmed =
      receipt === 'confirmed' &&
      found.status === 'matched' &&
      found.session.id === existing.command.classSessionId &&
      found.session.status === 'CANCELLED_BY_STUDIO' &&
      impact.status === 'read' &&
      JSON.stringify(impact.bookingIds) ===
        JSON.stringify(existing.command.expectedBookingIds) &&
      impact.activeBookings === 0 &&
      impact.attendedBookings === 0 &&
      impact.expectedPayments === 0 &&
      impact.paidBookings === 0 &&
      impact.consumingBookings === 0;
    await store.settle(input.reviewId, confirmed);
    return { status: confirmed ? 'confirmed' : 'needs-review' };
  }
  if (input.mode === 'execute' && !input.enabled) return { status: 'disabled' };
  const startedAt = Date.now();
  const captured = await store.capture(input.reviewId);
  if (
    !captured ||
    captured.configurationVersion !== input.expectedConfigurationVersion ||
    !(await input.capabilities())
  )
    return { status: 'needs-review' };
  const found = await input.lookup(captured.recordingKey);
  if (
    found.status !== 'matched' ||
    found.session.id !== captured.classSessionId ||
    !['PLANNED', 'CONFIRMED'].includes(found.session.status) ||
    Date.parse(found.session.startsAt) <= Date.now()
  )
    return { status: 'needs-review' };
  const expectedSession = calendarCancellationSessionSchema.safeParse({
    name: found.session.name,
    startsAt: found.session.startsAt,
    endsAt: found.session.endsAt,
    sessionFormat: found.session.sessionFormat,
    capacity: found.session.capacity,
    status: found.session.status,
    recordingKey: found.session.recordingKey,
  });
  if (
    !expectedSession.success ||
    (existing &&
      JSON.stringify(existing.command.expectedSession) !==
        JSON.stringify(expectedSession.data))
  )
    return { status: 'needs-review' };
  const impact = await input.impact(captured.classSessionId);
  const baseline = z
    .array(z.uuid())
    .max(999)
    .safeParse(captured.initialBookingIds);
  const seen = z.array(z.uuid()).max(999).safeParse(captured.seenBookingIds);
  if (
    impact.status !== 'read' ||
    !impact.bookingIds ||
    !baseline.success ||
    !seen.success ||
    JSON.stringify([...baseline.data].sort()) !==
      JSON.stringify(impact.bookingIds) ||
    seen.data.some((id) => !impact.bookingIds!.includes(id)) ||
    impact.attendedBookings ||
    impact.paidBookings ||
    impact.consumingBookings ||
    impact.totalBookings !== impact.bookingIds.length
  )
    return { status: 'needs-review' };
  const resources = await store.presentResources();
  let occurrences = 0;
  for (const resource of resources) {
    const uids = readCalendarUids(resource.calendarData);
    if (!uids) return { status: 'needs-review' };
    occurrences += uids.filter((uid) => uid === captured.uid).length;
  }
  if (
    occurrences !== (captured.missing ? 0 : 1) ||
    captured.kind !== (captured.missing ? 'MISSING' : 'CANCELLED') ||
    (captured.missing && !captured.missingMature) ||
    (!captured.missing &&
      readCalendarCancellation(
        captured.calendarData,
        captured.uid,
        captured.timezone,
      ).status !== 'cancelled')
  )
    return { status: 'needs-review' };
  const liveCheck =
    input.liveCheck ??
    (async (source: CancellationExecutionSource) => {
      const transport = createYandexCalDavTransport({
        username: source.username,
        appPassword: input.cipher.open(
          { ...store.scope, username: source.username },
          source.encryptedAppPassword,
        ),
      });
      try {
        const live = await readCalendarResource(
          source.calendarUrl,
          source.resourceUrl,
          transport.fetch,
        );
        return source.missing
          ? live.status === 'not-found'
          : live.status === 'read' &&
              live.etag === source.etag &&
              normalizeCalendarScheduleData(live.calendarData) ===
                normalizeCalendarScheduleData(source.calendarData);
      } finally {
        await transport.close().catch(() => undefined);
      }
    });
  if (!(await liveCheck(captured))) return { status: 'needs-review' };
  const prepared = await store.prepare(
    captured,
    impact.bookingIds,
    found.session,
  );
  const verified = await input.lookup(captured.recordingKey);
  if (
    verified.status !== 'matched' ||
    verified.session.id !== captured.classSessionId ||
    JSON.stringify(
      calendarCancellationSessionSchema.parse({
        name: verified.session.name,
        startsAt: verified.session.startsAt,
        endsAt: verified.session.endsAt,
        sessionFormat: verified.session.sessionFormat,
        capacity: verified.session.capacity,
        status: verified.session.status,
        recordingKey: verified.session.recordingKey,
      }),
    ) !== JSON.stringify(prepared.command.expectedSession)
  )
    return { status: 'needs-review' };
  if (input.mode === 'prepare')
    return { status: 'prepared', command: prepared.command };
  if (
    Date.now() - startedAt > 60000 ||
    prepared.state !== 'PREPARED' ||
    !(await store.beginSend(captured))
  )
    return { status: 'needs-review' };
  try {
    await input.send(prepared.command);
  } catch {
    /* The durable SENDING marker permits observation, never another automatic POST. */
  }
  const receipt = await input.receipt(prepared.command);
  const after = await input.lookup(captured.recordingKey);
  const afterImpact = await input.impact(captured.classSessionId);
  const confirmed =
    receipt === 'confirmed' &&
    after.status === 'matched' &&
    after.session.id === captured.classSessionId &&
    after.session.status === 'CANCELLED_BY_STUDIO' &&
    afterImpact.status === 'read' &&
    JSON.stringify(afterImpact.bookingIds) ===
      JSON.stringify(prepared.command.expectedBookingIds) &&
    afterImpact.activeBookings === 0 &&
    afterImpact.attendedBookings === 0 &&
    afterImpact.expectedPayments === 0 &&
    afterImpact.paidBookings === 0 &&
    afterImpact.consumingBookings === 0;
  await store.settle(input.reviewId, confirmed);
  return { status: confirmed ? 'confirmed' : 'needs-review' };
};
