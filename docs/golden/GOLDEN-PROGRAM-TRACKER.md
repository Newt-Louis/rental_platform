# Golden ERP Program Tracker

Status: PROGRAM ASSESSMENT COMPLETE — PRODUCTION NOT READY

Baseline: `HUNG` at `a6a6bad25b907922b61934fdf0888bccbf7d6bc5`

## Protected working-tree manifest

The following pre-existing paths are excluded from program staging unless their owning phase explicitly authorizes them:

- `apps/frontend/src/pages/dashboard/DashboardPage.tsx`
- `apps/frontend/src/lib/currency.test.ts`
- `apps/frontend/src/locales/{en,vi}/deals.json`
- `apps/frontend/src/pages/approvals/ApprovalsPage.tsx`
- `apps/frontend/src/pages/proposals/*` current modified/untracked presentation files
- `docs/changes/CR-PROPOSAL-APPROVAL-CORRECTNESS-BACKLOG.md`
- `docs/ux/CR-GOLDEN-PROPOSAL-APPROVAL-*.md`
- Concurrent Periodic Charge / Billing Add-in work (Wave 24): `apps/backend/prisma/schema.prisma`, its migrations, `apps/backend/src/modules/billing-addin/`, `apps/backend/src/modules/billing/billing.service.ts`, `apps/backend/src/modules/billing/billing.receivables.spec.ts`, `apps/backend/src/app.module.ts`, `apps/backend/src/common/constants/role-permissions.ts`, `apps/backend/src/modules/spaces/dto/create-mall.dto.ts`, `apps/backend/src/modules/contracts/dto/create-contract.dto.ts`, `apps/backend/src/modules/contracts/contracts.service.ts`, `apps/backend/src/modules/contracts/contract-write-atomicity.spec.ts`, `apps/frontend/src/lib/permissions.ts`, `apps/frontend/src/App.tsx`, `apps/frontend/src/api/billing-addin.ts`, `apps/frontend/src/api/index.ts`, `apps/frontend/src/pages/billing-addin/`, `apps/frontend/src/locales/{vi,en}/billing.json`

## Wave status

| Wave | Scope | Status |
|---|---|---|
| Baseline and canonical truth | Repository and governance reconstruction | COMPLETE |
| 1 | Golden Fitout presentation | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 2 | CRM / Customer / Tenant presentation | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 3 | Unit / Space Inventory presentation | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 4 | Operations / Ticket / Maintenance presentation | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 5 | Reporting / Statistics presentation | IMPLEMENTED — AUTHORIZATION + HUMAN REVIEW PENDING |
| 6 | Admin / Settings / Users / Permissions | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 7 | Golden Dashboard | AUDITED — PROTECTED CONCURRENT POLISH; RENDERED REVIEW PENDING |
| Platform verification | correctness, security, reconciliation, E2E, build | COMPLETE — 17/17 invariants and builds pass; full UAT/security/operations gates remain open |
| 8 | Supporting presentation consistency | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 9 | Golden/reference localization safety sweep | IMPLEMENTED — HUMAN VISUAL REVIEW PENDING |
| 10 | Frontend baseline test remediation | COMPLETE — test assertions only; frontend 262/262 PASS |
| 11 | Unknown-enum presentation safety | COMPLETE — neutral fallback/localization only; HUMAN VISUAL REVIEW PENDING |
| 12 | Cross-module journey evidence | COMPLETE — 5/8 fixture segments evidenced; 3 gaps explicit; UAT remains 2/12 |
| 13 | Automated rendered viewport verification | COMPLETE — 28 route/viewport renders pass automated checks; HUMAN SIGN-OFF PENDING |
| 14 | Render-discovered presentation defects | COMPLETE — report artifacts removed and Work Order templates localized |
| 15 | Ticket secondary-path authorization | COMPLETE — per-ticket ownership and Mall-scoped aggregates enforced |
| 16 | CRM unified-deals authorization | COMPLETE — authoritative Lead scope enforced before pagination |
| 17 | Analytics compliance-export authorization | COMPLETE — Mall scope, payload isolation and global-write control enforced |
| 18 | Work Order state/event atomicity | COMPLETE — state mutation and audit event share one transaction |
| 19 | Short-term Slot allocation concurrency | COMPLETE — serialized conflict-check and write with bounded retry |
| 20 | Contract direct-create/update atomicity | COMPLETE — Contract, Unit and audit writes share transaction boundaries |
| 21 | Patrol abnormal-check automation atomicity | COMPLETE — Patrol result and auto-created Work Order share one transaction |
| 22 | Contract termination/amendment atomicity | COMPLETE — lifecycle, Unit, Billing and audit writes share transactions |
| 23 | Reports revenue-export money/cap compliance | COMPLETE — raw Amount + Currency, sentinel cap detection and explicit truncation disclosure |
| 24 | Billing Add-in engineering closure | COMPLETE — 2 P0s (currency, scheduler timezone) found and fixed by independent 5-domain audit + QA re-verification; BC-BILLING-ADDIN-001 (Phí HTKD renewal lock) and CAM label-split deferred, not invented; HUMAN VISUAL REVIEW PENDING (no browser tool in this environment) |

## Independent progress scores

- **Engineering Golden Completion: 97%** — all independently provable P0/P1/P2
  corrections found in Waves 1–24 are implemented and checkpointed. The
  remaining 3% is limited to protected concurrent work and tasks requiring an
  approved business interpretation (incl. `BC-BILLING-ADDIN-001`); production-only
  evidence is not deducted from this score.
- **Production Readiness: 28%** — 7 of 25 release gates are PASS. Credential,
  off-site backup, observability, two-Mall UAT, human acceptance and controlled
  release/rollback evidence remain external no-go conditions. Wave 24 adds no
  new release-gate PASS (Billing Add-in has no production traffic/rollout
  gate defined yet) but removes a build-blocking condition Wave 23 recorded.

## Wave 24 Change Request and Impact Map

Change ID: `CR-GOLDEN-W24-BILLING-ADDIN-CLOSURE`

Business reason: P.CSKT (mall operations) needed a way to enter three variable
lease charges each billing period — Management Fee Surcharge (Office leases
only, headcount over an 8m²/person norm), Utility (electricity/water meter
readings) and After-Hours Cooling (hours) — through a Draft → Confirm (locked)
→ Invoiced state machine, feeding the existing Billing invoice pipeline. An
independent 5-domain audit (Business/System Truth, Backend/Transaction,
Database/Prisma, Authorization/Mall-isolation, Financial/Multi-currency) found
two P0 defects and a real completeness gap before this could be called done;
this wave is the fix-and-close pass plus independent QA re-verification.

| Dimension | Impact |
|---|---|
| Primary domain | Billing Add-in (new `billing-addin` module) + its two integration points in existing Billing |
| Runtime behavior | New state machine (PENDING→DRAFT→CONFIRMED→INVOICED, or →NO_CHARGE) per contract/chargeType/period; new admin CRUD for per-mall rate configs; new `Mall.leaseCategory`/`Contract.periodicChargeTypes` write paths |
| Data/workflow | New models `PeriodicChargeEntry`/`PeriodicChargeRateConfig`; `PeriodicChargeEntry.lines` promoted into real `InvoiceLine` rows only at INVOICED |
| Financial/currency | **P0 fixed**: rate configs are VND-authored only — `saveDraft` now rejects any non-VND contract instead of silently billing a VND figure as the contract's currency (a ~24,000x-scale defect for a USD contract, confirmed and fixed) |
| Mall/Tenant | `MANAGEMENT_FEE_SURCHARGE` is now enforced OFFICE-only at both the `ContractsService.update` write path and the `BillingAddInService` compute path (defense in depth); mall-scoping threaded through every billing-addin endpoint (verified live per-role) |
| Authorization | New `billingAddIn`/`billingAddInWrite` role matrix (ADMIN/OPERATION/MALL_DIRECTOR/FINANCE read, ADMIN/OPERATION write, ADMIN-only for rate-config writes and reopen alongside MALL_DIRECTOR) — verified live for every role incl. TENANT/LEASING_MANAGER denial |
| API | New `/api/billing/addin/*` routes incl. `/rates` CRUD; two new branches in existing `getPendingReceivables`/`createInvoiceFromPending` (`PERIODIC_CHARGE` source) |
| Schema/database/migration | New enums `MallLeaseCategory`/`PeriodicChargeType`/`PeriodicChargeStatus`, new models, `Contract.periodicChargeTypes` scalar list, `InvoiceType.PERIODIC_CHARGE` — migration `20260824122923_add_periodic_charge_addin` |
| Events/jobs/concurrency | **P0 fixed**: monthly scheduler's `currentPeriod()` read a UTC instant with UTC getters while the cron fires at a fixed Asia/Ho_Chi_Minh wall-clock hour — every run computed the already-generated previous period and silently created nothing, forever. Fixed with an explicit +7h (VN has no DST) offset before reading UTC getters. Also closed an ungraceful-500 double-invoke race on `createInvoiceFromPending` (P2002 now recovers idempotently, mirroring the existing `generateDueInvoices` pattern) |
| Protected work | Dashboard, Proposal/Approval and this wave's own concurrent files (see manifest above) mutually excluded |
| Tests | `billing-addin.util.spec.ts` (14), `billing-addin.service.spec.ts` (24), `contract-write-atomicity.spec.ts` OFFICE-only guard cases, `billing.receivables.spec.ts` PERIODIC_CHARGE cases — full focused + module suites, plus independent QA live E2E and regression re-run |
| Golden scenarios | New lifecycle: Periodic Charge → Confirm → Pending Receivable → Invoice; existing Billing sources (LEASE_CONTRACT/SERVICE_CONTRACT/SHORT_TERM_BOOKING/PARKING) regression-clean |
| Rollback | Revert the `billing-addin` module, its Billing integration branches, the migration, and the Mall/Contract DTO field additions |
| Unknowns | "Phí hỗ trợ kinh doanh → renewal-only" lock rule is a genuine BC blocker (see below) — not implemented, not invented |

