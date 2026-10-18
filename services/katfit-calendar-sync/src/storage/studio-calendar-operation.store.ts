import { DataSource } from 'typeorm';

import {
  type StudioCalendarOperationAction,
  type CalendarOperation,
} from './calendar-operation';

type OperationScope = { workspaceId: string; connectionId: string };
type OperationLease = OperationScope & { id: string; leaseGeneration: number };

type OperationOutcome =
  | {
      state: 'SUCCEEDED' | 'CONFLICT' | 'FAILED' | 'SUPERSEDED';
      errorCode?: string;
    }
  | {
      state: 'RETRY';
      delaySeconds: number;
      errorCode: string;
      requiresReconciliation: boolean;
    };

export const enqueueCalendarOperation = async (
  queryable: Pick<DataSource, 'query'>,
  input: OperationScope & {
    resourceKey: string;
    idempotencyKey: string;
    action: StudioCalendarOperationAction;
    payload: Record<string, unknown>;
  },
): Promise<CalendarOperation> => {
  const rows = await queryable.query<CalendarOperation[]>(
    `WITH inserted AS (
        INSERT INTO "calendar_sync"."studioCalendarOperation"
          ("workspaceId", "connectionId", "resourceKey", "idempotencyKey", "action", "payload")
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT ("workspaceId", "idempotencyKey") DO UPDATE
          SET "idempotencyKey" = EXCLUDED."idempotencyKey"
          WHERE "studioCalendarOperation"."connectionId" = EXCLUDED."connectionId"
            AND "studioCalendarOperation"."resourceKey" = EXCLUDED."resourceKey"
            AND "studioCalendarOperation"."action" = EXCLUDED."action"
            AND "studioCalendarOperation"."payload" = EXCLUDED."payload"
        RETURNING *
      ) SELECT * FROM inserted`,
    [
      input.workspaceId,
      input.connectionId,
      input.resourceKey,
      input.idempotencyKey,
      input.action,
      JSON.stringify(input.payload),
    ],
  );

  if (rows.length === 0) {
    throw new Error('STUDIO_CALENDAR_IDEMPOTENCY_CONFLICT');
  }

  return rows[0];
};

export class StudioCalendarOperationStore {
  constructor(private readonly dataSource: DataSource) {}

  async enqueue(
    input: OperationScope & {
      resourceKey: string;
      idempotencyKey: string;
      action: StudioCalendarOperationAction;
      payload: Record<string, unknown>;
    },
  ): Promise<CalendarOperation> {
    return enqueueCalendarOperation(this.dataSource, input);
  }

  async claimNext(
    scope: OperationScope,
    leaseSeconds: number,
    action?: StudioCalendarOperationAction,
  ): Promise<CalendarOperation | null> {
    if (
      !Number.isInteger(leaseSeconds) ||
      leaseSeconds < 5 ||
      leaseSeconds > 3600
    ) {
      throw new Error('STUDIO_CALENDAR_INVALID_LEASE_DURATION');
    }

    return this.dataSource.transaction(async (manager) => {
      // Acquire the advisory lock before the claim statement so its snapshot includes the previous claimant's commit.
      const locks: { acquired: boolean }[] = await manager.query(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0)) AS acquired",
        [scope.workspaceId, scope.connectionId],
      );
      if (!locks[0].acquired) return null;
      const rows: CalendarOperation[] = await manager.query(
        `WITH candidate AS (
          SELECT operation."id"
          FROM "calendar_sync"."studioCalendarOperation" operation
          WHERE operation."workspaceId" = $1 AND operation."connectionId" = $2
            AND ($4::text IS NULL OR operation.action = $4)
            AND NOT EXISTS (
              SELECT 1 FROM "calendar_sync"."studioCalendarOperation" active
              WHERE active."workspaceId" = $1 AND active."connectionId" = $2
                AND active."state" = 'RUNNING' AND (active."leaseUntil" > statement_timestamp()
                  OR ($4::text IS NOT NULL AND active.action <> $4))
            )
            AND (
              (operation."state" IN ('PENDING', 'RETRY') AND operation."nextAttemptAt" <= statement_timestamp())
              OR (operation."state" = 'RUNNING' AND operation."leaseUntil" <= statement_timestamp())
            )
          ORDER BY CASE WHEN operation."state" = 'RUNNING' THEN 0 ELSE 1 END,
            operation."nextAttemptAt", operation."createdAt", operation."id"
          LIMIT 1 FOR UPDATE SKIP LOCKED
        ), claimed AS (
          UPDATE "calendar_sync"."studioCalendarOperation" operation
          SET "requiresReconciliation" = operation."requiresReconciliation" OR operation."state" = 'RUNNING',
            "state" = 'RUNNING', "attempts" = operation."attempts" + 1,
            "leaseGeneration" = operation."leaseGeneration" + 1,
            "leaseUntil" = statement_timestamp() + $3 * interval '1 second', "updatedAt" = statement_timestamp()
          FROM candidate WHERE operation."id" = candidate."id"
          RETURNING operation.*
        ) SELECT * FROM claimed`,
        [scope.workspaceId, scope.connectionId, leaseSeconds, action ?? null],
      );
      return rows[0] ?? null;
    });
  }

  async settle(
    lease: OperationLease,
    outcome: OperationOutcome,
  ): Promise<boolean> {
    const delaySeconds = outcome.state === 'RETRY' ? outcome.delaySeconds : 0;

    if (
      !Number.isInteger(delaySeconds) ||
      delaySeconds < 0 ||
      delaySeconds > 86400
    ) {
      throw new Error('STUDIO_CALENDAR_INVALID_RETRY_DELAY');
    }

    // A stale worker must not acknowledge or reschedule a reclaimed operation.
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `WITH settled AS (
        UPDATE "calendar_sync"."studioCalendarOperation"
        SET "state" = $5, "leaseUntil" = NULL, "errorCode" = $6,
          "nextAttemptAt" = statement_timestamp() + $7 * interval '1 second',
          "requiresReconciliation" = $8, "updatedAt" = statement_timestamp()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "id" = $3
          AND "leaseGeneration" = $4 AND "state" = 'RUNNING'
          AND "leaseUntil" > statement_timestamp()
        RETURNING "id"
      ) SELECT * FROM settled`,
      [
        lease.workspaceId,
        lease.connectionId,
        lease.id,
        lease.leaseGeneration,
        outcome.state,
        outcome.errorCode ?? null,
        delaySeconds,
        outcome.state === 'RETRY' ? outcome.requiresReconciliation : false,
      ],
    );

    return rows.length === 1;
  }
}
