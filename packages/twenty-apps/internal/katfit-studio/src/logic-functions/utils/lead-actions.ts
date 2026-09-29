export const LEAD_ACTIONS = [
  'note',
  'no_answer',
  'contacted',
  'intro_offered',
  'intro_booked',
  'intro_attended',
  'no_show',
  'first_purchase',
  'lost',
] as const;

export type LeadAction = (typeof LEAD_ACTIONS)[number];

export const LOST_REASONS = [
  'NO_RESPONSE',
  'NO_SUITABLE_TIME',
  'PRICE',
  'LOCATION',
  'FORMAT_MISMATCH',
  'CHANGED_MIND',
  'DUPLICATE',
  'OTHER',
] as const;

export type LostReason = (typeof LOST_REASONS)[number];

export const TERMINAL_OPPORTUNITY_STAGES = new Set(['FIRST_PURCHASE', 'LOST']);

const OPPORTUNITY_STAGE_RANK: Record<string, number> = {
  WAITLIST: 0,
  NEW_LEAD: 1,
  CONTACTED: 2,
  INTRO_OFFERED: 3,
  INTRO_BOOKED: 4,
  INTRO_ATTENDED: 5,
  FIRST_PURCHASE: 6,
  LOST: 6,
};

export type LeadActionInput = {
  action: string;
  note?: string | null;
  lostReason?: string | null;
  nextActionAt?: string | null;
  actorLabel?: string | null;
  clientEventId?: string | null;
};

export type LeadActionPlan = {
  action: LeadAction;
  noteTitle: string;
  noteBody: string;
  personPatch: Record<string, unknown>;
  opportunityPatch: Record<string, unknown> | null;
  closeContactTask: boolean;
  closeOpenLeadTasks: boolean;
  createTask: { title: string; dueAt: string } | null;
  resultingClientStage: string | null;
  resultingLifecycleStatus: string | null;
};

export const isLeadAction = (value: string): value is LeadAction =>
  (LEAD_ACTIONS as readonly string[]).includes(value);

export const isLostReason = (value: string): value is LostReason =>
  (LOST_REASONS as readonly string[]).includes(value);

export const eventNoteTitle = (clientEventId: string): string =>
  `TG-EVENT:${clientEventId}`;

const hoursFromNow = (hours: number, from: Date = new Date()): string =>
  new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();

const appendActor = (body: string, actorLabel?: string | null): string => {
  const trimmed = body.trim();
  const actor = String(actorLabel ?? '').trim();
  if (!actor) return trimmed;
  return trimmed ? `${trimmed}\n\n— ${actor}` : `— ${actor}`;
};

const defaultNoteForAction = (action: LeadAction): string => {
  switch (action) {
    case 'no_answer':
      return 'Написала в мессенджере / на почту — ответа нет.';
    case 'contacted':
      return 'Пообщались в мессенджере / по почте.';
    case 'intro_offered':
      return 'Предложены слоты intro.';
    case 'intro_booked':
      return 'Intro записано (слот зафиксирован текстом; Booking в CRM — отдельно).';
    case 'intro_attended':
      return 'Intro посещено.';
    case 'no_show':
      return 'No-show на intro.';
    case 'first_purchase':
      return 'Первая покупка подтверждена.';
    case 'lost':
      return 'Лид потерян.';
    case 'note':
      return '';
    default:
      return '';
  }
};

export const validateLeadActionInput = (
  input: LeadActionInput,
): { ok: true; action: LeadAction } | { ok: false; status: 400; error: string } => {
  const actionRaw = String(input.action ?? '').trim();
  if (!isLeadAction(actionRaw)) {
    return {
      ok: false,
      status: 400,
      error: `Unknown action. Allowed: ${LEAD_ACTIONS.join(', ')}`,
    };
  }

  if (actionRaw === 'note' && !String(input.note ?? '').trim()) {
    return { ok: false, status: 400, error: 'note action requires note text' };
  }

  if (actionRaw === 'lost') {
    const reason = String(input.lostReason ?? '').trim();
    if (!isLostReason(reason)) {
      return {
        ok: false,
        status: 400,
        error: `lost requires lostReason. Allowed: ${LOST_REASONS.join(', ')}`,
      };
    }
  }

  return { ok: true, action: actionRaw };
};

