import { type DataSource } from 'typeorm';

import { type CalendarSessionLookup } from '../crm/find-calendar-session';
import { type CalendarSessionCandidate } from '../domain/prepare-calendar-session';

export type CalendarCrmScope = { workspaceId: string; connectionId: string };
export type CalendarCrmLease = CalendarCrmScope & {
  inboxId: string;
  configurationVersion: number;
  resourceId: string;
  resourceVersion: number;
  candidate: CalendarSessionCandidate;
  leaseGeneration: number;
};

export class CalendarCrmReconciliationStore {
  constructor(
    private readonly source: DataSource,
    private readonly scope: CalendarCrmScope,
  ) {}

  async claimNext(): Promise<CalendarCrmLease | null> {
    return this.source.transaction(async (manager) => {
      const connections: { id: string }[] = await manager.query(
        `SELECT id FROM calendar_sync."calendarConnection"
        WHERE "workspaceId" = $1 AND id = $2 AND state IN ('PREVIEW', 'ACTIVE') FOR UPDATE SKIP LOCKED`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      if (!connections.length) return null;
      await manager.query(
        `INSERT INTO calendar_sync."calendarCrmReconciliation" ("inboxId", "configurationVersion")
        SELECT "inboxId", "configurationVersion" FROM calendar_sync."calendarCurrentImportPreview"
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND decision = 'READY' ON CONFLICT DO NOTHING`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const rows: CalendarCrmLease[] = await manager.query(
        `SELECT preview.*, reconciliation."leaseGeneration"
        FROM calendar_sync."calendarCurrentImportPreview" preview
        JOIN calendar_sync."calendarCrmReconciliation" reconciliation USING ("inboxId", "configurationVersion")
        WHERE preview."workspaceId" = $1 AND preview."connectionId" = $2 AND preview.decision = 'READY'
          AND reconciliation.decision = 'PENDING' AND reconciliation."nextAttemptAt" <= now()
          AND (reconciliation."leaseUntil" IS NULL OR reconciliation."leaseUntil" <= now())
        ORDER BY reconciliation."nextAttemptAt", preview."createdAt", preview."inboxId" LIMIT 1 FOR UPDATE OF reconciliation`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const row = rows[0];
      if (!row) return null;
      const leases: { leaseGeneration: number }[] = await manager.query(
        `WITH claimed AS (UPDATE calendar_sync."calendarCrmReconciliation"
        SET "leaseUntil" = clock_timestamp() + interval '45 seconds', "leaseGeneration" = "leaseGeneration" + 1,
          attempts = attempts + 1, "updatedAt" = now()
        WHERE "inboxId" = $1 AND "configurationVersion" = $2 RETURNING "leaseGeneration") SELECT * FROM claimed`,
        [row.inboxId, row.configurationVersion],
      );
      return { ...row, leaseGeneration: leases[0].leaseGeneration };
    });
  }

  async settle(
    lease: CalendarCrmLease,
    result: CalendarSessionLookup,
  ): Promise<boolean> {
    if (
      lease.workspaceId !== this.scope.workspaceId ||
      lease.connectionId !== this.scope.connectionId
    )
      return false;
    return this.source.transaction(async (manager) => {
      await manager.query(
        `SELECT id FROM calendar_sync."calendarConnection"
        WHERE "workspaceId" = $1 AND id = $2 FOR UPDATE`,
        [lease.workspaceId, lease.connectionId],
      );
      const rows: CalendarCrmLease[] = await manager.query(
        `SELECT preview.* FROM calendar_sync."calendarCurrentImportPreview" preview
        JOIN calendar_sync."calendarCrmReconciliation" reconciliation USING ("inboxId", "configurationVersion")
        WHERE preview."workspaceId" = $1 AND preview."connectionId" = $2 AND preview."inboxId" = $3
          AND preview."configurationVersion" = $4 AND preview.decision = 'READY'
          AND reconciliation.decision = 'PENDING' AND reconciliation."leaseGeneration" = $5
          AND reconciliation."leaseUntil" > clock_timestamp() FOR UPDATE OF reconciliation`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.inboxId,
          lease.configurationVersion,
          lease.leaseGeneration,
        ],
      );
      const current = rows[0];
      if (!current) return false;
      const candidate = current.candidate;
      const duplicates: { count: number }[] = await manager.query(
        `SELECT count(*)::integer AS count
        FROM calendar_sync."calendarCurrentImportPreview" WHERE "workspaceId" = $1 AND "connectionId" = $2
          AND candidate->>'uid' = $3 AND decision = 'READY'`,
        [lease.workspaceId, lease.connectionId, candidate.uid],
      );
      const links: {
        classSessionId: string;
        resourceId: string;
        recordingKey: string;
      }[] = await manager.query(
        `
        SELECT "classSessionId", "resourceId", "recordingKey" FROM calendar_sync."calendarSessionLink"
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND "recurrenceKey" = 'single'`,
        [lease.workspaceId, lease.connectionId, candidate.uid],
      );
      const link = links[0];
      let decision = 'NEEDS_REVIEW';
      let reason: string | null = null;
      let retry = false;
      if (duplicates[0].count > 1) reason = 'DUPLICATE_CALENDAR_UID';
      else if (
        link &&
        (link.resourceId !== current.resourceId ||
          link.recordingKey !== candidate.recordingKey)
      )
        reason = 'RESOURCE_IDENTITY_CHANGED';
      else if (Date.parse(candidate.startsAt) <= Date.now())
        reason = 'PAST_OR_CURRENT_EVENT';
      else if (result.status === 'unavailable') {
        decision = 'PENDING';
        reason = 'CRM_UNAVAILABLE';
        retry = true;
      } else if (result.status === 'not-found') {
        decision = link ? 'NEEDS_REVIEW' : 'CREATE_CANDIDATE';
        reason = link ? 'LINKED_CRM_SESSION_MISSING' : null;
      } else if (result.status === 'matched') {
        if (result.session.recordingKey !== candidate.recordingKey)
          reason = 'CRM_RECORDING_KEY_MISMATCH';
        else if (link && link.classSessionId !== result.session.id)
          reason = 'CRM_IDENTITY_CHANGED';
        else {
          const inserted: { classSessionId: string }[] = await manager.query(
            `INSERT INTO calendar_sync."calendarSessionLink"
            ("workspaceId", "connectionId", uid, "recurrenceKey", "classSessionId", "resourceId", "recordingKey", "observedSession")
            VALUES ($1, $2, $3, 'single', $4, $5, $6, $7::jsonb)
            ON CONFLICT DO NOTHING RETURNING "classSessionId"`,
            [
              lease.workspaceId,
              lease.connectionId,
              candidate.uid,
              result.session.id,
              current.resourceId,
              candidate.recordingKey,
              JSON.stringify(result.session),
            ],
          );
          if (!link && !inserted.length) reason = 'CRM_SESSION_ALREADY_LINKED';
          else {
            await manager.query(
              `UPDATE calendar_sync."calendarSessionLink" SET "observedSession" = $4::jsonb, "updatedAt" = now()
              WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
              [
                lease.workspaceId,
                lease.connectionId,
                candidate.uid,
                JSON.stringify(result.session),
              ],
            );
            decision = 'LINKED';
          }
        }
      } else reason = `CRM_${result.status.toUpperCase().replaceAll('-', '_')}`;
      await manager.query(
        `UPDATE calendar_sync."calendarCrmReconciliation"
        SET decision = $3, reason = $4, "leaseUntil" = NULL,
          "nextAttemptAt" = now() + CASE WHEN $5 THEN interval '60 seconds' ELSE interval '0 seconds' END, "updatedAt" = now()
        WHERE "inboxId" = $1 AND "configurationVersion" = $2`,
        [lease.inboxId, lease.configurationVersion, decision, reason, retry],
      );
      return true;
    });
  }
}
