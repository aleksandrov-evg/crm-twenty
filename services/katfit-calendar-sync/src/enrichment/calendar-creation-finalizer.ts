import { type DataSource } from 'typeorm';

import { type CalendarSessionLookup } from '../crm/find-calendar-session';
import { type CalendarCrmScope } from '../storage/calendar-crm-reconciliation.store';
import { finalizeCalendarCreation } from '../storage/finalize-calendar-creation';

type FinalizationLease = CalendarCrmScope & {
  uid: string;
  generation: number;
  configurationVersion: number;
  recordingKey: string;
};
export class CalendarCreationFinalizer {
  constructor(
    private readonly source: DataSource,
    private readonly scope: CalendarCrmScope,
    private readonly lookup: (key: string) => Promise<CalendarSessionLookup>,
  ) {}

  async runOnce(): Promise<'idle' | 'saved' | 'stale'> {
    const lease = await this.source.transaction(async (manager) => {
      const connections: { configurationVersion: number }[] =
        await manager.query(
          `SELECT "configurationVersion" FROM calendar_sync."calendarConnection"
        WHERE "workspaceId" = $1 AND id = $2 AND state IN ('PREVIEW', 'ACTIVE') FOR UPDATE SKIP LOCKED`,
          [this.scope.workspaceId, this.scope.connectionId],
        );
      if (!connections[0]) return null;
      const rows: { uid: string; generation: number; recordingKey: string }[] =
        await manager.query(
          `SELECT execution.uid,
        execution."finalizationLeaseGeneration" + 1 AS generation, 'session-create:' || intent."idempotencyKey" AS "recordingKey"
        FROM calendar_sync."calendarCreationExecution" execution JOIN calendar_sync."calendarSessionCreateIntent" intent USING ("workspaceId", "connectionId", uid, "recurrenceKey")
        WHERE execution."workspaceId" = $1 AND execution."connectionId" = $2 AND execution.state = 'CONFIRMED' AND execution."finalizationState" IS NULL
          AND execution."nextFinalizeAt" <= now() AND (execution."finalizationLeaseUntil" IS NULL OR execution."finalizationLeaseUntil" <= now())
        ORDER BY execution."nextFinalizeAt", execution.uid LIMIT 1 FOR UPDATE OF execution`,
          [this.scope.workspaceId, this.scope.connectionId],
        );
      const row = rows[0];
      if (!row) return null;
      await manager.query(
        `UPDATE calendar_sync."calendarCreationExecution" SET "finalizationLeaseGeneration" = $4,
        "finalizationLeaseUntil" = clock_timestamp() + interval '60 seconds' WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          row.uid,
          row.generation,
        ],
      );
      return {
        ...this.scope,
        ...row,
        configurationVersion: connections[0].configurationVersion,
      } satisfies FinalizationLease;
    });
    if (!lease) return 'idle';
    let result: CalendarSessionLookup;
    try {
      result = await this.lookup(lease.recordingKey);
    } catch {
      result = { status: 'unavailable' };
    }
    return this.source.transaction(async (manager) => {
      await manager.query(
        'SELECT id FROM calendar_sync."calendarConnection" WHERE "workspaceId" = $1 AND id = $2 FOR UPDATE',
        [lease.workspaceId, lease.connectionId],
      );
      const rows: { uid: string }[] = await manager.query(
        `SELECT execution.uid FROM calendar_sync."calendarConnection" connection
        JOIN calendar_sync."calendarCreationExecution" execution ON execution."connectionId" = connection.id AND execution."workspaceId" = connection."workspaceId"
        WHERE connection."workspaceId" = $1 AND connection.id = $2 AND connection."configurationVersion" = $3 AND connection.state IN ('PREVIEW', 'ACTIVE')
          AND execution.uid = $4 AND execution.state = 'CONFIRMED' AND execution."finalizationState" IS NULL
          AND execution."finalizationLeaseGeneration" = $5 AND execution."finalizationLeaseUntil" > clock_timestamp() FOR UPDATE OF connection, execution`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.configurationVersion,
          lease.uid,
          lease.generation,
        ],
      );
      if (!rows[0]) return 'stale';
      if (result.status === 'matched')
        await finalizeCalendarCreation(manager, lease, result.session);
      else
        await manager.query(
          `UPDATE calendar_sync."calendarCreationExecution" SET "finalizationLeaseUntil" = NULL,
        "nextFinalizeAt" = now() + interval '60 seconds', "finalizationState" = $4, "finalizationReason" = $5
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
          [
            lease.workspaceId,
            lease.connectionId,
            lease.uid,
            result.status === 'unavailable' ? null : 'NEEDS_REVIEW',
            `FINALIZATION_CRM_${result.status.toUpperCase().replaceAll('-', '_')}`,
          ],
        );
      return 'saved';
    });
  }
}
