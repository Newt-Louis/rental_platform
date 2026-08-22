# CR-102 — Baseline (captured 2026-08-21, before any CR-102 change)

## Git state

- **Current branch**: `HUNG`
- **HEAD SHA**: `fdb6796c180a797aa681a6481906774627e8d149`
- **RC3 designated SHA** (per `docs/golive/RELEASE_CANDIDATE.md`): `c61fdb9` — **note**: HEAD is 3 commits ahead of the RC3-designation commit (`c61fdb9` → `1494281` docs → `38cadba` → `fdb6796`), and the working tree additionally has extensive uncommitted changes beyond `fdb6796`. This gap between the frozen RC3 SHA and current HEAD/working-tree predates this CR and is not created or resolved by this work — noted here for accuracy, not addressed (out of CR-102's scope; no RC4 will be created per explicit instruction).

## Pre-existing modified files (uncommitted, present before CR-102 work began)

```text
 M .env.build
 M apps/backend/src/modules/ai/ai.service.ts
 M apps/backend/src/modules/analytics/compliance.service.ts
 M apps/backend/src/modules/analytics/occupancy-analytics.service.ts
 M apps/backend/src/modules/billing/billing-schedule.service.spec.ts
 M apps/backend/src/modules/billing/billing-schedule.service.ts
 M apps/backend/src/modules/billing/billing.service.ts
 M apps/backend/src/modules/billing/collection-kpi.service.ts
 M apps/backend/src/modules/booking/booking.service.ts
 M apps/backend/src/modules/contracts/contract-templates.service.ts
 M apps/backend/src/modules/crm/crm.service.ts
 M apps/backend/src/modules/proposals/proposal-contract-conversion.spec.ts
 M apps/backend/src/modules/proposals/proposals.service.spec.ts
 M apps/backend/src/modules/proposals/proposals.service.ts
 M apps/backend/src/modules/reports/reports.service.ts
 M apps/frontend/src/components/spaces/dialogs/ConvertBookingDialog.tsx
 M apps/frontend/src/components/spaces/tabs/SalesPipelineTab.tsx
 M apps/frontend/src/locales/en/contracts.json
 M apps/frontend/src/locales/vi/contracts.json
 M apps/frontend/src/pages/approvals/ApprovalsPage.tsx
 M apps/frontend/src/pages/billing/BillingPage.tsx
 M apps/frontend/src/pages/bookings/ConvertToProposalDialog.tsx
 M apps/frontend/src/pages/bookings/proposal-prefill.test.ts
 M apps/frontend/src/pages/bookings/proposal-prefill.ts
 M apps/frontend/src/pages/contracts/ContractsPage.tsx
 M apps/frontend/src/pages/crm/CrmPage.tsx
 M apps/frontend/src/pages/deals/DealPipelinePage.tsx
 M apps/frontend/src/pages/proposals/ProposalEditor.tsx
 M apps/frontend/src/pages/proposals/ProposalsPage.tsx
 M apps/frontend/src/pages/tenant-portal/TenantPortalPage.tsx
 M apps/frontend/src/pages/tenants/TenantsPage.tsx
 M apps/frontend/src/types/index.ts
?? AGENTS.md
?? RUN-FIRST.md
?? apps/backend/src/modules/booking/booking.currency-price-validation.spec.ts
?? docs/ai-erp-team/
?? docs/ai-governance/
?? docs/architecture-review/
?? docs/change-templates/
?? docs/system-truth-templates/
?? docs/system-truth/
```

**Rule for this CR**: none of the above (except `apps/backend/src/modules/billing/billing.service.ts`, which is already modified pre-existing and must be edited carefully — my changes will be additive on top of, not a revert of, its existing uncommitted state) will be touched unless directly required by Defect A/B's fix. `billing.service.ts` is the one pre-existing-modified file CR-102 must edit; I will diff my specific change against its current (already-modified) state, not against a clean HEAD, to avoid discarding the pre-existing in-flight multi-currency work.

## Baseline test results

### Backend (`apps/backend`, `npx jest`)
```
Test Suites: 70 passed, 70 total
Tests:       375 passed, 375 total
Time:        93.514 s
```
All passing. No pre-existing backend failures.

### Frontend (`apps/frontend`, `npx vitest run`)
```
Test Files: 1 failed | 28 passed (29)
Tests:      9 failed | 216 passed (225)
```
**Pre-existing failure, unrelated to CR-102**: `src/pages/bookings/BookingsPage.test.tsx` — 9 failing tests, all related to a "Xóa booking" (delete booking) button interaction timing out in `waitFor`. This failure is **not caused by this session** and is **not related to Billing invoice summaries or Sales revenue-share** — it is recorded here so that CR-102's regression check (Step 11) can correctly distinguish "still failing, same as baseline" from "newly broken by CR-102."

## Scope confirmation

Authorized: CR-102 only (Defect A — Billing invoice-summary currency mixing; Defect B — Revenue-share currency mixing, pending proof of VND-only semantics per Step 4). Not authorized: CR-101, CR-103 through CR-107, dead-cron cleanup, any refactoring, schema changes, or new currency features. No commit, push, or RC designation change will be made.