## Wave 24 technical gate — 2026-08-24

Independent 5-domain pre-fix audit (each domain read-only, no shared context
with the implementer):

- Business/System Truth: **BLOCKED** — no admin write path existed for
  `Mall.leaseCategory`/`Contract.periodicChargeTypes`/rate configs (DB-write-only);
  OFFICE-only rule unenforced; confirmed `businessSupportFeeSqm` exists only on
  `Proposal`, never on `Contract`, with zero renewal gating (genuine BC gap, not
  invented).
- Backend/Transaction correctness: **FAIL** — P0 timezone bug (above); P2
  ungraceful double-invoke race; state-machine INVOICED-immutability itself had
  no exploit found.
- Database/Prisma: **PASS** — P1 (no rate-config CRUD/overlap protection existed
  yet — closed in this wave using the same pattern as `CategoryMallPricing`'s
  `ensurePricingDoesNotOverlap`), P2s (cascade-on-inert-path, JSON-shape trust).
- Authorization/Mall-isolation: **PASS** — full role matrix and mall-scope
  threading verified live per endpoint; one functional (not security) gap noted:
  OPERATION/FINANCE have no seeded `UserMallAccess` rows in dev data.
- Financial/multi-currency: **FAIL** — P0 confirmed live: a VND-authored rate
  applied without conversion to a USD contract would have billed ~24,000x the
  intended amount.

Fix pass (this session): added the VND-only currency guard (service + defense
in compute), fixed `currentPeriod()`'s timezone math, added OFFICE-only
enforcement at both the Contract-update and Billing-Add-in compute layers,
built the missing `PeriodicChargeRateConfig` CRUD with overlap validation,
added `Mall.leaseCategory`/`Contract.periodicChargeTypes` write paths, closed
the double-invoke race with idempotent recovery.

- Focused new/updated suites: `billing-addin.util.spec.ts`,
  `billing-addin.service.spec.ts`, `contract-write-atomicity.spec.ts`,
  `billing.receivables.spec.ts` — all passing.
- Module-wide re-run: `billing`, `billing-addin`, `contracts`, `spaces` —
  **22/22 suites, 178/178 tests PASS**.
- Independent QA gate (fresh session, no implementer context): **PASS** — all 5
  fixes re-proven live against the running API (not re-read from code), full
  Periodic-Charge→Confirm→Pending-Receivable→Invoice lifecycle proven with
  formula-exact amounts on a fresh VND fixture, a real 3-way concurrent
  double-invoke race reproduced and confirmed idempotent (identical invoice id,
  no 500s), and the same 22/22 suites / 178/178 tests re-run independently.
  All QA-created fixtures and mall/contract field changes confirmed reverted.
- Business logic outside this feature, other Billing sources' API contracts,
  and protected/concurrent files (Dashboard, Proposal/Approval, currency test,
  deals locale): **UNCHANGED** — confirmed via `git status --porcelain` showing
  zero overlap with the protected manifest.

Open item carried forward (not resolved, not invented): **BC-BILLING-ADDIN-001**
— "Phí hỗ trợ kinh doanh" (business support fee) exists today only as
`Proposal.businessSupportFeeSqm`, is never carried onto `Contract`, and has no
renewal-only lock. Needs a business decision on: (a) should it move onto
`Contract`, and if so populated only from a renewal Proposal; (b) what field/flag
represents "this Proposal is a renewal" to gate on (none currently exists); (c)
enforcement point (Proposal creation vs. Contract update). Deferred CAM→"Phí
Quản Lý/Phí Dịch vụ" presentation-label wave: touches
`ContractsPage.tsx`/`BillingPage.tsx`/`BillingExtraTabs.tsx`/locale files —
none currently protected/dirty, but cross-cutting across 3 modules and this
feature's own still-uncommitted `billing.json`; recommend its own wave rather
than folding in here.

## Wave 23 Change Request and Impact Map

Change ID: `CR-GOLDEN-W23-REPORT-EXPORT-COMPLIANCE`

Business reason: Reports revenue CSV silently caps at 5,000 rows, omits
currency and rounds every amount to zero decimals. That can lose USD/MMK
precision and mislabel mixed-currency records. The persisted authoritative
fields are already `Invoice.totalAmount` and `Invoice.currencyCode`.

| Dimension | Impact |
|---|---|
| Primary domain | Reports revenue CSV export |
| Runtime behavior | Query one sentinel row beyond the cap, export at most 5,000 rows, add separate raw Amount/Currency columns and disclose row count/limit/truncation in response headers and UI toast |
| Data/workflow | Read-only export; active filters and Mall scope unchanged |
| Financial/currency | No calculation/FX; preserves persisted numeric amount and ISO currency without rounding or aggregation |
| Mall/Tenant | Existing Reports scope helper remains authoritative |
| Authorization | Unchanged |
| API | CSV columns become compliant; additive `X-Export-*` headers; route/query unchanged |
| Schema/database/migration | No change |
| Events/jobs/concurrency | None |
| Protected work | Concurrent Billing Add-in/schema, Dashboard and Proposal/Approval files excluded |
| Tests | Service exact-money/cap test, controller header/scope test, focused frontend export test where practical, builds and `git diff --check` |
| Golden scenarios | Financial export retains filters, exact amount/currency and cap disclosure |
| Rollback | Restore prior CSV columns/string result and remove additive headers/toast |
| Unknowns | None; no FX or cross-currency total is introduced |

Wave 23 technical gate:

- backend exact-money/cap utility: **2/2 PASS**;
- frontend Reports-focused presentation: **4/4 PASS**;
- frontend full suite and production build: **PASS**;
- `git diff --check`: **PASS**;
- backend integrated build: **BASELINE BLOCKED** by protected concurrent
  Billing Add-in code referencing newly added Prisma models/enums before its
  generated client is updated. All 23 diagnostics are confined to the protected
  Billing Add-in/Billing paths; the Reports-only utility suite passes.

## Wave 22 Change Request and Impact Map

Change ID: `CR-GOLDEN-W22-CONTRACT-LIFECYCLE-ATOMICITY`

Business reason: Termination initiate/complete and Amendment approval currently
commit related Contract, termination/amendment, Unit, Billing Schedule and audit
writes in multiple steps. A later failure can leave lifecycle state applied only
partially. Each downstream service already accepts a transaction client, so the
existing authoritative behavior can be made atomic without new semantics.

| Dimension | Impact |
|---|---|
| Primary domain | Contract termination and amendment approval; Unit/Billing/audit consistency |
| Runtime behavior | Use interactive transactions for termination initiate/complete and amendment approve; re-read authoritative records inside the transaction |
| Data/workflow | Existing termination checklist/status rules, amendable-field whitelist, renewal marker and billing-relevance rules unchanged |
| Financial/currency | Existing deposit/penalty values and schedule formulas unchanged; no penalty/dunning currency decision |
| Mall/Tenant | Existing controller ownership checks unchanged |
| Authorization | Unchanged |
| API | Routes, DTOs, responses and expected validation errors unchanged |
| Schema/database/migration | No change |
| Events/jobs/concurrency | Lifecycle side effects roll back together; Unit transition, schedule rebuild and audit event receive the same transaction client |
| Protected work | Concurrent schema, Dashboard and Proposal/Approval/frontend currency work excluded |
| Tests | Focused transaction/rollback/client-propagation tests, backend full suite/build, reconciliation and `git diff --check` |
| Golden scenarios | Amendment-to-Billing continuity and Contract termination-to-Unit vacancy continuity |
| Rollback | Restore sequential lifecycle writes |
| Unknowns | Penalty/deposit business formulas and currency remain untouched; this wave changes only transaction boundaries |

## Wave 22 technical gate — 2026-08-24

- Termination initiate writes the termination record and Contract status in one
  transaction. Completion revalidates the checklist and commits termination,
  Contract and Unit vacancy through one transaction client.
- Amendment approval re-reads the submitted amendment and commits approved
  Contract fields, any existing Billing Schedule rebuild, amendment status and
  audit event through one transaction client.
- Focused Contract lifecycle atomicity: PASS, 1 suite / 3 tests.
- Cross-module backbone reconciliation: PASS, 17/17 checks clean.
- Full backend run: 96 suites / 625 tests PASS; 3 suites fail compilation only
  because concurrent uncommitted Billing Add-in code references newly added
  Prisma enums/models before its Prisma client is regenerated. Production build
  has the same unrelated baseline failure. The last clean pre-concurrent gate
  remains 98/98 suites, 635/635 tests and backend build PASS at Wave 21.
- Termination/amendment rules, amounts, currencies, API, schema and database
  structure: UNCHANGED by Wave 22.

## Wave 21 Change Request and Impact Map

Change ID: `CR-GOLDEN-W21-PATROL-WORK-ORDER-ATOMICITY`

Business reason: An ABNORMAL Patrol check currently creates a Work Order before
updating `PatrolCheck.workOrderId`. If the second write fails, the Work Order is
orphaned and a retry can create another Work Order. Both records share one
database and the existing source link explicitly establishes one-way ownership.

| Dimension | Impact |
|---|---|
| Primary domain | Patrol → Operations Work Order automation |
| Runtime behavior | Re-read the Patrol check and commit optional Work Order creation plus Patrol result/link update in one Serializable transaction with bounded retry |
| Data/workflow | Existing NORMAL/ABNORMAL/SKIPPED results, severity defaults, Work Order fields and escalation recipients unchanged |
| Financial/currency | None |
| Mall/Tenant | Work Order continues to inherit the authoritative Patrol Shift Mall |
| Authorization | Existing controller role/Mall checks unchanged |
| API | Route, DTO and response shape unchanged |
| Schema/database/migration | No change |
| Events/jobs/concurrency | Transaction rollback prevents orphan Work Orders; concurrent retries reuse the committed `workOrderId`; notifications remain post-commit |
| Protected work | Concurrent schema, Dashboard and Proposal/Approval/frontend currency work excluded |
| Tests | Focused atomicity/idempotency tests, backend full suite/build, reconciliation and `git diff --check` |
| Golden scenarios | Abnormal Patrol finding creates exactly one linked Work Order |
| Rollback | Restore sequential Work Order then Patrol update writes |
| Unknowns | None; Mall-director escalation policy is already explicit in current code and is unchanged |

