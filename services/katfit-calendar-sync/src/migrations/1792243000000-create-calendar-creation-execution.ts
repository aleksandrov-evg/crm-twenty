import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarCreationExecution1792243000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarCreationExecution" (
      "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL, uid text NOT NULL, "recurrenceKey" text NOT NULL,
      state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'RUNNING', 'RETRY', 'CONFIRMED', 'NEEDS_REVIEW')),
      "leaseGeneration" integer NOT NULL DEFAULT 0, "leaseUntil" timestamptz,
      "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "knownClassSessionId" uuid,
      "lastResult" jsonb, "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("workspaceId", "connectionId", uid, "recurrenceKey"),
      FOREIGN KEY ("workspaceId", "connectionId", uid, "recurrenceKey") REFERENCES calendar_sync."calendarSessionCreateIntent" ("workspaceId", "connectionId", uid, "recurrenceKey") ON DELETE CASCADE,
      CHECK ((state = 'RUNNING') = ("leaseUntil" IS NOT NULL))
    )`);
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarCreationAttempt" (
      "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL, uid text NOT NULL, "recurrenceKey" text NOT NULL,
      generation integer NOT NULL, "sendStartedAt" timestamptz, "sendResult" jsonb,
      "initialInspection" jsonb, inspection jsonb, result jsonb, "createdAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("workspaceId", "connectionId", uid, "recurrenceKey", generation),
      FOREIGN KEY ("workspaceId", "connectionId", uid, "recurrenceKey") REFERENCES calendar_sync."calendarCreationExecution" ("workspaceId", "connectionId", uid, "recurrenceKey") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_CALENDAR_CREATION_RUNNING" ON calendar_sync."calendarCreationExecution"
      ("workspaceId", "connectionId") WHERE state = 'RUNNING'`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE calendar_sync."calendarCreationAttempt"',
    );
    await queryRunner.query(
      'DROP TABLE calendar_sync."calendarCreationExecution"',
    );
  }
}
