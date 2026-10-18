import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarConnections1792230811000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "calendar_sync"."calendarConnection" (
      "id" uuid PRIMARY KEY,
      "workspaceId" uuid NOT NULL,
      "username" text NOT NULL,
      "calendarUrl" text NOT NULL,
      "displayName" text NOT NULL,
      "timezone" text NOT NULL,
      "reports" jsonb NOT NULL,
      "encryptedAppPassword" text,
      "state" text NOT NULL DEFAULT 'PREVIEW',
      "configurationVersion" integer NOT NULL DEFAULT 1,
      "credentialVersion" integer NOT NULL DEFAULT 1,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_CALENDAR_CONNECTION_STATE" CHECK ("state" IN ('PREVIEW', 'ACTIVE', 'PAUSED', 'AUTH_REQUIRED', 'ERROR', 'DISCONNECTED')),
      CONSTRAINT "CHK_CALENDAR_CONNECTION_VERSIONS" CHECK ("configurationVersion" > 0 AND "credentialVersion" > 0),
      CONSTRAINT "CHK_CALENDAR_CONNECTION_CREDENTIALS" CHECK (
        ("state" = 'DISCONNECTED') = ("encryptedAppPassword" IS NULL)
        AND ("encryptedAppPassword" IS NULL OR "encryptedAppPassword" LIKE 'v1.%')
      )
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CALENDAR_CONNECTION_WORKSPACE" ON "calendar_sync"."calendarConnection" ("workspaceId") WHERE "state" <> 'DISCONNECTED'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "calendar_sync"."calendarConnection"');
  }
}
