import { createHash } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { CalendarCredentialCipher } from '../security/calendar-credential-cipher';
import {
  type CalendarResourceSnapshot,
  type CalendarSnapshotResult,
  isCalendarResourceUrl,
} from '../transport/read-calendar-snapshot';

export type CalendarPollLease = {
  id: string;
  workspaceId: string;
  calendarUrl: string;
  configurationVersion: number;
  pollLeaseGeneration: number;
};

type Resource = {
  id: string;
  resourceVersion: number;
  etag: string;
  contentHash: string;
  missingSinceGeneration: number | null;
};
type PollFailure = Exclude<CalendarSnapshotResult['status'], 'snapshot'>;

export class CalendarPollStore {
  constructor(
    private readonly source: DataSource,
    private readonly cipher: CalendarCredentialCipher,
  ) {}

  async claimNext(): Promise<CalendarPollLease | null> {
    const rows = await this.source.query<
      CalendarPollLease[]
    >(`WITH candidate AS (
      SELECT "id" FROM "calendar_sync"."calendarConnection"
      WHERE "state" IN ('PREVIEW', 'ACTIVE') AND "nextPollAt" <= statement_timestamp()
        AND ("pollLeaseUntil" IS NULL OR "pollLeaseUntil" <= statement_timestamp())
      ORDER BY "nextPollAt", "id" LIMIT 1 FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE "calendar_sync"."calendarConnection" connection
      SET "pollLeaseGeneration" = "pollLeaseGeneration" + 1,
        "pollLeaseUntil" = statement_timestamp() + interval '120 seconds'
      FROM candidate WHERE connection."id" = candidate."id"
      RETURNING connection."id", connection."workspaceId", connection."calendarUrl",
        connection."configurationVersion", connection."pollLeaseGeneration"
    ) SELECT * FROM claimed`);
    return rows[0] ?? null;
  }

  async readCredentials(
    lease: CalendarPollLease,
  ): Promise<{ username: string; appPassword: string } | null> {
    const rows = await this.source.query<
      Array<{ username: string; encryptedAppPassword: string }>
    >(
      `SELECT "username", "encryptedAppPassword" FROM "calendar_sync"."calendarConnection"
       WHERE "workspaceId" = $1 AND "id" = $2 AND "configurationVersion" = $3
         AND "pollLeaseGeneration" = $4 AND "pollLeaseUntil" > clock_timestamp() AND "state" IN ('PREVIEW', 'ACTIVE')`,
      this.parameters(lease),
    );
    if (!rows[0]) return null;
    return {
      username: rows[0].username,
      appPassword: this.cipher.open(
        {
          workspaceId: lease.workspaceId,
          connectionId: lease.id,
          username: rows[0].username,
        },
        rows[0].encryptedAppPassword,
      ),
    };
  }

