import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import {
  mapLeadSource,
  normalizeContact,
  opportunityName,
  slaDueAt,
  splitPersonName,
  TASK_TITLE_CONTACT,
  TERMINAL_OPPORTUNITY_STAGES,
  toIsoDate,
} from 'src/logic-functions/utils/lead-normalize';

export type StudioLeadUtm = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
};

export type StudioLeadPayload = {
  externalId?: string;
  submittedAt?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  interestedFormats?: string[];
  personalDataConsent?: boolean;
  personalDataConsentVersion?: string | null;
  marketingConsent?: boolean;
  utm?: StudioLeadUtm | null;
};

type PersonNode = {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  landingLeadId?: string | null;
  firstLeadAt?: string | null;
  lastLeadAt?: string | null;
  leadSource?: string | null;
  lastLeadSource?: string | null;
  lifecycleStatus?: string | null;
  personalDataConsent?: boolean | null;
  firstUtmSource?: string | null;
  firstUtmMedium?: string | null;
  firstUtmCampaign?: string | null;
  firstUtmContent?: string | null;
  firstUtmTerm?: string | null;
};

type OpportunityNode = {
  id: string;
  clientStage?: string | null;
};

type IngestResult = {
  personId: string;
  opportunityId: string | null;
  taskId: string | null;
  duplicate: boolean;
  reviewRequired?: boolean;
  message?: string;
};

const PERSON_SELECTION = {
  id: true,
  name: { firstName: true, lastName: true },
  landingLeadId: true,
  firstLeadAt: true,
  lastLeadAt: true,
  leadSource: true,
  lastLeadSource: true,
  lifecycleStatus: true,
  personalDataConsent: true,
  firstUtmSource: true,
  firstUtmMedium: true,
  firstUtmCampaign: true,
  firstUtmContent: true,
  firstUtmTerm: true,
} as const;

const displayName = (person: PersonNode, fallback: string): string => {
  const combined = `${person.name?.firstName ?? ''} ${person.name?.lastName ?? ''}`.trim();
  return combined || fallback;
};

const uniquePeople = (people: PersonNode[]): PersonNode[] => {
  const byId = new Map<string, PersonNode>();
  for (const person of people) {
    if (person?.id) byId.set(person.id, person);
  }
  return [...byId.values()];
};

const findPeopleByLandingLeadId = async (
  client: CoreApiClient,
  landingLeadId: string,
): Promise<PersonNode[]> => {
  const data = (await client.query({
    people: {
      __args: {
        filter: { landingLeadId: { eq: landingLeadId } },
        first: 5,
      },
      edges: { node: PERSON_SELECTION },
    },
  } as any)) as any;

  return (data?.people?.edges ?? []).map(
    (edge: { node: PersonNode }) => edge.node,
  );
};

const findPeopleByPhone = async (
  client: CoreApiClient,
  nationalNumber: string,
): Promise<PersonNode[]> => {
  const data = (await client.query({
    people: {
      __args: {
        filter: {
          phones: { primaryPhoneNumber: { eq: nationalNumber } },
        },
        first: 5,
      },
      edges: { node: PERSON_SELECTION },
    },
  } as any)) as any;

  return (data?.people?.edges ?? []).map(
    (edge: { node: PersonNode }) => edge.node,
  );
};

const findPeopleByEmail = async (
  client: CoreApiClient,
  email: string,
): Promise<PersonNode[]> => {
  const data = (await client.query({
    people: {
      __args: {
        filter: { emails: { primaryEmail: { eq: email } } },
        first: 5,
      },
      edges: { node: PERSON_SELECTION },
    },
  } as any)) as any;

  return (data?.people?.edges ?? []).map(
    (edge: { node: PersonNode }) => edge.node,
  );
};

const resolvePersonByContact = async (
  client: CoreApiClient,
  contact: ReturnType<typeof normalizeContact>,
): Promise<
  | { ok: true; person: PersonNode | null }
  | { ok: false; conflict: true; message: string }