export const canApplyOpportunityStage = (
  currentStage: string | null | undefined,
  nextStage: string,
): boolean => {
  const current = currentStage ?? 'WAITLIST';
  if (TERMINAL_OPPORTUNITY_STAGES.has(current) && current !== nextStage) {
    return false;
  }
  if (nextStage === 'LOST') {
    return !TERMINAL_OPPORTUNITY_STAGES.has(current) || current === 'LOST';
  }
  const currentRank = OPPORTUNITY_STAGE_RANK[current] ?? 0;
  const nextRank = OPPORTUNITY_STAGE_RANK[nextStage] ?? 0;
  return nextRank >= currentRank;
};

/**
 * Pure planner: maps action + current CRM state → patches / tasks / note.
 * Throws nothing; returns 409-shaped error for illegal transitions.
 */
export const planLeadAction = ({
  input,
  currentClientStage,
  currentLifecycleStatus,
  leadReceivedAt,
  alreadyContactedAt,
}: {
  input: LeadActionInput;
  currentClientStage?: string | null;
  currentLifecycleStatus?: string | null;
  leadReceivedAt?: string | null;
  alreadyContactedAt?: string | null;
}):
  | { ok: true; plan: LeadActionPlan }
  | { ok: false; status: 400 | 409; error: string } => {
  const validated = validateLeadActionInput(input);
  if (!validated.ok) return validated;

  const action = validated.action;
  const now = new Date();
  const nowIso = now.toISOString();
  const noteText = appendActor(
    String(input.note ?? '').trim() || defaultNoteForAction(action),
    input.actorLabel,
  );
  const dueAt = input.nextActionAt
    ? new Date(input.nextActionAt).toISOString()
    : hoursFromNow(2, now);

  const clientEventId = String(input.clientEventId ?? '').trim();
  const noteTitle = clientEventId
    ? eventNoteTitle(clientEventId)
    : `Telegram: ${action}`;

  const stage = currentClientStage ?? 'WAITLIST';

  if (
    TERMINAL_OPPORTUNITY_STAGES.has(stage) &&
    action !== 'note' &&
    !(action === 'lost' && stage === 'LOST') &&
    !(action === 'first_purchase' && stage === 'FIRST_PURCHASE')
  ) {
    return {
      ok: false,
      status: 409,
      error: `Opportunity is terminal (${stage}); only note is allowed`,
    };
  }

  const base: Omit<
    LeadActionPlan,
    | 'personPatch'
    | 'opportunityPatch'
    | 'closeContactTask'
    | 'closeOpenLeadTasks'
    | 'createTask'
    | 'resultingClientStage'
    | 'resultingLifecycleStatus'
  > = {
    action,
    noteTitle,
    noteBody: noteText,
  };

  switch (action) {
    case 'note':
      return {
        ok: true,
        plan: {
          ...base,
          personPatch: input.nextActionAt
            ? { nextActionAt: dueAt }
            : {},
          opportunityPatch: null,
          closeContactTask: false,
          closeOpenLeadTasks: false,
          createTask: input.nextActionAt
            ? { title: 'Follow-up', dueAt }
            : null,
          resultingClientStage: stage,
          resultingLifecycleStatus: currentLifecycleStatus ?? null,
        },
      };

    case 'no_answer':
      return {
        ok: true,
        plan: {
          ...base,
          personPatch: { nextActionAt: dueAt },
          opportunityPatch: null,
          closeContactTask: false,
          closeOpenLeadTasks: false,
          createTask: { title: 'Написать снова', dueAt },
          resultingClientStage: stage,
          resultingLifecycleStatus: currentLifecycleStatus ?? null,
        },
      };

    case 'contacted': {
      if (!canApplyOpportunityStage(stage, 'CONTACTED')) {
        return {
          ok: false,
          status: 409,
          error: `Cannot move clientStage from ${stage} to CONTACTED`,
        };
      }
      const contactedAt = alreadyContactedAt || nowIso;
      let firstResponseMinutes: number | null = null;
      if (leadReceivedAt && !alreadyContactedAt) {
        const received = new Date(leadReceivedAt).getTime();
        if (!Number.isNaN(received)) {
          firstResponseMinutes = Math.max(
            0,
            Math.round((now.getTime() - received) / 60000),
          );
        }
      }
      const oppPatch: Record<string, unknown> = {
        clientStage: 'CONTACTED',
        contactedAt,
      };
      if (firstResponseMinutes !== null) {
        oppPatch.firstResponseMinutes = firstResponseMinutes;
      }
      return {
        ok: true,
        plan: {
          ...base,
          personPatch: {
            lifecycleStatus: 'CONTACTED',
            firstContactedAt: contactedAt,
            nextActionAt: dueAt,
          },
          opportunityPatch: oppPatch,
          closeContactTask: true,
          closeOpenLeadTasks: false,
          createTask: null,
          resultingClientStage: 'CONTACTED',
          resultingLifecycleStatus: 'CONTACTED',
        },
      };
    }

    case 'intro_offered': {
      if (!canApplyOpportunityStage(stage, 'INTRO_OFFERED')) {
        return {
          ok: false,
          status: 409,
          error: `Cannot move clientStage from ${stage} to INTRO_OFFERED`,
        };
      }
      const personPatch: Record<string, unknown> = { nextActionAt: dueAt };
      if (
        !currentLifecycleStatus ||
        currentLifecycleStatus === 'WAITLIST' ||
        currentLifecycleStatus === 'LEAD'
      ) {
        personPatch.lifecycleStatus = 'CONTACTED';
        if (!alreadyContactedAt) personPatch.firstContactedAt = nowIso;
      }
      return {
        ok: true,
        plan: {
          ...base,
          personPatch,
          opportunityPatch: {
            clientStage: 'INTRO_OFFERED',
            ...(stage === 'WAITLIST' || stage === 'NEW_LEAD'
              ? {
                  contactedAt: alreadyContactedAt || nowIso,
                }
              : {}),
          },
          closeContactTask: true,
          closeOpenLeadTasks: false,
          createTask: { title: 'Согласовать слот intro', dueAt },
          resultingClientStage: 'INTRO_OFFERED',
          resultingLifecycleStatus:
            (personPatch.lifecycleStatus as string) ??
            currentLifecycleStatus ??
            'CONTACTED',
        },
      };
    }

    case 'intro_booked': {
      if (!canApplyOpportunityStage(stage, 'INTRO_BOOKED')) {
        return {
          ok: false,
          status: 409,
          error: `Cannot move clientStage from ${stage} to INTRO_BOOKED`,
        };
      }
      return {
        ok: true,
        plan: {
          ...base,
          personPatch: {
            lifecycleStatus: 'INTRO_BOOKED',
            nextActionAt: dueAt,
          },
          opportunityPatch: { clientStage: 'INTRO_BOOKED' },
          closeContactTask: true,
          closeOpenLeadTasks: false,
          createTask: { title: 'Напомнить про intro', dueAt },
          resultingClientStage: 'INTRO_BOOKED',
          resultingLifecycleStatus: 'INTRO_BOOKED',
        },
      };
    }

    case 'intro_attended': {
      if (!canApplyOpportunityStage(stage, 'INTRO_ATTENDED')) {
        return {
          ok: false,
          status: 409,
          error: `Cannot move clientStage from ${stage} to INTRO_ATTENDED`,
        };
      }
      return {
        ok: true,
        plan: {
          ...base,
          personPatch: {
            lifecycleStatus: 'INTRO_ATTENDED',
            nextActionAt: dueAt,
          },
          opportunityPatch: { clientStage: 'INTRO_ATTENDED' },
          closeContactTask: false,
          closeOpenLeadTasks: false,
          createTask: { title: 'Предложить пакет', dueAt },
          resultingClientStage: 'INTRO_ATTENDED',
          resultingLifecycleStatus: 'INTRO_ATTENDED',
        },
      };
    }

    case 'no_show':
      return {
        ok: true,
        plan: {
          ...base,
          personPatch: { nextActionAt: dueAt },
          opportunityPatch: null,
          closeContactTask: false,
          closeOpenLeadTasks: false,
          createTask: { title: 'Написать после no-show', dueAt },
          resultingClientStage: stage,
          resultingLifecycleStatus: currentLifecycleStatus ?? null,
        },
      };

    case 'first_purchase': {
      if (!canApplyOpportunityStage(stage, 'FIRST_PURCHASE')) {
        return {
          ok: false,
          status: 409,
          error: `Cannot move clientStage from ${stage} to FIRST_PURCHASE`,
        };
      }
      return {
        ok: true,
        plan: {
          ...base,
          personPatch: { lifecycleStatus: 'ACTIVE_CLIENT' },
          opportunityPatch: { clientStage: 'FIRST_PURCHASE' },
          closeContactTask: true,
          closeOpenLeadTasks: true,
          createTask: null,
          resultingClientStage: 'FIRST_PURCHASE',
          resultingLifecycleStatus: 'ACTIVE_CLIENT',
        },
      };
    }

    case 'lost': {
      const reason = String(input.lostReason).trim();
      if (!canApplyOpportunityStage(stage, 'LOST') && stage !== 'LOST') {
        return {
          ok: false,
          status: 409,
          error: `Cannot move clientStage from ${stage} to LOST`,
        };
      }
      return {
        ok: true,
        plan: {
          ...base,
          personPatch: {},
          opportunityPatch: {
            clientStage: 'LOST',
            studioLostReason: reason,
          },
          closeContactTask: true,
          closeOpenLeadTasks: true,
          createTask: null,
          resultingClientStage: 'LOST',
          resultingLifecycleStatus: currentLifecycleStatus ?? null,
        },
      };
    }

    default:
      return { ok: false, status: 400, error: `Unhandled action: ${action}` };
  }
};

