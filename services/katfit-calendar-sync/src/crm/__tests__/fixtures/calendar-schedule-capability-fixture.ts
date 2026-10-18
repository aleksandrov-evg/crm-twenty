import { randomUUID } from 'node:crypto';

import { SCHEDULE_FUNCTION_IDENTIFIER } from '../../check-calendar-schedule-capabilities';

export const createScheduleCapabilityFixture = () => {
  const applicationId = randomUUID();
  const fields = (types: Record<string, string>) =>
    Object.entries(types).map(([name, type]) => ({
      id: randomUUID(),
      universalIdentifier:
        name === 'operationKey'
          ? '7caee520-b355-48a6-ab80-d0f70c1696b3'
          : name === 'mutationLock'
            ? 'b40aa498-854e-4997-a6fd-e70730668149'
            : randomUUID(),
      name,
      type,
      isActive: true,
    }));
  const session = {
    universalIdentifier: 'a7c3d8b4-8a67-483e-ae59-0af24b746110',
    applicationId,
    nameSingular: 'classSession',
    namePlural: 'classSessions',
    isActive: true,
    fieldsList: fields({ mutationLock: 'TEXT' }),
    indexMetadataList: [],
  };
  const journal = {
    universalIdentifier: 'e7c841ae-02d9-4f8d-8c7a-1f82bce48152',
    applicationId,
    nameSingular: 'studioSessionOperation',
    namePlural: 'studioSessionOperations',
    isActive: true,
    fieldsList: fields({
      operationKey: 'TEXT',
      classSessionId: 'TEXT',
      request: 'TEXT',
      ownerToken: 'TEXT',
      state: 'SELECT',
      result: 'TEXT',
    }),
    indexMetadataList: [
      {
        isUnique: true,
        indexWhereClause: null as string | null,
        indexFieldMetadataList: [
          { fieldMetadataId: '', subFieldName: null as string | null },
        ],
      },
    ],
  };
  journal.indexMetadataList[0].indexFieldMetadataList[0].fieldMetadataId =
    journal.fieldsList[0].id;
  const command = {
    universalIdentifier: SCHEDULE_FUNCTION_IDENTIFIER,
    applicationId,
    name: 'studio-update-session',
    httpRouteTriggerSettings: {
      path: '/studio/sessions/update',
      httpMethod: 'POST',
      isAuthRequired: true,
    },
  };
  return {
    session,
    journal,
    command,
    metadata: {
      data: {
        objects: {
          edges: [{ node: session }, { node: journal }],
          pageInfo: { hasNextPage: false },
        },
        findManyLogicFunctions: [command],
      },
    },
  };
};
