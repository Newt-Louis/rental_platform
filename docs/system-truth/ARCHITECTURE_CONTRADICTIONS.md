# System Truth — Architecture Contradictions

Register populated from direct code inspection across all 31 backend modules (2026-08-21). Search coverage: financial formulas (Billing/Dashboard/Reports/Analytics/AI), currency handling (all money-bearing modules), authorization guards (every controller, full backend), state machines (all major entities), transaction boundaries (all multi-step writes found), scheduled jobs (all `@Cron` sites platform-wide).

## P0 — Security / financial corruption / severe data loss

### CONTRA-008 — MallAccessGuard's heuristic resource-resolution leaves multiple confirmed cross-Mall data leaks
- **Concept**: Mall-scoped authorization.
- **Root cause**: `MallAccessGuard` (global `APP_GUARD`) resolves the target Mall only via specific param/query/body field names or narrow path-substring patterns, always keyed to `params.id`; `MallAccessService.extractAndValidateMallAccess()` fails open (silently skips the check) when no Mall ID resolves.
- **Confirmed live instances**: Spaces (`/spaces/units/:id*` — full CRUD, zero mall check), Analytics + Reports controllers (no `MallAccessService` at all; `mallId` an optional, unenforced filter — `GET /analytics/multi-mall` in particular grants CEO/ADMIN-equivalent visibility to `LEASING_MANAGER`), Sales (no mall filtering for internal roles), Parking-Dashboard (`parkingCode` param unchecked), Fitout-controls (`:projectId` param name unmatched), Fitout-gantt mutate/delete (`:id` refers to task not project), Fitout-daily-report photo routes (`:entryId`), AI chat context (`buildContext()` unscoped), CRM `getUnifiedDeals` (no DB-level filter, in-memory-only optional post-filter).
- **Severity**: P0 — direct, exploitable cross-Mall data exposure (read and, for Spaces, write/delete) for `MALL_DIRECTOR`/`LEASING_MANAGER`/`LEASING_EXECUTIVE`/`FINANCE`/`LEGAL`/`OPERATION` roles.
- **Resolution path**: Requires an ADR establishing a fail-closed, explicitly-declared-per-route Mall-scoping requirement (e.g. a decorator + compile-time or CI lint check that every non-bypass-role controller method either declares itself Mall-exempt or calls `MallAccessService`), rather than continuing to rely on the guard's automatic heuristics for new routes.
- **Status**: OPEN.

### CONTRA-005 — Invoice-summary currency-mixing bug contradicts `MULTI_CURRENCY_AUDIT.md`'s claimed fix
- **Concept**: Cross-currency SUM safety.
- **Location A (buggy)**: `billing.service.ts:findAllInvoices()` summary block (708-730) — sums `balance`/`totalAmount` across all currencies with no filter.
- **Location B (correct, same file/module)**: `getPendingReceivables` (explicit `vndOnly()` helper), `getArAging` (currency-bucketed), `collection-kpi.service.ts`, `dashboard.service.ts` (all explicitly currency-scoped).
- **Doc contradiction**: `docs/program/MULTI_CURRENCY_AUDIT.md` §6 documents this exact bug class as "Addressed in this pass" for Dashboard/CollectionKpi — true for those, but not for `findAllInvoices`, which the audit's stated scope implies should also have been covered.
- **Severity**: P0 (silent financial-data corruption on any multi-currency mall's invoice list summary).
- **Resolution path**: Straightforward fix once confirmed; also indicates the audit's own completion-tracking needs a re-check for coverage gaps elsewhere.
- **Status**: **RESOLVED (CR-102, 2026-08-21)** — see `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md`. `summary.*` is now VND-only with a new `summary.byCurrency` breakdown; 10 tests verify every currency combination. Correction, not silent edit: CR-102's independent bypass search also found that `reports.service.ts` and `analytics/{compliance,occupancy-analytics}.service.ts` were *already* correctly VND-filtered (contradicting this platform's own `docs/architecture-review/05-CANONICAL-FINANCIAL-SEMANTICS.md`, corrected there too) — Location B above should be read as more complete than originally documented. **Known limitation carried forward, not resolved by CR-102**: the fix cannot detect an Invoice whose *stored* `currencyCode` is itself wrong — see `CONTRA-010` below, confirmed still-live during CR-102's adversarial review.

