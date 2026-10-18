import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  createCalendarCrmBaseUrl,
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';

export const CALENDAR_CRM_CONTRACT = 'katfit-planned-session-v1';
const SESSION_OBJECT = 'a7c3d8b4-8a67-483e-ae59-0af24b746110';
const AUDIT_OBJECT = '1db750d9-2a37-4f78-9ea3-00d91704b66f';
const CREATE_FUNCTION = '269c7084-8c71-4c24-8692-8b689473a224';
const RECORDING_KEY_FIELD = '57c8b238-d981-4bb1-a7f4-713ad61e6c03';
const fieldSchema = z.object({
  id: z.uuid(),
  universalIdentifier: z.uuid(),
  name: z.string(),
  type: z.string(),
  isActive: z.boolean(),
});
const objectSchema = z.object({
  id: z.uuid(),
  universalIdentifier: z.uuid(),
  applicationId: z.uuid(),
  nameSingular: z.string(),
  namePlural: z.string(),
  isActive: z.boolean(),
  fieldsList: z.array(fieldSchema).max(500),
  indexMetadataList: z
    .array(
      z.object({
        id: z.uuid(),
        isUnique: z.boolean(),
        indexWhereClause: z.string().nullable(),
        indexFieldMetadataList: z
          .array(
            z.object({
              fieldMetadataId: z.uuid(),
              subFieldName: z.string().nullable(),
            }),
          )
          .max(20),
      }),
    )
    .max(100),
});
const metadataSchema = z.object({
  errors: z.array(z.unknown()).max(0).optional(),
  data: z.object({
    currentWorkspace: z.object({ id: z.uuid() }),
    objects: z.object({
      edges: z.array(z.object({ node: objectSchema })).max(2),
      pageInfo: z.object({ hasNextPage: z.literal(false) }),
    }),
    findManyLogicFunctions: z
      .array(
        z.object({
          id: z.uuid(),
          universalIdentifier: z.uuid().nullable().optional(),
          applicationId: z.uuid().nullable().optional(),
          name: z.string(),
          updatedAt: z.iso.datetime({ offset: true }),
          httpRouteTriggerSettings: z.unknown(),
        }),
      )
      .max(1000),
  }),
});
const query = `query CalendarSyncCapabilities {
  currentWorkspace { id }
  objects(paging: {first: 3}, filter: {or: [{universalIdentifier: {eq: "${SESSION_OBJECT}"}}, {universalIdentifier: {eq: "${AUDIT_OBJECT}"}}]}) {
    edges { node { id universalIdentifier applicationId nameSingular namePlural isActive
      fieldsList { id universalIdentifier name type isActive }
      indexMetadataList { id isUnique indexWhereClause indexFieldMetadataList { fieldMetadataId subFieldName } }
    } } pageInfo { hasNextPage }
  }
  findManyLogicFunctions { id universalIdentifier applicationId name updatedAt httpRouteTriggerSettings }
}`;

export type CalendarCrmCapabilityEvidence = {
  contract: typeof CALENDAR_CRM_CONTRACT;
  workspaceId: string;
  binding: string;
  origin: string;
  checkedAt: string;
  applicationId: string;
  commandId: string;
  commandUpdatedAt: string;
  sessionObjectId: string;
  auditObjectId: string;
  uniqueIndexId: string;
};
export type CalendarCrmCapabilities =
  | { status: 'ready'; evidence: CalendarCrmCapabilityEvidence }
  | { status: 'not-ready'; reason: string }
  | { status: 'auth-required' | 'forbidden' | 'unavailable' };

export const sameCalendarCrmCapabilities = (
  first: CalendarCrmCapabilityEvidence,
  second: CalendarCrmCapabilityEvidence,
): boolean =>
  (
    [
      'contract',
      'workspaceId',
      'binding',
      'origin',
      'applicationId',
      'commandId',
      'commandUpdatedAt',
      'sessionObjectId',
      'auditObjectId',
      'uniqueIndexId',
    ] as const
  ).every((key) => first[key] === second[key]);

export const calendarCrmBinding = (
  configuration: CalendarCrmConfiguration,
  workspaceId: string,
): string => {
  const origin = createCalendarCrmBaseUrl(configuration).origin;
  return createHash('sha256')
    .update(
      JSON.stringify([
        CALENDAR_CRM_CONTRACT,
        origin,
        workspaceId,
        configuration.apiToken,
      ]),
    )
    .digest('hex');
};

const requiredFields = (
  object: z.infer<typeof objectSchema>,
  required: Record<string, string>,
): boolean =>
  Object.entries(required).every(([name, type]) => {
    const fields = object.fieldsList.filter((field) => field.name === name);
    return fields.length === 1 && fields[0].isActive && fields[0].type === type;
  });

