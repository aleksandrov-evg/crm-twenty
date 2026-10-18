import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCancellationExecution1792250000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarCancellationExecution" (
      "reviewId" uuid PRIMARY KEY REFERENCES calendar_sync."calendarCancellationReview" (id) ON DELETE CASCADE,
      binding text NOT NULL, command jsonb NOT NULL,
      state text NOT NULL CHECK (state IN ('PREPARED', 'SENDING', 'CONFIRMED', 'NEEDS_REVIEW')),
      result jsonb, "createdAt" timestamptz NOT NULL DEFAULT now(), "sendStartedAt" timestamptz, "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE calendar_sync."calendarCancellationExecution"',
    );
  }
}
