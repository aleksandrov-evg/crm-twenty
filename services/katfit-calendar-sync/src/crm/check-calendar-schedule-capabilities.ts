import { z } from 'zod';

import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';

const SESSION_OBJECT = 'a7c3d8b4-8a67-483e-ae59-0af24b746110';
const JOURNAL_OBJECT = 'e7c841ae-02d9-4f8d-8c7a-1f82bce48152';
const OPERATION_KEY_FIELD = '7caee520-b355-48a6-ab80-d0f70c1696b3';
export const SCHEDULE_FUNCTION_IDENTIFIER =
  '219b53a9-9a02-4e6b-bd67-f4da46628541';
const objectSchema = z.object({
  universalIdentifier: z.uuid(),
  applicationId: z.uuid(),
  nameSingular: z.string(),
  namePlural: z.string(),
  isActive: z.boolean(),
  fieldsList: z
    .array(
      z.object({
        id: z.uuid(),
        universalIdentifier: z.uuid(),
        name: z.string(),
        type: z.string(),
        isActive: z.boolean(),
      }),
    )
    .max(500),
  indexMetadataList: z
    .array(
      z.object({
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
    objects: z.object({
      edges: z.array(z.object({ node: objectSchema })).length(2),
      pageInfo: z.object({ hasNextPage: z.literal(false) }),
    }),
    findManyLogicFunctions: z
      .array(
        z.object({
          universalIdentifier: z.uuid().nullable().optional(),
          applicationId: z.uuid().nullable().optional(),
          name: z.string(),
          httpRouteTriggerSettings: z.unknown(),
        }),
      )
      .max(1000),
  }),
});
const query = `query CalendarScheduleGatewayCapabilities {
  objects(paging: {first: 3}, filter: {or: [{universalIdentifier: {eq: "${SESSION_OBJECT}"}}, {universalIdentifier: {eq: "${JOURNAL_OBJECT}"}}]}) {
    edges { node { universalIdentifier applicationId nameSingular namePlural isActive
      fieldsList { id universalIdentifier name type isActive }
      indexMetadataList { isUnique indexWhereClause indexFieldMetadataList { fieldMetadataId subFieldName } }
    } } pageInfo { hasNextPage }
  }
  findManyLogicFunctions { universalIdentifier applicationId name httpRouteTriggerSettings }
}`;

export const createCalendarScheduleCapabilityCheck = (
  configuration: CalendarCrmConfiguration,
) => {
  const request = createCalendarCrmRequest(configuration);
  return async (): Promise<
    'ready' | 'auth-required' | 'forbidden' | 'unconfirmed'
  > => {
    const response = await request('/metadata', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
    if (response.status === 'unconfirmed') return 'unconfirmed';
    if (response.httpStatus === 401) return 'auth-required';
    if (response.httpStatus === 403) return 'forbidden';
    const parsed = metadataSchema.safeParse(response.body);
    if (response.httpStatus !== 200 || !parsed.success) return 'unconfirmed';
    const metadata = parsed.data.data;
    const sessions = metadata.objects.edges
      .map((edge) => edge.node)
      .filter((object) => object.universalIdentifier === SESSION_OBJECT);
    const journals = metadata.objects.edges
      .map((edge) => edge.node)
      .filter((object) => object.universalIdentifier === JOURNAL_OBJECT);
    if (sessions.length !== 1 || journals.length !== 1) return 'unconfirmed';
    const session = sessions[0],
      journal = journals[0];
    if (
      !session.isActive ||
      !journal.isActive ||
      session.applicationId !== journal.applicationId ||
      session.nameSingular !== 'classSession' ||
      session.namePlural !== 'classSessions' ||
      journal.nameSingular !== 'studioSessionOperation' ||
      journal.namePlural !== 'studioSessionOperations'
    )
      return 'unconfirmed';
    const hasFields = (
      object: z.infer<typeof objectSchema>,
      required: Record<string, string>,
    ) =>
      Object.entries(required).every(([name, type]) => {
        const fields = object.fieldsList.filter((field) => field.name === name);
        return (
          fields.length === 1 && fields[0].type === type && fields[0].isActive
        );
      });
    if (
      !hasFields(session, { mutationLock: 'TEXT' }) ||
      !hasFields(journal, {
        operationKey: 'TEXT',
        classSessionId: 'TEXT',
        request: 'TEXT',
        ownerToken: 'TEXT',
        state: 'SELECT',
        result: 'TEXT',
      })
    )
      return 'unconfirmed';
    if (
      session.fieldsList.find((field) => field.name === 'mutationLock')
        ?.universalIdentifier !== 'b40aa498-854e-4997-a6fd-e70730668149'
    )
      return 'unconfirmed';
    const operationKey = journal.fieldsList.find(
      (field) => field.name === 'operationKey',
    );
    if (
      !operationKey ||
      operationKey.universalIdentifier !== OPERATION_KEY_FIELD ||
      !journal.indexMetadataList.some(
        (index) =>
          index.isUnique &&
          !index.indexWhereClause?.trim() &&
          index.indexFieldMetadataList.length === 1 &&
          index.indexFieldMetadataList[0].fieldMetadataId === operationKey.id &&
          !index.indexFieldMetadataList[0].subFieldName,
      )
    )
      return 'unconfirmed';
    const functions = metadata.findManyLogicFunctions.filter(
      (item) => item.universalIdentifier === SCHEDULE_FUNCTION_IDENTIFIER,
    );
    if (functions.length !== 1) return 'unconfirmed';
    const command = functions[0];
    if (
      command.applicationId !== session.applicationId ||
      command.name !== 'studio-update-session' ||
      !z
        .object({
          path: z.literal('/studio/sessions/update'),
          httpMethod: z.literal('POST'),
          isAuthRequired: z.literal(true),
        })
        .safeParse(command.httpRouteTriggerSettings).success
    )
      return 'unconfirmed';
    return 'ready';
  };
};
