import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarInbox1792237004000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "calendar_sync"."calendarConnection"
      ADD COLUMN "readGeneration" integer NOT NULL DEFAULT 0,
      ADD COLUMN "pollLeaseGeneration" integer NOT NULL DEFAULT 0,
      ADD COLUMN "pollLeaseUntil" timestamptz,
      ADD COLUMN "nextPollAt" timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN "lastSuccessfulReadAt" timestamptz,
      ADD COLUMN "lastReadError" text,
      ADD CONSTRAINT "UQ_CALENDAR_CONNECTION_SCOPE" UNIQUE ("workspaceId", "id")`);
    await queryRunner.query(`CREATE TABLE "calendar_sync"."calendarResource" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL,
      "url" text NOT NULL, "etag" text NOT NULL,
      "contentHash" text NOT NULL, "calendarData" text NOT NULL,
      "resourceVersion" integer NOT NULL DEFAULT 1,
      "lastSeenGeneration" integer NOT NULL, "missingSinceGeneration" integer,
      UNIQUE ("workspaceId", "connectionId", "url"),
      UNIQUE ("workspaceId", "connectionId", "id"),
      FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "calendar_sync"."calendarConnection" ("workspaceId", "id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE TABLE "calendar_sync"."calendarInbox" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL, "resourceId" uuid NOT NULL,
      "resourceVersion" integer NOT NULL,
      "kind" text NOT NULL CHECK ("kind" IN ('UPSERT', 'MISSING_CANDIDATE')),
      "etag" text NOT NULL, "contentHash" text NOT NULL, "calendarData" text,
      "state" text NOT NULL DEFAULT 'PENDING' CHECK ("state" IN ('PENDING', 'APPLIED', 'NEEDS_REVIEW')),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("resourceId", "resourceVersion", "kind"),
      FOREIGN KEY ("workspaceId", "connectionId", "resourceId") REFERENCES "calendar_sync"."calendarResource" ("workspaceId", "connectionId", "id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_CALENDAR_INBOX_PENDING" ON "calendar_sync"."calendarInbox" ("workspaceId", "connectionId", "state")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_CALENDAR_POLL_DUE" ON "calendar_sync"."calendarConnection" ("state", "nextPollAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "calendar_sync"."calendarInbox"');
    await queryRunner.query('DROP TABLE "calendar_sync"."calendarResource"');
    await queryRunner.query(
      'DROP INDEX "calendar_sync"."IDX_CALENDAR_POLL_DUE"',
    );
    await queryRunner.query(`ALTER TABLE "calendar_sync"."calendarConnection"
      DROP CONSTRAINT "UQ_CALENDAR_CONNECTION_SCOPE",
      DROP COLUMN "readGeneration", DROP COLUMN "pollLeaseGeneration", DROP COLUMN "pollLeaseUntil",
      DROP COLUMN "nextPollAt", DROP COLUMN "lastSuccessfulReadAt", DROP COLUMN "lastReadError"`);
  }
}