## Wave 21 technical gate — 2026-08-24

- ABNORMAL Patrol processing re-reads the persisted Work Order link, optionally
  creates the Work Order and updates the Patrol result/link inside one
  Serializable transaction with bounded retry.
- A retry reuses the committed link, preventing duplicate/orphan Work Orders.
  High/Urgent Mall-director notifications remain post-commit.
- Focused Patrol atomicity: PASS, 1 suite / 3 tests.
- Backend full: PASS, 98/98 suites and 635/635 tests.
- Backend TypeScript/production build: PASS.
- Cross-module backbone reconciliation: PASS, 17/17 checks clean.
- Patrol results, severity, Work Order fields, escalation recipients, API,
  authorization, schema and database structure: UNCHANGED.

## Wave 20 Change Request and Impact Map

Change ID: `CR-GOLDEN-W20-CONTRACT-WRITE-ATOMICITY`

Business reason: Direct Contract creation currently commits the Contract before
transitioning its Unit and writing the Contract audit event. Contract update
similarly commits before its event. A downstream failure can leave a live
Contract without matching Unit state or audit history. Existing Proposal-based
conversion already demonstrates the approved transaction-client pattern.

| Dimension | Impact |
|---|---|
| Primary domain | Contracts with Unit status and Contract audit history |
| Runtime behavior | Revalidate Unit/live-contract constraints and commit Contract create + Unit transition + event in one Serializable transaction; update + event share one transaction |
| Data/workflow | Existing Contract status, editable fields and Unit transition matrix unchanged |
| Financial/currency | Existing Proposal currency propagation and all Contract amounts/formulas unchanged |
| Mall/Tenant | Existing authorization and entity ownership checks unchanged |
| Authorization | Unchanged |
| API | Routes, DTOs and response shapes unchanged |
| Schema/database/migration | No change |
| Events/jobs/concurrency | Direct create rechecks occupancy inside Serializable transaction; event/Unit failure rolls back Contract. Update event failure rolls back update. |
| Protected work | Dashboard and concurrent Proposal/Approval/frontend currency files excluded |
| Tests | Currency propagation regression plus focused rollback/transaction tests, backend full suite/build, reconciliation and `git diff --check` |
| Golden scenarios | Proposal/Contract currency invariant and Contract-to-Unit state continuity |
| Rollback | Restore sequential direct-create/update calls |
| Unknowns | Termination workflow transaction boundary is separately audited; no termination behavior in this wave |

## Wave 20 technical gate — 2026-08-24

- Direct Contract creation revalidates Unit/live-contract constraints inside a
  Serializable transaction, then creates the Contract, transitions the Unit and
  writes the existing audit event through the same transaction client.
- Contract field update and its existing audit event now share one transaction.
  Serialization conflicts retry at most three times.
- Proposal currency remains authoritative and the focused propagation suite
  still covers USD, MMK, direct explicit currency and VND fallback.
- Focused Contract create/update/activation: PASS, 3 suites / 14 tests.
- Backend full: PASS, 97/97 suites and 632/632 tests.
- Backend TypeScript/production build: PASS.
- Cross-module backbone reconciliation: PASS, 17/17 checks clean.
- Contract lifecycle, financial formulas, currency propagation, API, schema and
  database structure: UNCHANGED.

## Wave 19 Change Request and Impact Map

Change ID: `CR-GOLDEN-W19-SLOT-BOOKING-CONCURRENCY`

Business reason: Slot Booking create/update checks occupied-window conflicts and
then writes in separate database operations. Concurrent requests can both pass
the check and create overlapping PENDING/CONFIRMED allocations. The existing
timeline and active-status predicates already define authoritative conflict
semantics; only the transaction boundary is missing.

| Dimension | Impact |
|---|---|
| Primary domain | Short-term Slots / Booking allocation |
| Runtime behavior | Run conflict read plus create/update in a Serializable Prisma transaction and retry recognized serialization/booking-reference collisions up to three attempts |
| Data/workflow | Existing PENDING/CONFIRMED conflict set, occupied interval and status rules unchanged |
| Financial/currency | Existing pricing formula, discounts and persisted values unchanged; no currency inference |
| Mall/Tenant | Existing controller Mall ownership checks unchanged |
| Authorization | Unchanged |
| API | Routes, DTOs and response shapes unchanged; a concurrent loser receives the existing conflict error after retry |
| Schema/database/migration | No change |
| Events/jobs/concurrency | Removes check-then-write race for create and timeline update; bounded retry handles Prisma `P2034` and booking-reference `P2002` conflicts |
| Protected work | Dashboard and concurrent Proposal/Approval/frontend currency files excluded |
| Tests | Focused transaction/retry/conflict tests, backend full suite/build, reconciliation and `git diff --check` |
| Golden scenarios | Short-term Slot availability and non-overlapping allocation |
| Rollback | Restore non-transactional conflict checks/writes |
| Unknowns | Slot price currency provenance remains `BC-SLOT-001` and is not touched |

## Wave 19 technical gate — 2026-08-24

- Slot Booking create and timeline update now execute active-window conflict
  reads and writes in a Serializable Prisma transaction.
- Recognized serialization and booking-reference collisions retry at most three
  times; the concurrent loser then observes the committed booking through the
  existing conflict rule.
- Focused Slot service/controller: PASS, 3 suites / 9 tests.
- Backend full: PASS, 96/96 suites and 628/628 tests.
- Backend TypeScript/production build: PASS.
- Cross-module backbone reconciliation: PASS, 17/17 checks clean.
- Timeline, PENDING/CONFIRMED conflict semantics, pricing/discount formulas,
  authorization, API, schema and database structure: UNCHANGED.

## Wave 18 Change Request and Impact Map

Change ID: `CR-GOLDEN-W18-WORK-ORDER-AUDIT-ATOMICITY`

Business reason: Work Order update, transition and review currently commit the
business row before inserting the corresponding audit event. An event-write
failure can therefore leave an authoritative status/assignment change without
its required audit history. Both writes use the same database and their
intended one-to-one operation is explicit in existing code.

| Dimension | Impact |
|---|---|
| Primary domain | Operations / Work Orders |
| Runtime behavior | Execute each Work Order mutation and its existing audit-event insert in one Prisma transaction; notifications remain post-commit side effects |
| Data/workflow | Existing allowed fields, transition matrix, checklist/evidence gates and review outcomes unchanged |
| Financial/currency | None |
| Mall/Tenant | Existing controller/service ownership checks unchanged |
| Authorization | Roles and Mall scope unchanged |
| API | Routes, DTOs, errors and response shape unchanged |
| Schema/database/migration | No schema or migration; transaction boundary only |
| Events/jobs/concurrency | Audit insert failure rolls back the associated mutation; notification delivery remains after commit and unchanged |
| Protected work | Dashboard and concurrent Proposal/Approval/frontend currency files excluded |
| Tests | Focused rollback/commit tests, backend full suite/build, reconciliation and `git diff --check` |
| Golden scenarios | Operations status transition and review audit continuity |
| Rollback | Restore sequential mutation/event calls |
| Unknowns | None; this does not alter concurrent transition conflict semantics or notification delivery policy |

## Wave 18 technical gate — 2026-08-24

- General Work Order updates, status transitions and review outcomes now write
  their existing audit events through the same Prisma transaction client.
- An audit insert failure rejects and rolls back the mutation; notifications
  remain post-commit and are not sent after a failed transaction.
- Focused Work Order service/controller: PASS, 2 suites / 18 tests.
- Backend full: PASS, 95/95 suites and 624/624 tests.
- Backend TypeScript/production build: PASS.
- Cross-module backbone reconciliation: PASS, 17/17 checks clean.
- Transition matrix, checklist/evidence gates, roles, Mall scope, API, schema,
  database structure and notification policy: UNCHANGED.

## Wave 17 Change Request and Impact Map

Change ID: `CR-GOLDEN-W17-COMPLIANCE-EXPORT-MALL-SCOPE`

Business reason: Compliance export list/request/generate routes currently bypass
the Analytics Mall-scope helper. In addition, Mall-specific APPROVALS exports do
not filter their payload by Mall and Mall-specific AUDIT_TRAIL exports include
all SAP integration logs even though `SapIntegrationLog` has no authoritative
Mall provenance. These are proven cross-Mall disclosure risks.

| Dimension | Impact |
|---|---|
| Primary domain | Analytics compliance export |
| Runtime behavior | Scope export worklists to accessible Malls; validate Mall ownership before request/generate; restrict global export writes and the all-Mall monthly trigger to ADMIN |
| Data/workflow | Export records and source business entities are read-only; only existing export status/file metadata is written |
| Financial/currency | No amount, formula, rounding, currency or FX behavior changes |
| Mall/Tenant | Applies authoritative `Unit.mallId` / `Invoice.mallId` relationship predicates before source-data retrieval; scoped users cannot see global export records |
| Authorization | CEO retains approved cross-Mall read; operational writes require explicit Mall access; global writes are ADMIN-only |
| API | Existing routes, request DTOs and response shapes remain unchanged; unauthorized/cross-Mall access is denied or excluded |
| Schema/database/migration | No change |
| Events/jobs/concurrency | Internal scheduled monthly generation remains unchanged; manual all-Mall trigger is ADMIN-only |
| Protected work | Dashboard and concurrent Proposal/Approval/frontend currency files excluded |
| Tests | Controller authorization, service query predicates, focused/full backend, build, reconciliation and `git diff --check` |
| Golden scenarios | GS-09 cross-Mall denial; compliance APPROVALS/AUDIT export isolation |
| Rollback | Revert controller guards/scope propagation and service query predicates |
| Unknowns | `SapIntegrationLog` has no Mall field or relation; therefore Mall-scoped exports safely omit those logs instead of guessing ownership. Global ADMIN exports remain complete. |

