import { createHash } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { type CalendarCrmSession } from '../crm/find-calendar-session';
import { type SessionScheduleSnapshot } from '../domain/merge-session-schedule';
import { planCalendarSchedule } from '../domain/plan-calendar-schedule';
import { readCalendarUids } from '../domain/read-calendar-uids';
import { renderCalendarSchedule } from '../domain/render-calendar-schedule';
import {
  calendarSchedulePayloadSchema,
  type CalendarSchedulePayload,
  normalizeCalendarScheduleData,
} from '../schedule/calendar-schedule-payload';
import { type CalendarOperation } from './calendar-operation';
import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';
import { enqueueCalendarOperation } from './studio-calendar-operation.store';

type ScheduleSource = {
  uid: string;
  classSessionId: string;
  recordingKey: string;
  commonBase: SessionScheduleSnapshot;
  configurationVersion: number;
  timezone: string;
  calendarUrl: string;
  resourceId: string;
  resourceVersion: number;
  resourceUrl: string;
  etag: string;
  calendarData: string;
};

export class CalendarScheduleStore {
  constructor(
    private readonly source: DataSource,
    readonly scope: CalendarCrmScope,
    private readonly binding: string,
  ) {}

  private async lock(queryable: Pick<DataSource, 'query'>) {
    await queryable.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0))",
      [this.scope.workspaceId, this.scope.connectionId],
    );
    await queryable.query(
      'SELECT id FROM calendar_sync."calendarConnection" WHERE "workspaceId" = $1 AND id = $2 FOR UPDATE',
      [this.scope.workspaceId, this.scope.connectionId],
    );
  }

  async takeCandidate(): Promise<ScheduleSource | null> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      const rows: ScheduleSource[] = await manager.query(
        `SELECT link.uid, link."classSessionId", link."recordingKey", link."commonBase",
        connection."configurationVersion", connection.timezone, connection."calendarUrl",
        resource.id AS "resourceId", resource."resourceVersion", resource.url AS "resourceUrl", resource.etag, resource."calendarData"
        FROM calendar_sync."calendarSessionLink" link
        JOIN calendar_sync."calendarConnection" connection ON connection.id = link."connectionId" AND connection."workspaceId" = link."workspaceId"
        JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId" AND resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId"
        WHERE link."workspaceId" = $1 AND link."connectionId" = $2 AND connection.state IN ('PREVIEW', 'ACTIVE')
          AND link."commonBase" IS NOT NULL AND link."scheduleReviewReason" IS NULL
          AND link."nextScheduleCheckAt" <= clock_timestamp() AND resource."missingSinceGeneration" IS NULL
          AND NOT EXISTS (SELECT 1 FROM calendar_sync."studioCalendarOperation" operation WHERE operation."workspaceId" = $1 AND operation."connectionId" = $2
            AND operation.action = 'RECONCILE_RESOURCE' AND operation."resourceKey" = link.uid AND operation.state IN ('PENDING', 'RUNNING', 'RETRY'))
        ORDER BY link."nextScheduleCheckAt", link.uid LIMIT 1 FOR UPDATE OF link`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const candidate = rows[0];
      if (!candidate) return null;
      await manager.query(
        `UPDATE calendar_sync."calendarSessionLink" SET "nextScheduleCheckAt" = clock_timestamp() + interval '60 seconds'
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [this.scope.workspaceId, this.scope.connectionId, candidate.uid],
      );
      return candidate;
    });
  }

  async prepare(
    candidate: ScheduleSource,
    session: CalendarCrmSession,
  ): Promise<'saved' | 'stale' | 'unchanged'> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      const current = await manager.query(
        `SELECT link.uid FROM calendar_sync."calendarSessionLink" link
        JOIN calendar_sync."calendarConnection" connection ON connection.id = link."connectionId" AND connection."workspaceId" = link."workspaceId"
        JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId" AND resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId"
        WHERE link."workspaceId" = $1 AND link."connectionId" = $2 AND link.uid = $3
          AND link."classSessionId" = $4 AND link."recordingKey" = $5 AND link."commonBase" = $6::jsonb AND link."scheduleReviewReason" IS NULL
          AND connection.state IN ('PREVIEW', 'ACTIVE') AND connection."configurationVersion" = $7
          AND resource.id = $8 AND resource."resourceVersion" = $9 AND resource.etag = $10 AND resource."calendarData" = $11
          AND resource."missingSinceGeneration" IS NULL
          AND NOT EXISTS (SELECT 1 FROM calendar_sync."studioCalendarOperation" operation WHERE operation."workspaceId" = $1 AND operation."connectionId" = $2
            AND operation.action = 'RECONCILE_RESOURCE' AND operation."resourceKey" = $3 AND operation.state IN ('PENDING', 'RUNNING', 'RETRY'))`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          candidate.uid,
          candidate.classSessionId,
          candidate.recordingKey,
          JSON.stringify(candidate.commonBase),
          candidate.configurationVersion,
          candidate.resourceId,
          candidate.resourceVersion,
          candidate.etag,
          candidate.calendarData,
        ],
      );
      if (!current[0]) return 'stale';
      const review = async (reason: string) => {
        await manager.query(
          `UPDATE calendar_sync."calendarSessionLink" SET "scheduleReviewReason" = $4 WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
          [
            this.scope.workspaceId,
            this.scope.connectionId,
            candidate.uid,
            reason,
          ],
        );
        return 'saved' as const;
      };
      if (!(await this.uniqueUid(manager, candidate.uid)))
        return review('SCHEDULE_DUPLICATE_OR_UNVERIFIABLE_UID');
      const plan = planCalendarSchedule({
        ...this.scope,
        ...candidate,
        base: candidate.commonBase,
        calendarData: candidate.calendarData,
        session,
        now: new Date(),
      });
      if (plan.status !== 'planned') return review(plan.reason);
      const rendered = renderCalendarSchedule({
        calendarData: candidate.calendarData,
        uid: candidate.uid,
        snapshot: plan.snapshot,
      });
      if (rendered.status !== 'rendered') return review(rendered.reason);
      const payload = calendarSchedulePayloadSchema.parse({
        kind: 'SYNC_SCHEDULE',
        uid: candidate.uid,
        configurationVersion: candidate.configurationVersion,
        resourceId: candidate.resourceId,
        resourceVersion: candidate.resourceVersion,
        calendarUrl: candidate.calendarUrl,
        resourceUrl: candidate.resourceUrl,
        expectedEtag: candidate.etag,
        sourceData: candidate.calendarData,
        calendarData: rendered.calendarData,
        base: candidate.commonBase,
        snapshot: plan.snapshot,
        command: {
          expected: plan.expectedCrm,
          target: {
            name: plan.snapshot.name,
            startsAt: plan.snapshot.interval.startsAt,
            endsAt: plan.snapshot.interval.endsAt,
          },
        },
      });
      if (
        !plan.updateCrm &&
        !plan.updateCalendar &&
        JSON.stringify(payload.base) === JSON.stringify(payload.snapshot)
      )
        return 'unchanged';
      const hash = createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
      await enqueueCalendarOperation(manager, {
        ...this.scope,
        resourceKey: candidate.uid,
        action: 'RECONCILE_RESOURCE',
        idempotencyKey: `calendar-schedule:${hash}`,
        payload,
      });
      return 'saved';
    });
  }

  private async uniqueUid(
    queryable: Pick<DataSource, 'query'>,
    uid: string,
  ): Promise<boolean> {
    const resources: { calendarData: string }[] = await queryable.query(
      `SELECT "calendarData" FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL`,
      [this.scope.workspaceId, this.scope.connectionId],
    );
    let count = 0;
    for (const resource of resources) {
      const identifiers = readCalendarUids(resource.calendarData);
      if (!identifiers) return false;
      count += identifiers.filter((identifier) => identifier === uid).length;
    }
    return count === 1;
  }

  async context(
    operation: CalendarOperation,
    payload: CalendarSchedulePayload,
    queryable: Pick<DataSource, 'query'> = this.source,
  ): Promise<{ username: string; encryptedAppPassword: string } | null> {
    const rows: { username: string; encryptedAppPassword: string }[] =
      await queryable.query(
        `SELECT connection.username, connection."encryptedAppPassword"
      FROM calendar_sync."calendarConnection" connection
      JOIN calendar_sync."calendarActivation" activation ON activation."workspaceId" = connection."workspaceId" AND activation."connectionId" = connection.id
      JOIN calendar_sync."calendarSessionLink" link ON link."workspaceId" = connection."workspaceId" AND link."connectionId" = connection.id
      JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId" AND resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId"
      JOIN calendar_sync."studioCalendarOperation" operation ON operation."workspaceId" = connection."workspaceId" AND operation."connectionId" = connection.id
      WHERE connection."workspaceId" = $1 AND connection.id = $2 AND connection.state = 'ACTIVE' AND connection."configurationVersion" = $3
        AND activation."configurationVersion" = connection."configurationVersion" AND activation.binding = $4
        AND connection."lastSuccessfulReadAt" > clock_timestamp() - interval '90 seconds'
        AND link.uid = $5 AND link."classSessionId" = $6 AND link."recordingKey" = $7 AND link."commonBase" = $8::jsonb AND link."scheduleReviewReason" IS NULL
        AND resource.id = $9 AND resource.url = $10 AND connection."calendarUrl" = $11 AND resource."missingSinceGeneration" IS NULL
        AND operation.id = $12 AND operation.state = 'RUNNING' AND operation."leaseGeneration" = $13
        AND operation."leaseUntil" > clock_timestamp() + interval '50 seconds'`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          payload.configurationVersion,
          this.binding,
          payload.uid,
          payload.command.expected.id,
          payload.command.expected.recordingKey,
          JSON.stringify(payload.base),
          payload.resourceId,
          payload.resourceUrl,
          payload.calendarUrl,
          operation.id,
          operation.leaseGeneration,
        ],
      );
    if (!rows[0] || !(await this.uniqueUid(queryable, payload.uid)))
      return null;
    return rows[0];
  }

  async active(): Promise<boolean> {
    const rows = await this.source.query(
      `SELECT connection.id FROM calendar_sync."calendarConnection" connection
      JOIN calendar_sync."calendarActivation" activation ON activation."workspaceId" = connection."workspaceId" AND activation."connectionId" = connection.id
      WHERE connection."workspaceId" = $1 AND connection.id = $2 AND connection.state = 'ACTIVE'
        AND activation."configurationVersion" = connection."configurationVersion" AND activation.binding = $3`,
      [this.scope.workspaceId, this.scope.connectionId, this.binding],
    );
    return Boolean(rows[0]);
  }

  async finish(
    operation: CalendarOperation,
    payload: CalendarSchedulePayload,
    session: CalendarCrmSession,
    calendarData: string,
    etag: string,
  ): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      if (!(await this.context(operation, payload, manager))) return false;
      const resources: {
        resourceVersion: number;
        calendarData: string;
        etag: string;
      }[] = await manager.query(
        `SELECT "resourceVersion", "calendarData", etag FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND id = $3 FOR UPDATE`,
        [this.scope.workspaceId, this.scope.connectionId, payload.resourceId],
      );
      const resource = resources[0];
      // Polling alone owns the resource snapshot; wait for it to observe the confirmed write.
      if (
        !resource ||
        resource.etag !== etag ||
        normalizeCalendarScheduleData(resource.calendarData) !==
          normalizeCalendarScheduleData(calendarData)
      )
        return false;
      const settled = await manager.query(
        `UPDATE calendar_sync."studioCalendarOperation" SET state = 'SUCCEEDED', "leaseUntil" = NULL, "requiresReconciliation" = false, "errorCode" = NULL, "updatedAt" = clock_timestamp()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND id = $3 AND state = 'RUNNING' AND "leaseGeneration" = $4 AND "leaseUntil" > clock_timestamp() RETURNING id`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          operation.id,
          operation.leaseGeneration,
        ],
      );
      if (!settled[0]) return false;
      await manager.query(
        `UPDATE calendar_sync."calendarSessionLink" SET "commonBase" = $4::jsonb, "baseResourceVersion" = $5, "baseEtag" = $6,
        "observedSession" = $7::jsonb, "updatedAt" = clock_timestamp(), "nextScheduleCheckAt" = clock_timestamp() + interval '60 seconds'
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          payload.uid,
          JSON.stringify(payload.snapshot),
          resource.resourceVersion,
          etag,
          JSON.stringify(session),
        ],
      );
      await manager.query(
        `UPDATE calendar_sync."calendarInbox" SET state = 'APPLIED' WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "resourceId" = $3 AND "resourceVersion" = $4 AND kind = 'UPSERT'`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          payload.resourceId,
          resource.resourceVersion,
        ],
      );
      return true;
    });
  }

  async review(
    operation: CalendarOperation,
    payload: CalendarSchedulePayload,
    reason: string,
  ): Promise<void> {
    await this.source.transaction(async (manager) => {
      await this.lock(manager);
      const rows = await manager.query(
        `UPDATE calendar_sync."studioCalendarOperation" SET state = 'CONFLICT', "leaseUntil" = NULL, "errorCode" = $5, "updatedAt" = clock_timestamp()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND id = $3 AND state = 'RUNNING' AND "leaseGeneration" = $4 AND "leaseUntil" > clock_timestamp() RETURNING id`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          operation.id,
          operation.leaseGeneration,
          reason,
        ],
      );
      if (rows[0])
        await manager.query(
          `UPDATE calendar_sync."calendarSessionLink" SET "scheduleReviewReason" = $4 WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
          [
            this.scope.workspaceId,
            this.scope.connectionId,
            payload.uid,
            reason,
          ],
        );
    });
  }
}
