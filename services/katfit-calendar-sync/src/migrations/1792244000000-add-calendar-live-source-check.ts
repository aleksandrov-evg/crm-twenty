import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddCalendarLiveSourceCheck1792244000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarCreationAttempt"
      ADD COLUMN "liveSourceCheck" jsonb, ADD COLUMN "liveSourceCheckedAt" timestamptz`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarCreationAttempt"
      DROP COLUMN "liveSourceCheck", DROP COLUMN "liveSourceCheckedAt"`);
  }
}
