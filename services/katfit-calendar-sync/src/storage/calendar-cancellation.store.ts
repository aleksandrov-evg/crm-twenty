import { createHash } from 'node:crypto';

import { type DataSource } from 'typeorm';
import { z } from 'zod';

import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';

export type CalendarCancellationSource = {
  uid: string;
  classSessionId: string;
  recordingKey: string;
  configurationVersion: number;
  timezone: string;
  calendarUrl: string;
  username: string;
  encryptedAppPassword: string;
  resourceId: string;
  resourceVersion: number;
  resourceUrl: string;
  etag: string;
  calendarData: string;
  missingSinceGeneration: number | null;
  readGeneration: number;
  missingMature: boolean;
  initialBookingIds: unknown;
  seenBookingIds: unknown;
};
export type CalendarCancellationObservation = {
  kind: 'MISSING' | 'CANCELLED';
  state: 'AWAITING_CONFIRMATION' | 'NEEDS_REVIEW' | 'CRM_CANCELLED_OBSERVED';
  initialBookingIds?: string[];
  reason: string;
  evidence: Record<string, unknown>;
};

export class CalendarCancellationStore {
  constructor(
    private readonly source: DataSource,
    readonly scope: CalendarCrmScope,
  ) {}
  private async lock(queryable: Pick<DataSource, 'query'>) {
    await queryable.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0))",
      [this.scope.workspaceId, this.scope.connectionId],
    );
    await queryable.query(
      'SELECT id FROM calendar_sync."calendarConnection" WHERE "workspaceId" = $1 AND id = $2 FOR UPDATE',
      [this.scope.workspaceId, this.scope.connectionId],
    );
  }
  async takeCandidate(): Promise<CalendarCancellationSource | null> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      const rows: CalendarCancellationSource[] = await manager.query(
        `SELECT link.uid, link."classSessionId", link."recordingKey", connection."configurationVersion",
        connection.timezone, connection."calendarUrl", connection.username, connection."encryptedAppPassword",
        resource.id AS "resourceId", resource."resourceVersion", resource.url AS "resourceUrl", resource.etag, resource."calendarData", resource."missingSinceGeneration", connection."readGeneration",
        (resource."missingSinceGeneration" IS NOT NULL AND connection."readGeneration" > resource."missingSinceGeneration" AND EXISTS (
          SELECT 1 FROM calendar_sync."calendarInbox" inbox WHERE inbox."resourceId" = resource.id AND inbox."resourceVersion" = resource."resourceVersion" AND inbox.kind = 'MISSING_CANDIDATE'
          AND inbox."createdAt" <= clock_timestamp() - interval '60 seconds')) AS "missingMature"
        , (SELECT review."initialBookingIds" FROM calendar_sync."calendarCancellationReview" review
           WHERE review."workspaceId" = link."workspaceId" AND review."connectionId" = link."connectionId" AND review.uid = link.uid
             AND review."configurationVersion" = connection."configurationVersion" AND review."resourceVersion" = resource."resourceVersion"
           ORDER BY review."createdAt" DESC LIMIT 1) AS "initialBookingIds"
        , (SELECT review."seenBookingIds" FROM calendar_sync."calendarCancellationReview" review
           WHERE review."workspaceId" = link."workspaceId" AND review."connectionId" = link."connectionId" AND review.uid = link.uid
             AND review."configurationVersion" = connection."configurationVersion" AND review."resourceVersion" = resource."resourceVersion"
           ORDER BY review."createdAt" DESC LIMIT 1) AS "seenBookingIds"
        FROM calendar_sync."calendarSessionLink" link
        JOIN calendar_sync."calendarConnection" connection ON connection.id = link."connectionId" AND connection."workspaceId" = link."workspaceId"
        JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId" AND resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId"
        WHERE link."workspaceId" = $1 AND link."connectionId" = $2 AND connection.state IN ('PREVIEW', 'ACTIVE')
          AND link."nextCancellationCheckAt" <= clock_timestamp() AND connection."lastSuccessfulReadAt" > clock_timestamp() - interval '90 seconds'
        ORDER BY link."nextCancellationCheckAt", link.uid LIMIT 1`,
        [this.scope.workspaceId, this.scope.connectionId],
      );
      if (!rows[0]) return null;
      await manager.query(
        `UPDATE calendar_sync."calendarSessionLink" SET "nextCancellationCheckAt" = clock_timestamp() + interval '60 seconds' WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [this.scope.workspaceId, this.scope.connectionId, rows[0].uid],
      );
      return rows[0];
    });
  }

  async presentResources(): Promise<{ calendarData: string }[]> {
    return this.source.query(
      `SELECT "calendarData" FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL`,
      [this.scope.workspaceId, this.scope.connectionId],
    );
  }

  async save(
    captured: CalendarCancellationSource,
    observation: CalendarCancellationObservation | null,
  ): Promise<'saved' | 'stale'> {
    return this.source.transaction(async (manager) => {
      await this.lock(manager);
      const rows = await manager.query(
        `SELECT link.uid FROM calendar_sync."calendarSessionLink" link
        JOIN calendar_sync."calendarConnection" connection ON connection.id = link."connectionId" AND connection."workspaceId" = link."workspaceId"
        JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId" AND resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId"
        WHERE link."workspaceId" = $1 AND link."connectionId" = $2 AND link.uid = $3 AND link."classSessionId" = $4 AND link."recordingKey" = $5
          AND connection.state IN ('PREVIEW', 'ACTIVE') AND connection."configurationVersion" = $6 AND connection."readGeneration" = $7
          AND connection."lastSuccessfulReadAt" > clock_timestamp() - interval '90 seconds'
          AND resource.id = $8 AND resource."resourceVersion" = $9 AND resource.etag = $10 AND resource."calendarData" = $11
          AND resource."missingSinceGeneration" IS NOT DISTINCT FROM $12::integer`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          captured.uid,
          captured.classSessionId,
          captured.recordingKey,
          captured.configurationVersion,
          captured.readGeneration,
          captured.resourceId,
          captured.resourceVersion,
          captured.etag,
          captured.calendarData,
          captured.missingSinceGeneration,
        ],
      );
      if (!rows[0]) return 'stale';
      const superseded: { id: string; evidence: Record<string, unknown> }[] =
        await manager.query(
          `WITH superseded AS (UPDATE calendar_sync."calendarCancellationReview" SET state = 'SUPERSEDED', "updatedAt" = clock_timestamp()
        WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND state <> 'SUPERSEDED'
          AND ($4::boolean OR "configurationVersion" <> $5 OR "resourceVersion" <> $6) RETURNING id, evidence) SELECT * FROM superseded`,
          [
            this.scope.workspaceId,
            this.scope.connectionId,
            captured.uid,
            observation === null,
            captured.configurationVersion,
            captured.resourceVersion,
          ],
        );
      for (const previous of superseded)
        await this.appendObservation(
          manager,
          previous.id,
          'SUPERSEDED',
          'CALENDAR_SOURCE_CHANGED',
          previous.evidence,
        );
      if (!observation) {
        await manager.query(
          `UPDATE calendar_sync."calendarSessionLink" SET "scheduleReviewReason" = NULL WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3 AND "scheduleReviewReason" = 'CALENDAR_CANCELLATION_REQUIRES_REVIEW'`,
          [this.scope.workspaceId, this.scope.connectionId, captured.uid],
        );
        return 'saved';
      }
      const seen = z
        .object({
          status: z.literal('read'),
          bookingIds: z.array(z.uuid()).max(1000),
        })
        .safeParse(observation.evidence.impact);
      const saved: { id: string }[] = await manager.query(
        `INSERT INTO calendar_sync."calendarCancellationReview" ("workspaceId", "connectionId", uid, "configurationVersion", "resourceVersion", kind, state, reason, evidence, "initialBookingIds", "outcomeObservedAt", "seenBookingIds")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,CASE WHEN $7 = 'CRM_CANCELLED_OBSERVED' THEN clock_timestamp() ELSE NULL END,$11::jsonb)
        ON CONFLICT ("workspaceId", "connectionId", uid, "configurationVersion", "resourceVersion", kind) DO UPDATE
          SET state = EXCLUDED.state, reason = EXCLUDED.reason, evidence = EXCLUDED.evidence, "updatedAt" = clock_timestamp(),
            "initialBookingIds" = COALESCE("calendarCancellationReview"."initialBookingIds", EXCLUDED."initialBookingIds"),
            "seenBookingIds" = CASE WHEN "calendarCancellationReview"."seenBookingIds" IS NULL AND EXCLUDED."seenBookingIds" IS NULL THEN NULL
              ELSE (SELECT COALESCE(jsonb_agg(DISTINCT value ORDER BY value), '[]'::jsonb) FROM jsonb_array_elements(COALESCE("calendarCancellationReview"."seenBookingIds", '[]'::jsonb) || COALESCE(EXCLUDED."seenBookingIds", '[]'::jsonb))) END,
            "outcomeObservedAt" = CASE WHEN EXCLUDED.state = 'CRM_CANCELLED_OBSERVED' THEN COALESCE("calendarCancellationReview"."outcomeObservedAt", clock_timestamp()) ELSE NULL END
          RETURNING id`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          captured.uid,
          captured.configurationVersion,
          captured.resourceVersion,
          observation.kind,
          observation.state,
          observation.reason,
          JSON.stringify(observation.evidence),
          observation.initialBookingIds
            ? JSON.stringify(observation.initialBookingIds)
            : null,
          seen.success ? JSON.stringify(seen.data.bookingIds) : null,
        ],
      );
      await this.appendObservation(
        manager,
        saved[0].id,
        observation.state,
        observation.reason,
        observation.evidence,
      );
      await manager.query(
        `UPDATE calendar_sync."calendarSessionLink" SET "scheduleReviewReason" = COALESCE("scheduleReviewReason", 'CALENDAR_CANCELLATION_REQUIRES_REVIEW') WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
        [this.scope.workspaceId, this.scope.connectionId, captured.uid],
      );
      return 'saved';
    });
  }

  private async appendObservation(
    queryable: Pick<DataSource, 'query'>,
    reviewId: string,
    state: string,
    reason: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          state,
          reason,
          evidence.calendarConfirmed,
          evidence.session ?? null,
          evidence.impact ?? null,
        ]),
      )
      .digest('hex');
    const previous: { evidenceHash: string }[] = await queryable.query(
      'SELECT "evidenceHash" FROM calendar_sync."calendarCancellationObservation" WHERE "reviewId" = $1 ORDER BY "observedAt" DESC, id DESC LIMIT 1',
      [reviewId],
    );
    if (previous[0]?.evidenceHash === hash) return;
    await queryable.query(
      `INSERT INTO calendar_sync."calendarCancellationObservation" ("reviewId", state, reason, evidence, "evidenceHash") VALUES ($1,$2,$3,$4::jsonb,$5)`,
      [reviewId, state, reason, JSON.stringify(evidence), hash],
    );
  }

  async history(reviewId: string): Promise<
    {
      id: string;
      observedAt: Date;
      state: string;
      reason: string;
      evidence: unknown;
    }[]
  > {
    return this.source.query(
      `SELECT observation.id, observation."observedAt", observation.state, observation.reason, observation.evidence
      FROM calendar_sync."calendarCancellationObservation" observation JOIN calendar_sync."calendarCancellationReview" review ON review.id = observation."reviewId"
      WHERE review."workspaceId" = $1 AND review."connectionId" = $2 AND review.id = $3 ORDER BY observation."observedAt" DESC, observation.id DESC LIMIT 100`,
      [this.scope.workspaceId, this.scope.connectionId, reviewId],
    );
  }

  async list(): Promise<
    {
      id: string;
      uid: string;
      state: string;
      kind: string;
      reason: string;
      evidence: unknown;
      updatedAt: Date;
    }[]
  > {
    return this.source.query(
      `SELECT id, uid, state, kind, reason, evidence, "updatedAt", "outcomeObservedAt", "initialBookingIds", "seenBookingIds" FROM calendar_sync."calendarCancellationReview" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND state <> 'SUPERSEDED' ORDER BY "updatedAt" DESC, id LIMIT 100`,
      [this.scope.workspaceId, this.scope.connectionId],
    );
  }
}
