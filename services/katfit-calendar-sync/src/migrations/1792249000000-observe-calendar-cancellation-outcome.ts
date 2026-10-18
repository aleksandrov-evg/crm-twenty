import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class ObserveCalendarCancellationOutcome1792249000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarCancellationReview"
      DROP CONSTRAINT "calendarCancellationReview_state_check",
      ADD CONSTRAINT "calendarCancellationReview_state_check" CHECK (state IN ('AWAITING_CONFIRMATION', 'NEEDS_REVIEW', 'CRM_CANCELLED_OBSERVED', 'SUPERSEDED')),
      ADD COLUMN "initialBookingIds" jsonb, ADD COLUMN "seenBookingIds" jsonb, ADD COLUMN "outcomeObservedAt" timestamptz`);
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarCancellationObservation" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "reviewId" uuid NOT NULL REFERENCES calendar_sync."calendarCancellationReview" (id) ON DELETE CASCADE,
      "observedAt" timestamptz NOT NULL DEFAULT clock_timestamp(), state text NOT NULL, reason text NOT NULL, evidence jsonb NOT NULL,
      "evidenceHash" text NOT NULL
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE calendar_sync."calendarCancellationObservation"',
    );
    await queryRunner.query(
      `UPDATE calendar_sync."calendarCancellationReview" SET state = 'NEEDS_REVIEW', reason = 'CANCELLATION_OUTCOME_REQUIRES_RECHECK' WHERE state = 'CRM_CANCELLED_OBSERVED'`,
    );
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarCancellationReview"
      DROP CONSTRAINT "calendarCancellationReview_state_check",
      ADD CONSTRAINT "calendarCancellationReview_state_check" CHECK (state IN ('AWAITING_CONFIRMATION', 'NEEDS_REVIEW', 'SUPERSEDED')),
      DROP COLUMN "initialBookingIds", DROP COLUMN "seenBookingIds", DROP COLUMN "outcomeObservedAt"`);
  }
}