/** Parse free-text secretary intents into a lead action (templates / keywords). */
export const parseSecretaryIntent = (
  text: string,
): { action: LeadAction; lostReason?: LostReason; note: string } | null => {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const lostMatch = lower.match(
    /(?:потерян|отказ|lost)\s*(?::|-)?\s*(нет ответа|время|цена|локация|формат|передумал|дубль|другое)?/i,
  );
  if (lostMatch || /^(потерян|отказ|lost)\b/.test(lower)) {
    const reasonMap: Record<string, LostReason> = {
      'нет ответа': 'NO_RESPONSE',
      время: 'NO_SUITABLE_TIME',
      цена: 'PRICE',
      локация: 'LOCATION',
      формат: 'FORMAT_MISMATCH',
      передумал: 'CHANGED_MIND',
      дубль: 'DUPLICATE',
      другое: 'OTHER',
    };
    const hint = (lostMatch?.[1] ?? '').toLowerCase();
    return {
      action: 'lost',
      lostReason: reasonMap[hint] ?? 'OTHER',
      note: raw,
    };
  }

  if (
    /недозвон|не ответил|не бер[её]т|нет ответа|не дозвони|написала?,?\s*но\s*никто|написала?,?\s*нет ответа|никто не ответил|молчит|без ответа/.test(
      lower,
    )
  ) {
    return { action: 'no_answer', note: raw };
  }

  if (/no[\s-]?show|не приш|не явил/.test(lower)) {
    return { action: 'no_show', note: raw };
  }

  if (/купил|оплатил|первая покупка|пакет куплен/.test(lower)) {
    return { action: 'first_purchase', note: raw };
  }

  if (/посетил intro|был на intro|intro состоял|приш[её]л на intro/.test(lower)) {
    return { action: 'intro_attended', note: raw };
  }

  if (/записал.*intro|intro записан|бронь intro|записана на/.test(lower)) {
    return { action: 'intro_booked', note: raw };
  }

  if (/предложил.*intro|intro предложен|предложила intro/.test(lower)) {
    return { action: 'intro_offered', note: raw };
  }

  if (
    /дозвонил|связал|контакт состоял|поговорил|пообщал|переписк|ответил[аи]? в (мессенджер|телеграм|whatsapp|вотсап|почт)|написала? ответ|по почте/.test(
      lower,
    )
  ) {
    return { action: 'contacted', note: raw };
  }

  return { action: 'note', note: raw };
};