## Wave 17 technical gate — 2026-08-24

- Compliance export list results are constrained to the caller's accessible
  Mall set; scoped request/generate mutations validate authoritative Mall
  ownership before service execution.
- Global export requests and the manual all-Mall scheduler trigger are
  ADMIN-only. CEO cross-Mall read remains unchanged.
- Mall-scoped APPROVALS data resolves Mall through Proposal/Fitout Unit
  ownership. SAP logs have no Mall provenance and are omitted only from scoped
  AUDIT_TRAIL exports; global ADMIN exports remain complete.
- Focused Analytics controller/service: PASS, 2 suites / 14 tests.
- Backend full: PASS, 94/94 suites and 620/620 tests.
- Backend TypeScript/production build: PASS.
- Cross-module backbone reconciliation: PASS, 17/17 checks clean.
- API route/request/response contracts, export types, financial logic, schema,
  database and internal scheduled generation: UNCHANGED.

## Wave 16 Change Request and Impact Map

Change ID: `CR-GOLDEN-W16-CRM-DEALS-MALL-SCOPE`

Business reason: `GET /crm/deals` currently accepts an unvalidated `mallId`,
does not pass caller scope into the service, and applies a partial Mall filter
only after pagination. Lead already persists authoritative `mallId` and the CRM
controller/service already implement the approved scope helper for every sibling
Lead worklist.

| Dimension | Impact |
|---|---|
| Primary domain | CRM unified Deal read model |
| Runtime behavior | Validate explicit Mall access, pass caller scope and apply Lead scope/Mall predicate before query pagination |
| Data/workflow | Read-only; no Lead/Booking/Proposal/Contract state change |
| Financial/currency | Existing estimated-value/currency presentation unchanged |
| Mall/Tenant | Closes `CONTRA-008` / `AUTH-01` for `GET /crm/deals`; Customer ownership `BC-016` remains out of scope |
| Authorization | Reuses the same authoritative CRM scope as Lead list/pipeline; backend remains authoritative |
| API | Route, query parameters and response shape unchanged; inaccessible records are no longer returned |
| Schema/database/migration | No change |
| Events/jobs/concurrency | Not applicable; read-only |
| Protected work | Concurrent frontend Deals locales and Proposal/Approval/Dashboard files excluded |
| Tests | Controller scope propagation plus service query predicate tests; focused/full backend, build, reconciliation and `git diff --check` |
| Golden scenarios | GS-09 cross-Mall denial and Lead-to-Booking identity boundary |
| Rollback | Revert controller scope propagation and service where predicate |
| Unknowns | Customer global-vs-Mall ownership remains `BC-016`; no Customer behavior changes |

## Wave 16 technical gate — 2026-08-24

- `GET /crm/deals` validates explicit Mall access, propagates the caller's
  accessible Mall set and applies the existing CRM Lead scope before pagination.
- Leasing Executives remain limited to assigned Leads; explicit Mall requests
  require the Lead's persisted `mallId` to match.
- Focused CRM controller/service: PASS, 2 suites / 11 tests.
- Backend full: PASS, 93/93 suites and 611/611 tests.
- Backend TypeScript/production build: PASS.
- Cross-module backbone reconciliation: PASS, 17/17 checks clean.
- API response, Deal stage/next-action logic, estimated-value currency behavior,
  schema and database: UNCHANGED.
- Customer ownership remains `BC-016` and was not inferred from Deal behavior.

## Wave 15 Change Request and Impact Map

Change ID: `CR-GOLDEN-W15-TICKET-SECONDARY-AUTHORIZATION`

Business reason: Ticket core CRUD validates authoritative Ticket ownership, but
escalation/rating routes bypass that same validation, global SLA policy writes
are reachable by Tenant users, and aggregate SLA/CSAT statistics are not scoped.
These are confirmed authorization defects with an existing safe pattern, not
open business semantics.

| Dimension | Impact |
|---|---|
| Primary domain | Tickets / SLA / CSAT authorization only |
| Runtime behavior | Reuse existing Ticket Mall/Tenant validation for per-ticket secondary routes; restrict global SLA policy configuration to ADMIN; scope aggregate statistics to accessible Malls and exclude Tenant aggregate access |
| Data/workflow | No Ticket status, SLA calculation, rating formula, escalation generation or lifecycle change |
| Financial/currency | Not applicable; Ticket surfaces contain no money |
| Mall/Tenant | Closes `CONTRA-003`/`INV-006` on the selected HTTP paths; scheduler recipient semantics remain `BC-020-R` |
| Authorization | Backend remains authoritative; no frontend permission expansion |
| API | Response shapes and paths unchanged; unauthorized callers now receive the existing guard/access denial |
| Schema/database/migration | No change |
| Events/jobs | Scheduled escalation generation unchanged; only HTTP read/write authorization and aggregate query scope change |
| Concurrency/idempotency | Rating upsert behavior unchanged |
| Protected work | Dashboard and Proposal/Approval concurrent files excluded |
| Tests | New focused controller/service denial and scope tests; backend focused/full, builds, reconciliation and `git diff --check` |
| Golden scenarios | GS-09/GS-10 authorization boundaries; no UAT scenario upgraded from unit evidence |
| Rollback | Revert controller role/scope wiring and scoped aggregate predicates |
| Unknowns | Mall-specific escalation-recipient policy remains `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` and is out of scope |

## Wave 15 technical gate — 2026-08-24

- Ticket SLA policy list/write is now ADMIN-only; per-ticket escalation/rating
  routes reuse the authoritative Mall and Tenant ownership checks from core
  Ticket CRUD.
- Aggregate SLA and CSAT statistics exclude Tenant access and apply the caller's
  accessible Mall set at the Prisma query.
- Focused Ticket authorization/workflow: PASS, 2 suites / 12 tests.
- Backend full: PASS, 92/92 suites and 606/606 tests.
- Backend TypeScript/production build: PASS.
- Cross-module backbone reconciliation: PASS, 17/17 checks clean.
- Ticket workflow, SLA calculation, rating formula, scheduler behavior, API
  response shapes, schema and database: UNCHANGED.
- Remaining `BC-020-R` concerns only which Mall-specific users should receive
  scheduled escalation notifications; it does not reopen the corrected HTTP
  authorization paths.

## Wave 14 Change Request and Impact Map

Change ID: `CR-GOLDEN-W14-RENDER-DISCOVERED-PRESENTATION`

Business reason: rendered English-locale review exposed literal wrapper
parentheses around the Occupancy report and Vietnamese-only copy in the Work
Order template panel. Both defects reduce trust in the Golden candidate and are
provable presentation defects rather than business-policy questions.

| Dimension | Impact |
|---|---|
| Primary domains | Reporting presentation and Operations/Work Order template localization |
| Runtime/business behavior | Remove two literal text artifacts and route existing template labels through the existing `workOrders` locale namespace |
| Data/state/workflow | Existing template frequency/category codes, mutations, query keys and readiness behavior remain unchanged |
| Financial/currency | No money, currency, formula, export or aggregation change |
| Mall/Tenant/authorization | Existing Mall selector, ADMIN/operations permissions and backend enforcement remain unchanged |
| API/backend/frontend/schema/database | Frontend presentation and locale resources only; no API, backend, schema or database change |
| Department values | Preserve the existing Vietnamese department values sent to the backend; only category/frequency/user-facing copy is localized |
| Protected work | Dashboard and Proposal/Approval source remains excluded |
| Tests | Focused Work Order/Reporting tests, frontend TypeScript/build, rendered viewport smoke and `git diff --check` |
| Golden scenarios | GS-08 Operations presentation only; no workflow or UAT evidence is upgraded |
| Reconciliation | Not applicable; no persisted or computed value changes |
| Rollback | Revert the reporting JSX artifact removal and Work Order locale mapping |
| Open questions | None; English locale must not render hard-coded Vietnamese UI copy |

## Wave 14 technical gate — 2026-08-24

Checkpoint: `705b2bd test(golden): verify rendered candidate viewports`

- Render-discovered fixes: PASS. Occupancy report wrapper artifacts are absent,
  and the Work Order template workspace follows the active English locale.
- Existing persisted department values remain unchanged when locale changes;
  category/frequency codes and all API calls are preserved.
- Focused Operations: PASS, 3 files / 7 tests. Focused Reporting presentation:
  PASS, 1 file / 2 tests.
- Frontend full: PASS, 45/45 files and 265/265 tests.
- TypeScript and production build: PASS in the rebuilt production frontend
  image. Docker: all four services healthy; frontend and backend health return
  HTTP 200.
- Rendered regression: PASS in the Wave 13 4/4 Playwright viewport run; the
  corrected 1024×768 Reports and Work Orders screenshots were inspected.
- Business logic/API/backend/schema/database changes: NO.

## Wave 13 Change Request and Impact Map

Change ID: `CR-GOLDEN-W13-RENDERED-VIEWPORT-EVIDENCE`

Business reason: the earlier in-app browser runtime was unavailable, but the
repository's installed Playwright runner can launch local Chromium. A dedicated
read-only smoke can inspect the production Docker frontend at the four required
desktop viewports and replace indirect responsive claims with rendered evidence.

