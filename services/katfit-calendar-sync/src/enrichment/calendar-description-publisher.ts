import { createHash } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { type CalendarSessionLookup } from '../crm/find-calendar-session';
import { type CalendarRoster } from '../crm/read-calendar-roster';
import { enrichCalendarEvent } from '../domain/enrich-calendar-event';
import { prepareCalendarSession } from '../domain/prepare-calendar-session';
import { type CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import { type CalendarOperation } from '../storage/calendar-operation';
import { type CalendarCrmScope } from '../storage/calendar-crm-reconciliation.store';
import { StudioCalendarOperationStore } from '../storage/studio-calendar-operation.store';
import {
  createYandexCalDavTransport,
  type YandexCalDavTransport,
} from '../transport/create-yandex-caldav-transport';
import { readCalendarResource } from '../transport/read-calendar-resource';
import { writeCalDavResource } from '../transport/write-caldav-resource';
import {
  calendarDescriptionPayloadSchema,
  type CalendarDescriptionPayload,
} from './calendar-description-payload';

const normalize = (text: string): string => text.replace(/\r\n|\r/g, '\n');
const sourceMatches = (text: string, hash: string): boolean =>
  [text, normalize(text), normalize(text).replace(/\n/g, '\r\n')].some(
    (value) => createHash('sha256').update(value).digest('hex') === hash,
  );

export class CalendarDescriptionPublisher {
  private readonly operations: StudioCalendarOperationStore;
  constructor(
    private readonly source: DataSource,
    private readonly scope: CalendarCrmScope,
    private readonly binding: string,
    private readonly cipher: CalendarCredentialCipher,
    private readonly lookup: (key: string) => Promise<CalendarSessionLookup>,
    private readonly roster: (id: string) => Promise<CalendarRoster>,
    private readonly transport: typeof createYandexCalDavTransport = createYandexCalDavTransport,
  ) {
    this.operations = new StudioCalendarOperationStore(source);
  }

  private async context(
    operation: CalendarOperation,
    payload: CalendarDescriptionPayload,
  ) {
    const rows: { username: string; encryptedAppPassword: string }[] =
      await this.source.query(
        `SELECT connection.username, connection."encryptedAppPassword"
      FROM calendar_sync."calendarConnection" connection
      JOIN calendar_sync."calendarActivation" activation ON activation."connectionId" = connection.id AND activation."workspaceId" = connection."workspaceId"
      JOIN calendar_sync."calendarSessionLink" link ON link."connectionId" = connection.id AND link."workspaceId" = connection."workspaceId"
      JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId" AND resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId"
      JOIN calendar_sync."studioCalendarOperation" operation ON operation."connectionId" = connection.id AND operation."workspaceId" = connection."workspaceId"
      WHERE connection."workspaceId" = $1 AND connection.id = $2 AND connection.state = 'ACTIVE' AND connection."configurationVersion" = $3
        AND activation."configurationVersion" = connection."configurationVersion" AND activation.binding = $4
        AND link.uid = $5 AND link."classSessionId" = $6 AND link."commonBase" IS NOT NULL AND link."recordingKey" = $7
        AND connection."calendarUrl" = $8 AND resource.id = $9 AND resource.url = $10 AND resource."resourceVersion" = $11
        AND resource.etag = $12 AND resource."contentHash" = $13 AND resource."missingSinceGeneration" IS NULL
        AND operation.id = $14 AND operation.state = 'RUNNING' AND operation."leaseGeneration" = $15
        AND operation."leaseUntil" > clock_timestamp() + interval '35 seconds'`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          payload.configurationVersion,
          this.binding,
          payload.uid,
          payload.classSessionId,
          payload.recordingKey,
          payload.calendarUrl,
          payload.resourceId,
          payload.resourceUrl,
          payload.resourceVersion,
          payload.expectedEtag,
          payload.sourceHash,
          operation.id,
          operation.leaseGeneration,
        ],
      );
    return rows[0] ?? null;
  }

  async runOnce(): Promise<'idle' | 'saved' | 'stale'> {
    const active: { id: string }[] = await this.source.query(
      `SELECT connection.id FROM calendar_sync."calendarConnection" connection
      JOIN calendar_sync."calendarActivation" activation ON activation."connectionId" = connection.id AND activation."workspaceId" = connection."workspaceId"
      WHERE connection."workspaceId" = $1 AND connection.id = $2 AND connection.state = 'ACTIVE'
        AND activation."configurationVersion" = connection."configurationVersion" AND activation.binding = $3`,
      [this.scope.workspaceId, this.scope.connectionId, this.binding],
    );
    if (!active[0]) return 'idle';
    const operation = await this.operations.claimNext(
      this.scope,
      120,
      'EXPORT_EVENT',
    );
    if (!operation) return 'idle';
    const lease = {
      ...this.scope,
      id: operation.id,
      leaseGeneration: operation.leaseGeneration,
    };
    const settle = async (
      state: 'SUCCEEDED' | 'CONFLICT' | 'FAILED' | 'SUPERSEDED',
      errorCode?: string,
    ) =>
      (await this.operations.settle(lease, { state, errorCode }))
        ? ('saved' as const)
        : ('stale' as const);
    const retry = async () =>
      (await this.operations.settle(lease, {
        state: 'RETRY',
        delaySeconds: 60,
        errorCode: 'DESCRIPTION_PUBLICATION_UNCONFIRMED',
        requiresReconciliation: true,
      }))
        ? ('saved' as const)
        : ('stale' as const);
    const parsed = calendarDescriptionPayloadSchema.safeParse(
      operation.payload,
    );
    if (!parsed.success)
      return settle('FAILED', 'INVALID_DESCRIPTION_OPERATION');
    const payload = parsed.data;
    let transport: YandexCalDavTransport | undefined;
    try {
      const context = await this.context(operation, payload);
      if (!context) return settle('SUPERSEDED', 'PUBLICATION_CONTEXT_CHANGED');
      const session = await this.lookup(payload.recordingKey);
      if (session.status === 'unavailable') return retry();
      if (
        session.status !== 'matched' ||
        session.session.id !== payload.classSessionId
      )
        return settle('CONFLICT', 'CRM_SESSION_IDENTITY_CHANGED');
      const currentRoster = await this.roster(payload.classSessionId);
      if (currentRoster.status === 'unavailable') return retry();
      if (currentRoster.status !== 'read')
        return settle('FAILED', 'CRM_ROSTER_UNAVAILABLE');
      if (currentRoster.rosterHash !== payload.rosterHash)
        return settle('SUPERSEDED', 'ROSTER_CHANGED');
      transport = this.transport({
        username: context.username,
        appPassword: this.cipher.open(
          { ...this.scope, username: context.username },
          context.encryptedAppPassword,
        ),
      });
      const remote = await readCalendarResource(
        payload.calendarUrl,
        payload.resourceUrl,
        transport.fetch,
      );
      if (remote.status === 'unavailable') return retry();
      if (remote.status !== 'read')
        return settle(
          'CONFLICT',
          `CALDAV_${remote.status.toUpperCase().replaceAll('-', '_')}`,
        );
      const expectedPatch = enrichCalendarEvent({
        calendarData: remote.calendarData,
        uid: payload.uid,
        classSessionId: payload.classSessionId,
        participants: currentRoster.participants,
      });
      if (
        expectedPatch.status !== 'rendered' ||
        normalize(expectedPatch.calendarData) !==
          normalize(payload.calendarData)
      )
        return settle('CONFLICT', 'DESCRIPTION_PATCH_NO_LONGER_MATCHES');
      if (normalize(remote.calendarData) === normalize(payload.calendarData))
        return settle('SUCCEEDED');
      if (
        remote.etag !== payload.expectedEtag ||
        !sourceMatches(remote.calendarData, payload.sourceHash)
      )
        return settle('CONFLICT', 'CALENDAR_RESOURCE_CHANGED');
      const candidate = prepareCalendarSession({
        workspaceId: this.scope.workspaceId,
        connectionId: this.scope.connectionId,
        calendarData: remote.calendarData,
        now: new Date(),
        options: { timezone: 'UTC' },
      });
      if (
        candidate.decision !== 'READY' ||
        candidate.candidate.uid !== payload.uid ||
        !['PLANNED', 'CONFIRMED'].includes(session.session.status) ||
        candidate.candidate.name !== session.session.name ||
        candidate.candidate.sessionFormat !== session.session.sessionFormat ||
        candidate.candidate.capacity !== session.session.capacity ||
        Date.parse(candidate.candidate.startsAt) !==
          Date.parse(session.session.startsAt) ||
        Date.parse(candidate.candidate.endsAt) !==
          Date.parse(session.session.endsAt)
      )
        return settle('CONFLICT', 'SCHEDULE_CHANGED_BEFORE_ENRICHMENT');
      if (!(await this.context(operation, payload)))
        return settle('SUPERSEDED', 'PUBLICATION_CONTEXT_CHANGED');
      const written = await writeCalDavResource({
        calendarUrl: payload.calendarUrl,
        resourceUrl: payload.resourceUrl,
        operation: {
          action: 'update',
          calendarData: payload.calendarData,
          expectedEtag: remote.etag,
        },
        fetch: transport.fetch,
      });
      if (written.status === 'conflict' || written.status === 'not-found')
        return settle('CONFLICT', 'CALDAV_CONDITIONAL_WRITE_CONFLICT');
      if (!['written', 'unconfirmed', 'retryable'].includes(written.status))
        return settle('FAILED', 'CALDAV_WRITE_REJECTED');
      const verified = await readCalendarResource(
        payload.calendarUrl,
        payload.resourceUrl,
        transport.fetch,
      );
      if (
        verified.status === 'read' &&
        normalize(verified.calendarData) === normalize(payload.calendarData)
      )
        return settle('SUCCEEDED');
      return retry();
    } catch {
      return retry();
    } finally {
      await transport?.close().catch(() => undefined);
    }
  }
}
