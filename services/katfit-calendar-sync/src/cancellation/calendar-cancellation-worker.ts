import { type CalendarCancellationImpact } from '../crm/read-calendar-cancellation-impact';
import { type CalendarSessionLookup } from '../crm/find-calendar-session';
import { observeCancellationOutcome } from '../domain/observe-cancellation-outcome';
import { parseCalendarEvent } from '../domain/parse-calendar-event';
import { readCalendarCancellation } from '../domain/read-calendar-cancellation';
import { readCalendarUids } from '../domain/read-calendar-uids';
import { type CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import {
  CalendarCancellationStore,
  type CalendarCancellationObservation,
} from '../storage/calendar-cancellation.store';
import {
  createYandexCalDavTransport,
  type YandexCalDavTransport,
} from '../transport/create-yandex-caldav-transport';
import { readCalendarResource } from '../transport/read-calendar-resource';
import { normalizeCalendarScheduleData } from '../schedule/calendar-schedule-payload';

export class CalendarCancellationWorker {
  constructor(
    private readonly store: CalendarCancellationStore,
    private readonly cipher: CalendarCredentialCipher,
    private readonly lookup: (key: string) => Promise<CalendarSessionLookup>,
    private readonly impact: (
      id: string,
    ) => Promise<CalendarCancellationImpact>,
    private readonly transport: typeof createYandexCalDavTransport = createYandexCalDavTransport,
  ) {}

  async runOnce(): Promise<'idle' | 'saved' | 'stale'> {
    const source = await this.store.takeCandidate();
    if (!source) return 'idle';
    const classification = readCalendarCancellation(
      source.calendarData,
      source.uid,
      source.timezone,
    );
    const missing = source.missingSinceGeneration !== null;
    if (!missing && classification.status === 'not-cancelled') {
      const restored = parseCalendarEvent(source.calendarData, {
        timezone: source.timezone,
      });
      return restored.status === 'parsed' && restored.event.uid === source.uid
        ? this.store.save(source, null)
        : 'idle';
    }
    const kind = missing ? ('MISSING' as const) : ('CANCELLED' as const);
    const evidence: Record<string, unknown> = {
      calendarConfirmed: false,
      classSessionId: source.classSessionId,
      resourceVersion: source.resourceVersion,
      readGeneration: source.readGeneration,
      missingSinceGeneration: source.missingSinceGeneration,
    };
    let initialBookingIds: string[] | undefined;
    const save = (
      state: CalendarCancellationObservation['state'],
      reason: string,
    ) =>
      this.store.save(source, {
        kind,
        state,
        reason,
        evidence,
        initialBookingIds,
      });
    if (classification.status === 'needs-review')
      return save('NEEDS_REVIEW', classification.reason);
    if (
      missing &&
      parseCalendarEvent(source.calendarData, { timezone: source.timezone })
        .status !== 'parsed' &&
      classification.status !== 'cancelled'
    )
      return save('NEEDS_REVIEW', 'UNSUPPORTED_MISSING_EVENT');
    const resources = await this.store.presentResources();
    let occurrences = 0;
    for (const resource of resources) {
      const identifiers = readCalendarUids(resource.calendarData);
      if (!identifiers)
        return save('NEEDS_REVIEW', 'UNVERIFIABLE_CALENDAR_UIDS');
      occurrences += identifiers.filter((uid) => uid === source.uid).length;
    }
    if (occurrences !== (missing ? 0 : 1))
      return save(
        'NEEDS_REVIEW',
        missing ? 'UID_RELOCATED_OR_DUPLICATE' : 'DUPLICATE_CANCELLATION_UID',
      );
    if (missing && !source.missingMature)
      return save(
        'AWAITING_CONFIRMATION',
        'SECOND_INVENTORY_AND_DELAY_REQUIRED',
      );
    let transport: YandexCalDavTransport | undefined;
    try {
      transport = this.transport({
        username: source.username,
        appPassword: this.cipher.open(
          { ...this.store.scope, username: source.username },
          source.encryptedAppPassword,
        ),
      });
      const live = await readCalendarResource(
        source.calendarUrl,
        source.resourceUrl,
        transport.fetch,
      );
      if (missing ? live.status !== 'not-found' : live.status !== 'read')
        return save('AWAITING_CONFIRMATION', 'LIVE_CANCELLATION_NOT_CONFIRMED');
      if (
        !missing &&
        live.status === 'read' &&
        (live.etag !== source.etag ||
          normalizeCalendarScheduleData(live.calendarData) !==
            normalizeCalendarScheduleData(source.calendarData))
      )
        return save(
          'AWAITING_CONFIRMATION',
          'CALENDAR_CHANGED_DURING_CANCELLATION_CHECK',
        );
      evidence.calendarConfirmed = true;
      const found = await this.lookup(source.recordingKey);
      if (found.status !== 'matched')
        return save(
          'NEEDS_REVIEW',
          `CRM_${found.status.toUpperCase().replaceAll('-', '_')}`,
        );
      const session = found.session;
      if (
        session.id !== source.classSessionId ||
        session.recordingKey !== source.recordingKey
      )
        return save('NEEDS_REVIEW', 'CRM_CANCELLATION_IDENTITY_CHANGED');
      evidence.session = {
        id: session.id,
        name: session.name,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        status: session.status,
      };
      if (
        session.status !== 'CANCELLED_BY_STUDIO' &&
        (!['PLANNED', 'CONFIRMED'].includes(session.status) ||
          Date.parse(session.startsAt) <= Date.now())
      )
        return save('NEEDS_REVIEW', 'PAST_OR_NON_EDITABLE_CRM_SESSION');
      const impact = await this.impact(session.id);
      evidence.impact = impact;
      if (session.status === 'CANCELLED_BY_STUDIO') {
        const outcome = observeCancellationOutcome({
          initialBookingIds: source.initialBookingIds,
          seenBookingIds: source.seenBookingIds,
          impact,
        });
        if (outcome.status !== 'observed')
          return save('NEEDS_REVIEW', outcome.reason);
        const verified = await this.lookup(source.recordingKey);
        if (
          verified.status !== 'matched' ||
          verified.session.id !== session.id ||
          verified.session.recordingKey !== session.recordingKey ||
          verified.session.status !== 'CANCELLED_BY_STUDIO'
        )
          return save('NEEDS_REVIEW', 'CRM_CANCELLATION_OUTCOME_CHANGED');
        evidence.financialReconciliation =
          'NOT_REQUIRED_FOR_EMPTY_OBSERVED_SESSION';
        return save(
          'CRM_CANCELLED_OBSERVED',
          'EMPTY_CRM_CANCELLATION_OBSERVED',
        );
      }
      if (impact.status !== 'read')
        return save('NEEDS_REVIEW', 'CANCELLATION_IMPACT_UNCONFIRMED');
      initialBookingIds = impact.bookingIds;
      return save(
        'NEEDS_REVIEW',
        impact.totalBookings > 0
          ? 'CANCELLATION_WITH_BOOKING_HISTORY'
          : 'CANCELLATION_REQUIRES_DOMAIN_COMMAND',
      );
    } catch {
      return save('AWAITING_CONFIRMATION', 'CANCELLATION_CHECK_UNAVAILABLE');
    } finally {
      await transport?.close().catch(() => undefined);
    }
  }
}
