import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCalendarScheduleCheck1792247000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarSessionLink"
      ADD COLUMN "nextScheduleCheckAt" timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN "scheduleReviewReason" text`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarSessionLink"
      DROP COLUMN "nextScheduleCheckAt", DROP COLUMN "scheduleReviewReason"`);
  }
}
