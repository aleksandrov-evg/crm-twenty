import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarSessionLinks1792241000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "calendar_sync"."calendarSessionLink" (
      "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL,
      "uid" text NOT NULL, "recurrenceKey" text NOT NULL CHECK ("recurrenceKey" = 'single'),
      "classSessionId" uuid NOT NULL, "resourceId" uuid NOT NULL,
      "recordingKey" text NOT NULL, "observedSession" jsonb NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("workspaceId", "connectionId", "uid", "recurrenceKey"),
      UNIQUE ("workspaceId", "connectionId", "classSessionId"),
      FOREIGN KEY ("workspaceId", "connectionId", "resourceId") REFERENCES "calendar_sync"."calendarResource" ("workspaceId", "connectionId", "id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE TABLE "calendar_sync"."calendarCrmReconciliation" (
      "inboxId" uuid NOT NULL, "configurationVersion" integer NOT NULL,
      "decision" text NOT NULL DEFAULT 'PENDING' CHECK ("decision" IN ('PENDING', 'LINKED', 'CREATE_CANDIDATE', 'NEEDS_REVIEW')),
      "reason" text, "attempts" integer NOT NULL DEFAULT 0,
      "leaseGeneration" integer NOT NULL DEFAULT 0, "leaseUntil" timestamptz,
      "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("inboxId", "configurationVersion"),
      FOREIGN KEY ("inboxId", "configurationVersion") REFERENCES "calendar_sync"."calendarImportPreview" ("inboxId", "configurationVersion") ON DELETE CASCADE
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE "calendar_sync"."calendarCrmReconciliation"',
    );
    await queryRunner.query('DROP TABLE "calendar_sync"."calendarSessionLink"');
  }
}
