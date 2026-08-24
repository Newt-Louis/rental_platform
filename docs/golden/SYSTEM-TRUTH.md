# Golden ERP System Truth

Status: CANONICAL WORKING BASELINE

Baseline commit: `a6a6bad25b907922b61934fdf0888bccbf7d6bc5`

Captured: 2026-08-24

THISO Leasing Platform is one mall-leasing ERP: a NestJS backend and React frontend share one relational data model. Mall is the operational authorization and reporting boundary. There is no implemented Company hierarchy above Mall.

The authoritative commercial chain is:

`Lead -> Deal/Booking -> Proposal/Approval -> Contract -> Billing/Payment -> Reporting`

Fitout is activated by an active Contract and operates beside the commercial chain. A Fitout Project belongs to one Contract and follows the configured forward-only stage pipeline. Stage transition rules, eligibility, invoice balance, currency, and authorization remain backend-authoritative.

## Sources of truth

- Business entities and constraints: Prisma schema and migrations.
- State transitions and calculations: backend domain services plus focused tests.
- Authorization: backend guards and data-access scoping; UI visibility is not authorization.
- Currency: persisted transaction/document currency. Never infer historical currency from the Mall's current currency.
- UI presentation: locale files and shared ERP components; raw enums are presentation inputs, not labels.

## Protected Golden baselines

- Dashboard: protected, no rollout or incidental change.
- Booking: Golden UI approved and closed.
- Billing: Golden UI approved and closed.
- Contract: Golden UI approved and closed.
- Proposal/Approval: active uncommitted work is protected from unrelated waves.

## Open truth boundaries

Items without an authoritative answer are tracked in `MASTER-CORRECTNESS-BACKLOG.md`. They must not be silently resolved by UI work.
