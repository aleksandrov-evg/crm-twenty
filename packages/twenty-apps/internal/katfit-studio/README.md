# KATFIT Studio

Internal Twenty application for KATFIT BALANCE CRM operations.

## Lead contour (implemented in code)

```text
Landing form → PostgreSQL leads → telegram-lead-notifier
  ├─ Telegram alert (supergroup + inline keyboard + deep-link)
  └─ POST /s/studio/leads (WF-01)
        → Person + Opportunity (WAITLIST) + Task «Написать клиенту» (due +2h)

Telegram buttons / reply / secretary
  └─ POST /s/studio/lead-actions
        → Note + stage / lifecycle / tasks (see docs/lead-actions.md)

Telegram resend card (ID36 / /resend)
  └─ POST /s/studio/lead-status
        → stage + channel + notes history (see docs/lead-status.md)
```

Manager lists in Opportunities: **Новые лиды**, **Нарушение SLA**, **Воронка первой покупки**, **Связались — ждут intro**, **Intro без покупки**.

Apply to a workspace (`twenty plan` / `apply`) and enable `CRM_SYNC_ENABLED` on the poller before this appears in production UI.

## Also in 0.1.0+

- Person lifecycle, lead source / last-touch, lead timestamps, landing ID, consents, full UTM, preferred channel, **lastContactChannel**, formats, time bands, next action.
- Opportunity pipeline fields (stage, SLA timestamps, lead/UTM snapshots, lost reason).
- WF-01 ingest + **LeadAction API** (`studio-lead-actions`) + **LeadStatus API** (`studio-lead-status`) for Telegram ops-bot.
- Products, groups, sessions, bookings, memberships, payments, make-up credits and relations.
- Default application function role.

Not in this app yet: product seed data, booking capacity Logic Functions, membership balance mutations, WF-02 SLA cron, WF-03 Telegram-from-CRM (outbound stays in poller).

Contracts: [docs/lead-actions.md](docs/lead-actions.md), [docs/lead-status.md](docs/lead-status.md).

## Validate

```bash
yarn install
yarn typecheck
yarn lint
yarn test:unit
yarn twenty dev:build
```

## Deploy safely

```bash
yarn twenty remote:add
yarn twenty plan
yarn twenty apply
```

Do not apply to production before reviewing the plan and backing up the workspace.

Contract: `docs/katfit-balance-crm-technical-spec.ru.md` (repo root `crm-twenty`).
Manager guide: `docs/katfit-balance-crm-manager-guide.ru.md`.