| Dimension | Impact |
|---|---|
| Primary domains | E2E verification tooling and Golden readiness documentation only |
| Runtime/business behavior | Authenticated GET/navigation and screenshots; no create/update/delete action |
| Data/state/workflow | No business mutation; login token/session is browser-local |
| Financial/currency | Render inspection only; no amount or currency calculation |
| Mall/Tenant/authorization | Uses one existing local ADMIN seed account; does not claim two-Mall or Tenant-isolation coverage |
| API/backend/frontend/schema/database | No application or contract change |
| Protected work | Dashboard and Proposal/Approval are rendered read-only; their source files remain excluded |
| Tests | Check page-level overflow, fatal page errors, raw i18n-key patterns and capture screenshots at 1920×1080, 1440×900, 1366×768 and 1024×768 |
| Golden scenarios | Navigation/readability support only; no UAT scenario is upgraded from this evidence |
| Reconciliation | Not applicable; no persisted values change |
| Rollback | Revert the E2E verifier and documentation checkpoint |
| Open questions | Human business-usability sign-off remains separate even if automated rendering passes |

## Wave 13 technical gate — 2026-08-24

Checkpoint: `705b2bd test(golden): verify rendered candidate viewports`

- Playwright Chromium: PASS, 4/4 viewport cases and 28 authenticated
  route/viewport renders against the rebuilt production Docker frontend.
- Viewports: 1920×1080, 1440×900, 1366×768 and 1024×768.
- Routes: protected Dashboard, Fitout, CRM, Spaces, Work Orders, Reports and
  Admin. Navigation is read-only; no create/update/delete control is used.
- Automated assertions: PASS for page-level horizontal overflow, visible raw
  i18n-key patterns and fatal page errors.
- Manual screenshot inspection: completed for Dashboard at all four required
  viewports, every candidate workspace at 1024×768, and the corrected Reports
  and Work Orders surfaces. Dense tables/Kanban remain contained at 1024×768.
- Classification: `AUTOMATED RENDERED VERIFICATION: PASS`; overall Visual
  Verification remains `PARTIAL` until human business-usability sign-off.
- This evidence does not upgrade UAT, two-Mall isolation, authorization or
  production readiness.

## Wave 12 Change Request and Impact Map

Change ID: `CR-GOLDEN-W12-JOURNEY-EVIDENCE`

Business reason: production readiness currently records only two live UAT
scenarios, while the development database contains linked records spanning
multiple Golden domains. A read-only verifier can prove which journey segments
are represented and identify fixture gaps without mutating data or falsely
claiming human UAT completion.

| Dimension | Impact |
|---|---|
| Primary domains | Verification tooling and canonical Golden readiness documentation only |
| Runtime/business behavior | None; the verifier executes SQL `SELECT` statements through the existing Compose PostgreSQL service |
| Data/state/workflow | No writes, transitions, retries or fixture changes |
| Financial/currency | Counts linked persisted records only; no amount calculation, FX or currency reinterpretation |
| Mall/Tenant/authorization | Reports whether multi-Mall fixture coverage exists; does not claim or modify authorization |
| API/backend/frontend/schema/database | No application or schema change |
| Protected work | Dashboard and Proposal/Approval concurrent files remain excluded |
| Tests | Unit-test evidence classification; execute verifier against current local Docker data |
| Golden scenarios | Measures coverage supporting UAT-01 through UAT-10 while preserving UAT as a separate human/live gate |
| Reconciliation | Complements, but does not replace, the 17 zero-violation backbone invariants |
| Rollback | Revert the verifier and documentation checkpoint; no persisted data affected |
| Open questions | None; missing fixtures are reported as `MISSING`, never inferred as PASS |

## Wave 12 technical gate — 2026-08-24

Checkpoint: `8ef46bd test(golden): verify cross-module journey fixtures`

- Added `scripts/golden-journey-evidence.mjs`, a read-only PostgreSQL verifier
  that classifies fixture coverage as `EVIDENCED` or `MISSING`. It performs no
  database writes and does not replace human/live UAT.
- Current local evidence: 5/8 represented — two approved
  Lead→Booking→Proposal→Contract chains, 13 active Contract Fitout/Billing
  handoffs, 15 Invoice→Payment links, six completed Tickets and three distinct
  persisted currencies.
- Explicit fixture gaps: zero rejected approval workflows, zero single-record
  Lead→Collection chains and only one Mall. These remain missing rather than
  being inferred from narrower tests.
- Verifier unit tests: PASS, 2/2. Read-only live execution: PASS.
- Backbone reconciliation: PASS, 17/17 clean. Docker/runtime remains healthy.
- UAT status remains 2/12 PASS; Wave 12 improves automated integration evidence
  only and makes the remaining fixture prerequisites precise.
- Business logic/API contract/frontend/backend/schema/database changes: NO.

## Wave 11 Change Request and Impact Map

Change ID: `CR-GOLDEN-W11-UNKNOWN-ENUM-SAFETY`

Business reason: the independent post-program sweep found remaining reference
surfaces where an unknown future role/status/type could be rendered as a raw
backend code, plus one Forbidden-page role and known Sales audit actions that
are currently exposed verbatim. Known current values already have authoritative
locale labels; this wave standardizes the fallback behavior without assigning
meaning to unknown values.

| Dimension | Impact |
|---|---|
| Primary domains | Shared presentation utility; Auth/Profile/Audit, Reports, Booking workspace/reference finder, Billing reference presentation, Contract/Service Contract, CRM, Ticket/Tenant Portal, Fitout/Operations/Parking, Sales, SAP and Unit/Space presentation |
| Runtime/business behavior | Display labels only; comparisons, filters, actions and payload values remain raw authoritative enums internally |
| Data/state/workflow | No transition, eligibility, workflow or source-of-truth change |
| Financial/currency | No amount, formatter, formula, aggregation, precision or currency change |
| Mall/Tenant/authorization | No route, permission, query scope or action visibility change |
| API/backend/schema/database | No change |
| Protected work | Dashboard and Proposal/Approval concurrent files remain excluded |
| Tests | Extend shared enum fallback coverage and existing Reporting/Operations presentation locale coverage; run full frontend/backend/build gates |
| Golden scenarios | Preserve GS-01 through GS-15; presentation-only reads |
| Reconciliation | No value changes; rerun the 17 read-only invariants |
| Rollback | Revert the Wave 11 presentation commit; no persisted data affected |
| Open questions | None; unrecognized values use the localized neutral fallback rather than invented semantics |

## Wave 11 technical gate — 2026-08-24

Checkpoint: `7c6b4fa fix(i18n): neutralize unknown ERP presentation values`

- Added one shared localized enum-label fallback and applied it to the audited
  Auth/Profile, Reporting, Booking, Billing reference, Contract/Service
  Contract, CRM, Ticket/Tenant, Fitout/Operations/Parking, Sales, SAP and
  Unit/Space presentation points. Unknown future values
  now render the neutral localized label while the raw authoritative value is
  retained internally for comparisons, filters and API payloads.
- Known Sales audit actions received explicit English/Vietnamese labels. No
  new workflow meaning or backend enum was introduced.
- Focused frontend: PASS, 9 files / 34 tests.
- Frontend full: PASS, 44/44 files and 264/264 tests.
- Backend full: PASS, 91/91 suites and 598/598 tests.
- TypeScript, frontend production build and backend production build: PASS.
- Database invariants: PASS, 17/17 clean. Backup/restore safety guards: PASS,
  4/4. `git diff --check`: PASS.
- Docker/runtime: PASS; rebuilt the frontend/backend dependency chain and
  verified `http://localhost:8080/` and `/api/health` return HTTP 200. Existing
  UAT orphan containers were reported and deliberately left untouched.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery
  returned no browser instances; responsive or visual PASS is not claimed.
- The quarantined Analytics Compliance authorization surface and protected
  Dashboard/Proposal/Approval worktree were not modified.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 10 Change Request and Impact Map

Change ID: `CR-GOLDEN-W10-TEST-BASELINE`

Business reason: restore a truthful green frontend suite after confirmed UI
architecture and localized-copy changes made existing tests ambiguous or
obsolete. This wave changes test selectors/assertions only; production code is
not modified.

| Dimension | Impact |
|---|---|
| Primary domains | Frontend navigation test coverage and Golden Booking list test coverage |
| Runtime/business behavior | None; assertions are aligned to the currently approved rendered structure and locale copy |
| Data/state/workflow | No status, transition, action or source-of-truth change |
| Financial/currency | No amount, formatter, formula, precision or currency change |
| Mall/Tenant/authorization | Existing permissions remain unchanged; the test still proves every route module is reachable from navigation and every path is unique |
| API/backend/schema/database | No change |
| Tests | Replace ambiguous global text lookups with row/dialog-scoped queries; recognize two distinct AI navigation paths sharing one permission module |
| Golden scenarios | Preserve the approved Booking cancel/delete interactions and current navigation coverage |
| Rollback | Revert the test-only checkpoint; no runtime or persisted data affected |
| Open questions | None |

## Wave 10 technical gate — 2026-08-24

Checkpoint: `a310df4 test(frontend): close Golden ERP baseline failures`

- `permissions.test.ts` now verifies every permission module is represented and
  every navigation path is unique, while correctly allowing `/ai` and
  `/ai/codebase` to share the same authoritative permission module.
- `BookingsPage.test.tsx` now scopes repeated labels to their row/dialog,
  follows the existing mandatory cancellation-reason flow, and asserts the
  current localized delete action. Production Booking code was not changed.
- Focused frontend: PASS, 2 files / 46 tests.
- Frontend full: PASS, 44 files / 262 tests. The previously classified ten
  baseline failures are closed with no skipped/disabled tests.
- Frontend TypeScript and production build: PASS. `git diff --check`: PASS.
- Backend, Docker and database behavior are unchanged from the passing Wave 9
  gate; no rebuild or data mutation was required for this test-only wave.
- Business logic/API/backend/schema/database/financial/currency changes: NO.

## Wave 9 Change Request and Impact Map

Change ID: `CR-GOLDEN-W9-LOCALIZATION-SAFETY`

Business reason: close remaining confirmed cases where otherwise-approved
Booking/Billing/reference surfaces expose backend role or workflow codes to
operators, without reopening their architecture or changing business behavior.

