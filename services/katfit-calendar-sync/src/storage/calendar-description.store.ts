import { createHash } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { type CalendarRoster } from '../crm/read-calendar-roster';
import { enrichCalendarEvent } from '../domain/enrich-calendar-event';
import { type CalendarDescriptionPayload } from '../enrichment/calendar-description-payload';
import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';
import { enqueueCalendarOperation } from './studio-calendar-operation.store';

export type CalendarDescriptionLease = CalendarCrmScope & {
  uid: string;
  classSessionId: string;
  recordingKey: string;
  generation: number;
  configurationVersion: number;
  resourceId: string;
  resourceVersion: number;
  calendarData: string;
  calendarUrl: string;
  resourceUrl: string;
  etag: string;
  contentHash: string;
};

export class CalendarDescriptionStore {
  constructor(
    private readonly source: DataSource,
    private readonly scope: CalendarCrmScope,
  ) {}

  async claimNext(): Promise<CalendarDescriptionLease | null> {
    return this.source.transaction(async (manager) => {
      const connections: {
        configurationVersion: number;
        calendarUrl: string;
      }[] = await manager.query(
        `SELECT "configurationVersion", "calendarUrl"
        FROM calendar_sync."calendarConnection" WHERE "workspaceId" = $1 AND id = $2 AND state IN ('PREVIEW', 'ACTIVE') FOR UPDATE SKIP LOCKED`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      if (!connections[0]) return null;
      const rows: Omit<
        CalendarDescriptionLease,
        keyof CalendarCrmScope | 'configurationVersion' | 'calendarUrl'
      >[] = await manager.query(
        `
        SELECT job.uid, job."leaseGeneration" + 1 AS generation, link."classSessionId", link."recordingKey", resource.id AS "resourceId",
          resource."resourceVersion", resource."calendarData", resource.url AS "resourceUrl", resource.etag, resource."contentHash"
        FROM calendar_sync."calendarDescriptionRefresh" job JOIN calendar_sync."calendarSessionLink" link USING ("workspaceId", "connectionId", uid, "recurrenceKey")
        JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId" AND resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId"
        WHERE job."workspaceId" = $1 AND job."connectionId" = $2 AND job."nextAttemptAt" <= now()
          AND (job."leaseUntil" IS NULL OR job."leaseUntil" <= now()) AND resource."missingSinceGeneration" IS NULL
          AND link."commonBase" IS NOT NULL AND (link."observedSession"->>'startsAt')::timestamptz > now()
        ORDER BY job."nextAttemptAt", job.uid LIMIT 1 FOR UPDATE OF job`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const row = rows[0];
      if (!row) return null;
      await manager.query(
        `UPDATE calendar_sync."calendarDescriptionRefresh" SET "leaseGeneration" = $4,
        "leaseUntil" = clock_timestamp() + interval '120 seconds' WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          row.uid,
          row.generation,
        ],
      );
      return { ...this.scope, ...connections[0], ...row };
    });
  }

  async settle(
    lease: CalendarDescriptionLease,
    roster: CalendarRoster,
  ): Promise<boolean> {
    if (
      lease.workspaceId !== this.scope.workspaceId ||
      lease.connectionId !== this.scope.connectionId
    )
      return false;
    return this.source.transaction(async (manager) => {
      const connections: { id: string }[] = await manager.query(
        `SELECT id FROM calendar_sync."calendarConnection"
        WHERE "workspaceId" = $1 AND id = $2 AND "configurationVersion" = $3 AND state IN ('PREVIEW', 'ACTIVE') FOR UPDATE`,
        [lease.workspaceId, lease.connectionId, lease.configurationVersion],
      );
      if (!connections[0]) return false;
      const jobs: { uid: string }[] = await manager.query(
        `SELECT job.uid FROM calendar_sync."calendarDescriptionRefresh" job
        JOIN calendar_sync."calendarSessionLink" link USING ("workspaceId", "connectionId", uid, "recurrenceKey")
        JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId"
        WHERE job."workspaceId" = $1 AND job."connectionId" = $2 AND job.uid = $3 AND job."leaseGeneration" = $4 AND job."leaseUntil" > clock_timestamp()
          AND link."classSessionId" = $5 AND resource.id = $6 AND resource."resourceVersion" = $7 AND resource.etag = $8
          AND resource."missingSinceGeneration" IS NULL FOR UPDATE OF job`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.uid,
          lease.generation,
          lease.classSessionId,
          lease.resourceId,
          lease.resourceVersion,
          lease.etag,
        ],
      );
      if (!jobs[0]) return false;
      let result: string = roster.status;
      let delay = roster.status === 'needs-review' ? 300 : 60;
      if (roster.status === 'read') {
        const patch = enrichCalendarEvent({
          calendarData: lease.calendarData,
          uid: lease.uid,
          classSessionId: lease.classSessionId,
          participants: roster.participants,
        });
        if (patch.status === 'needs-review') {
          result = patch.reason;
          delay = 300;
        } else if (!patch.changed) result = 'UNCHANGED';
        else {
          const payload: CalendarDescriptionPayload = {
            kind: 'ENRICH_DESCRIPTION',
            uid: lease.uid,
            classSessionId: lease.classSessionId,
            recordingKey: lease.recordingKey,
            configurationVersion: lease.configurationVersion,
            resourceId: lease.resourceId,
            resourceVersion: lease.resourceVersion,
            calendarUrl: lease.calendarUrl,
            resourceUrl: lease.resourceUrl,
            expectedEtag: lease.etag,
            sourceHash: lease.contentHash,
            rosterHash: roster.rosterHash,
            calendarData: patch.calendarData,
          };
          const key = createHash('sha256')
            .update(
              JSON.stringify([lease.workspaceId, lease.connectionId, payload]),
            )
            .digest('hex');
          await enqueueCalendarOperation(manager, {
            workspaceId: lease.workspaceId,
            connectionId: lease.connectionId,
            resourceKey: lease.uid,
            idempotencyKey: `calendar-enrich:${key}`,
            action: 'EXPORT_EVENT',
            payload,
          });
          result = 'PREPARED';
        }
      } else if (roster.status === 'needs-review') result = roster.reason;
      await manager.query(
        `UPDATE calendar_sync."calendarDescriptionRefresh" SET "leaseUntil" = NULL, "lastResult" = $4,
        "nextAttemptAt" = clock_timestamp() + $5 * interval '1 second' WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [lease.workspaceId, lease.connectionId, lease.uid, result, delay],
      );
      return true;
    });
  }
}
