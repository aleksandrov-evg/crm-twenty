import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import {
  eventNoteTitle,
  planLeadAction,
  type LeadActionInput,
} from 'src/logic-functions/utils/lead-actions';
import {
  findOpenOpportunity,
  findOpportunityById,
  findPersonById,
  findPersonByLandingLeadId,
  LEAD_OPPORTUNITY_LOOKUP_SELECTION,
  LEAD_PERSON_LOOKUP_SELECTION,
  type LeadOpportunityLookup,
  type LeadPersonLookup,
} from 'src/logic-functions/utils/lead-crm-lookup';
import {
  TASK_TITLE_CONTACT,
  TASK_TITLES_CONTACT_LEGACY,
  TASK_TITLES_FOLLOWUP_LEGACY,
} from 'src/logic-functions/utils/lead-normalize';

export type StudioLeadActionPayload = LeadActionInput & {
  landingLeadId?: string | null;
  personId?: string | null;
  opportunityId?: string | null;
};

const findNoteByEventTitle = async (
  client: CoreApiClient,
  title: string,
): Promise<string | null> => {
  const data = (await client.query({
    notes: {
      __args: {
        filter: { title: { eq: title } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  } as any)) as any;
  return data?.notes?.edges?.[0]?.node?.id ?? null;
};

const createNoteForPerson = async (
  client: CoreApiClient,
  personId: string,
  title: string,
  body: string,
): Promise<string> => {
  const created = (await client.mutation({
    createNote: {
      __args: {
        data: {
          title,
          bodyV2: { markdown: body },
        },
      },
      id: true,
    },
  } as any)) as any;

  const noteId = created?.createNote?.id as string | undefined;
  if (!noteId) throw new Error('Failed to create Note');

  await client.mutation({
    createNoteTarget: {
      __args: {
        data: {
          noteId,
          targetPersonId: personId,
        },
      },
      id: true,
    },
  } as any);

  return noteId;
};

const createTaskForPerson = async (
  client: CoreApiClient,
  personId: string,
  title: string,
  dueAt: string,
): Promise<string> => {
  const created = (await client.mutation({
    createTask: {
      __args: {
        data: {
          title,
          dueAt,
          status: 'TODO',
        },
      },
      id: true,
    },
  } as any)) as any;

  const taskId = created?.createTask?.id as string | undefined;
  if (!taskId) throw new Error('Failed to create Task');

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

const listOpenTasksForPerson = async (
  client: CoreApiClient,
  personId: string,
): Promise<Array<{ id: string; title: string }>> => {
  const data = (await client.query({
    taskTargets: {
      __args: {
        filter: { targetPersonId: { eq: personId } },
        first: 50,
      },
      edges: {
        node: {
          task: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    },
  } as any)) as any;

  const tasks: Array<{ id: string; title: string }> = [];
  for (const edge of data?.taskTargets?.edges ?? []) {
    const task = edge?.node?.task;
    if (task?.id && task.status !== 'DONE') {
      tasks.push({ id: task.id, title: String(task.title ?? '') });
    }
  }
  return tasks;
};

const closeTasks = async (
  client: CoreApiClient,
  taskIds: string[],
): Promise<void> => {
  for (const id of taskIds) {
    await client.mutation({
      updateTask: {
        __args: {
          id,
          data: { status: 'DONE' },
        },
        id: true,
      },
    } as any);
  }
};

export const studioLeadActionsHandler = async (
  routePayload: RoutePayload<StudioLeadActionPayload>,
): Promise<Response> => {
  const body = (routePayload.body ?? {}) as StudioLeadActionPayload;
  const landingLeadId = String(body.landingLeadId ?? '').trim();
  const personIdInput = String(body.personId ?? '').trim();
  const opportunityIdInput = String(body.opportunityId ?? '').trim();

  if (!landingLeadId && !personIdInput) {
    return new Response(
      { error: 'landingLeadId or personId is required' },
      { status: 400 },
    );
  }

  const client = new CoreApiClient();

  let person: LeadPersonLookup | null = null;
  if (personIdInput) {
    person = await findPersonById(client, personIdInput);
  } else {
    person = await findPersonByLandingLeadId(client, landingLeadId);
  }

  if (!person?.id) {
    return new Response({ error: 'Person not found' }, { status: 404 });
  }

  let ensuredPerson: LeadPersonLookup = person;

  const clientEventId = String(body.clientEventId ?? '').trim();
  if (clientEventId) {
    const existingNoteId = await findNoteByEventTitle(
      client,
      eventNoteTitle(clientEventId),
    );
    if (existingNoteId) {
      const opportunity = opportunityIdInput
        ? await findOpportunityById(client, opportunityIdInput)
        : await findOpenOpportunity(client, ensuredPerson.id);
      return new Response(
        {
          personId: ensuredPerson.id,
          opportunityId: opportunity?.id ?? null,
          clientStage: opportunity?.clientStage ?? null,
          lifecycleStatus: ensuredPerson.lifecycleStatus ?? null,
          noteId: existingNoteId,
          taskId: null,
          duplicateEvent: true,
          deepLinkPath: `/objects/people/${ensuredPerson.id}`,
        },
        { status: 200 },
      );
    }
  }

  let opportunity: LeadOpportunityLookup | null = null;
  if (opportunityIdInput) {
    opportunity = await findOpportunityById(client, opportunityIdInput);
    if (!opportunity?.id) {
      return new Response({ error: 'Opportunity not found' }, { status: 404 });
    }
  } else {
    opportunity = await findOpenOpportunity(client, ensuredPerson.id);
  }

  const planned = planLeadAction({
    input: body,
    currentClientStage: opportunity?.clientStage,
    currentLifecycleStatus: ensuredPerson.lifecycleStatus,
    leadReceivedAt: opportunity?.leadReceivedAt,
    alreadyContactedAt:
      opportunity?.contactedAt ?? ensuredPerson.firstContactedAt,
  });

  if (!planned.ok) {
    return new Response({ error: planned.error }, { status: planned.status });
  }

  const { plan } = planned;

  if (Object.keys(plan.personPatch).length > 0) {
    const updated = (await client.mutation({
      updatePerson: {
        __args: { id: ensuredPerson.id, data: plan.personPatch },
        ...LEAD_PERSON_LOOKUP_SELECTION,
      },
    } as any)) as any;
    const nextPerson = updated?.updatePerson as LeadPersonLookup | null | undefined;
    if (nextPerson?.id) {
      ensuredPerson = nextPerson;
    }
  }

  if (plan.opportunityPatch) {
    if (!opportunity?.id) {
      return new Response(
        { error: 'Open Opportunity required for this action' },
        { status: 404 },
      );
    }
    const updatedOpp = (await client.mutation({
      updateOpportunity: {
        __args: { id: opportunity.id, data: plan.opportunityPatch },
        ...LEAD_OPPORTUNITY_LOOKUP_SELECTION,
      },
    } as any)) as any;
    opportunity = updatedOpp?.updateOpportunity ?? opportunity;
  }

  const noteId = await createNoteForPerson(
    client,
    ensuredPerson.id,
    plan.noteTitle,
    plan.noteBody,
  );

  const openTasks = await listOpenTasksForPerson(client, ensuredPerson.id);
  const toClose: string[] = [];
  const contactTitles = new Set<string>([
    TASK_TITLE_CONTACT,
    ...TASK_TITLES_CONTACT_LEGACY,
  ]);
  if (plan.closeContactTask) {
    for (const task of openTasks) {
      if (
        contactTitles.has(task.title) ||
        task.title === 'Написать снова' ||
        task.title === 'Вернуться к думающим'
      ) {
        toClose.push(task.id);
      }
    }
  }
  if (plan.closeOpenLeadTasks) {
    const leadTitles = new Set([
      ...contactTitles,
      'Написать снова',
      'Вернуться к думающим',
      'Согласовать слот intro',
      'Напомнить про intro',
      'Предложить пакет',
      'Написать после no-show',
      'Follow-up',
      ...TASK_TITLES_FOLLOWUP_LEGACY,
    ]);
    for (const task of openTasks) {
      if (leadTitles.has(task.title)) toClose.push(task.id);
    }
  }
  if (toClose.length) {
    await closeTasks(client, [...new Set(toClose)]);
  }

  let taskId: string | null = null;
  if (plan.createTask) {
    taskId = await createTaskForPerson(
      client,
      ensuredPerson.id,
      plan.createTask.title,
      plan.createTask.dueAt,
    );
  }

  return new Response(
    {
      personId: ensuredPerson.id,
      opportunityId: opportunity?.id ?? null,
      clientStage: plan.resultingClientStage,
      lifecycleStatus: plan.resultingLifecycleStatus,
      noteId,
      taskId,
      duplicateEvent: false,
      deepLinkPath: `/objects/people/${ensuredPerson.id}`,
    },
    { status: 200 },
  );
};

export default defineLogicFunction({
  universalIdentifier: '7c4e9f12-8a3b-4d6e-9c1f-2e5a8b7d4c6f',
  name: 'studio-lead-actions',
  description:
    'Lead funnel actions from Telegram ops-bot / secretary: notes, stages, tasks',
  timeoutSeconds: 30,
  handler: studioLeadActionsHandler,
  httpRouteTriggerSettings: {
    path: '/studio/lead-actions',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
