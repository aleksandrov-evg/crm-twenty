import { createHash } from 'node:crypto';
import { type DataSource } from 'typeorm';
import {
  calendarCancellationCommandSchema,
  calendarCancellationSessionSchema,
  type CalendarCancellationCommand,
} from '../crm/cancel-calendar-session';
import { type CalendarCrmSession } from '../crm/find-calendar-session';
import { type CalendarCrmScope } from './calendar-crm-reconciliation.store';

export type CancellationExecutionSource = {
  reviewId: string;
  uid: string;
  kind: 'MISSING' | 'CANCELLED';
  configurationVersion: number;
  resourceVersion: number;
  classSessionId: string;
  recordingKey: string;
  timezone: string;
  username: string;
  encryptedAppPassword: string;
  calendarUrl: string;
  resourceUrl: string;
  etag: string;
  calendarData: string;
  missing: boolean;
  missingMature: boolean;
  initialBookingIds: unknown;
  seenBookingIds: unknown;
  readGeneration: number;
};
export type CancellationExecution = {
  command: CalendarCancellationCommand;
  state: 'PREPARED' | 'SENDING' | 'CONFIRMED' | 'NEEDS_REVIEW';
};
export class CalendarCancellationExecutionStore {
  constructor(
    private readonly source: DataSource,
    readonly scope: CalendarCrmScope,
    private readonly binding: string,
  ) {}
  async capture(reviewId: string): Promise<CancellationExecutionSource | null> {
    const rows: CancellationExecutionSource[] = await this.source.query(
      `SELECT review.id AS "reviewId", review.uid, review.kind, review."configurationVersion", review."resourceVersion", review."initialBookingIds", review."seenBookingIds", connection."readGeneration",
      link."classSessionId", link."recordingKey", connection.timezone, connection.username, connection."encryptedAppPassword", connection."calendarUrl", resource.url AS "resourceUrl", resource.etag, resource."calendarData",
      resource."missingSinceGeneration" IS NOT NULL AS missing,
      (resource."missingSinceGeneration" IS NOT NULL AND connection."readGeneration" > resource."missingSinceGeneration" AND EXISTS(SELECT 1 FROM calendar_sync."calendarInbox" inbox WHERE inbox."resourceId" = resource.id AND inbox."resourceVersion" = resource."resourceVersion" AND inbox.kind = 'MISSING_CANDIDATE' AND inbox."createdAt" < clock_timestamp() - interval '60 seconds')) AS "missingMature"
      FROM calendar_sync."calendarCancellationReview" review
      JOIN calendar_sync."calendarSessionLink" link ON link."workspaceId" = review."workspaceId" AND link."connectionId" = review."connectionId" AND link.uid = review.uid AND link."recurrenceKey" = 'single'
      JOIN calendar_sync."calendarConnection" connection ON connection.id = review."connectionId" AND connection."workspaceId" = review."workspaceId"
      JOIN calendar_sync."calendarResource" resource ON resource.id = link."resourceId" AND resource."workspaceId" = link."workspaceId" AND resource."connectionId" = link."connectionId"
      JOIN calendar_sync."calendarActivation" activation ON activation."workspaceId" = connection."workspaceId" AND activation."connectionId" = connection.id AND activation."configurationVersion" = connection."configurationVersion" AND activation.binding = $4
      WHERE review.id = $3 AND review."workspaceId" = $1 AND review."connectionId" = $2 AND review.state IN ('NEEDS_REVIEW', 'CRM_CANCELLED_OBSERVED')
        AND connection.state = 'ACTIVE' AND connection."configurationVersion" = review."configurationVersion" AND resource."resourceVersion" = review."resourceVersion"
        AND connection."lastSuccessfulReadAt" > clock_timestamp() - interval '90 seconds'`,
      [this.scope.workspaceId, this.scope.connectionId, reviewId, this.binding],
    );
    return rows[0] ?? null;
  }
  async presentResources(): Promise<{ calendarData: string }[]> {
    return this.source.query(
      'SELECT "calendarData" FROM calendar_sync."calendarResource" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL',
      [this.scope.workspaceId, this.scope.connectionId],
    );
  }
  async get(reviewId: string): Promise<CancellationExecution | null> {
    const rows = await this.source.query(
      `SELECT execution.command, execution.state FROM calendar_sync."calendarCancellationExecution" execution JOIN calendar_sync."calendarCancellationReview" review ON review.id = execution."reviewId" WHERE review.id = $3 AND review."workspaceId" = $1 AND review."connectionId" = $2 AND execution.binding = $4`,
      [this.scope.workspaceId, this.scope.connectionId, reviewId, this.binding],
    );
    if (!rows[0]) return null;
    return {
      command: calendarCancellationCommandSchema.parse(rows[0].command),
      state: rows[0].state,
    };
  }
  async prepare(
    captured: CancellationExecutionSource,
    bookingIds: string[],
    session: CalendarCrmSession,
  ): Promise<CancellationExecution> {
    const command: CalendarCancellationCommand = {
      classSessionId: captured.classSessionId,
      cancelledAt: new Date().toISOString(),
      idempotencyKey: `calendar-cancel:${createHash('sha256')
        .update(
          JSON.stringify([
            this.scope,
            captured.reviewId,
            captured.configurationVersion,
            captured.resourceVersion,
          ]),
        )
        .digest('hex')}`,
      expectedBookingIds: [...bookingIds].sort(),
      expectedSession: calendarCancellationSessionSchema.parse({
        name: session.name,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        sessionFormat: session.sessionFormat,
        capacity: session.capacity,
        status: session.status,
        recordingKey: session.recordingKey,
      }),
    };
    calendarCancellationCommandSchema.parse(command);
    await this.source.query(
      `INSERT INTO calendar_sync."calendarCancellationExecution" ("reviewId", binding, command, state) SELECT review.id, $4, $5::jsonb, 'PREPARED' FROM calendar_sync."calendarCancellationReview" review WHERE review.id = $3 AND review."workspaceId" = $1 AND review."connectionId" = $2 AND review."configurationVersion" = $6 AND review."resourceVersion" = $7 AND review.state = 'NEEDS_REVIEW' ON CONFLICT ("reviewId") DO NOTHING`,
      [
        this.scope.workspaceId,
        this.scope.connectionId,
        captured.reviewId,
        this.binding,
        JSON.stringify(command),
        captured.configurationVersion,
        captured.resourceVersion,
      ],
    );
    const result = await this.get(captured.reviewId);
    if (!result) throw Error('CANCELLATION_PREPARATION_UNCONFIRMED');
    if (
      JSON.stringify(result.command.expectedSession) !==
        JSON.stringify(command.expectedSession) ||
      result.command.idempotencyKey !== command.idempotencyKey ||
      result.command.classSessionId !== command.classSessionId ||
      JSON.stringify(result.command.expectedBookingIds) !==
        JSON.stringify(command.expectedBookingIds)
    )
      throw Error('CANCELLATION_PREPARED_INVENTORY_CHANGED');
    return result;
  }
  async beginSend(captured: CancellationExecutionSource): Promise<boolean> {
    return this.source.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::uuid::text, 0))",
        [this.scope.workspaceId, this.scope.connectionId],
      );
      const rows = await manager.query(
        `WITH sent AS (UPDATE calendar_sync."calendarCancellationExecution" execution SET state = 'SENDING', "sendStartedAt" = clock_timestamp(), "updatedAt" = clock_timestamp() FROM calendar_sync."calendarCancellationReview" review, calendar_sync."calendarConnection" connection, calendar_sync."calendarSessionLink" link, calendar_sync."calendarResource" resource, calendar_sync."calendarActivation" activation
      WHERE execution."reviewId" = $3 AND execution.binding = $4 AND execution.state = 'PREPARED' AND review.id = execution."reviewId" AND review.state = 'NEEDS_REVIEW'
      AND review."workspaceId" = $1 AND review."connectionId" = $2 AND connection."workspaceId" = $1 AND connection.id = $2 AND connection.state = 'ACTIVE' AND connection."configurationVersion" = $5 AND review."configurationVersion" = $5 AND review."resourceVersion" = $6
      AND link."workspaceId" = $1 AND link."connectionId" = $2 AND link.uid = review.uid AND link."classSessionId" = $7 AND resource.id = link."resourceId" AND resource."resourceVersion" = $6 AND resource.url = $8 AND resource.etag = $9 AND resource."calendarData" = $10 AND (resource."missingSinceGeneration" IS NOT NULL) = $11
      AND activation."workspaceId" = $1 AND activation."connectionId" = $2 AND activation."configurationVersion" = $5 AND activation.binding = $4 AND connection."readGeneration" = $12 AND connection."lastSuccessfulReadAt" > clock_timestamp() - interval '90 seconds' RETURNING execution."reviewId") SELECT * FROM sent`,
        [
          this.scope.workspaceId,
          this.scope.connectionId,
          captured.reviewId,
          this.binding,
          captured.configurationVersion,
          captured.resourceVersion,
          captured.classSessionId,
          captured.resourceUrl,
          captured.etag,
          captured.calendarData,
          captured.missing,
          captured.readGeneration,
        ],
      );
      return rows.length === 1;
    });
  }
  async settle(reviewId: string, confirmed: boolean): Promise<void> {
    await this.source.query(
      `UPDATE calendar_sync."calendarCancellationExecution" execution SET state = $5, "updatedAt" = clock_timestamp(), result = $6::jsonb FROM calendar_sync."calendarCancellationReview" review WHERE execution."reviewId" = review.id AND review.id = $3 AND review."workspaceId" = $1 AND review."connectionId" = $2 AND execution.binding = $4 AND execution.state IN ('SENDING', 'NEEDS_REVIEW')`,
      [
        this.scope.workspaceId,
        this.scope.connectionId,
        reviewId,
        this.binding,
        confirmed ? 'CONFIRMED' : 'NEEDS_REVIEW',
        JSON.stringify({ gatewayReceiptConfirmed: confirmed }),
      ],
    );
  }
}
