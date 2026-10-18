import { randomUUID } from 'node:crypto';

import {
  calendarCrmBinding,
  CALENDAR_CRM_CONTRACT,
  type CalendarCrmCapabilityEvidence,
} from '../../check-calendar-crm-capabilities';

export const CRM_TEST_CONFIGURATION = {
  baseUrl: 'https://crm.example.test',
  apiToken: 'test-token',
};
export const createCapabilityFixture = (workspaceId = randomUUID()) => {
  const applicationId = randomUUID();
  const fields = (types: Record<string, string>) =>
    Object.entries(types).map(([name, type]) => ({
      id: randomUUID(),
      universalIdentifier:
        name === 'recordingKey'
          ? '57c8b238-d981-4bb1-a7f4-713ad61e6c03'
          : randomUUID(),
      name,
      type,
      isActive: true,
    }));
  const session = {
    id: randomUUID(),
    universalIdentifier: 'a7c3d8b4-8a67-483e-ae59-0af24b746110',
    applicationId,
    nameSingular: 'classSession',
    namePlural: 'classSessions',
    isActive: true,
    fieldsList: fields({
      name: 'TEXT',
      recordingKey: 'TEXT',
      creationRequest: 'TEXT',
      sessionFormat: 'SELECT',
      startsAt: 'DATE_TIME',
      endsAt: 'DATE_TIME',
      capacity: 'NUMBER',
      status: 'SELECT',
    }),
    indexMetadataList: [] as {
      id: string;
      isUnique: boolean;
      indexWhereClause: string | null;
      indexFieldMetadataList: {
        fieldMetadataId: string;
        subFieldName: string | null;
      }[];
    }[],
  };
  session.indexMetadataList.push({
    id: randomUUID(),
    isUnique: true,
    indexWhereClause: null,
    indexFieldMetadataList: [
      {
        fieldMetadataId: session.fieldsList.find(
          (field) => field.name === 'recordingKey',
        )!.id,
        subFieldName: null,
      },
    ],
  });
  const audit = {
    id: randomUUID(),
    universalIdentifier: '1db750d9-2a37-4f78-9ea3-00d91704b66f',
    applicationId,
    nameSingular: 'studioEvent',
    namePlural: 'studioEvents',
    isActive: true,
    fieldsList: fields({
      classSessionId: 'TEXT',
      eventType: 'SELECT',
      outcome: 'SELECT',
      idempotencyKey: 'TEXT',
      details: 'TEXT',
    }),
    indexMetadataList: [],
  };
  const command = {
    id: randomUUID(),
    universalIdentifier: '269c7084-8c71-4c24-8692-8b689473a224',
    applicationId,
    name: 'studio-create-class-session',
    updatedAt: '2026-10-17T00:00:00Z',
    httpRouteTriggerSettings: {
      path: '/studio/sessions/create',
      httpMethod: 'POST',
      isAuthRequired: true,
    },
  };
  const metadata = {
    data: {
      currentWorkspace: { id: workspaceId },
      objects: {
        edges: [{ node: session }, { node: audit }],
        pageInfo: { hasNextPage: false },
      },
      findManyLogicFunctions: [command],
    },
  };
  const evidence: CalendarCrmCapabilityEvidence = {
    contract: CALENDAR_CRM_CONTRACT,
    workspaceId,
    binding: calendarCrmBinding(CRM_TEST_CONFIGURATION, workspaceId),
    origin: CRM_TEST_CONFIGURATION.baseUrl,
    checkedAt: new Date().toISOString(),
    applicationId,
    commandId: command.id,
    commandUpdatedAt: command.updatedAt,
    sessionObjectId: session.id,
    auditObjectId: audit.id,
    uniqueIndexId: session.indexMetadataList[0].id,
  };
  return { metadata, evidence, session, audit, command, workspaceId };
};
