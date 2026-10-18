import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarCancellationReview1792248000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE calendar_sync."calendarSessionLink" ADD COLUMN "nextCancellationCheckAt" timestamptz NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarCancellationReview" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL, uid text NOT NULL, "recurrenceKey" text NOT NULL DEFAULT 'single',
      "configurationVersion" integer NOT NULL, "resourceVersion" integer NOT NULL,
      kind text NOT NULL CHECK (kind IN ('MISSING', 'CANCELLED')),
      state text NOT NULL CHECK (state IN ('AWAITING_CONFIRMATION', 'NEEDS_REVIEW', 'SUPERSEDED')),
      reason text NOT NULL, evidence jsonb NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("workspaceId", "connectionId", uid, "configurationVersion", "resourceVersion", kind),
      FOREIGN KEY ("workspaceId", "connectionId", uid, "recurrenceKey") REFERENCES calendar_sync."calendarSessionLink" ("workspaceId", "connectionId", uid, "recurrenceKey") ON DELETE CASCADE
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE calendar_sync."calendarCancellationReview"',
    );
    await queryRunner.query(
      'ALTER TABLE calendar_sync."calendarSessionLink" DROP COLUMN "nextCancellationCheckAt"',
    );
  }
}
