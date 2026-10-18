import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarSessionIntents1792242000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarSessionCreateIntent" (
      "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL, uid text NOT NULL,
      "recurrenceKey" text NOT NULL CHECK ("recurrenceKey" = 'single'),
      "inboxId" uuid NOT NULL, "configurationVersion" integer NOT NULL,
      "idempotencyKey" text NOT NULL, payload jsonb NOT NULL,
      state text NOT NULL DEFAULT 'PREPARED' CHECK (state IN ('PREPARED', 'NEEDS_REVIEW')),
      reason text, "createdAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("workspaceId", "connectionId", uid, "recurrenceKey"),
      UNIQUE ("workspaceId", "idempotencyKey"),
      FOREIGN KEY ("inboxId", "configurationVersion") REFERENCES calendar_sync."calendarImportPreview" ("inboxId", "configurationVersion"),
      FOREIGN KEY ("workspaceId", "connectionId") REFERENCES calendar_sync."calendarConnection" ("workspaceId", id) ON DELETE CASCADE
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE calendar_sync."calendarSessionCreateIntent"',
    );
  }
}