### CONTRA-011 — Revenue-share formula mixes an implicitly-VND figure with a contract-currency figure
- **Concept**: Currency-safe financial formula.
- **Location**: `billing.service.ts:1384` (`calculateRevenueShare`) — `shareAmount = max(0, sale.grossSales * pct% - contract.rent)`, where `SalesTurnover.grossSales` has no currency field (implicitly VND) and `contract.rent` is in `contract.currencyCode` (can be non-VND).
- **Severity**: P0 **if** revenue-share contracts are ever priced non-VND in production (unconfirmed — see `BUSINESS_CONFIRMATION_REQUIRED.md` BC-007); otherwise dormant/low-severity.
- **Resolution path**: Requires business confirmation before a fix can be correctly scoped (should Sales turnover follow contract currency, or is VND-only correct by design for retail sales metrics?).
- **Status**: OPEN, severity pending confirmation. **CR-102 (2026-08-21) investigated and explicitly did not fix this** — see `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md` "Blocker": a fresh, thorough search (schema, code, docs, UI, tests) found no evidence proving VND-only semantics, so the guard was not implemented per explicit instruction not to guess business policy. Returned `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`, unchanged from before.

## P1 — Major E2E business failure

### CONTRA-001 — Duplicate pricing-calculation logic between Proposal's own `calcFinancials()` and Booking's inline conversion calc
- **Locations**: `proposals.service.ts:71-98` vs. `booking.service.ts:839-846` (inside `convertToProposal`).
- **Divergence**: Proposal's version applies discount% and rent-free-month deduction to `totalContractValue`; Booking's inline version does not.
- **Effect**: Identical inputs produce different `totalContractValue` depending on whether a Proposal was created directly or via Booking conversion.
- **Severity**: P1 (BP-001 financial-terms correctness).
- **Resolution path**: ADR to establish `calcFinancials()` (or an extracted shared helper) as the single source of truth, called from both entry points.
- **Status**: OPEN.

### CONTRA-002 — Approval-workflow terminal-outcome reliability asymmetry
- **Locations**: `approval.workflow.completed` (outbox-durable, `approvals.service.ts:252`) vs. `approval.workflow.rejected` (plain EventEmitter, `approvals.service.ts:313`).
- **Effect**: A process crash between commit and delivery loses the rejection notification to Proposals; the approved path is retried/durable, the rejected path is not.
- **Severity**: P1 (asymmetric reliability guarantee for two outcomes of the same workflow).
- **Resolution path**: Confirm whether this asymmetry is intentional (rejection has no side-effect worth retrying) before deciding whether to route it through the outbox too.
- **Status**: OPEN, see `BUSINESS_CONFIRMATION_REQUIRED.md` BC-003.

### CONTRA-003 — Tickets tenant-isolation gap on 3 endpoint groups
- **Locations**: `tickets.controller.ts:162-178` (`escalations`, `rate`, `rating`) and `tickets.controller.ts:138-154` (SLA-policy admin endpoints) — none pass `currentUser` to the underlying service methods, which therefore skip the tenant-ownership check every other method in the same service applies.
- **Effect**: Any authenticated `TENANT`-role account can read another tenant's escalation history/ratings, and any tenant-role account can upsert the platform-wide SLA policy.
- **Severity**: P1 (confirmed exploitable at the API level; current frontend never calls these for tenants, so no observed real-world exploitation, but the API itself is not safe).
- **Status**: OPEN.

