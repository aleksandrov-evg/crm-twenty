# KATFIT Studio

Internal Twenty application for KATFIT BALANCE CRM operations.

## Implemented in 0.1.0

- Person lifecycle, lead source, lead timestamps, landing ID, and consents.
- Opportunity fields and a Kanban pipeline for the first purchase journey.
- Products and product versions.
- Permanent groups and group memberships.
- Class sessions and bookings.
- Client memberships and immutable membership transaction records.
- Payments and make-up credits.
- Core relations between people, products, sessions, bookings, memberships, and groups.
- Relations for group participation, payments, membership transactions, and make-up credits.
- Seven workspace views, six navigation entries, and five critical indexes.
- Default application function role.

The app defines metadata only. It does not yet seed product records, ingest
landing leads, enforce booking capacity, or mutate membership balances.

## Validate

```bash
yarn install
yarn typecheck
yarn lint
yarn twenty dev:build
```

## Deploy safely

Configure a non-production remote first, then preview and apply metadata:

```bash
yarn twenty remote:add
yarn twenty plan
yarn twenty apply
```

Do not apply the app to production before reviewing the generated plan and
backing up the workspace.

The detailed implementation contract is in
`docs/katfit-balance-crm-technical-spec.ru.md` at the repository root.
