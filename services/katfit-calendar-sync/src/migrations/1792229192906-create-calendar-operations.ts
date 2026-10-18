import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarOperations1792229192906 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "calendar_sync"');
    await queryRunner.query(
      'CREATE TABLE "calendar_sync"."studioCalendarOperation" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT gen_random_uuid(), "connectionId" uuid NOT NULL, "resourceKey" text NOT NULL, "idempotencyKey" text NOT NULL, "action" text NOT NULL, "payload" jsonb NOT NULL, "state" text NOT NULL DEFAULT \'PENDING\', "attempts" integer NOT NULL DEFAULT \'0\', "leaseGeneration" integer NOT NULL DEFAULT \'0\', "leaseUntil" TIMESTAMP WITH TIME ZONE, "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "requiresReconciliation" boolean NOT NULL DEFAULT false, "errorCode" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_STUDIO_CALENDAR_OPERATION_COUNTERS" CHECK ("attempts" >= 0 AND "leaseGeneration" >= 0), CONSTRAINT "CHK_STUDIO_CALENDAR_OPERATION_LEASE" CHECK (("state" = \'RUNNING\') = ("leaseUntil" IS NOT NULL)), CONSTRAINT "CHK_STUDIO_CALENDAR_OPERATION_ACTION" CHECK ("action" IN (\'IMPORT_EVENT\', \'EXPORT_EVENT\', \'RECONCILE_RESOURCE\')), CONSTRAINT "CHK_STUDIO_CALENDAR_OPERATION_STATE" CHECK ("state" IN (\'PENDING\', \'RUNNING\', \'RETRY\', \'SUCCEEDED\', \'CONFLICT\', \'FAILED\', \'SUPERSEDED\')), CONSTRAINT "PK_a15086721ae3193cd1cb87467bd" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_STUDIO_CALENDAR_OPERATION_RUNNING" ON "calendar_sync"."studioCalendarOperation" ("workspaceId", "connectionId") WHERE "state" = \'RUNNING\'',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_STUDIO_CALENDAR_OPERATION_DUE" ON "calendar_sync"."studioCalendarOperation" ("workspaceId", "connectionId", "state", "nextAttemptAt") ',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_STUDIO_CALENDAR_OPERATION_IDEMPOTENCY" ON "calendar_sync"."studioCalendarOperation" ("workspaceId", "idempotencyKey") ',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "calendar_sync"."IDX_STUDIO_CALENDAR_OPERATION_IDEMPOTENCY"',
    );
    await queryRunner.query(
      'DROP INDEX "calendar_sync"."IDX_STUDIO_CALENDAR_OPERATION_DUE"',
    );
    await queryRunner.query(
      'DROP INDEX "calendar_sync"."IDX_STUDIO_CALENDAR_OPERATION_RUNNING"',
    );
    await queryRunner.query(
      'DROP TABLE "calendar_sync"."studioCalendarOperation"',
    );
  }
}
