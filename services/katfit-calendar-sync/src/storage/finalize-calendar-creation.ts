import { type EntityManager } from 'typeorm';

import { type CalendarCrmSession } from '../crm/find-calendar-session';
import {
  calendarSessionCommandSchema,
  createCalendarSessionCommand,
} from '../domain/create-calendar-session-command';
import { prepareCalendarSession } from '../domain/prepare-calendar-session';
import { readCalendarUids } from '../domain/read-calendar-uids';
import { type CalendarCreationLease } from './calendar-creation-execution.store';

export const finalizeCalendarCreation = async (
  manager: EntityManager,
  lease: Pick<CalendarCreationLease, 'workspaceId' | 'connectionId' | 'uid'>,
  session: CalendarCrmSession,
): Promise<void> => {
  const parameters = [lease.workspaceId, lease.connectionId, lease.uid];
  const review = async (reason: string) =>
    manager.query(
      `UPDATE calendar_sync."calendarCreationExecution"
    SET "finalizationState" = 'NEEDS_REVIEW', "finalizationReason" = $4, "finalizationLeaseUntil" = NULL
    WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
      [...parameters, reason],
    );
  const rows: {
    resourceId: string;
    resourceVersion: number;
    currentVersion: number;
    etag: string;
    calendarData: string;
    missingSinceGeneration: number | null;
    timezone: string;
    payload: unknown;
    recordingKey: string;
    knownClassSessionId: string;
    configurationVersion: number;
  }[] = await manager.query(
    `
    SELECT resource.id AS "resourceId", inbox."resourceVersion", resource."resourceVersion" AS "currentVersion", resource.etag,
      resource."calendarData", resource."missingSinceGeneration", connection.timezone, connection."configurationVersion", intent.payload,
      'session-create:' || intent."idempotencyKey" AS "recordingKey", execution."knownClassSessionId"
    FROM calendar_sync."calendarSessionCreateIntent" intent
    JOIN calendar_sync."calendarCreationExecution" execution USING ("workspaceId", "connectionId", uid, "recurrenceKey")
    JOIN calendar_sync."calendarInbox" inbox ON inbox.id = intent."inboxId" AND inbox."workspaceId" = intent."workspaceId" AND inbox."connectionId" = intent."connectionId"
    JOIN calendar_sync."calendarResource" resource ON resource.id = inbox."resourceId"
    JOIN calendar_sync."calendarConnection" connection ON connection.id = intent."connectionId" AND connection."workspaceId" = intent."workspaceId"
    WHERE intent."workspaceId" = $1 AND intent."connectionId" = $2 AND intent.uid = $3`,
    parameters,
  );
  const source = rows[0];
  if (
    !source ||
    source.knownClassSessionId !== session.id ||
    source.recordingKey !== session.recordingKey
  ) {
    await review('FINALIZATION_CRM_IDENTITY_MISMATCH');
    return;
  }
  const resources: { calendarData: string }[] = await manager.query(
    `SELECT "calendarData" FROM calendar_sync."calendarResource"
    WHERE "workspaceId" = $1 AND "connectionId" = $2 AND "missingSinceGeneration" IS NULL`,
    parameters.slice(0, 2),
  );
  let occurrences = 0;
  for (const resource of resources) {
    const identifiers = readCalendarUids(resource.calendarData);
    if (!identifiers) {
      await review('FINALIZATION_UNVERIFIABLE_UID');
      return;
    }
    occurrences += identifiers.filter((uid) => uid === lease.uid).length;
  }
  if (source.missingSinceGeneration !== null || occurrences !== 1) {
    await review('FINALIZATION_SOURCE_MISSING_OR_DUPLICATE');
    return;
  }
  // Identity remains valid when the calendar changed after creation; a merge base does not.
  const inserted: { classSessionId: string }[] = await manager.query(
    `INSERT INTO calendar_sync."calendarSessionLink"
    ("workspaceId", "connectionId", uid, "recurrenceKey", "classSessionId", "resourceId", "recordingKey", "observedSession")
    VALUES ($1, $2, $3, 'single', $4, $5, $6, $7::jsonb) ON CONFLICT DO NOTHING RETURNING "classSessionId"`,
    [
      ...parameters,
      session.id,
      source.resourceId,
      session.recordingKey,
      JSON.stringify(session),
    ],
  );
  if (!inserted.length) {
    const existing: {
      classSessionId: string;
      resourceId: string;
      recordingKey: string;
    }[] = await manager.query(
      `SELECT "classSessionId", "resourceId", "recordingKey"
      FROM calendar_sync."calendarSessionLink" WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
      parameters,
    );
    if (
      !existing[0] ||
      existing[0].classSessionId !== session.id ||
      existing[0].resourceId !== source.resourceId ||
      existing[0].recordingKey !== session.recordingKey
    ) {
      await review('FINALIZATION_LINK_CONFLICT');
      return;
    }
  }
  // Preparation's past-event guard must not prevent a read-only finalization of an already-created session.
  const prepared = prepareCalendarSession({
    workspaceId: lease.workspaceId,
    connectionId: lease.connectionId,
    calendarData: source.calendarData,
    options: { timezone: source.timezone },
    now: new Date(Date.parse(session.startsAt) - 1),
  });
  if (
    prepared.decision !== 'READY' ||
    prepared.candidate.uid !== lease.uid ||
    prepared.candidate.name !== session.name ||
    prepared.candidate.sessionFormat !== session.sessionFormat ||
    prepared.candidate.capacity !== session.capacity ||
    Date.parse(prepared.candidate.startsAt) !== Date.parse(session.startsAt) ||
    Date.parse(prepared.candidate.endsAt) !== Date.parse(session.endsAt) ||
    JSON.stringify(createCalendarSessionCommand(prepared.candidate)) !==
      JSON.stringify(calendarSessionCommandSchema.parse(source.payload))
  ) {
    await review('FINALIZATION_SCHEDULE_DIVERGED');
    return;
  }
  const base = {
    name: session.name,
    interval: {
      startsAt: prepared.candidate.startsAt,
      endsAt: prepared.candidate.endsAt,
      timezone: prepared.candidate.timezone,
    },
  };
  await manager.query(
    `UPDATE calendar_sync."calendarSessionLink" SET "observedSession" = $4::jsonb, "commonBase" = $5::jsonb,
    "baseResourceVersion" = $6, "baseEtag" = $7, "updatedAt" = now() WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
    [
      ...parameters,
      JSON.stringify(session),
      JSON.stringify(base),
      source.currentVersion,
      source.etag,
    ],
  );
  await manager.query(
    `UPDATE calendar_sync."calendarInbox" SET state = 'APPLIED' WHERE "workspaceId" = $1 AND "connectionId" = $2
    AND "resourceId" = $3 AND "resourceVersion" = $4 AND kind = 'UPSERT' AND state = 'PENDING'`,
    [
      lease.workspaceId,
      lease.connectionId,
      source.resourceId,
      source.currentVersion,
    ],
  );
  await manager.query(
    `UPDATE calendar_sync."calendarCrmReconciliation" reconciliation SET decision = 'LINKED', reason = NULL, "leaseUntil" = NULL, "updatedAt" = now()
    FROM calendar_sync."calendarInbox" inbox WHERE inbox.id = reconciliation."inboxId" AND inbox."workspaceId" = $1 AND inbox."connectionId" = $2
      AND inbox."resourceId" = $3 AND inbox."resourceVersion" = $4 AND inbox.state = 'APPLIED' AND reconciliation."configurationVersion" = $5`,
    [
      lease.workspaceId,
      lease.connectionId,
      source.resourceId,
      source.currentVersion,
      source.configurationVersion,
    ],
  );
  await manager.query(
    `INSERT INTO calendar_sync."calendarDescriptionRefresh" ("workspaceId", "connectionId", uid, "recurrenceKey")
    VALUES ($1, $2, $3, 'single') ON CONFLICT DO NOTHING`,
    parameters,
  );
  await manager.query(
    `UPDATE calendar_sync."calendarCreationExecution" SET "finalizationState" = 'LINKED', "finalizationReason" = NULL,
    "finalizationLeaseUntil" = NULL WHERE "workspaceId" = $1 AND "connectionId" = $2 AND uid = $3`,
    parameters,
  );
};
