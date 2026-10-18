import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class FinalizeCalendarCreation1792246000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarSessionLink" ADD COLUMN "commonBase" jsonb,
      ADD COLUMN "baseResourceVersion" integer, ADD COLUMN "baseEtag" text`);
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarCreationExecution"
      ADD COLUMN "finalizationState" text CHECK ("finalizationState" IN ('LINKED', 'NEEDS_REVIEW')),
      ADD COLUMN "finalizationReason" text, ADD COLUMN "finalizationLeaseGeneration" integer NOT NULL DEFAULT 0,
      ADD COLUMN "finalizationLeaseUntil" timestamptz, ADD COLUMN "nextFinalizeAt" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarDescriptionRefresh" (
      "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL, uid text NOT NULL, "recurrenceKey" text NOT NULL,
      "leaseGeneration" integer NOT NULL DEFAULT 0, "leaseUntil" timestamptz,
      "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "lastResult" text,
      PRIMARY KEY ("workspaceId", "connectionId", uid, "recurrenceKey"),
      FOREIGN KEY ("workspaceId", "connectionId", uid, "recurrenceKey") REFERENCES calendar_sync."calendarSessionLink" ("workspaceId", "connectionId", uid, "recurrenceKey") ON DELETE CASCADE
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE calendar_sync."calendarDescriptionRefresh"',
    );
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarCreationExecution" DROP COLUMN "finalizationState", DROP COLUMN "finalizationReason",
      DROP COLUMN "finalizationLeaseGeneration", DROP COLUMN "finalizationLeaseUntil", DROP COLUMN "nextFinalizeAt"`);
    await queryRunner.query(
      `ALTER TABLE calendar_sync."calendarSessionLink" DROP COLUMN "commonBase", DROP COLUMN "baseResourceVersion", DROP COLUMN "baseEtag"`,
    );
  }
}
