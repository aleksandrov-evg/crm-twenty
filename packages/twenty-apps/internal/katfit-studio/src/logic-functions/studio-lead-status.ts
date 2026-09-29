import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import {
  findOpenOpportunity,
  findPersonById,
  findPersonByLandingLeadId,
  listNotesForPerson,
} from 'src/logic-functions/utils/lead-crm-lookup';

export type StudioLeadStatusPayload = {
  landingLeadId?: string | null;
  personId?: string | null;
};

export const studioLeadStatusHandler = async (
  routePayload: RoutePayload<StudioLeadStatusPayload>,
): Promise<Response> => {
  const body = (routePayload.body ?? {}) as StudioLeadStatusPayload;
  const landingLeadId = String(body.landingLeadId ?? '').trim();
  const personIdInput = String(body.personId ?? '').trim();

  if (!landingLeadId && !personIdInput) {
    return new Response(
      { error: 'landingLeadId or personId is required' },
      { status: 400 },
    );
  }

  const client = new CoreApiClient();

  const person = personIdInput
    ? await findPersonById(client, personIdInput)
    : await findPersonByLandingLeadId(client, landingLeadId);

  if (!person?.id) {
    return new Response({ error: 'Person not found' }, { status: 404 });
  }

  const opportunity = await findOpenOpportunity(client, person.id);
  const notes = await listNotesForPerson(client, person.id);

  return new Response(
    {
      personId: person.id,
      opportunityId: opportunity?.id ?? null,
      clientStage: opportunity?.clientStage ?? null,
      lifecycleStatus: person.lifecycleStatus ?? null,
      lastContactChannel: person.lastContactChannel ?? null,
      studioLostReason: opportunity?.studioLostReason ?? null,
      deepLinkPath: `/objects/people/${person.id}`,
      notes,
    },
    { status: 200 },
  );
};

export default defineLogicFunction({
  universalIdentifier: 'b2e8d4a1-6c3f-4e9b-a7d2-1f5c8e0b9a34',
  name: 'studio-lead-status',
  description:
    'Read-only lead status for Telegram card resend: stage, channel, notes history',
  timeoutSeconds: 15,
  handler: studioLeadStatusHandler,
  httpRouteTriggerSettings: {
    path: '/studio/lead-status',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
