import { finalizeCalendarCreation } from './finalize-calendar-creation';
import {
  type CalendarCrmCapabilityEvidence,
  CALENDAR_CRM_CONTRACT,
  sameCalendarCrmCapabilities,
} from '../crm/check-calendar-crm-capabilities';
import { type CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import {
  type CalendarResourceCheck,
  type CalendarResourceCheckResult,
} from '../transport/check-calendar-resource';
import { type DataSource, type EntityManager } from 'typeorm';

import { type CalendarCreationInspection } from '../crm/inspect-calendar-session-creation';
import { type CalendarSessionCreationResult } from '../crm/create-calendar-session';
import { type CalendarCreationRecovery } from '../creation/recover-calendar-session-creation';
import {
  calendarSessionCommandSchema,
  type CalendarSessionCommand,
} from '../domain/create-calendar-session-command';
import { readCalendarUids } from '../domain/read-calendar-uids';
import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';

export type CalendarCreationLease = CalendarCrmScope & {
  uid: string;
  recurrenceKey: 'single';
  leaseGeneration: number;
  configurationVersion: number;
  connectionState: 'PREVIEW' | 'ACTIVE';
  knownClassSessionId: string | null;
  command: CalendarSessionCommand;
};

type ExecutionRow = {
  state: string;
  configurationVersion: number;
  knownClassSessionId: string | null;
  expectedRecordingKey: string;
  leaseUntil: Date;
};

export class CalendarCreationExecutionStore {
  constructor(
    private readonly source: DataSource,
    private readonly scope: CalendarCrmScope,
    private readonly requiredCrmBinding: string | null = null,
  ) {}

  async claimNext(): Promise<CalendarCreationLease | null> {
    return this.source.transaction(async (manager) => {
      const connections: {
        configurationVersion: number;
        state: 'PREVIEW' | 'ACTIVE';
      }[] = await manager.query(
        `SELECT "configurationVersion", state
        FROM calendar_sync."calendarConnection" WHERE "workspaceId" = $1 AND id = $2 AND state IN ('PREVIEW', 'ACTIVE')
        FOR UPDATE SKIP LOCKED`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      if (!connections[0]) return null;
      await manager.query(
        `INSERT INTO calendar_sync."calendarCreationExecution" ("workspaceId", "connectionId", uid, "recurrenceKey")
        SELECT "workspaceId", "connectionId", uid, "recurrenceKey" FROM calendar_sync."calendarSessionCreateIntent"
        WHERE "workspaceId" = $1 AND "connectionId" = $2 ON CONFLICT DO NOTHING`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const rows: {
        uid: string;
        leaseGeneration: number;
        payload: unknown;
        knownClassSessionId: string | null;
      }[] = await manager.query(
        `
        SELECT execution.uid, execution."leaseGeneration", execution."knownClassSessionId", intent.payload
        FROM calendar_sync."calendarCreationExecution" execution
        JOIN calendar_sync."calendarSessionCreateIntent" intent USING ("workspaceId", "connectionId", uid, "recurrenceKey")
        WHERE execution."workspaceId" = $1 AND execution."connectionId" = $2
          AND NOT EXISTS (SELECT 1 FROM calendar_sync."calendarCreationExecution" active WHERE active."workspaceId" = $1
            AND active."connectionId" = $2 AND active.state = 'RUNNING' AND active."leaseUntil" > clock_timestamp())
          AND ((execution.state IN ('PENDING', 'RETRY') AND execution."nextAttemptAt" <= clock_timestamp())
            OR (execution.state = 'RUNNING' AND execution."leaseUntil" <= clock_timestamp()))
        ORDER BY CASE WHEN execution.state = 'RUNNING' THEN 0 ELSE 1 END, execution."nextAttemptAt", execution.uid
        LIMIT 1 FOR UPDATE OF execution`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const row = rows[0];
      if (!row) return null;
      const command = calendarSessionCommandSchema.parse(row.payload);
      const generation = row.leaseGeneration + 1;
      await manager.query(
        `UPDATE calendar_sync."calendarCreationExecution" SET state = 'RUNNING',
        "leaseGeneration" = $4, "leaseUntil" = clock_timestamp() + interval '120 seconds', "updatedAt" = now()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [this.scope.workspaceId, this.scope.connectionId, row.uid, generation],
      );
      await manager.query(
        `INSERT INTO calendar_sync."calendarCreationAttempt"
        ("workspaceId", "connectionId", uid, "recurrenceKey", generation) VALUES ($1, $2, $3, 'single', $4)`,
        [this.scope.workspaceId, this.scope.connectionId, row.uid, generation],
      );
      return {
        ...this.scope,
        uid: row.uid,
        recurrenceKey: 'single',
        leaseGeneration: generation,
        configurationVersion: connections[0].configurationVersion,
        connectionState: connections[0].state,
        command,
        knownClassSessionId: row.knownClassSessionId,
      };
    });
  }

  private async locked(
    manager: EntityManager,
    lease: CalendarCreationLease,
  ): Promise<ExecutionRow | null> {
    if (
      lease.workspaceId !== this.scope.workspaceId ||
      lease.connectionId !== this.scope.connectionId
    )
      return null;
    const connections: { state: string; configurationVersion: number }[] =
      await manager.query(
        `SELECT state, "configurationVersion"
      FROM calendar_sync."calendarConnection" WHERE "workspaceId" = $1 AND id = $2 FOR UPDATE`,
        [lease.workspaceId, lease.connectionId],
      );
    const connection = connections[0];
    if (
      !connection ||
      !['PREVIEW', 'ACTIVE'].includes(connection.state) ||
      connection.configurationVersion !== lease.configurationVersion
    )
      return null;
    const executions: {
      knownClassSessionId: string | null;
      expectedRecordingKey: string;
      leaseUntil: Date;
    }[] = await manager.query(
      `SELECT execution."knownClassSessionId", execution."leaseUntil", 'session-create:' || intent."idempotencyKey" AS "expectedRecordingKey"
      FROM calendar_sync."calendarCreationExecution" execution
      JOIN calendar_sync."calendarSessionCreateIntent" intent USING ("workspaceId", "connectionId", uid, "recurrenceKey")
      WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND execution.state = 'RUNNING'
        AND "leaseGeneration" = $4 AND "leaseUntil" > clock_timestamp() FOR UPDATE OF execution`,
      [lease.workspaceId, lease.connectionId, lease.uid, lease.leaseGeneration],
    );
    return executions[0] ? { ...connection, ...executions[0] } : null;
  }

  async recordInspection(
    lease: CalendarCreationLease,
    inspection: CalendarCreationInspection,
  ): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      const current = await this.locked(manager, lease);
      if (!current) return false;
      if (
        inspection.status === 'confirmed' &&
        inspection.recordingKey !== current.expectedRecordingKey
      )
        return false;
      if (
        (inspection.status === 'confirmed' ||
          inspection.status === 'incomplete') &&
        current.knownClassSessionId &&
        current.knownClassSessionId !== inspection.classSessionId
      )
        return false;
      if (
        inspection.status === 'confirmed' ||
        inspection.status === 'incomplete'
      )
        await manager.query(
          `UPDATE calendar_sync."calendarCreationExecution" SET "knownClassSessionId" = $4
          WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
          [
            lease.workspaceId,
            lease.connectionId,
            lease.uid,
            inspection.classSessionId,
          ],
        );
      await manager.query(
        `UPDATE calendar_sync."calendarCreationAttempt" SET "initialInspection" = COALESCE("initialInspection", $5::jsonb), inspection = $5::jsonb
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND generation = $4`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.uid,
          lease.leaseGeneration,
          JSON.stringify(inspection),
        ],
      );
      return true;
    });
  }

  private async currentSource(
    manager: EntityManager,
    lease: CalendarCreationLease,
  ) {
    const rows: (CalendarResourceCheck & {
      resourceVersion: number;
      resourceId: string;
      username: string;
      encryptedAppPassword: string;
    })[] = await manager.query(
      `
      SELECT connection."calendarUrl", resource.url AS "resourceUrl", resource.etag, resource."contentHash",
        resource."resourceVersion", resource.id AS "resourceId", connection.username, connection."encryptedAppPassword"
      FROM calendar_sync."calendarSessionCreateIntent" intent
      JOIN calendar_sync."calendarCurrentImportPreview" preview USING ("inboxId", "configurationVersion", "workspaceId", "connectionId")
      JOIN calendar_sync."calendarResource" resource ON resource.id = preview."resourceId"
        AND resource."workspaceId" = intent."workspaceId" AND resource."connectionId" = intent."connectionId"
      JOIN calendar_sync."calendarConnection" connection ON connection.id = intent."connectionId" AND connection."workspaceId" = intent."workspaceId"
      WHERE intent."workspaceId" = $1 AND intent."connectionId" = $2 AND intent.uid = $3 AND intent.state = 'PREPARED'
        AND preview.decision = 'READY'`,
      [lease.workspaceId, lease.connectionId, lease.uid],
    );
    return rows[0] ?? null;
  }

  async readSourceForCheck(
    lease: CalendarCreationLease,
    cipher: CalendarCredentialCipher,
  ) {
    return this.source.transaction(async (manager) => {
      if (!(await this.locked(manager, lease))) return null;
      const current = await this.currentSource(manager, lease);
      if (!current) return null;
      return {
        source: {
          calendarUrl: current.calendarUrl,
          resourceUrl: current.resourceUrl,
          etag: current.etag,
          contentHash: current.contentHash,
          resourceId: current.resourceId,
          resourceVersion: current.resourceVersion,
        },
        credentials: {
          username: current.username,
          appPassword: cipher.open(
            {
              workspaceId: lease.workspaceId,
              connectionId: lease.connectionId,
              username: current.username,
            },
            current.encryptedAppPassword,
          ),
        },
      };
    });
  }

  async recordLiveSourceCheck(
    lease: CalendarCreationLease,
    check: CalendarResourceCheckResult,
    expectedSource?: { resourceId: string; resourceVersion: number },
    checkedAt = new Date(),
  ): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      if (!(await this.locked(manager, lease))) return false;
      const source = await this.currentSource(manager, lease);
      if (
        check.status === 'verified' &&
        (!expectedSource ||
          source?.resourceId !== expectedSource.resourceId ||
          source.resourceVersion !== expectedSource.resourceVersion)
      )
        return false;
      if (
        !source ||
        (check.status === 'verified' &&
          (source.resourceUrl !== check.resourceUrl ||
            source.etag !== check.etag ||
            source.contentHash !== check.contentHash))
      )
        return false;
      const proof =
        check.status === 'verified'
          ? {
              ...check,
              resourceId: source.resourceId,
              resourceVersion: source.resourceVersion,
            }
          : check;
      const rows: { generation: number }[] = await manager.query(
        `WITH updated AS (UPDATE calendar_sync."calendarCreationAttempt"
        SET "liveSourceCheck" = $5::jsonb, "liveSourceCheckedAt" = LEAST($6::timestamptz, clock_timestamp())
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND generation = $4
          AND "sendStartedAt" IS NULL RETURNING generation) SELECT * FROM updated`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.uid,
          lease.leaseGeneration,
          JSON.stringify(proof),
          checkedAt,
        ],
      );
      return rows.length === 1;
    });
  }

  async recordCapabilities(
    lease: CalendarCreationLease,
    evidence: CalendarCrmCapabilityEvidence,
  ): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      const connection = await this.locked(manager, lease);
      if (
        !connection ||
        connection.state !== 'ACTIVE' ||
        !this.requiredCrmBinding ||
        evidence.binding !== this.requiredCrmBinding ||
        evidence.workspaceId !== lease.workspaceId ||
        evidence.contract !== CALENDAR_CRM_CONTRACT ||
        !Number.isFinite(Date.parse(evidence.checkedAt)) ||
        Date.now() - Date.parse(evidence.checkedAt) > 60000 ||
        Date.parse(evidence.checkedAt) > Date.now() + 1000
      )
        return false;
      const activations: {
        id: string;
        evidence: CalendarCrmCapabilityEvidence;
      }[] = await manager.query(
        `SELECT id, evidence FROM calendar_sync."calendarActivation"
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "configurationVersion" = $3 AND binding = $4`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.configurationVersion,
          this.requiredCrmBinding,
        ],
      );
      const activation = activations[0];
      if (
        !activation ||
        !sameCalendarCrmCapabilities(activation.evidence, evidence)
      )
        return false;
      const rows: { generation: number }[] = await manager.query(
        `WITH updated AS (UPDATE calendar_sync."calendarCreationAttempt"
        SET "activationId" = $5, "crmCapabilityCheck" = $6::jsonb, "crmCapabilitiesCheckedAt" = $7::timestamptz
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND generation = $4 AND "sendStartedAt" IS NULL RETURNING generation) SELECT * FROM updated`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.uid,
          lease.leaseGeneration,
          activation.id,
          JSON.stringify(evidence),
          evidence.checkedAt,
        ],
      );
      return rows.length === 1;
    });
  }

  async beginSend(lease: CalendarCreationLease): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      const connection = await this.locked(manager, lease);
      if (
        !connection ||
        connection.state !== 'ACTIVE' ||
        connection.leaseUntil.getTime() - Date.now() < 50000
      )
        return false;
      if (this.requiredCrmBinding) {
        const capabilities: { generation: number }[] = await manager.query(
          `SELECT attempt.generation FROM calendar_sync."calendarCreationAttempt" attempt
          JOIN calendar_sync."calendarActivation" activation ON activation.id = attempt."activationId"
          WHERE attempt."workspaceId" = $1 AND attempt."connectionId" = $2 AND attempt.uid = $3 AND attempt.generation = $4
            AND activation."workspaceId" = $1 AND activation."connectionId" = $2 AND activation."configurationVersion" = $5
            AND activation.binding = $6 AND attempt."crmCapabilityCheck"->>'binding' = $6
            AND attempt."crmCapabilitiesCheckedAt" > clock_timestamp() - interval '60 seconds'`,
          [
            lease.workspaceId,
            lease.connectionId,
            lease.uid,
            lease.leaseGeneration,
            lease.configurationVersion,
            this.requiredCrmBinding,
          ],
        );
        if (!capabilities.length) return false;
      }

      const rows: {
        payload: unknown;
        candidate: { startsAt: string };
        lastSuccessfulReadAt: Date | null;
      }[] = await manager.query(
        `
        SELECT intent.payload, preview.candidate, connection."lastSuccessfulReadAt"
        FROM calendar_sync."calendarSessionCreateIntent" intent
        JOIN calendar_sync."calendarCurrentImportPreview" preview USING ("inboxId", "configurationVersion", "workspaceId", "connectionId")
        JOIN calendar_sync."calendarConnection" connection ON connection.id = intent."connectionId" AND connection."workspaceId" = intent."workspaceId"
        WHERE intent."workspaceId" = $1 AND intent."connectionId" = $2 AND intent.uid = $3 AND intent.state = 'PREPARED'
          AND preview.decision = 'READY' AND NOT EXISTS (SELECT 1 FROM calendar_sync."calendarSessionLink" link
            WHERE link."workspaceId" = $1 AND link."connectionId" = $2 AND link.uid = $3)`,
        [lease.workspaceId, lease.connectionId, lease.uid],
      );
      const row = rows[0];
      if (
        !row ||
        !row.lastSuccessfulReadAt ||
        Date.now() - row.lastSuccessfulReadAt.getTime() > 90000 ||
        Date.parse(row.candidate.startsAt) <= Date.now() ||
        JSON.stringify(calendarSessionCommandSchema.parse(row.payload)) !==
          JSON.stringify(lease.command)
      )
        return false;
      const resources: { calendarData: string }[] = await manager.query(
        `SELECT "calendarData" FROM calendar_sync."calendarResource"
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL`,
        [lease.workspaceId, lease.connectionId],
      );
      let occurrences = 0;
      for (const resource of resources) {
        const identifiers = readCalendarUids(resource.calendarData);
        if (!identifiers) return false;
        occurrences += identifiers.filter((uid) => uid === lease.uid).length;
      }
      if (occurrences !== 1) return false;
      const source = await this.currentSource(manager, lease);
      if (!source) return false;
      const sent: { generation: number }[] = await manager.query(
        `WITH updated AS (UPDATE calendar_sync."calendarCreationAttempt"
        SET "sendStartedAt" = clock_timestamp() WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3
          AND generation = $4 AND "sendStartedAt" IS NULL
          AND inspection->>'status' IN ('absent', 'incomplete')
          AND "liveSourceCheckedAt" > clock_timestamp() - interval '10 seconds'
          AND "liveSourceCheck"->>'status' = 'verified'
          AND "liveSourceCheck"->>'resourceUrl' = $5 AND "liveSourceCheck"->>'etag' = $6
          AND "liveSourceCheck"->>'contentHash' = $7 AND "liveSourceCheck"->>'resourceId' = $8
          AND ("liveSourceCheck"->>'resourceVersion')::integer = $9 RETURNING generation) SELECT * FROM updated`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.uid,
          lease.leaseGeneration,
          source.resourceUrl,
          source.etag,
          source.contentHash,
          source.resourceId,
          source.resourceVersion,
        ],
      );
      return sent.length === 1;
    });
  }

  async recordSendResult(
    lease: CalendarCreationLease,
    result: CalendarSessionCreationResult,
  ): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      const current = await this.locked(manager, lease);
      if (!current) return false;
      if (
        result.status === 'confirmed' &&
        current.knownClassSessionId &&
        current.knownClassSessionId !== result.classSessionId
      )
        return false;
      const rows: { generation: number }[] = await manager.query(
        `WITH updated AS (UPDATE calendar_sync."calendarCreationAttempt"
        SET "sendResult" = $5::jsonb WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND generation = $4
          AND "sendStartedAt" IS NOT NULL AND "sendResult" IS NULL RETURNING generation) SELECT * FROM updated`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.uid,
          lease.leaseGeneration,
          JSON.stringify(result),
        ],
      );
      if (!rows.length) return false;
      if (result.status === 'confirmed') {
        if (
          current.knownClassSessionId &&
          current.knownClassSessionId !== result.classSessionId
        )
          return false;
        await manager.query(
          `UPDATE calendar_sync."calendarCreationExecution" SET "knownClassSessionId" = $4
          WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
          [
            lease.workspaceId,
            lease.connectionId,
            lease.uid,
            result.classSessionId,
          ],
        );
      }
      return rows.length === 1;
    });
  }

  async settle(
    lease: CalendarCreationLease,
    result: CalendarCreationRecovery,
  ): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      const current = await this.locked(manager, lease);
      if (!current) return false;
      const observations: { inspection: CalendarCreationInspection | null }[] =
        await manager.query(
          `SELECT inspection FROM calendar_sync."calendarCreationAttempt" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND generation = $4`,
          [
            lease.workspaceId,
            lease.connectionId,
            lease.uid,
            lease.leaseGeneration,
          ],
        );
      const proof = observations[0]?.inspection;
      if (
        result.status === 'confirmed' &&
        (proof?.status !== 'confirmed' ||
          proof.classSessionId !== result.classSessionId ||
          proof.recordingKey !== current.expectedRecordingKey)
      )
        result = {
          status: 'needs-review',
          reason: 'CREATION_AUDIT_NOT_PERSISTED',
        };
      const final =
        result.status === 'confirmed' &&
        current.knownClassSessionId !== result.classSessionId
          ? {
              status: 'needs-review',
              reason: 'CRM_IDENTITY_CHANGED_DURING_CREATION',
            }
          : result;
      if (
        final.status === 'confirmed' &&
        proof?.status === 'confirmed' &&
        proof.session
      )
        await finalizeCalendarCreation(manager, lease, proof.session);
      const state =
        final.status === 'confirmed'
          ? 'CONFIRMED'
          : ['needs-review', 'auth-required', 'forbidden'].includes(
                final.status,
              )
            ? 'NEEDS_REVIEW'
            : 'RETRY';
      await manager.query(
        `UPDATE calendar_sync."calendarCreationExecution" SET state = $4, "lastResult" = $5::jsonb,
        "leaseUntil" = NULL, "nextAttemptAt" = clock_timestamp() + interval '60 seconds', "updatedAt" = now()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.uid,
          state,
          JSON.stringify(final),
        ],
      );
      await manager.query(
        `UPDATE calendar_sync."calendarCreationAttempt" SET result = $5::jsonb
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND generation = $4`,
        [
          lease.workspaceId,
          lease.connectionId,
          lease.uid,
          lease.leaseGeneration,
          JSON.stringify(final),
        ],
      );
      return true;
    });
  }
}
