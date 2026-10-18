import { z } from 'zod';
import { createCalendarScheduleCapabilityCheck } from './check-calendar-schedule-capabilities';
import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';

export const createCalendarCancellationCapabilityCheck = (
  configuration: CalendarCrmConfiguration,
) => {
  const request = createCalendarCrmRequest(configuration);
  return async (): Promise<boolean> => {
    if (
      (await createCalendarScheduleCapabilityCheck(configuration)()) !== 'ready'
    )
      return false;
    const response = await request('/metadata', {
      method: 'POST',
      body: JSON.stringify({
        query: `query CalendarCancellationGateway { objects(paging: {first: 2}, filter: {universalIdentifier: {eq: "295ff896-3ff5-429e-b390-b52825ae03eb"}}) { edges { node { applicationId nameSingular namePlural isActive fieldsList { universalIdentifier name type isActive } } } pageInfo { hasNextPage } } findManyLogicFunctions { universalIdentifier applicationId name httpRouteTriggerSettings } }`,
      }),
    });
    if (response.status !== 'received' || response.httpStatus !== 200)
      return false;
    const parsed = z
      .object({
        errors: z.array(z.unknown()).max(0).optional(),
        data: z.object({
          objects: z.object({
            edges: z
              .array(
                z.object({
                  node: z.object({
                    applicationId: z.uuid(),
                    nameSingular: z.literal('studioMembership'),
                    namePlural: z.literal('studioMemberships'),
                    isActive: z.literal(true),
                    fieldsList: z.array(
                      z.object({
                        universalIdentifier: z.uuid(),
                        name: z.string(),
                        type: z.string(),
                        isActive: z.boolean(),
                      }),
                    ),
                  }),
                }),
              )
              .length(1),
            pageInfo: z.object({ hasNextPage: z.literal(false) }),
          }),
          findManyLogicFunctions: z.array(
            z.object({
              universalIdentifier: z.string().nullable().optional(),
              applicationId: z.string().nullable().optional(),
              name: z.string(),
              httpRouteTriggerSettings: z.unknown(),
            }),
          ),
        }),
      })
      .safeParse(response.body);
    if (!parsed.success) return false;
    const membership = parsed.data.data.objects.edges[0].node;
    if (
      membership.fieldsList.filter(
        (field) =>
          field.name === 'mutationLock' &&
          field.type === 'TEXT' &&
          field.isActive &&
          field.universalIdentifier === 'ed94a469-540c-4375-9349-7f58100945df',
      ).length !== 1
    )
      return false;
    const functions = parsed.data.data.findManyLogicFunctions.filter(
      (item) =>
        item.universalIdentifier === '71da876c-5d65-44bd-9db9-5afdf178f5e1',
    );
    return (
      functions.length === 1 &&
      functions[0].name === 'studio-cancel-class-session' &&
      functions[0].applicationId === membership.applicationId &&
      z
        .object({
          path: z.literal('/studio/sessions/cancel'),
          httpMethod: z.literal('POST'),
          isAuthRequired: z.literal(true),
        })
        .safeParse(functions[0].httpRouteTriggerSettings).success
    );
  };
};
