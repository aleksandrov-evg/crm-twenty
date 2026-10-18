import { type DataSource } from 'typeorm';

import {
  CALENDAR_CRM_CONTRACT,
  sameCalendarCrmCapabilities,
  type CalendarCrmCapabilityEvidence,
} from '../crm/check-calendar-crm-capabilities';
import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';

export type CalendarActivation = CalendarCrmScope & {
  id: string;
  configurationVersion: number;
  binding: string;
  evidence: CalendarCrmCapabilityEvidence;
};

export class CalendarActivationStore {
  constructor(
    private readonly source: DataSource,
    private readonly scope: CalendarCrmScope,
    private readonly binding: string,
  ) {}

  async activate(
    expectedVersion: number,
    evidence: CalendarCrmCapabilityEvidence,
  ): Promise<CalendarActivation> {
    if (
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 ||
      evidence.workspaceId !== this.scope.workspaceId ||
      evidence.binding !== this.binding ||
      evidence.contract !== CALENDAR_CRM_CONTRACT ||
      !Number.isFinite(Date.parse(evidence.checkedAt)) ||
      Date.now() - Date.parse(evidence.checkedAt) > 60000 ||
      Date.parse(evidence.checkedAt) > Date.now() + 1000
    )
      throw new Error('CALENDAR_ACTIVATION_EVIDENCE_INVALID');
    return this.source.transaction(async (manager) => {
      const rows: {
        state: string;
        configurationVersion: number;
        readGeneration: number;
        lastSuccessfulReadAt: Date | null;
      }[] = await manager.query(
        `
        SELECT state, "configurationVersion", "readGeneration", "lastSuccessfulReadAt" FROM calendar_sync."calendarConnection"
        WHERE "workspaceId" = $1 AND id = $2 FOR UPDATE`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const connection = rows[0];
      if (
        !connection ||
        connection.configurationVersion !== expectedVersion ||
        !['PREVIEW', 'ACTIVE'].includes(connection.state)
      )
        throw new Error('CALENDAR_ACTIVATION_STATE_CHANGED');
      const existing: CalendarActivation[] = await manager.query(
        `SELECT * FROM calendar_sync."calendarActivation"
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "configurationVersion" = $3`,
        [this.scope.workspaceId, this.scope.connectionId, expectedVersion],
      );
      if (connection.state === 'ACTIVE') {
        if (!existing[0] || existing[0].binding !== this.binding)
          throw new Error('CALENDAR_ACTIVATION_BINDING_CHANGED');
        if (!sameCalendarCrmCapabilities(existing[0].evidence, evidence))
          throw new Error('CALENDAR_ACTIVATION_CAPABILITIES_CHANGED');
        return existing[0];
      }
      if (Date.now() - Date.parse(evidence.checkedAt) > 60000)
        throw new Error('CALENDAR_ACTIVATION_EVIDENCE_INVALID');
      if (
        !connection.readGeneration ||
        !connection.lastSuccessfulReadAt ||
        Date.now() - connection.lastSuccessfulReadAt.getTime() > 90000
      )
        throw new Error('CALENDAR_ACTIVATION_SNAPSHOT_REQUIRED');
      const reviews: { count: number }[] = await manager.query(
        `SELECT count(*)::integer AS count
        FROM calendar_sync."calendarCurrentImportPreview" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND decision = 'NEEDS_REVIEW'`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      if (reviews[0].count)
        throw new Error('CALENDAR_ACTIVATION_REVIEW_REQUIRED');
      const pending: { count: number }[] = await manager.query(
        `SELECT count(*)::integer AS count FROM calendar_sync."calendarResource" resource
        WHERE resource."workspaceId" = $1 AND resource."connectionId" = $2 AND resource."missingSinceGeneration" IS NULL
          AND NOT EXISTS (SELECT 1 FROM calendar_sync."calendarCurrentImportPreview" preview WHERE preview."resourceId" = resource.id
            AND preview."workspaceId" = resource."workspaceId" AND preview."connectionId" = resource."connectionId" AND preview.decision = 'READY')
          AND NOT EXISTS (SELECT 1 FROM calendar_sync."calendarSessionLink" link WHERE link."resourceId" = resource.id
            AND link."workspaceId" = resource."workspaceId" AND link."connectionId" = resource."connectionId"
            AND link."commonBase" IS NOT NULL AND link."baseResourceVersion" = resource."resourceVersion")`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      if (pending[0].count)
        throw new Error('CALENDAR_ACTIVATION_PREVIEW_REQUIRED');
      const activated: CalendarActivation[] = await manager.query(
        `INSERT INTO calendar_sync."calendarActivation"
        ("workspaceId", "connectionId", "configurationVersion", binding, evidence) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          expectedVersion,
          this.binding,
          JSON.stringify(evidence),
        ],
      );
      // Activation approves the current configuration; incrementing it would invalidate the previews being approved.
      await manager.query(
        `UPDATE calendar_sync."calendarConnection" SET state = 'ACTIVE', "updatedAt" = now()
        WHERE "workspaceId" = $1 AND id = $2`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      return activated[0];
    });
  }

  async getActive(): Promise<CalendarActivation | null> {
    const rows: CalendarActivation[] = await this.source.query(
      `SELECT activation.* FROM calendar_sync."calendarActivation" activation
      JOIN calendar_sync."calendarConnection" connection ON connection.id = activation."connectionId" AND connection."workspaceId" = activation."workspaceId"
      WHERE activation."workspaceId" = $1 AND activation."connectionId" = $2 AND activation.binding = $3
        AND activation."configurationVersion" = connection."configurationVersion" AND connection.state = 'ACTIVE'`,
      [this.scope.workspaceId, this.scope.connectionId, this.binding],
    );
    return rows[0] ?? null;
  }
}