export const createCalendarCrmCapabilityCheck = (
  configuration: CalendarCrmConfiguration,
  workspaceId: string,
) => {
  z.uuid().parse(workspaceId);
  const request = createCalendarCrmRequest(configuration);
  const binding = calendarCrmBinding(configuration, workspaceId);
  return async (): Promise<CalendarCrmCapabilities> => {
    const checkedAt = new Date().toISOString();
    const response = await request('/metadata', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
    if (response.status === 'unconfirmed') return { status: 'unavailable' };
    if (response.httpStatus === 401) return { status: 'auth-required' };
    if (response.httpStatus === 403) return { status: 'forbidden' };
    if (response.httpStatus !== 200) return { status: 'unavailable' };
    const parsed = metadataSchema.safeParse(response.body);
    if (!parsed.success)
      return { status: 'not-ready', reason: 'INVALID_METADATA_RESPONSE' };
    const metadata = parsed.data.data;
    if (metadata.currentWorkspace.id !== workspaceId)
      return { status: 'not-ready', reason: 'CRM_WORKSPACE_MISMATCH' };
    const sessions = metadata.objects.edges
      .map((edge) => edge.node)
      .filter((object) => object.universalIdentifier === SESSION_OBJECT);
    const audits = metadata.objects.edges
      .map((edge) => edge.node)
      .filter((object) => object.universalIdentifier === AUDIT_OBJECT);
    if (sessions.length !== 1 || audits.length !== 1)
      return {
        status: 'not-ready',
        reason: 'STUDIO_OBJECTS_MISSING_OR_AMBIGUOUS',
      };
    const session = sessions[0],
      audit = audits[0];
    if (
      !session.isActive ||
      !audit.isActive ||
      session.applicationId !== audit.applicationId ||
      session.nameSingular !== 'classSession' ||
      session.namePlural !== 'classSessions' ||
      audit.nameSingular !== 'studioEvent' ||
      audit.namePlural !== 'studioEvents'
    )
      return { status: 'not-ready', reason: 'STUDIO_OBJECT_IDENTITY_MISMATCH' };
    if (
      !requiredFields(session, {
        name: 'TEXT',
        recordingKey: 'TEXT',
        creationRequest: 'TEXT',
        sessionFormat: 'SELECT',
        startsAt: 'DATE_TIME',
        endsAt: 'DATE_TIME',
        capacity: 'NUMBER',
        status: 'SELECT',
      }) ||
      !requiredFields(audit, {
        classSessionId: 'TEXT',
        eventType: 'SELECT',
        outcome: 'SELECT',
        idempotencyKey: 'TEXT',
        details: 'TEXT',
      })
    )
      return { status: 'not-ready', reason: 'STUDIO_FIELDS_INCOMPATIBLE' };
    const recordingKey = session.fieldsList.find(
      (field) => field.name === 'recordingKey',
    );
    if (
      !recordingKey ||
      recordingKey.universalIdentifier !== RECORDING_KEY_FIELD
    )
      return { status: 'not-ready', reason: 'RECORDING_KEY_IDENTITY_MISMATCH' };
    const index = session.indexMetadataList.find(
      (index) =>
        index.isUnique &&
        !index.indexWhereClause?.trim() &&
        index.indexFieldMetadataList.length === 1 &&
        index.indexFieldMetadataList[0].fieldMetadataId === recordingKey.id &&
        !index.indexFieldMetadataList[0].subFieldName,
    );
    if (!index)
      return {
        status: 'not-ready',
        reason: 'UNIQUE_RECORDING_KEY_INDEX_MISSING',
      };
    const functions = metadata.findManyLogicFunctions.filter(
      (item) => item.universalIdentifier === CREATE_FUNCTION,
    );
    if (functions.length !== 1)
      return {
        status: 'not-ready',
        reason: 'CREATE_COMMAND_MISSING_OR_AMBIGUOUS',
      };
    const command = functions[0];
    const route = z
      .object({
        path: z.literal('/studio/sessions/create'),
        httpMethod: z.literal('POST'),
        isAuthRequired: z.literal(true),
      })
      .safeParse(command.httpRouteTriggerSettings);
    if (
      !route.success ||
      command.applicationId !== session.applicationId ||
      command.name !== 'studio-create-class-session'
    )
      return {
        status: 'not-ready',
        reason: 'CREATE_COMMAND_CONTRACT_MISMATCH',
      };
    for (const [object, filter] of [
      [
        'classSessions',
        `recordingKey[eq]:session-create:calendar-create:${'0'.repeat(64)}`,
      ],
      ['studioEvents', 'id[eq]:00000000-0000-4000-8000-000000000000'],
    ] as const) {
      const parameters = new URLSearchParams({
        limit: '1',
        depth: '0',
        filter,
      });
      const probe = await request(`/rest/${object}?${parameters}`, {
        method: 'GET',
      });
      if (probe.status === 'unconfirmed') return { status: 'unavailable' };
      if (probe.httpStatus === 401) return { status: 'auth-required' };
      if (probe.httpStatus === 403) return { status: 'forbidden' };
      if (probe.httpStatus !== 200) return { status: 'unavailable' };
      if (
        !z
          .object({
            data: z.object({ [object]: z.array(z.unknown()).length(0) }),
            pageInfo: z.object({ hasNextPage: z.literal(false) }),
          })
          .safeParse(probe.body).success
      )
        return { status: 'not-ready', reason: 'CRM_READ_PROBE_FAILED' };
    }
    return {
      status: 'ready',
      evidence: {
        contract: CALENDAR_CRM_CONTRACT,
        workspaceId,
        binding,
        origin: createCalendarCrmBaseUrl(configuration).origin,
        checkedAt,
        applicationId: session.applicationId,
        commandId: command.id,
        commandUpdatedAt: command.updatedAt,
        sessionObjectId: session.id,
        auditObjectId: audit.id,
        uniqueIndexId: index.id,
      },
    };
  };
};