> => {
  const byPhone = contact.nationalNumber
    ? await findPeopleByPhone(client, contact.nationalNumber)
    : [];
  const byEmail = contact.email
    ? await findPeopleByEmail(client, contact.email)
    : [];

  if (byPhone.length && byEmail.length) {
    const phoneIds = new Set(byPhone.map((person) => person.id));
    const conflicting = byEmail.filter((person) => !phoneIds.has(person.id));
    if (conflicting.length) {
      return {
        ok: false,
        conflict: true,
        message: `Person conflict: phone matches ${byPhone.map((p) => p.id).join(',')} but email matches ${conflicting.map((p) => p.id).join(',')}`,
      };
    }
  }

  const matches = uniquePeople([...byPhone, ...byEmail]);
  if (matches.length > 1) {
    return {
      ok: false,
      conflict: true,
      message: `Multiple Person matches for contact: ${matches.map((p) => p.id).join(',')}`,
    };
  }

  return { ok: true, person: matches[0] ?? null };
};

const findOpenOpportunity = async (
  client: CoreApiClient,
  personId: string,
): Promise<OpportunityNode | null> => {
  const data = (await client.query({
    opportunities: {
      __args: {
        filter: { studioClientId: { eq: personId } },
        first: 20,
      },
      edges: {
        node: {
          id: true,
          clientStage: true,
        },
      },
    },
  } as any)) as any;

  const nodes: OpportunityNode[] = (data?.opportunities?.edges ?? []).map(
    (edge: { node: OpportunityNode }) => edge.node,
  );

  return (
    nodes.find(
      (node) => node?.id && !TERMINAL_OPPORTUNITY_STAGES.has(node.clientStage ?? ''),
    ) ?? null
  );
};

