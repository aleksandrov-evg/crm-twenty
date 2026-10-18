import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCalendarActivation1792245000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarActivation" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL,
      "configurationVersion" integer NOT NULL, binding text NOT NULL, evidence jsonb NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("workspaceId", "connectionId", "configurationVersion"),
      FOREIGN KEY ("workspaceId", "connectionId") REFERENCES calendar_sync."calendarConnection" ("workspaceId", id) ON DELETE CASCADE
    )`);
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarCreationAttempt"
      ADD COLUMN "activationId" uuid REFERENCES calendar_sync."calendarActivation" (id),
      ADD COLUMN "crmCapabilityCheck" jsonb, ADD COLUMN "crmCapabilitiesCheckedAt" timestamptz`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE calendar_sync."calendarCreationAttempt"
      DROP COLUMN "activationId", DROP COLUMN "crmCapabilityCheck", DROP COLUMN "crmCapabilitiesCheckedAt"`);
    await queryRunner.query('DROP TABLE calendar_sync."calendarActivation"');
  }
}
