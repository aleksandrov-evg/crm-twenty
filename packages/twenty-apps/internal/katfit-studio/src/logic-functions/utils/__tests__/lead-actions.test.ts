import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canApplyOpportunityStage,
  parseSecretaryIntent,
  planLeadAction,
  validateLeadActionInput,
} from '../lead-actions.ts';

describe('validateLeadActionInput', () => {
  it('rejects unknown action', () => {
    const result = validateLeadActionInput({ action: 'fly' });
    assert.equal(result.ok, false);
  });

  it('requires note text for note action', () => {
    const result = validateLeadActionInput({ action: 'note', note: '  ' });
    assert.equal(result.ok, false);
  });

  it('requires lostReason for lost', () => {
    const result = validateLeadActionInput({ action: 'lost' });
    assert.equal(result.ok, false);
  });

  it('accepts contacted', () => {
    const result = validateLeadActionInput({ action: 'contacted' });
    assert.equal(result.ok, true);
  });
});

describe('canApplyOpportunityStage', () => {
  it('allows forward and same stage', () => {
    assert.equal(canApplyOpportunityStage('WAITLIST', 'CONTACTED'), true);
    assert.equal(canApplyOpportunityStage('CONTACTED', 'CONTACTED'), true);
  });

  it('blocks terminal reverse', () => {
    assert.equal(canApplyOpportunityStage('LOST', 'CONTACTED'), false);
    assert.equal(canApplyOpportunityStage('FIRST_PURCHASE', 'LOST'), false);
  });

  it('allows lost from open stages', () => {
    assert.equal(canApplyOpportunityStage('INTRO_OFFERED', 'LOST'), true);
  });
});

describe('planLeadAction', () => {
  it('plans contacted with SLA fields', () => {
    const result = planLeadAction({
      input: {
        action: 'contacted',
        note: 'Ок',
        actorLabel: 'Менеджер',
        clientEventId: 'tg:1',
      },
      currentClientStage: 'WAITLIST',
      currentLifecycleStatus: 'WAITLIST',
      leadReceivedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      alreadyContactedAt: null,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.opportunityPatch?.clientStage, 'CONTACTED');
    assert.equal(result.plan.personPatch.lifecycleStatus, 'CONTACTED');
    assert.equal(result.plan.closeContactTask, true);
    assert.match(result.plan.noteBody, /Менеджер/);
    assert.equal(result.plan.noteTitle, 'TG-EVENT:tg:1');
  });

  it('no_answer does not move stage', () => {
    const result = planLeadAction({
      input: { action: 'no_answer' },
      currentClientStage: 'NEW_LEAD',
      currentLifecycleStatus: 'LEAD',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.opportunityPatch, null);
    assert.equal(result.plan.createTask?.title, 'Написать снова');
    assert.equal(result.plan.resultingClientStage, 'NEW_LEAD');
  });

  it('blocks actions on terminal opportunity', () => {
    const result = planLeadAction({
      input: { action: 'contacted' },
      currentClientStage: 'LOST',
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 409);
  });

  it('plans lost with reason', () => {
    const result = planLeadAction({
      input: { action: 'lost', lostReason: 'PRICE', note: 'Дорого' },
      currentClientStage: 'CONTACTED',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.opportunityPatch?.clientStage, 'LOST');
    assert.equal(result.plan.opportunityPatch?.studioLostReason, 'PRICE');
    assert.equal(result.plan.closeOpenLeadTasks, true);
  });

  it('plans intro_booked', () => {
    const result = planLeadAction({
      input: { action: 'intro_booked', note: 'Среда 19:00' },
      currentClientStage: 'INTRO_OFFERED',
      currentLifecycleStatus: 'CONTACTED',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.resultingClientStage, 'INTRO_BOOKED');
    assert.equal(result.plan.personPatch.lifecycleStatus, 'INTRO_BOOKED');
  });

  it('contacted with thinking note creates follow-up task', () => {
    const result = planLeadAction({
      input: {
        action: 'contacted',
        note: 'Канал: Telegram. Написала в Telegram — думает.',
        channel: 'TELEGRAM',
        nextActionAt: '2026-10-01T12:00:00.000Z',
      },
      currentClientStage: 'WAITLIST',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.createTask?.title, 'Вернуться к думающим');
    assert.equal(result.plan.createTask?.dueAt, '2026-10-01T12:00:00.000Z');
    assert.equal(result.plan.personPatch.lastContactChannel, 'TELEGRAM');
  });

  it('no_answer stores lastContactChannel', () => {
    const result = planLeadAction({
      input: { action: 'no_answer', channel: 'WHATSAPP', note: 'Нет ответа' },
      currentClientStage: 'CONTACTED',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.personPatch.lastContactChannel, 'WHATSAPP');
  });

  it('note with channel sets lastContactChannel', () => {
    const result = planLeadAction({
      input: { action: 'note', note: 'Попытка: MAX.', channel: 'MAX' },
      currentClientStage: 'WAITLIST',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.plan.personPatch.lastContactChannel, 'MAX');
  });
});

describe('parseSecretaryIntent', () => {
  it('detects no_answer', () => {
    const parsed = parseSecretaryIntent('Написала, никто не ответил');
    assert.equal(parsed?.action, 'no_answer');
  });

  it('detects contacted', () => {
    const parsed = parseSecretaryIntent('Пообщались в мессенджере, интересует реформер');
    assert.equal(parsed?.action, 'contacted');
  });

  it('detects lost with reason', () => {
    const parsed = parseSecretaryIntent('Потерян: цена');
    assert.equal(parsed?.action, 'lost');
    assert.equal(parsed?.lostReason, 'PRICE');
  });

  it('detects thinking and intro agreed', () => {
    assert.equal(parseSecretaryIntent('Думает, перезвонит')?.action, 'contacted');
    assert.equal(parseSecretaryIntent('Согласилась на intro')?.action, 'intro_offered');
  });

  it('detects intro_booked', () => {
    const parsed = parseSecretaryIntent('Записала на intro среду 19:00');
    assert.equal(parsed?.action, 'intro_booked');
  });

  it('falls back to note', () => {
    const parsed = parseSecretaryIntent('Уточнить удобное время');
    assert.equal(parsed?.action, 'note');
  });
});