const findOpenContactTask = async (
  client: CoreApiClient,
  personId: string,
): Promise<string | null> => {
  const data = (await client.query({
    taskTargets: {
      __args: {
        filter: { targetPersonId: { eq: personId } },
        first: 20,
      },
      edges: {
        node: {
          id: true,
          taskId: true,
          task: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    },
  } as any)) as any;

  for (const edge of data?.taskTargets?.edges ?? []) {
    const task = edge?.node?.task;
    if (
      task?.id &&
      task.title === TASK_TITLE_CONTACT &&
      task.status !== 'DONE'
    ) {
      return task.id;
    }
  }

  return null;
};

const buildCreatePersonData = ({
  name,
  contact,
  leadSource,
  submittedAt,
  externalId,
  interestedFormats,
  personalDataConsentVersion,
  marketingConsent,
  utm,
}: {
  name: string;
  contact: ReturnType<typeof normalizeContact>;
  leadSource: string;
  submittedAt: string;
  externalId: string;
  interestedFormats: string[];
  personalDataConsentVersion: string | null;
  marketingConsent: boolean;
  utm: StudioLeadUtm;
}) => {
  const { firstName, lastName } = splitPersonName(name);
  const data: Record<string, unknown> = {
    name: { firstName, lastName },
    landingLeadId: externalId,
    lifecycleStatus: 'WAITLIST',
    leadSource,
    lastLeadSource: leadSource,
    firstLeadAt: submittedAt,
    lastLeadAt: submittedAt,
    personalDataConsent: true,
    personalDataConsentAt: submittedAt,
    marketingConsent,
    nextActionAt: slaDueAt(new Date(submittedAt)),
  };

  if (personalDataConsentVersion) {
    data.personalDataConsentVersion = personalDataConsentVersion;
  }
  if (marketingConsent) {
    data.marketingConsentAt = submittedAt;
    data.marketingConsentSource = 'landing';
  }
  if (interestedFormats.length) {
    data.interestedFormats = interestedFormats;
  }
  if (contact.nationalNumber) {
    data.phones = {
      primaryPhoneNumber: contact.nationalNumber,
      primaryPhoneCountryCode: 'RU',
      primaryPhoneCallingCode: '+7',
    };
  }
  if (contact.email) {
    data.emails = { primaryEmail: contact.email };
  }
  if (utm.source) data.firstUtmSource = utm.source;
  if (utm.medium) data.firstUtmMedium = utm.medium;
  if (utm.campaign) data.firstUtmCampaign = utm.campaign;
  if (utm.content) data.firstUtmContent = utm.content;
  if (utm.term) data.firstUtmTerm = utm.term;
  if (utm.source) data.lastUtmSource = utm.source;
  if (utm.medium) data.lastUtmMedium = utm.medium;
  if (utm.campaign) data.lastUtmCampaign = utm.campaign;
  if (utm.content) data.lastUtmContent = utm.content;
  if (utm.term) data.lastUtmTerm = utm.term;

  return data;
};

const buildUpdatePersonData = ({
  existing,
  leadSource,
  submittedAt,
  externalId,
  interestedFormats,
  marketingConsent,
  utm,
}: {
  existing: PersonNode;
  leadSource: string;
  submittedAt: string;
  externalId: string;
  interestedFormats: string[];
  marketingConsent: boolean;
  utm: StudioLeadUtm;
}) => {
  const data: Record<string, unknown> = {
    lastLeadAt: submittedAt,
    lastLeadSource: leadSource,
    marketingConsent,
    nextActionAt: slaDueAt(new Date(submittedAt)),
  };

  if (!existing.firstLeadAt) {
    data.firstLeadAt = submittedAt;
  }
  if (!existing.leadSource || existing.leadSource === 'UNKNOWN') {
    data.leadSource = leadSource;
  }
  if (!existing.landingLeadId) {
    data.landingLeadId = externalId;
  }
  if (!existing.personalDataConsent) {
    data.personalDataConsent = true;
    data.personalDataConsentAt = submittedAt;
  }
  if (marketingConsent) {
    data.marketingConsentAt = submittedAt;
    data.marketingConsentSource = 'landing';
  }
  if (interestedFormats.length) {
    data.interestedFormats = interestedFormats;
  }
  if (
    existing.lifecycleStatus === 'CHURNED' ||
    existing.lifecycleStatus === 'PAUSED'
  ) {
    data.lifecycleStatus = 'RE_ENGAGEMENT';
  } else if (
    !existing.lifecycleStatus ||
    existing.lifecycleStatus === 'WAITLIST'
  ) {
    data.lifecycleStatus = 'WAITLIST';
  }

  if (!existing.firstUtmSource && utm.source) data.firstUtmSource = utm.source;
  if (!existing.firstUtmMedium && utm.medium) data.firstUtmMedium = utm.medium;
  if (!existing.firstUtmCampaign && utm.campaign) {
    data.firstUtmCampaign = utm.campaign;
  }
  if (!existing.firstUtmContent && utm.content) {
    data.firstUtmContent = utm.content;
  }
  if (!existing.firstUtmTerm && utm.term) data.firstUtmTerm = utm.term;

  if (utm.source) data.lastUtmSource = utm.source;
  if (utm.medium) data.lastUtmMedium = utm.medium;
  if (utm.campaign) data.lastUtmCampaign = utm.campaign;
  if (utm.content) data.lastUtmContent = utm.content;
  if (utm.term) data.lastUtmTerm = utm.term;

  return data;
};

const createContactTask = async (
  client: CoreApiClient,
  personId: string,
  submittedAt: string,
): Promise<string> => {
  const existingTaskId = await findOpenContactTask(client, personId);
  if (existingTaskId) return existingTaskId;

  const dueAt = slaDueAt(new Date(submittedAt));
  const created = (await client.mutation({
    createTask: {
      __args: {
        data: {
          title: TASK_TITLE_CONTACT,
          dueAt,
          status: 'TODO',
        },
      },
      id: true,
    },
  } as any)) as any;

  const taskId = created?.createTask?.id as string | undefined;
  if (!taskId) {
    throw new Error('Failed to create Task');
  }

  await client.mutation({
    createTaskTarget: {
      __args: {
        data: {
          taskId,
          targetPersonId: personId,
        },
      },
      id: true,
    },
  } as any);

  return taskId;
};

export const studioLeadsHandler = async (
  routePayload: RoutePayload<StudioLeadPayload>,
): Promise<Response> => {
  const body = (routePayload.body ?? {}) as StudioLeadPayload;

  const externalId = String(body.externalId ?? '').trim();
  const name = String(body.name ?? '').trim();
  const personalDataConsent = body.personalDataConsent === true;

  if (!externalId || !name || !personalDataConsent) {
    return new Response(
      {
        error:
          'externalId, name and personalDataConsent=true are required',
      },
      { status: 400 },
    );
  }

  const contact = normalizeContact(body.phone, body.email);
  if (!contact.e164 && !contact.email) {
    return new Response(
      { error: 'phone or email is required after normalization' },
      { status: 400 },
    );
  }

  const submittedAt = toIsoDate(body.submittedAt);
  const utm: StudioLeadUtm = body.utm ?? {};
  const leadSource = mapLeadSource({
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
  });
  const interestedFormats = Array.isArray(body.interestedFormats)
    ? [...new Set(body.interestedFormats.map(String).filter(Boolean))]
    : [];

  const client = new CoreApiClient();

  const byExternalId = await findPeopleByLandingLeadId(client, externalId);
  let person: PersonNode | null = byExternalId[0] ?? null;
  let duplicate = Boolean(person);

  if (!person) {
    const resolved = await resolvePersonByContact(client, contact);
    if (!resolved.ok) {
      return new Response(
        {
          reviewRequired: true,
          message: resolved.message,
          duplicate: false,
        },
        { status: 202 },
      );
    }
    person = resolved.person;
    duplicate = Boolean(person);
  }

  if (person) {
    const updateData = buildUpdatePersonData({
      existing: person,
      leadSource,
      submittedAt,
      externalId,
      interestedFormats,
      marketingConsent: Boolean(body.marketingConsent),
      utm,
    });
    const updated = (await client.mutation({
      updatePerson: {
        __args: { id: person.id, data: updateData },
        ...PERSON_SELECTION,
      },
    } as any)) as any;
    person = updated?.updatePerson ?? person;
  } else {
    const createData = buildCreatePersonData({
      name,
      contact,
      leadSource,
      submittedAt,
      externalId,
      interestedFormats,
      personalDataConsentVersion: body.personalDataConsentVersion ?? null,
      marketingConsent: Boolean(body.marketingConsent),
      utm,
    });
    const created = (await client.mutation({
      createPerson: {
        __args: { data: createData },
        ...PERSON_SELECTION,
      },
    } as any)) as any;
    person = created?.createPerson ?? null;
    if (!person?.id) {
      return new Response({ error: 'Failed to create Person' }, { status: 500 });
    }
  }

  if (!person?.id) {
    return new Response({ error: 'Person missing after upsert' }, { status: 500 });
  }

  const ensuredPerson: PersonNode = person;

  let opportunity = await findOpenOpportunity(client, ensuredPerson.id);
  if (!opportunity) {
    const createdOpp = (await client.mutation({
      createOpportunity: {
        __args: {
          data: {
            name: opportunityName(displayName(ensuredPerson, name)),
            clientStage: 'WAITLIST',
            leadReceivedAt: submittedAt,
            studioClientId: ensuredPerson.id,
            leadSource,
            utmCampaign: utm.campaign ?? null,
            utmContent: utm.content ?? null,
          },
        },
        id: true,
        clientStage: true,
      },
    } as any)) as any;
    opportunity = createdOpp?.createOpportunity ?? null;
  }

  const taskId = await createContactTask(client, ensuredPerson.id, submittedAt);

  const result: IngestResult = {
    personId: ensuredPerson.id,
    opportunityId: opportunity?.id ?? null,
    taskId,
    duplicate,
  };

  return new Response(result, { status: 200 });
};

export default defineLogicFunction({
  universalIdentifier: '23309870-44ab-4bd1-9dd8-9f29af1018be',
  name: 'studio-leads',
  description: 'WF-01: ingest landing lead into Person, Opportunity and Task',
  timeoutSeconds: 30,
  handler: studioLeadsHandler,
  httpRouteTriggerSettings: {
    path: '/studio/leads',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