Current behavior: development login accounts, Ticket staff selection and Sales
audit show raw role codes; Booking detail shows raw Lead/Proposal/activity
values; Billing schedule/service-contract rows show raw status/type values.

Expected behavior: each known enum uses the existing authoritative locale map
or the shared enum-presentation mapper, with the raw code retained only in a
`title` attribute for traceability and a neutral fallback for future values.

| Dimension | Impact |
|---|---|
| Primary domains | Authentication presentation, Booking, Billing, Ticket and Sales presentation |
| Journeys | GS-01, GS-03, GS-06, GS-07 and staff support/audit reads |
| Upstream/downstream | Existing API enums remain inputs; no payload, persistence, navigation or downstream output changes |
| Data/state/workflow | No status comparison, transition or source-of-truth change |
| Financial/currency | No amount, formatter, formula, precision or currency change |
| Mall/Tenant/authorization | No route, permission, role capability, query scope or action visibility change |
| Transaction/event/job/document | N/A — presentation reads only |
| API/schema/database/migration | No change; backward compatible |
| Tests | Extend pure enum-mapping coverage and run Booking/Billing/Ticket focused plus full frontend/backend/build gates |
| Golden scenarios | Preserve GS-01, GS-03, GS-06, GS-07 and GS-09 through GS-15 |
| Reconciliation | No value changes; rerun the 17 read-only platform invariants |
| Rollback | Revert the Wave 9 presentation commit; no persisted data affected |
| Open questions | None; unknown future values receive no invented business label |

Approval boundary: this is the P3 localization cleanup explicitly allowed by
the master program. Golden architecture and all Tier 0/Tier 1 semantics remain
closed to change.

## Wave 9 technical gate — 2026-08-24

Checkpoint: `ad576bb fix(i18n): localize remaining ERP workflow codes`

- Login development accounts, Ticket staff selection and Sales audit now use
  the shared localized role mapper; unknown future roles receive the neutral
  localized fallback.
- Booking detail localizes Lead and linked-Proposal states plus all eight
  existing activity types. Billing localizes schedule-entry states and invoice
  types using existing authoritative locale namespaces. Raw codes remain only
  in traceability `title` attributes.
- Frontend focused: PASS, 6 files / 62 tests. Frontend TypeScript and production
  build: PASS.
- Frontend full: 252/262; the same ten pre-program failures remain (one
  permission navigation invariant plus nine legacy Booking assertions). No
  Wave 9 regression was identified.
- Backend full: PASS, 91 suites / 598 tests. Backend production build: PASS.
- Database invariants: PASS, 17/17 clean. Backup/restore safety guards: PASS,
  4/4. `git diff --check`: PASS.
- Docker rebuild: PASS; current frontend/backend images rebuilt, all four
  services healthy, and localhost frontend/backend returned HTTP 200.
  Pre-existing UAT orphan containers were reported and deliberately retained.
- Automated rendered verification: UNAVAILABLE. Browser discovery returned no
  available instance after the required troubleshooting check; responsive or
  visual PASS is not claimed.
- Business logic/API/backend/schema/database/financial/currency changes: NO.

## Wave 8 Change Request and Impact Map

Change ID: `CR-GOLDEN-W8-SUPPORTING-PRESENTATION`

Business reason: complete the presentation audit on reachable supporting
surfaces that still expose raw backend enums or a decorative integration hero,
so operators receive consistent ERP terminology without changing the facts or
actions owned by those modules.

Current behavior: Profile/Audit display raw role codes; SAP reconciliation,
Reports invoice breakdown and Service Contract type controls expose raw enum
values; Parking has a raw status fallback; SAP uses a marketing-style gradient
hero inconsistent with the approved ERP shell.

Expected behavior: known authoritative enum values are mapped to localized
labels, unknown values retain a neutral explicit fallback for traceability, and
SAP uses the existing shared `PageHeader`/`ERPToolbar` presentation pattern.

| Dimension | Impact |
|---|---|
| Primary domains | Administration/Audit, Integration, Reporting, Service Contracts and Parking presentation only |
| Affected journeys | Supporting reads around GS-06 through GS-10; no primary handoff or write changes |
| Upstream/downstream | Existing API responses remain the only input; no output data, export, event or downstream consumer changes |
| Data ownership | Read-only presentation mapping; no entity write changes |
| State machine | Existing role, invoice, reconciliation, contract and parking enum values remain unchanged |
| Financial/currency | No amount, formula, precision, aggregation or currency formatter change |
| Mall/Tenant/authorization | No route, role, query or action visibility change; backend remains authoritative |
| Reporting | Invoice-type labels only; report formula and VND-only scope unchanged |
| Transaction/event/job/document | N/A — no mutation path or artifact payload changes |
| API/schema/database/migration | No change; backward compatible |
| Golden scenarios | Preserve GS-06 through GS-10 and GS-11 through GS-15; focused presentation tests plus full frontend/build gate |
| Reconciliation | No duplicated values changed; rerun the 17 read-only platform invariants after implementation |
| Rollback | Revert the Wave 8 presentation commit; persisted data is unaffected |
| Open business questions | None introduced. Unknown future enum values are not assigned invented semantics |

Approval boundary: the master program authorizes presentation standardization.
No Tier 0/Tier 1 behavior, authorization or financial semantics are included.

## Wave 8 technical gate — 2026-08-24

- Profile and Audit role codes, SAP sync/reconciliation states, Reports invoice
  types and Service Contract types now use one shared locale-key mapper with a
  neutral unknown-value fallback; backend enum values remain visible only as
  traceability titles.
- SAP now uses the shared ERP `PageHeader` and `ERPToolbar`, with a compact
  divided attention strip instead of the decorative gradient/card hero.
- Frontend focused: PASS, 3 files / 7 tests.
- Frontend full: 251/261; the same ten pre-program failures remain (one
  permission navigation invariant plus nine legacy Booking assertions). No
  Wave 8 regression was identified.
- Backend full: PASS, 91 suites / 598 tests. Frontend TypeScript/production
  build and backend production build: PASS.
- Database invariants: PASS, 17/17 clean. Backup/restore safety guards: PASS,
  4/4.
- Docker rebuild: PASS; current frontend/backend images rebuilt, four services
  running and localhost frontend/backend returned HTTP 200. Pre-existing UAT
  orphan containers were reported and deliberately retained.
- Automated rendered verification: UNAVAILABLE. Browser discovery returned no
  available instances after the required troubleshooting check; responsive or
  visual PASS is not claimed.
- Business logic/API/backend/schema/database/currency changes: NO.

## Wave 1 Change Request and Impact Map

Business objective: turn the existing Fitout surface into a dense, localized ERP operational workspace while preserving the implemented Fitout pipeline and all business behavior.

In scope:

- Fitout frontend page composition, density, responsive behavior and localized presentation.
- Existing-route navigation and existing-action hierarchy.
- Presentation-only mapping of raw status/workflow enums.
- Focused frontend tests and locale updates.

Out of scope:

- Backend controllers/services, API contracts, Prisma schema/migrations and database.
- Stage definitions, transition/gate rules, override roles, checklist semantics, Unit synchronization, financial calculations and authorization.
- Dashboard, Booking, Billing, Contract and active Proposal/Approval changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Contract activation creates Fitout Project; unchanged |
| Downstream | `OPENED` synchronizes Unit occupancy in backend; unchanged |
| Financial/currency | Change/risk money semantics are not altered; provenance remains UNKNOWN |
| Mall/Tenant | Existing API/query scope unchanged; UI role visibility remains presentation only |
| Events/jobs | No event or job change |
| Concurrency/idempotency | Existing backend transition transaction and idempotency unchanged |
| API/schema/database | No change |
| Protected modules | Explicitly excluded by manifest above |

Golden scenarios to preserve: GS05, GS08, GS09, GS10 and cross-Mall GS11-GS15.

Unknowns: Fitout change-order currency provenance; any business desire to make checklist/issues stage gates. Both are quarantined and cannot be inferred in Wave 1.

Visual verification: `AUTOMATED VISUAL VERIFICATION: UNAVAILABLE`. The configured browser runtime reported no available browser instances on 2026-08-24. Responsive PASS is not claimed; human rendered review remains required.

Approval boundary: the user's master execution authorization permits this presentation wave. Tier 0/Tier 1 behavior remains non-self-approved and will be reported or quarantined.

## Wave 1 technical gate — 2026-08-24

- Frontend Fitout + currency focused: PASS, 8 tests.
- Backend Fitout focused: PASS, 5 suites / 44 tests.
- Backend full: PASS, 91 suites / 598 tests.
- TypeScript + production build: PASS.
- `git diff --check`: PASS.
- Docker build: PASS; localhost frontend and backend health endpoints returned HTTP 200.
- Frontend full: BASELINE FAILURES outside Fitout — `permissions.test.ts` navigation duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. Fitout focused tests passed within the same run; protected Booking/navigation work was not modified.
- Automated rendered viewport review: UNAVAILABLE (no browser instance). Human visual gate remains open, so Wave 1 is not yet declared Golden.
- Business logic/API contract/backend/schema/database changes: NO. The frontend adapter now preserves an already-existing `FitoutChangeOrder.currency` response field and passes the optional existing DTO field on create; no endpoint shape changed.

## Wave 2 Change Request and Impact Map

Business objective: make CRM, Customer/Tenant master data and the Tenant Portal read as one dense ERP handoff from prospect to operating tenant, while preserving the approved Booking/Proposal/Contract chain and all authoritative state transitions.

In scope:

- CRM, CRM overview, Tenant master and Tenant Portal frontend information hierarchy, density, responsive behavior and localized presentation.
- Presentation-only mapping of existing statuses, priorities, lease-term types and workflow labels.
- Exact-money presentation through the existing shared currency formatter where an authoritative currency is available.
- Focused frontend presentation tests and locale updates.

Out of scope:

