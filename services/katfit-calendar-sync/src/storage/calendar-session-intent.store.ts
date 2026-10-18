import { type DataSource } from 'typeorm';

import { createCalendarSessionCommand } from '../domain/create-calendar-session-command';
import { readCalendarUids } from '../domain/read-calendar-uids';
import { type CalendarSessionCandidate } from '../domain/prepare-calendar-session';
import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';

type IntentCandidate = {
  inboxId: string;
  configurationVersion: number;
  candidate: CalendarSessionCandidate;
  resourceId: string;
};

export class CalendarSessionIntentStore {
  constructor(
    private readonly source: DataSource,
    private readonly scope: CalendarCrmScope,
  ) {}

  async runOnce(): Promise<'idle' | 'prepared'> {
    return this.source.transaction(async (manager) => {
      const connections: { id: string }[] = await manager.query(
        `SELECT id FROM calendar_sync."calendarConnection"
        WHERE "workspaceId" = $1 AND id = $2 AND state IN ('PREVIEW', 'ACTIVE') FOR UPDATE SKIP LOCKED`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      if (!connections.length) return 'idle';
      const rows: IntentCandidate[] = await manager.query(
        `SELECT preview.*
        FROM calendar_sync."calendarCurrentImportPreview" preview
        JOIN calendar_sync."calendarCrmReconciliation" reconciliation USING ("inboxId", "configurationVersion")
        LEFT JOIN calendar_sync."calendarSessionCreateIntent" intent ON intent."workspaceId" = preview."workspaceId"
          AND intent."connectionId" = preview."connectionId" AND intent.uid = preview.candidate->>'uid' AND intent."recurrenceKey" = 'single'
        WHERE preview."workspaceId" = $1 AND preview."connectionId" = $2 AND preview.decision = 'READY'
          AND reconciliation.decision = 'CREATE_CANDIDATE'
          AND (intent.uid IS NULL OR (intent.state = 'PREPARED' AND
            (intent."inboxId" <> preview."inboxId" OR intent."configurationVersion" <> preview."configurationVersion")))
        ORDER BY preview."createdAt", preview."inboxId" LIMIT 1`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const row = rows[0];
      if (!row) return 'idle';
      const candidate = row.candidate;
      const payload = createCalendarSessionCommand(candidate);
      const resources: { id: string; calendarData: string }[] =
        await manager.query(
          `SELECT id, "calendarData"
        FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL`,
          [this.scope.workspaceId, this.scope.connectionId],
        );
      let occurrences = 0;
      let identityUnknown = false;
      for (const resource of resources) {
        const identifiers = readCalendarUids(resource.calendarData);
        if (!identifiers) {
          identityUnknown = true;
          continue;
        }
        occurrences += identifiers.filter(
          (uid) => uid === candidate.uid,
        ).length;
      }
      const links: { uid: string }[] = await manager.query(
        `SELECT uid FROM calendar_sync."calendarSessionLink"
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [this.scope.workspaceId, this.scope.connectionId, candidate.uid],
      );
      const reason = links.length
        ? 'SESSION_ALREADY_LINKED'
        : identityUnknown
          ? 'UNVERIFIABLE_RESOURCE_IDENTITY'
          : occurrences !== 1
            ? 'DUPLICATE_OR_MISSING_UID'
            : Date.parse(candidate.startsAt) <= Date.now()
              ? 'PAST_OR_CURRENT_EVENT'
              : null;
      // The first command is frozen even if later calendar versions reuse the same UID.
      await manager.query(
        `INSERT INTO calendar_sync."calendarSessionCreateIntent"
        ("workspaceId", "connectionId", uid, "recurrenceKey", "inboxId", "configurationVersion", "idempotencyKey", payload, state, reason)
        VALUES ($1, $2, $3, 'single', $4, $5, $6, $7::jsonb, $8, $9)
        ON CONFLICT ("workspaceId", "connectionId", uid, "recurrenceKey") DO UPDATE
          SET state = 'NEEDS_REVIEW', reason = 'SOURCE_CHANGED_AFTER_PREPARATION'`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          candidate.uid,
          row.inboxId,
          row.configurationVersion,
          payload.idempotencyKey,
          JSON.stringify(payload),
          reason ? 'NEEDS_REVIEW' : 'PREPARED',
          reason,
        ],
      );
      return 'prepared';
    });
  }
}
