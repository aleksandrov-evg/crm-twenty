import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarImportPreview1792240000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "calendar_sync"."calendarImportPreview" (
      "inboxId" uuid NOT NULL REFERENCES "calendar_sync"."calendarInbox" ("id") ON DELETE CASCADE,
      "configurationVersion" integer NOT NULL,
      "decision" text NOT NULL CHECK ("decision" IN ('READY', 'NEEDS_REVIEW', 'SUPERSEDED')),
      "reason" text, "candidate" jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("inboxId", "configurationVersion"),
      CHECK (("decision" = 'READY' AND "candidate" IS NOT NULL AND "reason" IS NULL)
        OR ("decision" <> 'READY' AND "candidate" IS NULL AND "reason" IS NOT NULL))
    )`);
    await queryRunner.query(`CREATE VIEW "calendar_sync"."calendarCurrentImportPreview" AS
      SELECT preview.*, inbox."workspaceId", inbox."connectionId", inbox."resourceId", inbox."resourceVersion", inbox."kind"
      FROM "calendar_sync"."calendarImportPreview" preview
      JOIN "calendar_sync"."calendarInbox" inbox ON inbox."id" = preview."inboxId"
      JOIN "calendar_sync"."calendarConnection" connection ON connection."id" = inbox."connectionId"
        AND connection."workspaceId" = inbox."workspaceId"
      JOIN "calendar_sync"."calendarResource" resource ON resource."id" = inbox."resourceId"
        AND resource."workspaceId" = inbox."workspaceId" AND resource."connectionId" = inbox."connectionId"
      WHERE connection."state" IN ('PREVIEW', 'ACTIVE') AND inbox."state" = 'PENDING'
        AND preview."configurationVersion" = connection."configurationVersion"
        AND inbox."resourceVersion" = resource."resourceVersion"
        AND preview."decision" <> 'SUPERSEDED'
        AND ((inbox."kind" = 'UPSERT' AND resource."missingSinceGeneration" IS NULL)
          OR (inbox."kind" = 'MISSING_CANDIDATE' AND resource."missingSinceGeneration" IS NOT NULL))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP VIEW "calendar_sync"."calendarCurrentImportPreview"',
    );
    await queryRunner.query(
      'DROP TABLE "calendar_sync"."calendarImportPreview"',
    );
  }
}