- Lead, Customer or Tenant lifecycle/business rules; Booking/Proposal/Contract handoff semantics.
- Backend controllers/services, API contracts, Prisma schema/migrations and database.
- Resolving global Customer ownership or adding Mall scope to `Customer`.
- Inventing currency provenance for Lead estimates, FX, aggregation across currencies, or changing financial calculations.
- Dashboard and protected Booking/Proposal/Approval working-tree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Lead is the entry point; existing import/manual-create and mall association remain unchanged |
| Downstream | Booking/Proposal reference Lead/Customer and Proposal snapshots commercial terms; unchanged |
| Financial/currency | `Lead.expectedRent`/`estimatedValue` have no currency field; current backend documents them as VND while BC-001 remains open. No mixed-currency inference or formula change is authorized |
| Mall/Tenant | Lead routes are Mall-scoped. `Customer` has no `mallId` and global ownership is an open business decision (BC-016); no UI-only security fiction will be introduced. Tenant Portal continues to rely on server-forced `currentUser.tenantId` |
| Events/jobs | CRM follow-up reminder job and notifications are unchanged |
| Concurrency/idempotency | Existing Lead/Customer synchronization and Booking/Proposal transaction behavior remain unchanged |
| API/schema/database | No change |
| Protected modules | Dashboard, Booking and active Proposal/Approval paths remain excluded |

Golden scenarios to preserve: GS-01, GS-03, GS-09, GS-10 and GS-11 through GS-15.

Unknowns: BC-001 (whether Lead estimates can ever be non-VND) and BC-016 (whether Customer is intentionally global) remain `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`. They are tracked, not guessed or silently fixed in Wave 2.

Approval boundary: the user's master execution authorization permits this presentation wave. Tier 0 currency semantics and Tier 1 authorization/data-ownership changes remain non-self-approved and are excluded.

## Wave 2 technical gate — 2026-08-24

- Frontend CRM / Tenant Portal / currency focused: PASS, 3 files / 9 tests.
- Backend CRM / Customer / Tenant focused: PASS, 4 suites / 16 tests.
- TypeScript + production build: PASS.
- `git diff --check`: PASS.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. CRM focused, Tenant Portal presentation and currency tests passed in the same full run.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive PASS is not claimed.
- Reconciliation: CRM Lead values remain exact documented VND; Tenant Portal pending invoice totals are separated by persisted ISO currency with no mixed-currency sum or FX.
- Authorization: Lead and Tenant controller paths verified; CRM unified deals remains a confirmed Tier 1 gap and Customer Mall ownership remains BC-016. Neither was silently changed.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 4 Change Request and Impact Map

Business objective: consolidate Ticket, scheduled Maintenance, Work Order and Patrol into dense ERP operations worklists whose priorities, authoritative statuses and allowed actions are immediately legible, without changing any operational workflow or system-of-record behavior.

In scope:

- Presentation hierarchy, density, responsive composition and localization for Ticket, the Ticket Maintenance tab, Work Order and Patrol frontend surfaces.
- Presentation-only mapping of existing Ticket, Work Order, Patrol Shift and Patrol Check enums.
- Reuse of the existing ERP page header and toolbar components; preserve the established Ticket worklist/detail architecture.
- Focused frontend presentation tests and locale resources.

Out of scope:

- Ticket, Maintenance, Work Order or Patrol transition rules, SLA calculations, scheduling/execution semantics, QR/geofence validation and abnormal-check automation.
- Backend controllers/services, API contracts, authorization policy, Prisma schema/migrations and database.
- Known Ticket tenant-isolation gaps on escalation/rating/SLA-policy paths; these remain a Tier 1 correctness quarantine.
- Service Contract currency/invoice-transfer correctness, Announcements, Inventory, Parking, Dashboard and protected Proposal/Approval working-tree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Tenant/staff creates Ticket; operations schedules Maintenance, Work Orders and Patrol Shifts through existing routes; unchanged |
| Downstream | Ticket SLA escalation remains job-driven. An abnormal Patrol Check may create one Security Work Order through the existing backend path; unchanged |
| Financial/currency | No money or currency field is displayed or calculated by the in-scope operational worklists |
| Mall/Tenant | Main Ticket, Work Order and Patrol paths remain Mall-scoped. Confirmed Ticket isolation gaps on three secondary paths are not hidden or treated as UI-secured |
| Events/jobs | Ticket SLA cron, Maintenance reminder/execution jobs and Patrol-to-Work-Order automation are unchanged |
| Concurrency/idempotency | Existing Patrol abnormal-check idempotency and separate Work Order status/audit writes are preserved; no new client-side transition semantics |
| API/schema/database | No change |
| Protected modules | Dashboard, Booking and active Proposal/Approval paths remain excluded |

Golden scenarios to preserve: GS-09 (cross-Mall access), GS-10 (Tenant isolation) and GS-15 (retry/idempotency), subject to the already-recorded Ticket secondary-endpoint gap.

Unknowns: BC-020 (authoritative ownership for Ticket escalation/rating/SLA-policy reads) remains `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`. XMOD-007 (transaction boundary for an abnormal Patrol Check and its generated Work Order) remains unverified and quarantined. Neither is inferred in Wave 4.

Approval boundary: the user's master execution authorization permits presentation work. Workflow, authorization, operational automation and transaction-boundary changes are Tier 1 boundaries and remain unchanged.

## Wave 3 Change Request and Impact Map

Business objective: turn the existing Space surface into a dense inventory cockpit where availability, physical hierarchy, authoritative Unit status and current commercial context are immediately legible, without altering the Unit lifecycle or leasing eligibility.

In scope:

- Space inventory header, view controls, filter density, Unit grid/detail hierarchy and localized presentation.
- Presentation-only localization of Unit, Booking, Proposal and Contract statuses already returned by existing APIs.
- Exact display of the existing Unit VND rate-card fields; no abbreviations or symbol-only ambiguity.
- Focused frontend presentation tests and locale updates.

Out of scope:

- `UnitStatusService`, transition matrix, Booking eligibility/queue rules, Contract/Fitout side effects and merge/split behavior.
- Slot allocation, SlotBooking concurrency, slot-pricing currency design or any short-term pricing formula.
- Backend controllers/services, API contracts, Prisma schema/migrations and database.
- Dashboard, Booking and protected Proposal/Approval working-tree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Mall → Floor/Zone defines Unit ownership and physical hierarchy; unchanged |
| Downstream | Booking locks Unit; Proposal/Contract commit Unit; Fitout advances Unit to `UNDER_FITOUT`/`OCCUPIED`; unchanged |
| Financial/currency | Unit base rent/CAM fields have no currency field and existing UI/backend treat the rate card as VND. Wave 3 only makes VND explicit and exact; it does not propagate Unit rates as authoritative contract currency |
| Mall/Tenant | Current Unit list/detail/mutation routes enforce Mall access after CR-101; frontend visibility remains non-authoritative |
| Events/jobs | Contract/Fitout/Booking status side effects and occupancy readers are unchanged |
| Concurrency/idempotency | Shared status transitions remain centralized; merge/split bypass and slot concurrency findings are not modified |
| API/schema/database | No change |
| Protected modules | Dashboard, Booking and active Proposal/Approval paths remain excluded |

Golden scenarios to preserve: GS-01, GS-02, GS-04, GS-05, GS-07, GS-08 and GS-09 through GS-15.

Unknowns: BC-010 (whether `MERGED` was deliberately excluded from the shared transition matrix) remains `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`. Unit-slot currency provenance and slot allocation concurrency remain separately quarantined.

Approval boundary: the user's master execution authorization permits presentation work. Unit lifecycle, eligibility, financial semantics and authorization behavior are Tier 0/Tier 1 boundaries and remain unchanged.

## Wave 3 technical gate — 2026-08-24

- Frontend Unit/Space presentation and form-safety focused: PASS, 2 files / 8 tests.
- Backend Unit status, authorization, CRUD, hierarchy, map and merge/split focused: PASS, 8 suites / 77 tests.
- Backend full: PASS, 91 suites / 598 tests.
- TypeScript, frontend production build and backend production build: PASS.
- Docker/runtime: PASS; rebuilt current compose frontend/backend dependency chain, all four services healthy, `http://localhost:8080/` and `http://localhost:3000/api/health` return HTTP 200. Existing UAT orphan containers were reported and deliberately left untouched.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. Space focused tests passed in the same run.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive or visual PASS is not claimed.
- Reconciliation: Unit rate-card fields remain existing implicit-VND data and are now presented exact with explicit `VND`; Proposal/Contract values continue using their persisted currency. Slot pricing remains unclassified and is not combined or relabeled.
- Authorization: current Unit/Floor/Zone/map paths remain backend-scoped and focused authorization tests pass; no frontend role check is treated as security.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 4 technical gate — 2026-08-24

- Frontend Work Order behavior and Operations presentation focused: PASS, 2 files / 6 tests.
- Backend Ticket/Maintenance and Work Order role-scope focused: PASS, 2 suites / 18 tests.
- Backend full: PASS, 91 suites / 598 tests.
- TypeScript, frontend production build and backend production build: PASS.
- Docker/runtime: PASS; rebuilt the current compose dependency chain, all four services are healthy, and `http://localhost:8080/` plus `http://localhost:3000/api/health` return HTTP 200. Existing UAT orphan containers were reported and deliberately left untouched.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. All Wave 4 focused tests passed in the same full run.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive or visual PASS is not claimed.
- Reconciliation: Ticket, Maintenance, Work Order and Patrol surfaces contain no financial fields. Existing status/action transitions and Patrol-to-Work-Order automation remain backend-authoritative and unchanged.
- Authorization: core paths remain server-scoped; the known Ticket secondary-endpoint Tenant gap remains explicitly quarantined and is not presented as secured by UI.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 5 Change Request and Impact Map

Business objective: make Reports and Analytics a dense, decision-oriented management workspace with explicit financial units, exact monetary detail and localized analytical labels, while preserving every current formula and refusing to represent the remaining unscoped Compliance-export paths as Golden-secure.

