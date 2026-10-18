import { type DataSource, type EntityManager } from 'typeorm';

import { calendarCrmRecordingKeySchema } from '../crm/calendar-crm-session-reference';
import { type CalendarCrmSession } from '../crm/find-calendar-session';
import { parseCalendarEvent } from '../domain/parse-calendar-event';
import { readCalendarUids } from '../domain/read-calendar-uids';
import {
  renderCrmOriginExport,
  isSameCrmOriginCalendarData,
  type CrmOriginExportCommand,
} from '../domain/render-crm-origin-export';
import { isCalendarEtag } from '../transport/is-calendar-etag';
import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';

export type CalendarCrmExportContext = {
  configurationVersion: number;
  calendarUrl: string;
  timezone: string;
  username: string;
  encryptedAppPassword: string;
};
export type CalendarCrmExportLease = CalendarCrmExportContext & {
  id: string;
  leaseGeneration: number;
  command: CrmOriginExportCommand;
  sendStartedAt: Date | null;
  verifiedAt: Date | null;
};
const sameSession = (left: CalendarCrmSession, right: CalendarCrmSession) =>
  left.id === right.id &&
  left.recordingKey === right.recordingKey &&
  left.name === right.name &&
  Date.parse(left.startsAt) === Date.parse(right.startsAt) &&
  Date.parse(left.endsAt) === Date.parse(right.endsAt) &&
  left.capacity === right.capacity &&
  left.sessionFormat === right.sessionFormat &&
  left.status === right.status;

