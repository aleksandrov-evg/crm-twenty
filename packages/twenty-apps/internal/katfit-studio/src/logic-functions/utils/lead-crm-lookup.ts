import type { CoreApiClient } from 'twenty-client-sdk/core';

export type LeadPersonLookup = {
  id: string;
  landingLeadId?: string | null;
  lifecycleStatus?: string | null;
  lastContactChannel?: string | null;
  firstContactedAt?: string | null;
  nextActionAt?: string | null;
};

export type LeadOpportunityLookup = {
  id: string;
  clientStage?: string | null;
  leadReceivedAt?: string | null;
  contactedAt?: string | null;
  studioLostReason?: string | null;
};

export type LeadStatusNote = {
  id: string;
  at: string;
  title: string | null;
  body: string;
};

/** Max notes returned by lead-status (newest N, then sorted oldest→newest). */
export const LEAD_STATUS_NOTES_LIMIT = 50;

export const LEAD_PERSON_LOOKUP_SELECTION = {
  id: true,
  landingLeadId: true,
  lifecycleStatus: true,
  lastContactChannel: true,
  firstContactedAt: true,
  nextActionAt: true,
} as const;

export const LEAD_OPPORTUNITY_LOOKUP_SELECTION = {
  id: true,
  clientStage: true,
  leadReceivedAt: true,
  contactedAt: true,
  studioLostReason: true,
} as const;

export const findPersonById = async (
  client: CoreApiClient,
  personId: string,
): Promise<LeadPersonLookup | null> => {
  const data = (await client.query({
    person: {
      __args: { filter: { id: { eq: personId } } },
      ...LEAD_PERSON_LOOKUP_SELECTION,
    },
  } as any)) as any;
  return data?.person ?? null;
};

export const findPersonByLandingLeadId = async (
  client: CoreApiClient,
  landingLeadId: string,
): Promise<LeadPersonLookup | null> => {
  const data = (await client.query({
    people: {
      __args: {
        filter: { landingLeadId: { eq: landingLeadId } },
        first: 1,
      },
      edges: { node: LEAD_PERSON_LOOKUP_SELECTION },
    },
  } as any)) as any;
  return data?.people?.edges?.[0]?.node ?? null;
};

export const findOpportunityById = async (
  client: CoreApiClient,
  opportunityId: string,
): Promise<LeadOpportunityLookup | null> => {
  const data = (await client.query({
    opportunity: {
      __args: { filter: { id: { eq: opportunityId } } },
      ...LEAD_OPPORTUNITY_LOOKUP_SELECTION,
    },
  } as any)) as any;
  return data?.opportunity ?? null;
};

export const findOpenOpportunity = async (
  client: CoreApiClient,
  personId: string,
): Promise<LeadOpportunityLookup | null> => {
  const data = (await client.query({
    opportunities: {
      __args: {
        filter: { studioClientId: { eq: personId } },
        first: 20,
      },
      edges: { node: LEAD_OPPORTUNITY_LOOKUP_SELECTION },
    },
  } as any)) as any;

  const nodes: LeadOpportunityLookup[] = (data?.opportunities?.edges ?? []).map(
    (edge: { node: LeadOpportunityLookup }) => edge.node,
  );

  const open = nodes.find(
    (node) =>
      node?.id &&
      node.clientStage !== 'FIRST_PURCHASE' &&
      node.clientStage !== 'LOST',
  );
  return open ?? nodes[0] ?? null;
};

type NoteTargetEdge = {
  node?: {
    note?: {
      id?: string;
      createdAt?: string;
      title?: string | null;
      bodyV2?: { markdown?: string | null } | null;
    } | null;
  } | null;
};

/**
 * Map noteTarget edges → status notes.
 * Input may be newest-first (API order); output is oldest→newest (ascending by `at`).
 */
export const mapNoteTargetsToStatusNotes = (
  edges: NoteTargetEdge[],
): LeadStatusNote[] => {
  const notes: LeadStatusNote[] = [];
  for (const edge of edges) {
    const note = edge?.node?.note;
    if (!note?.id) continue;
    notes.push({
      id: note.id,
      at: note.createdAt ?? '',
      title: note.title ?? null,
      body: String(note.bodyV2?.markdown ?? ''),
    });
  }
  notes.sort((a, b) => {
    const ta = Date.parse(a.at) || 0;
    const tb = Date.parse(b.at) || 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  return notes;
};

export const listNotesForPerson = async (
  client: CoreApiClient,
  personId: string,
  limit: number = LEAD_STATUS_NOTES_LIMIT,
): Promise<LeadStatusNote[]> => {
  const data = (await client.query({
    noteTargets: {
      __args: {
        filter: { targetPersonId: { eq: personId } },
        first: limit,
        orderBy: [{ createdAt: 'DescNullsLast' }],
      },
      edges: {
        node: {
          note: {
            id: true,
            createdAt: true,
            title: true,
            bodyV2: { markdown: true },
          },
        },
      },
    },
  } as any)) as any;

  return mapNoteTargetsToStatusNotes(data?.noteTargets?.edges ?? []);
};