In scope:

- Reports and Analytics frontend hierarchy, density, responsive composition and localized presentation.
- Exact financial display with ISO currency; chart axes may use a declared scale while tooltips remain exact.
- Presentation-only status/risk/lease-term labels and visibility alignment for the existing CEO/ADMIN cross-Mall capability.
- Focused frontend presentation and currency tests.

Out of scope:

- Revenue, collection, occupancy, risk, compliance or AR-aging formula changes and formula consolidation.
- Compliance export/list/generate/manual-monthly authorization remediation; the remaining exposure is Tier 1 and requires the governance review chain before implementation.
- Backend controllers/services, API contracts, schema/migrations, database, jobs and persisted analytics snapshots.
- Dashboard, Sales, Billing and protected Proposal/Approval working-tree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Reports/Analytics read CRM, Proposal, Contract, Invoice/Payment, Unit and audit data directly; no source writes are introduced |
| Downstream | CSV/compliance exports and management decisions consume these views; export payloads and formulas remain unchanged |
| Financial/currency | Revenue/receivables endpoints are explicitly VND-scoped and silently exclude non-VND records. Pipeline and renewal-risk values are already separated by persisted currency. Wave 5 will disclose these semantics and never combine currencies |
| Mall/Tenant | CR-101 Phase 3G now scopes core Reports and Analytics reads through `MallAccessService` and accessible Mall ID sets. Analytics Compliance export list/request/generate/manual-monthly paths still do not resolve or validate Mall ownership; this narrower Tier 1 gap prevents full closure |
| Events/jobs | Occupancy snapshot, renewal-risk and compliance scheduler behavior is unchanged; the dead duplicate analytics expiry scheduler remains unregistered |
| Concurrency/idempotency | Read-side presentation only; existing SchedulerLock/job-ledger behavior and per-item failure gaps are unchanged |
| API/schema/database | No change |
| Protected modules | Dashboard and active Proposal/Approval paths remain excluded |

Golden scenarios to preserve: GS-09 (cross-Mall authorization), GS-10 (Tenant isolation), GS-11 through GS-14 (currency), and GS-15 (retry/idempotency). GS-09 passes for the focused core Report/Analytics reads and remains blocked for the Compliance-export sub-surface.

Unknowns: authoritative ownership/role policy for Compliance exports remains `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`; UI presentation will not be treated as authorization. Metric formula ownership also remains unresolved and no formula is selected as canonical in Wave 5.

Approval boundary: the user's master authorization permits presentation work. Mall-scope remediation and shared financial-formula ownership cross Tier 0/Tier 1 boundaries and are not self-approved.

## Wave 5 technical gate — 2026-08-24

- Frontend Reporting presentation and currency focused: PASS, 2 files / 5 tests.
- Backend Reports/Analytics scope, currency and breakdown focused: PASS, 6 suites / 29 tests.
- Backend full: PASS, 91 suites / 598 tests (same backend working tree; no Wave 5 backend changes).
- TypeScript and frontend production build: PASS.
- Docker/runtime: PASS; rebuilt the current frontend/backend dependency chain, all four services are healthy, and `http://localhost:8080/` plus `http://localhost:3000/api/health` return HTTP 200. Existing UAT orphan containers were reported and deliberately left untouched.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. Reporting/currency focused tests passed.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive or visual PASS is not claimed.
- Financial reconciliation: VND-only revenue/receivables scope is disclosed; chart axes declare `Tỷ VND`; tooltips, KPI values and per-currency pipeline/risk values are exact and use ISO currency. No FX, mixed-currency sum or formula change was introduced.
- Authorization: core Reports/Analytics Mall scope is verified under CR-101 Phase 3G. Analytics Compliance export list/request/generate/manual-monthly remains a Tier 1 quarantine, so Wave 5 is not Golden Closed.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 6 Change Request and Impact Map

Business objective: standardize Admin, Settings, Users and Permissions as a dense ERP control workspace where account state, role and authoritative Mall scope are immediately legible, without changing any authorization policy or access-control behavior.

In scope:

- Admin workspace header/navigation hierarchy, account worklist density, compact account summary and Mall-access presentation.
- Presentation-only localization of the existing role and account-access values returned by current APIs.
- Reuse of the established ERP page header/toolbar and existing UI components; focused presentation tests and locale resources.
- Read-only verification that frontend actions correspond to existing ADMIN-restricted backend routes.

Out of scope:

- Role definitions, `ROUTE_PERMISSIONS`, backend `@Roles` metadata, `MallAccessGuard`, UserMallAccess grant rules or any authorization-policy change.
- User/account lifecycle semantics, password policy, approval-policy behavior, Mall/space master-data behavior and system-health semantics.
- Backend controllers/services, API contracts, Prisma schema/migrations, database, jobs and audit behavior.
- The known concurrent `permissions.test.ts` change and all protected Dashboard/Proposal/Approval worktree changes.

Impact dimensions:

| Dimension | Finding |
|---|---|
| Upstream | Users, roles, Malls and UserMallAccess grants are read from existing Users/Spaces/MallAccess APIs; unchanged |
| Downstream | Route navigation and backend guards consume the role/access model. The presentation will not write or duplicate a new permission model |
| Financial/currency | No financial amount, currency field, calculation or export is in scope |
| Mall/Tenant | UserMallAccess is the authoritative staff-to-Mall scope. ADMIN/CEO/TENANT bypass semantics and Tenant service-layer isolation remain unchanged and will not be represented as a frontend security guarantee |
| Authorization | Users CRUD and grant/revoke endpoints are ADMIN-only. The matrix remains read-only and sourced from current frontend route configuration; backend remains authoritative |
| State machine | Existing active/locked account state and approval-policy behavior are unchanged |
| Events/jobs | No event, queue, cron, health polling contract or audit-log behavior changes |
| Concurrency/idempotency | Existing grant upsert/revoke and account-write behavior remain unchanged; no new writes are introduced |
| API/schema/database | No change |
| Protected modules | Dashboard and active Proposal/Approval paths, plus the concurrent permissions test, remain excluded |

Golden scenarios to preserve: GS-09 (cross-Mall denial), GS-10 (Tenant isolation) and the role-specific entry points exercised by the permanent GS-01 through GS-08 journey baseline. No financial reconciliation is required because Wave 6 displays no money.

Unknowns: the documented CEO capability contradictions and any future editable permission-policy model remain `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`. Wave 6 will neither normalize nor expand those capabilities.

Approval boundary: the user authorized presentation standardization. Authorization and role semantics are Tier 0; no Tier 0 implementation is self-approved or included in this wave.

## Wave 6 technical gate — 2026-08-24

- Frontend Admin presentation, Mall-access display, System health and Approval-policy focused: PASS, 5 files / 20 tests.
- Backend Users/UserMallAccess focused: PASS, 2 suites / 17 tests.
- Backend full: PASS, 91 suites / 598 tests.
- TypeScript and frontend production build: PASS.
- Docker/runtime: PASS; rebuilt the current frontend/backend dependency chain and verified `http://localhost:8080/` plus `http://localhost:3000/api/health` return HTTP 200. Existing UAT orphan containers were reported and deliberately left untouched.
- Frontend full: BASELINE FAILURES only — `permissions.test.ts` RouteModule duplication and 9 legacy `BookingsPage.test.tsx` selector/assertion failures. All Wave 6 focused tests passed in the same run.
- Automated rendered viewport review: UNAVAILABLE. Browser runtime discovery returned no browser instances; responsive or visual PASS is not claimed.
- Authorization: Users CRUD remains ADMIN-only; UserMallAccess service validation and grantable-role restrictions remain unchanged. The permission matrix is explicitly read-only and frontend presentation is not treated as security.
- Reconciliation: no financial or currency values are present in the Wave 6 surface. Account role/state and Mall scope are presented from their existing authoritative fields without new semantics.
- Business logic/API contract/backend/schema/database changes: NO.

## Wave 7 protected Dashboard audit — 2026-08-24

Decision: Dashboard is an existing Golden surface with an active, pre-existing minor-polish diff. Wave 7 is therefore read-only: no Dashboard application, locale or test file is modified or staged by this program checkpoint.

Audit findings:

- Financial strip values remain exact and explicitly labeled `VND`; no compact financial transaction value is used.
- Financial chart axes declare their scale (`Đơn vị: Tỷ VND`) while exact tooltips use ISO currency.
- Action Center derives counts and overdue amount from the existing Dashboard payload and navigates only to existing routes.
- `healthScore` provenance is confirmed as the private, role-dependent `DashboardService.healthScoreForRole()` composite. It has no approved business-KPI definition and is correctly presented only as a secondary reference composite indicator with methodology/disclaimer—not authoritative portfolio health.
- Main Dashboard reads resolve requested or accessible Mall scope inside `DashboardService`; the dedicated cross-Mall endpoint remains restricted to `MODULE_ROLES.crossMall` (`ADMIN`, `CEO`).
- Dashboard financial data remains explicitly VND-scoped. This avoids mixed-currency arithmetic but excludes USD/MMK rather than converting them; that platform limitation remains disclosed and unchanged.
- Revenue/collection and occupancy formulas remain duplicated across Dashboard/Reports/Analytics/AI. No formula was selected or rewritten under this presentation program.

Technical evidence:

- Frontend Dashboard focused: PASS, 1 file / 3 tests.
- Backend Dashboard focused: PASS, 1 suite / 4 tests.
- Backend full, TypeScript, production build, Docker and localhost results are shared with the immediately preceding Wave 6 gate and remain PASS on the same working tree.
- Frontend full retains the same 10 unrelated baseline failures; Dashboard focused tests pass in that run.
- `git diff --check`: PASS.
- Automated rendered viewport review: UNAVAILABLE. The protected minor-polish diff is not staged and responsive/visual PASS is not claimed.

Business logic/API contract/backend/schema/database changes by Wave 7: NO.