### CONTRA-010 — Two independent "transfer ServiceContractPayment to Invoice" implementations, only one currency-correct
- **Locations**: `service-contracts.service.ts:transferPaymentToBilling` (350-384, missing `currencyCode`) vs. `billing.service.ts:createInvoiceFromPending` SERVICE_CONTRACT branch (377-418, correctly sets it).
- **Additional divergence**: different invoice-numbering schemes (wall-clock-based vs. deterministic-by-payment-id).
- **Severity**: P1.
- **Status**: OPEN. **Independently reconfirmed live during CR-102's adversarial review (2026-08-21)**: `ServiceContractsPage.tsx` genuinely exposes a USD/MMK currency selector on service contracts and payments, so an Invoice with a wrong `currencyCode` via this path is not hypothetical. CR-102 explicitly did not fix this (out of its authorized scope — see `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md` "Known limitations") — it is the same finding, not a new one, but now with a concrete UI-reachability citation. Remains tracked under `CR-103`/`ADR-105`.

### CONTRA-012 — Financial/occupancy formulas independently reimplemented 5-10 times across Dashboard/Reports/Analytics/AI
- **Concept**: "Collected revenue" and "occupancy rate," the platform's two most consumed derived metrics.
- **Locations**: see `13-REPORTING-DEFINITIONS.md`'s full 10-row matrix — only 1 of 10 confirmed report/metric implementations (Reports' AR-aging) actually delegates to its owning module (Billing); the rest independently reimplement, with confirmed variance in exact formula shape (face-value vs. payments-received, subtotal vs. totalAmount, clamped vs. unclamped).
- **Severity**: P1 — this is the literal risk class named in the original governance brief ("duplicated financial formulas between Billing, Dashboard and Reports"), confirmed present and more widespread than the brief's framing suggested (it's not just Billing/Dashboard/Reports — Analytics and AI independently reimplement too).
- **Resolution path**: Establish `OccupancyAnalyticsService.getOccupancyV2()` and a to-be-extracted shared revenue/collection service as the canonical implementations; migrate the other 4-9 consumers to call them.
- **Status**: OPEN.

### CONTRA-014 — Contract termination is not fully transactional, unlike every other major state transition in the same module
- **Locations**: `contract-termination.service.ts:113-143` (`complete()` — Unit-status release outside the Contract+Termination transaction), `:24-74` (`initiate()` — two separate unwrapped writes).
- **Contrast**: Contract activation (`updateStatus`) is the platform's most rigorously transacted operation; termination, in the same module, is the one gap.
- **Severity**: P1.
- **Status**: OPEN.

