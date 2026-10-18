import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateCrmExportIntent1792251000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE calendar_sync."calendarCrmExportIntent" (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "workspaceId" uuid NOT NULL, "connectionId" uuid NOT NULL,
      "classSessionId" uuid NOT NULL, uid text NOT NULL, "resourceUrl" text NOT NULL, command jsonb NOT NULL,
      "configurationVersion" integer NOT NULL, binding text NOT NULL, "calendarUrl" text NOT NULL, timezone text NOT NULL,
      state text NOT NULL DEFAULT 'PREPARED' CHECK (state IN ('PREPARED', 'RUNNING', 'WRITTEN', 'CONFIRMED', 'NEEDS_REVIEW')),
      reason text, "leaseGeneration" integer NOT NULL DEFAULT 0, "leaseUntil" timestamptz, "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
      "sendStartedAt" timestamptz, "verifiedAt" timestamptz, "verifiedEtag" text,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("workspaceId", "connectionId", "classSessionId"), UNIQUE ("workspaceId", "connectionId", uid), UNIQUE ("workspaceId", "connectionId", "resourceUrl"),
      FOREIGN KEY ("workspaceId", "connectionId") REFERENCES calendar_sync."calendarConnection" ("workspaceId", id) ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CRM_EXPORT_RUNNING" ON calendar_sync."calendarCrmExportIntent" ("workspaceId", "connectionId") WHERE state = 'RUNNING'`,
    );
    await queryRunner.query(`CREATE FUNCTION calendar_sync.suppress_crm_export_import() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM calendar_sync."calendarCurrentImportPreview" preview
          JOIN calendar_sync."calendarCrmExportIntent" intent ON intent."workspaceId" = preview."workspaceId" AND intent."connectionId" = preview."connectionId" AND intent.uid = preview.candidate->>'uid'
          WHERE preview."inboxId" = NEW."inboxId" AND preview."configurationVersion" = NEW."configurationVersion") THEN
          IF EXISTS (SELECT 1 FROM calendar_sync."calendarCurrentImportPreview" preview
            JOIN calendar_sync."calendarCrmExportIntent" intent ON intent."workspaceId" = preview."workspaceId" AND intent."connectionId" = preview."connectionId" AND intent.uid = preview.candidate->>'uid' AND intent.state = 'CONFIRMED'
            JOIN calendar_sync."calendarSessionLink" link ON link."workspaceId" = intent."workspaceId" AND link."connectionId" = intent."connectionId" AND link.uid = intent.uid AND link."classSessionId" = intent."classSessionId" AND link."resourceId" = preview."resourceId"
            WHERE preview."inboxId" = NEW."inboxId" AND preview."configurationVersion" = NEW."configurationVersion") THEN
            NEW.decision := 'LINKED'; NEW.reason := NULL;
            UPDATE calendar_sync."calendarInbox" SET state = 'APPLIED' WHERE id = NEW."inboxId";
          ELSE
            NEW.decision := 'NEEDS_REVIEW'; NEW.reason := 'CRM_EXPORT_INTENT_OWNS_UID';
          END IF;
        END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(
      `CREATE TRIGGER suppress_crm_export_import BEFORE INSERT ON calendar_sync."calendarCrmReconciliation" FOR EACH ROW EXECUTE FUNCTION calendar_sync.suppress_crm_export_import()`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER suppress_crm_export_import ON calendar_sync."calendarCrmReconciliation"',
    );
    await queryRunner.query(
      'DROP FUNCTION calendar_sync.suppress_crm_export_import()',
    );
    await queryRunner.query(
      'DROP TABLE calendar_sync."calendarCrmExportIntent"',
    );
  }
}
