import { type DataSource } from 'typeorm';

import { prepareCalendarSession } from '../domain/prepare-calendar-session';

type PreviewConnection = {
  id: string;
  workspaceId: string;
  timezone: string;
  configurationVersion: number;
};
type PreviewInbox = {
  id: string;
  kind: 'UPSERT' | 'MISSING_CANDIDATE';
  calendarData: string | null;
  resourceVersion: number;
  currentVersion: number;
  missingSinceGeneration: number | null;
};

export class CalendarImportPreviewStore {
  constructor(private readonly source: DataSource) {}

  async runOnce(): Promise<'idle' | 'prepared'> {
    return this.source.transaction(async (manager) => {
      // Lock the connection first, matching snapshot commit and pause/disconnect ordering.
      const connections: PreviewConnection[] = await manager.query(`
        SELECT connection."id", connection."workspaceId", connection."timezone", connection."configurationVersion"
        FROM "calendar_sync"."calendarConnection" connection
        WHERE connection."state" IN ('PREVIEW', 'ACTIVE') AND EXISTS (
          SELECT 1 FROM "calendar_sync"."calendarInbox" inbox
          WHERE inbox."connectionId" = connection."id" AND inbox."workspaceId" = connection."workspaceId"
            AND inbox."state" = 'PENDING' AND NOT EXISTS (
              SELECT 1 FROM "calendar_sync"."calendarImportPreview" preview
              WHERE preview."inboxId" = inbox."id" AND preview."configurationVersion" = connection."configurationVersion"))
        ORDER BY connection."id" FOR UPDATE OF connection SKIP LOCKED LIMIT 1`);
      const connection = connections[0];
      if (!connection) return 'idle';
      const rows: PreviewInbox[] = await manager.query(
        `
        SELECT inbox."id", inbox."kind", inbox."calendarData", inbox."resourceVersion",
          resource."resourceVersion" AS "currentVersion", resource."missingSinceGeneration"
        FROM "calendar_sync"."calendarInbox" inbox
        JOIN "calendar_sync"."calendarResource" resource ON resource."id" = inbox."resourceId"
          AND resource."workspaceId" = inbox."workspaceId" AND resource."connectionId" = inbox."connectionId"
        WHERE inbox."workspaceId" = $1 AND inbox."connectionId" = $2 AND inbox."state" = 'PENDING'
          AND NOT EXISTS (SELECT 1 FROM "calendar_sync"."calendarImportPreview" preview
            WHERE preview."inboxId" = inbox."id" AND preview."configurationVersion" = $3)
        ORDER BY inbox."createdAt", inbox."id" LIMIT 1`,
        [
          connection.workspaceId,
          connection.id,
          connection.configurationVersion,
        ],
      );
      const inbox = rows[0];
      if (!inbox) return 'idle';
      const superseded =
        inbox.resourceVersion !== inbox.currentVersion ||
        (inbox.kind === 'UPSERT'
          ? inbox.missingSinceGeneration !== null
          : inbox.missingSinceGeneration === null);
      const result = superseded
        ? { decision: 'SUPERSEDED' as const, reason: 'RESOURCE_CHANGED' }
        : inbox.kind === 'MISSING_CANDIDATE'
          ? {
              decision: 'NEEDS_REVIEW' as const,
              reason: 'DELETION_REQUIRES_VERIFICATION',
            }
          : prepareCalendarSession({
              workspaceId: connection.workspaceId,
              connectionId: connection.id,
              calendarData: inbox.calendarData ?? '',
              options: { timezone: connection.timezone },
              now: new Date(),
            });
      await manager.query(
        `INSERT INTO "calendar_sync"."calendarImportPreview"
        ("inboxId", "configurationVersion", "decision", "reason", "candidate") VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          inbox.id,
          connection.configurationVersion,
          result.decision,
          result.decision === 'READY' ? null : result.reason,
          result.decision === 'READY' ? JSON.stringify(result.candidate) : null,
        ],
      );
      return 'prepared';
    });
  }
}