### CONTRA-015 — Slot booking has no concurrency protection, unlike every sibling booking-type module
- **Location**: `slots.service.ts:createBooking()` (261-349) — conflict-check-then-create not wrapped in a transaction, no DB unique constraint on `(slotId, timeRange)`.
- **Contrast**: `UnitBooking` (the platform's other booking-queue model) uses Serializable transactions + P2034 retry specifically to prevent this exact class of race.
- **Severity**: P1 (double-booking is a direct operational failure).
- **Status**: OPEN.

## P2 — Significant operational problem

### CONTRA-004 — Core leasing chain (CRM/Proposals/Contracts) lacks the clean write-boundary discipline found everywhere else
- **Finding**: Of 16 audited modules, only CRM, Proposals, and Contracts have multiple external direct writers to their Prisma tables bypassing their own service layer — and these three are exactly the highest-value chain (BP-001/002/003).
- **Severity**: P2 (maintainability/consistency risk; not yet observed to have caused a live data-correctness bug beyond the already-separately-tracked CONTRA-001).
- **Status**: OPEN.

### CONTRA-006 — SAP retry/reconciliation is manual-only, contradicting `OPERATIONS_RUNBOOK.md`'s assumption of scheduled jobs
- **Doc contradiction**: `docs/OPERATIONS_RUNBOOK.md:143` lists "failed... SAP scheduled jobs" as something ops should alert on; no `@Cron` exists anywhere for SAP retry or reconciliation — confirmed via full `@Cron(` grep.
- **Severity**: P2 (operational gap — a stuck PENDING/FAILED sync sits forever without automated remediation).
- **Status**: OPEN, see `BUSINESS_CONFIRMATION_REQUIRED.md` BC-011.

### CONTRA-007 — Dead, duplicate-named cron job left in the codebase after a known-and-documented hazard
- **Locations**: `analytics/contract-expiry.scheduler.ts` (unregistered, dead) vs. `notifications/contract-expiry.scheduler.ts` (live) — both declare `@Cron(..., {name:'contract-expiry-check'})`, which would crash app bootstrap (`DUPLICATE_SCHEDULER`) if both were ever registered.
- **Doc self-awareness**: `docs/OPERATIONS_RUNBOOK.md:155-157` already explicitly warns against exactly this scenario — the team knows about the hazard but left the orphaned file in place rather than deleting it, and the two versions' bucket-threshold logic actually differs.
- **Severity**: P2 (dormant landmine — no live impact today, but a future "wire up this unused service" cleanup would crash the app).
- **Resolution path**: Delete the dead file (audit-only scope of this reconstruction — flagging only, not fixing).
- **Status**: OPEN.

### CONTRA-016 — Spaces' unit-merge/split bypasses the shared `UnitStatusService`, duplicating status-write logic
- **Location**: `spaces.service.ts:mergeUnits`/`splitUnit` (1528-1611) — direct `tx.unit.update({status: ...})` + hand-rolled `UnitHistory` write, because `MERGED` isn't representable in `UnitStatusService`'s transition matrix.
- **Severity**: P2 today (locally guarded); P1 risk for future maintainers who assume `UnitStatusService` is the sole gate for all Unit-status rules.
- **Status**: OPEN.

### CONTRA-009 — `MULTI_CURRENCY_AUDIT.md`'s "left untouched by design" framing undersells concrete downstream bugs and undocumented model gaps
- **Doc contradiction**: The audit correctly documents Parking/Service-Contracts currency fields as an intentional architectural decision to defer, but doesn't anticipate (a) the ServiceContracts dual-path bug (CONTRA-010) this deferral enabled, or (b) that Sales and Slots have **no currency field at all**, not even the "free-text, unvalidated" treatment Parking/Service-Contracts got — these two weren't in the audit's scanned model list at all.
- **Severity**: P2 (documentation-accuracy gap, with the real bugs it enabled tracked separately at P1/P0 above).
- **Status**: OPEN.

## P3 — UX / maintainability

### CONTRA-013 — No `Company` entity exists, contradicting the Mall/Company hierarchy assumed by this governance framework itself
- **Location**: `docs/ai-governance/00-START-HERE.md`'s platform vocabulary and `docs/ai-erp-team/05-ERP-MASTER-DATA.md`'s master-data candidate list both assume a two-tier Mall/Company structure; no `Company` Prisma model exists — `Mall` is flat.
- **Severity**: P3 (documentation-only — does not reflect a code defect, but should be corrected so future CRs don't design against a nonexistent entity).
- **Resolution path**: Update `docs/ai-governance/00-START-HERE.md` and `docs/ai-erp-team/05-ERP-MASTER-DATA.md` to remove "Company" and describe the actual ADMIN/CEO-bypass-role mechanism instead. Not performed in this audit-only pass — flagged for the P1 Program Board phase.
- **Status**: OPEN.

## Register summary

| Severity | Count | IDs |
|---|---|---|
| P0 | 3 | CONTRA-005, 008, 011 |
| P1 | 6 | CONTRA-001, 002, 003, 010, 012, 014, 015 (7 — corrected count) |
| P2 | 4 | CONTRA-004, 006, 007, 009, 016 (5 — corrected count) |
| P3 | 1 | CONTRA-013 |

(Note: 16 total contradictions logged; tallies above corrected to 3 P0 / 7 P1 / 5 P2 / 1 P3 = 16.)

## Search coverage note
Areas searched: financial formulas (exhaustive across Billing/Dashboard/Reports/Analytics/AI), currency handling (exhaustive across all 6 money-bearing modules in the Financial Core stream), authorization guards (every controller file across the backend, per the Tenant & Security stream's explicit broad sweep), state machines (all major entities across all 5 streams), transaction boundaries (every multi-step write found), scheduled jobs (full `@Cron(` grep platform-wide). Not searched this pass: file/document access control beyond the carried-forward `SECURITY_READINESS.md` note (see `14-FILE-DOCUMENT-OWNERSHIP.md`), deployment/infra config, frontend component-level logic beyond the specific pages cited.
