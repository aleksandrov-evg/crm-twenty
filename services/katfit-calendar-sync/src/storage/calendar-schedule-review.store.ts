import { createHash } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { type SessionScheduleSnapshot } from '../domain/merge-session-schedule';
import { readCalendarUids } from '../domain/read-calendar-uids';
import { type CalendarSchedulePayload } from '../schedule/calendar-schedule-payload';
import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';
import { enqueueCalendarOperation } from './studio-calendar-operation.store';

export type CalendarScheduleReviewSource = {
  uid: string;
  classSessionId: string;
  recordingKey: string;
  commonBase: SessionScheduleSnapshot;
  scheduleReviewReason: string;
  configurationVersion: number;
  state: string;
  timezone: string;
  calendarUrl: string;
  resourceId: string;
  resourceVersion: number;
  resourceUrl: string;
  etag: string;
  calendarData: string;
  username: string;
  encryptedAppPassword: string;
};

export class CalendarScheduleReviewStore {
  constructor(
    private readonly source: DataSource,
    readonly scope: CalendarCrmScope,
  ) {}

  async list(): Promise<
    { uid: string; classSessionId: string; reason: string }[]
  > {
    return this.source.query(
      `SELECT uid, "classSessionId", "scheduleReviewReason" AS reason
      FROM calendar_sync."calendarSessionLink" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "scheduleReviewReason" IS NOT NULL ORDER BY uid LIMIT 100`,
      [this.scope.workspaceId, this.scope.connectionId],
    );
  }

  async read(uid: string): Promise<CalendarScheduleReviewSource | null> {
    const rows: CalendarScheduleReviewSource[] = await this.source.query(
      `SELECT link.uid, link."classSessionId", link."recordingKey", link."commonBase", link."scheduleReviewReason",
      connection."configurationVersion", connection.state, connection.timezone, connection."calendarUrl", connection.username, connection."encryptedAppPassword",
      resource.id AS "resourceId", resource."resourceVersion", resource.url AS "resourceUrl", resource.etag, resource."calendarData"
      FROM calendar_sync."calendarSessionLink" link
      JOIN calendar_sync."calendarConnection" connection ON connection."workspaceId" = link."workspaceId" AND connection.id = link."connectionId"
      JOIN calendar_sync."calendarResource" resource ON resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId" AND resource.id = link."resourceId"
      WHERE link."workspaceId" = $1 AND link."connectionId" = $2 AND link.uid = $3 AND link."scheduleReviewReason" IS NOT NULL
        AND link."commonBase" IS NOT NULL AND resource."missingSinceGeneration" IS NULL
        AND connection.state IN ('PREVIEW', 'ACTIVE', 'PAUSED') AND connection."encryptedAppPassword" IS NOT NULL`,
      [this.scope.workspaceId, this.scope.connectionId, uid],
    );
    return rows[0] ?? null;
  }

  async existing(
    token: string,
  ): Promise<{
    id: string;
    uid: string;
    choice: string;
    state: string;
  } | null> {
    const rows: { id: string; uid: string; choice: string; state: string }[] =
      await this.source.query(
        `SELECT id, "resourceKey" AS uid, payload->'resolution'->>'choice' AS choice, state FROM calendar_sync."studioCalendarOperation"
      WHERE "workspaceId" = $1 AND "connectionId" = $2 AND action = 'RECONCILE_RESOURCE'
        AND payload->>'kind' = 'SYNC_SCHEDULE' AND payload->'resolution'->>'reviewToken' = $3 LIMIT 1`,
        [this.scope.workspaceId, this.scope.connectionId, token],
      );
    return rows[0] ?? null;
  }

  async resolve(
    captured: CalendarScheduleReviewSource,
    payload: CalendarSchedulePayload,
  ): Promise<
    { status: 'queued'; operationId: string } | { status: 'stale' | 'busy' }
  > {
    return this.source.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0))",
        [this.scope.workspaceId, this.scope.connectionId],
      );
      await manager.query(
        'SELECT id FROM calendar_sync."calendarConnection" WHERE "workspaceId" = $1 AND id = $2 FOR UPDATE',
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const validity: { valid: boolean }[] = await manager.query(
        `SELECT clock_timestamp() BETWEEN to_timestamp($1::double precision / 1000) AND to_timestamp($1::double precision / 1000) + interval '120 seconds' AS valid`,
        [Number(payload.resolution?.reviewToken.split('.')[0])],
      );
      if (!validity[0]?.valid) return { status: 'stale' };
      const rows = await manager.query(
        `SELECT link.uid FROM calendar_sync."calendarSessionLink" link
        JOIN calendar_sync."calendarConnection" connection ON connection."workspaceId" = link."workspaceId" AND connection.id = link."connectionId"
        JOIN calendar_sync."calendarResource" resource ON resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId" AND resource.id = link."resourceId"
        WHERE link."workspaceId" = $1 AND link."connectionId" = $2 AND link.uid = $3 AND link."classSessionId" = $4 AND link."recordingKey" = $5
          AND link."commonBase" = $6::jsonb AND link."scheduleReviewReason" = $7
          AND connection."configurationVersion" = $8 AND connection.state = $9 AND connection.state IN ('PREVIEW', 'ACTIVE')
          AND connection."calendarUrl" = $10 AND resource.id = $11 AND resource."resourceVersion" = $12 AND resource.etag = $13
          AND resource."calendarData" = $14 AND resource.url = $15 AND resource."missingSinceGeneration" IS NULL`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          captured.uid,
          captured.classSessionId,
          captured.recordingKey,
          JSON.stringify(captured.commonBase),
          captured.scheduleReviewReason,
          captured.configurationVersion,
          captured.state,
          captured.calendarUrl,
          captured.resourceId,
          captured.resourceVersion,
          captured.etag,
          captured.calendarData,
          captured.resourceUrl,
        ],
      );
      if (!rows[0]) return { status: 'stale' };
      const running = await manager.query(
        `SELECT id FROM calendar_sync."studioCalendarOperation" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND state = 'RUNNING' LIMIT 1`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      if (running[0]) return { status: 'busy' };
      const resources: { calendarData: string }[] = await manager.query(
        `SELECT "calendarData" FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      let occurrences = 0;
      for (const resource of resources) {
        const identifiers = readCalendarUids(resource.calendarData);
        if (!identifiers) return { status: 'stale' };
        occurrences += identifiers.filter((uid) => uid === captured.uid).length;
      }
      if (occurrences !== 1) return { status: 'stale' };
      await manager.query(
        `UPDATE calendar_sync."studioCalendarOperation" SET state = 'SUPERSEDED', "errorCode" = 'OPERATOR_SCHEDULE_RESOLUTION', "updatedAt" = clock_timestamp()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND action = 'RECONCILE_RESOURCE' AND "resourceKey" = $3 AND state IN ('PENDING', 'RETRY')`,
        [this.scope.workspaceId, this.scope.connectionId, captured.uid],
      );
      const hash = createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
      const operation = await enqueueCalendarOperation(manager, {
        ...this.scope,
        resourceKey: captured.uid,
        action: 'RECONCILE_RESOURCE',
        idempotencyKey: `calendar-schedule:${hash}`,
        payload,
      });
      await manager.query(
        `UPDATE calendar_sync."calendarSessionLink" SET "scheduleReviewReason" = NULL, "nextScheduleCheckAt" = clock_timestamp() + interval '60 seconds', "updatedAt" = clock_timestamp()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [this.scope.workspaceId, this.scope.connectionId, captured.uid],
      );
      return { status: 'queued', operationId: operation.id };
    });
  }
}