export class CalendarCrmExportStore {
  constructor(
    private readonly source: DataSource,
    readonly scope: CalendarCrmScope,
    private readonly binding: string,
  ) {}
  private async lock(manager: EntityManager) {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0))",
      [this.scope.workspaceId, this.scope.connectionId],
    );
    await manager.query(
      'SELECT id FROM calendar_sync."calendarConnection" WHERE "workspaceId" = $1 AND id = $2 FOR UPDATE',
      [this.scope.workspaceId, this.scope.connectionId],
    );
  }
  private async context(
    queryable: Pick<DataSource, 'query'>,
  ): Promise<CalendarCrmExportContext | null> {
    const rows: CalendarCrmExportContext[] = await queryable.query(
      `SELECT connection."configurationVersion", connection."calendarUrl", connection.timezone, connection.username, connection."encryptedAppPassword"
      FROM calendar_sync."calendarConnection" connection JOIN calendar_sync."calendarActivation" activation ON activation."workspaceId" = connection."workspaceId" AND activation."connectionId" = connection.id AND activation."configurationVersion" = connection."configurationVersion" AND activation.binding = $3
      WHERE connection."workspaceId" = $1 AND connection.id = $2 AND connection.state = 'ACTIVE' AND connection."lastSuccessfulReadAt" > clock_timestamp() - interval '90 seconds'`,
      [this.scope.workspaceId, this.scope.connectionId, this.binding],
    );
    return rows[0] ?? null;
  }
  async getContext(): Promise<CalendarCrmExportContext | null> {
    return this.context(this.source);
  }
  async prepare(
    command: CrmOriginExportCommand,
    configurationVersion: number,
  ): Promise<'prepared' | 'existing' | 'rejected'> {
    if (
      !calendarCrmRecordingKeySchema.safeParse(command.session.recordingKey)
        .success ||
      command.session.recordingKey.startsWith('session-create:calendar-create:')
    )
      return 'rejected';
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      const context = await this.context(manager);
      if (!context || context.configurationVersion !== configurationVersion)
        return 'rejected';
      const rendered = renderCrmOriginExport({
        ...this.scope,
        calendarUrl: context.calendarUrl,
        session: command.session,
      });
      if (
        rendered.status !== 'prepared' ||
        rendered.command.uid !== command.uid ||
        rendered.command.resourceUrl !== command.resourceUrl ||
        !sameSession(rendered.command.session, command.session) ||
        !isSameCrmOriginCalendarData(
          rendered.command.calendarData,
          command.calendarData,
        )
      )
        return 'rejected';
      const existing: {
        command: CrmOriginExportCommand;
        configurationVersion: number;
        binding: string;
      }[] = await manager.query(
        `SELECT command, "configurationVersion", binding FROM calendar_sync."calendarCrmExportIntent" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "classSessionId" = $3`,
        [this.scope.workspaceId, this.scope.connectionId, command.session.id],
      );
      if (existing[0])
        return existing[0].configurationVersion === configurationVersion &&
          existing[0].binding === this.binding &&
          sameSession(existing[0].command.session, command.session) &&
          existing[0].command.uid === command.uid &&
          existing[0].command.resourceUrl === command.resourceUrl &&
          isSameCrmOriginCalendarData(
            existing[0].command.calendarData,
            command.calendarData,
          )
          ? 'existing'
          : 'rejected';
      const links = await manager.query(
        `SELECT 1 FROM calendar_sync."calendarSessionLink" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND (uid = $3 OR "classSessionId" = $4)`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          command.uid,
          command.session.id,
        ],
      );
      if (links.length) return 'rejected';
      const resources: { calendarData: string; url: string }[] =
        await manager.query(
          `SELECT "calendarData", url FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL`,
          [this.scope.workspaceId, this.scope.connectionId],
        );
      for (const resource of resources) {
        const uids = readCalendarUids(resource.calendarData);
        if (
          !uids ||
          uids.includes(command.uid) ||
          resource.url === command.resourceUrl
        )
          return 'rejected';
      }
      await manager.query(
        `INSERT INTO calendar_sync."calendarCrmExportIntent" ("workspaceId", "connectionId", "classSessionId", uid, "resourceUrl", command, "configurationVersion", binding, "calendarUrl", timezone) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          command.session.id,
          command.uid,
          command.resourceUrl,
          JSON.stringify(command),
          configurationVersion,
          this.binding,
          context.calendarUrl,
          context.timezone,
        ],
      );
      return 'prepared';
    });
  }
  async claimNext(): Promise<CalendarCrmExportLease | null> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      const context = await this.context(manager);
      if (!context) return null;
      await manager.query(
        `UPDATE calendar_sync."calendarCrmExportIntent" SET state = 'NEEDS_REVIEW', reason = 'CRM_EXPORT_CONFIGURATION_CHANGED', "leaseUntil" = NULL, "updatedAt" = clock_timestamp()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND state = 'RUNNING' AND "leaseUntil" <= clock_timestamp()
          AND (binding <> $3 OR "configurationVersion" <> $4 OR "calendarUrl" <> $5 OR timezone <> $6)`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          this.binding,
          context.configurationVersion,
          context.calendarUrl,
          context.timezone,
        ],
      );
      const rows: CalendarCrmExportLease[] = await manager.query(
        `WITH candidate AS (
        SELECT id FROM calendar_sync."calendarCrmExportIntent" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND binding = $3 AND "configurationVersion" = $4
        AND state IN ('PREPARED','WRITTEN','RUNNING') AND "nextAttemptAt" <= clock_timestamp() AND ("leaseUntil" IS NULL OR "leaseUntil" <= clock_timestamp())
        ORDER BY (state = 'RUNNING') DESC, "nextAttemptAt", id LIMIT 1 FOR UPDATE
      ), claimed AS (UPDATE calendar_sync."calendarCrmExportIntent" intent SET state = 'RUNNING', "leaseGeneration" = "leaseGeneration" + 1, "leaseUntil" = clock_timestamp() + interval '120 seconds', "updatedAt" = clock_timestamp() FROM candidate WHERE intent.id = candidate.id
      AND NOT EXISTS(SELECT 1 FROM calendar_sync."calendarCrmExportIntent" running WHERE running."workspaceId" = $1 AND running."connectionId" = $2 AND running.state = 'RUNNING' AND running.id <> candidate.id)
      RETURNING intent.id, intent.command, intent."leaseGeneration", intent."sendStartedAt", intent."verifiedAt") SELECT * FROM claimed`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          this.binding,
          context.configurationVersion,
        ],
      );
      return rows[0] ? { ...rows[0], ...context } : null;
    });
  }
  private async current(
    manager: Pick<DataSource, 'query'>,
    lease: CalendarCrmExportLease,
  ): Promise<boolean> {
    const rows = await manager.query(
      `SELECT intent.id FROM calendar_sync."calendarCrmExportIntent" intent JOIN calendar_sync."calendarConnection" connection ON connection."workspaceId" = intent."workspaceId" AND connection.id = intent."connectionId" JOIN calendar_sync."calendarActivation" activation ON activation."workspaceId" = connection."workspaceId" AND activation."connectionId" = connection.id AND activation."configurationVersion" = connection."configurationVersion" AND activation.binding = intent.binding
      WHERE intent.id = $3 AND intent."workspaceId" = $1 AND intent."connectionId" = $2 AND intent.binding = $4 AND intent.state = 'RUNNING' AND intent."leaseGeneration" = $5 AND intent."leaseUntil" > clock_timestamp() AND connection.state = 'ACTIVE' AND connection."lastSuccessfulReadAt" > clock_timestamp() - interval '90 seconds' AND connection."configurationVersion" = intent."configurationVersion" AND intent."configurationVersion" = $6 AND connection."calendarUrl" = intent."calendarUrl" AND connection.timezone = intent.timezone AND intent.command = $7::jsonb`,
      [
        this.scope.workspaceId,
        this.scope.connectionId,
        lease.id,
        this.binding,
        lease.leaseGeneration,
        lease.configurationVersion,
        JSON.stringify(lease.command),
      ],
    );
    return rows.length === 1;
  }
  async authorize(lease: CalendarCrmExportLease): Promise<boolean> {
    return this.current(this.source, lease);
  }
  async beginSend(lease: CalendarCrmExportLease): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      if (!(await this.current(manager, lease))) return false;
      const resources: { calendarData: string; url: string }[] =
        await manager.query(
          'SELECT "calendarData", url FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL',
          [this.scope.workspaceId, this.scope.connectionId],
        );
      for (const resource of resources) {
        const uids = readCalendarUids(resource.calendarData);
        if (
          !uids ||
          uids.includes(lease.command.uid) ||
          resource.url === lease.command.resourceUrl
        )
          return false;
      }
      const rows = await manager.query(
        `WITH updated AS (UPDATE calendar_sync."calendarCrmExportIntent" SET "sendStartedAt" = COALESCE("sendStartedAt",clock_timestamp()), "updatedAt" = clock_timestamp() WHERE id = $1 AND "sendStartedAt" IS NULL AND "leaseUntil" > clock_timestamp() + interval '35 seconds' RETURNING id) SELECT * FROM updated`,
        [lease.id],
      );
      return rows.length === 1;
    });
  }
  async recordVerified(
    lease: CalendarCrmExportLease,
    etag: string,
    calendarData: string,
  ): Promise<boolean> {
    if (
      !isCalendarEtag(etag) ||
      !isSameCrmOriginCalendarData(lease.command.calendarData, calendarData)
    )
      return false;
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      if (!(await this.current(manager, lease))) return false;
      await manager.query(
        'UPDATE calendar_sync."calendarCrmExportIntent" SET "verifiedAt" = clock_timestamp(), "verifiedEtag" = $2 WHERE id = $1',
        [lease.id, etag],
      );
      return true;
    });
  }
  private async settle(
    lease: CalendarCrmExportLease,
    state: 'NEEDS_REVIEW' | 'WRITTEN' | 'PREPARED',
    reason: string,
  ): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      if (!(await this.current(manager, lease))) return false;
      await manager.query(
        `UPDATE calendar_sync."calendarCrmExportIntent" SET state = CASE WHEN $2 = 'PREPARED' AND "verifiedAt" IS NOT NULL THEN 'WRITTEN' ELSE $2 END, reason = $3, "leaseUntil" = NULL, "nextAttemptAt" = clock_timestamp() + interval '60 seconds', "updatedAt" = clock_timestamp() WHERE id = $1`,
        [lease.id, state, reason],
      );
      return true;
    });
  }
  async settleReview(
    lease: CalendarCrmExportLease,
    reason: string,
  ): Promise<boolean> {
    return this.settle(lease, 'NEEDS_REVIEW', reason);
  }
  async retry(lease: CalendarCrmExportLease, reason: string): Promise<boolean> {
    return this.settle(
      lease,
      lease.verifiedAt ? 'WRITTEN' : 'PREPARED',
      reason,
    );
  }
  async finalize(
    lease: CalendarCrmExportLease,
    currentSession: CalendarCrmSession,
  ): Promise<'finalized' | 'waiting-for-poll' | 'review' | 'stale'> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      if (!(await this.current(manager, lease))) return 'stale';
      const review = async (reason: string) => {
        await manager.query(
          `UPDATE calendar_sync."calendarCrmExportIntent" SET state = 'NEEDS_REVIEW', reason = $2, "leaseUntil" = NULL, "updatedAt" = clock_timestamp() WHERE id = $1`,
          [lease.id, reason],
        );
        return 'review' as const;
      };
      if (!sameSession(lease.command.session, currentSession))
        return review('CRM_EXPORT_SOURCE_CHANGED');
      const proof: { verifiedAt: Date | null; verifiedEtag: string | null }[] =
        await manager.query(
          'SELECT "verifiedAt", "verifiedEtag" FROM calendar_sync."calendarCrmExportIntent" WHERE id = $1',
          [lease.id],
        );
      if (!proof[0]?.verifiedAt || !proof[0].verifiedEtag)
        return 'waiting-for-poll';
      const resources: {
        id: string;
        url: string;
        calendarData: string;
        resourceVersion: number;
        etag: string;
      }[] = await manager.query(
        `SELECT id, url, "calendarData", "resourceVersion", etag FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      let occurrences = 0;
      for (const resource of resources) {
        const uids = readCalendarUids(resource.calendarData);
        if (!uids) return review('CRM_EXPORT_UNVERIFIABLE_UIDS');
        occurrences += uids.filter((uid) => uid === lease.command.uid).length;
      }
      const resource = resources.find(
        (item) => item.url === lease.command.resourceUrl,
      );
      if (!resource) return 'waiting-for-poll';
      if (
        occurrences !== 1 ||
        !isSameCrmOriginCalendarData(
          lease.command.calendarData,
          resource.calendarData,
        )
      )
        return review('CRM_EXPORT_RESOURCE_CHANGED_OR_DUPLICATE');
      if (resource.etag !== proof[0].verifiedEtag) return 'waiting-for-poll';
      const parsed = parseCalendarEvent(resource.calendarData, {
        timezone: lease.timezone,
      });
      if (parsed.status !== 'parsed' || parsed.event.uid !== lease.command.uid)
        return review('CRM_EXPORT_INVALID_EVENT');
      const base = {
        name: currentSession.name,
        interval: {
          startsAt: new Date(currentSession.startsAt).toISOString(),
          endsAt: new Date(currentSession.endsAt).toISOString(),
          timezone: parsed.event.timezone,
        },
      };
      const links: {
        uid: string;
        classSessionId: string;
        resourceId: string;
        recordingKey: string;
      }[] = await manager.query(
        `SELECT uid, "classSessionId", "resourceId", "recordingKey" FROM calendar_sync."calendarSessionLink" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND (uid = $3 OR "classSessionId" = $4)`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          lease.command.uid,
          currentSession.id,
        ],
      );
      if (
        links.length &&
        (links.length !== 1 ||
          links[0].uid !== lease.command.uid ||
          links[0].classSessionId !== currentSession.id ||
          links[0].resourceId !== resource.id ||
          links[0].recordingKey !== currentSession.recordingKey)
      )
        return review('CRM_EXPORT_LINK_IDENTITY_CONFLICT');
      await manager.query(
        `INSERT INTO calendar_sync."calendarSessionLink" ("workspaceId", "connectionId", uid, "recurrenceKey", "classSessionId", "resourceId", "recordingKey", "observedSession", "commonBase", "baseResourceVersion", "baseEtag") VALUES ($1,$2,$3,'single',$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)
      ON CONFLICT ("workspaceId", "connectionId", uid, "recurrenceKey") DO UPDATE SET "observedSession" = EXCLUDED."observedSession", "commonBase" = EXCLUDED."commonBase", "baseResourceVersion" = EXCLUDED."baseResourceVersion", "baseEtag" = EXCLUDED."baseEtag", "updatedAt" = clock_timestamp()`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          lease.command.uid,
          currentSession.id,
          resource.id,
          currentSession.recordingKey,
          JSON.stringify(currentSession),
          JSON.stringify(base),
          resource.resourceVersion,
          resource.etag,
        ],
      );
      await manager.query(
        `UPDATE calendar_sync."calendarInbox" SET state = 'APPLIED' WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "resourceId" = $3 AND "resourceVersion" = $4 AND kind = 'UPSERT'`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          resource.id,
          resource.resourceVersion,
        ],
      );
      await manager.query(
        `UPDATE calendar_sync."calendarCrmReconciliation" reconciliation SET decision = 'LINKED', reason = NULL, "leaseUntil" = NULL FROM calendar_sync."calendarInbox" inbox WHERE inbox.id = reconciliation."inboxId" AND inbox."workspaceId" = $1 AND inbox."connectionId" = $2 AND inbox."resourceId" = $3 AND inbox."resourceVersion" = $4`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          resource.id,
          resource.resourceVersion,
        ],
      );
      await manager.query(
        `INSERT INTO calendar_sync."calendarDescriptionRefresh" ("workspaceId", "connectionId", uid, "recurrenceKey") VALUES ($1,$2,$3,'single') ON CONFLICT DO NOTHING`,
        [this.scope.workspaceId, this.scope.connectionId, lease.command.uid],
      );
      await manager.query(
        `UPDATE calendar_sync."calendarCrmExportIntent" SET state = 'CONFIRMED', reason = NULL, "leaseUntil" = NULL, "updatedAt" = clock_timestamp() WHERE id = $1`,
        [lease.id],
      );
      return 'finalized';
    });
  }
}