  async commitSnapshot(
    lease: CalendarPollLease,
    resources: CalendarResourceSnapshot[],
  ): Promise<boolean> {
    if (
      resources.length > 2000 ||
      new Set(resources.map((value) => value.url)).size !== resources.length ||
      resources.some(
        (value) => !isCalendarResourceUrl(lease.calendarUrl, value.url),
      )
    ) {
      throw new Error('CALENDAR_SNAPSHOT_INVALID');
    }

    return this.source.transaction(async (manager) => {
      const connections = await manager.query<
        Array<{ readGeneration: number; calendarUrl: string }>
      >(
        `SELECT "readGeneration", "calendarUrl" FROM "calendar_sync"."calendarConnection"
         WHERE "workspaceId" = $1 AND "id" = $2 AND "configurationVersion" = $3
           AND "pollLeaseGeneration" = $4 AND "pollLeaseUntil" > clock_timestamp()
           AND "state" IN ('PREVIEW', 'ACTIVE') FOR UPDATE`,
        this.parameters(lease),
      );
      if (!connections[0] || connections[0].calendarUrl !== lease.calendarUrl)
        return false;
      const generation = connections[0].readGeneration + 1;

      for (const resource of resources) {
        const hash = createHash('sha256')
          .update(resource.calendarData)
          .digest('hex');
        const existing = await manager.query<Resource[]>(
          `SELECT "id", "resourceVersion", "etag", "contentHash", "missingSinceGeneration"
           FROM "calendar_sync"."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "url" = $3`,
          [lease.workspaceId, lease.id, resource.url],
        );
        const old = existing[0];
        if (
          old &&
          old.etag === resource.etag &&
          old.contentHash === hash &&
          old.missingSinceGeneration === null
        ) {
          await manager.query(
            'UPDATE "calendar_sync"."calendarResource" SET "lastSeenGeneration" = $2 WHERE "id" = $1',
            [old.id, generation],
          );
          continue;
        }
        const saved = await manager.query<Resource[]>(
          `INSERT INTO "calendar_sync"."calendarResource"
            ("workspaceId", "connectionId", "url", "etag", "contentHash", "calendarData", "lastSeenGeneration")
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT ("workspaceId", "connectionId", "url") DO UPDATE
             SET "etag" = EXCLUDED."etag", "contentHash" = EXCLUDED."contentHash", "calendarData" = EXCLUDED."calendarData",
               "resourceVersion" = "calendarResource"."resourceVersion" + 1,
               "lastSeenGeneration" = EXCLUDED."lastSeenGeneration", "missingSinceGeneration" = NULL
           RETURNING "id", "resourceVersion", "etag", "contentHash"`,
          [
            lease.workspaceId,
            lease.id,
            resource.url,
            resource.etag,
            hash,
            resource.calendarData,
            generation,
          ],
        );
        await manager.query(
          `INSERT INTO "calendar_sync"."calendarInbox" ("workspaceId", "connectionId", "resourceId", "resourceVersion", "kind", "etag", "contentHash", "calendarData")
           VALUES ($1, $2, $3, $4, 'UPSERT', $5, $6, $7)`,
          [
            lease.workspaceId,
            lease.id,
            saved[0].id,
            saved[0].resourceVersion,
            resource.etag,
            hash,
            resource.calendarData,
          ],
        );
      }

      // Absence from a complete inventory is a hint for verification, never an automatic cancellation.
      await manager.query(
        `WITH missing AS (
          UPDATE "calendar_sync"."calendarResource"
          SET "missingSinceGeneration" = $3, "resourceVersion" = "resourceVersion" + 1
          WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "lastSeenGeneration" <> $3 AND "missingSinceGeneration" IS NULL
          RETURNING *
        ) INSERT INTO "calendar_sync"."calendarInbox" ("workspaceId", "connectionId", "resourceId", "resourceVersion", "kind", "etag", "contentHash", "calendarData")
          SELECT "workspaceId", "connectionId", "id", "resourceVersion", 'MISSING_CANDIDATE', "etag", "contentHash", NULL FROM missing`,
        [lease.workspaceId, lease.id, generation],
      );
      const committed = await manager.query<Array<{ id: string }>>(
        `WITH updated AS (
          UPDATE "calendar_sync"."calendarConnection"
          SET "readGeneration" = $5, "lastSuccessfulReadAt" = now(), "lastReadError" = NULL,
            "pollLeaseUntil" = NULL, "nextPollAt" = now() + interval '60 seconds' + random() * interval '10 seconds'
          WHERE "workspaceId" = $1 AND "id" = $2 AND "configurationVersion" = $3 AND "pollLeaseGeneration" = $4
            AND "pollLeaseUntil" > clock_timestamp() AND "state" IN ('PREVIEW', 'ACTIVE') RETURNING "id"
        ) SELECT * FROM updated`,
        [...this.parameters(lease), generation],
      );
      if (committed.length === 0) throw new Error('CALENDAR_POLL_LEASE_LOST');
      return true;
    });
  }

  async fail(lease: CalendarPollLease, error: PollFailure): Promise<boolean> {
    const rows = await this.source.query<Array<{ id: string }>>(
      `WITH updated AS (
        UPDATE "calendar_sync"."calendarConnection"
        SET "lastReadError" = $5, "pollLeaseUntil" = NULL, "nextPollAt" = now() + interval '60 seconds',
          "state" = CASE WHEN $5 = 'auth-required' THEN 'AUTH_REQUIRED' WHEN $5 = 'forbidden' THEN 'ERROR' ELSE "state" END,
          "configurationVersion" = "configurationVersion" + CASE WHEN $5 IN ('auth-required', 'forbidden') THEN 1 ELSE 0 END
        WHERE "workspaceId" = $1 AND "id" = $2 AND "configurationVersion" = $3 AND "pollLeaseGeneration" = $4
          AND "pollLeaseUntil" > clock_timestamp() AND "state" IN ('PREVIEW', 'ACTIVE') RETURNING "id"
      ) SELECT * FROM updated`,
      [...this.parameters(lease), error],
    );
    return rows.length === 1;
  }

  private parameters(
    lease: CalendarPollLease,
  ): [string, string, number, number] {
    return [
      lease.workspaceId,
      lease.id,
      lease.configurationVersion,
      lease.pollLeaseGeneration,
    ];
  }
}
