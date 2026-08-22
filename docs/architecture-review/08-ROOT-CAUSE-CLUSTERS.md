# 08 — Architectural Root-Cause Clustering

16 architecture contradictions, 3 P0 verifications, 16 XMOD findings, and the file-security investigation cluster into **6 root causes**, each evidence-supported (not templated from the illustrative list in the review prompt — `DATA-01` as originally suggested was folded into `CRM-01` since the evidence for both is the same weak-write-boundary pattern, and no evidence supports a distinct standalone `DATA-01` cluster beyond that).

## AUTH-01 — Mall/Tenant Scope Architecture

**Root cause**: `MallAccessGuard`'s resource-resolution is a fixed, hardcoded list of field names and path substrings, with a fail-open fallback when nothing resolves. This is a single architectural defect, not 11 unrelated bugs.

**Findings clustered here**: CONTRA-008 (all 9+ instances: Spaces-Units, Analytics, Reports, Sales, Parking-Dashboard, Fitout-controls, Fitout-gantt, Fitout-daily-report, AI, CRM), P0-002, the `FilesController` cross-Mall IDOR residual finding from the file-security investigation, BC-007/008/009/013/014/016/017/020.

**Why one cluster, not eleven**: every instance has the identical failure mechanism (guard doesn't recognize the route's identifying parameter → silent skip) and the identical fix shape (either the route needs an explicit `assertMallAccess` call, or — better — the architecture needs a fail-closed default). Patching each instance individually would leave the underlying defect in place for the next new route.

## FIN-01 — Canonical Financial Semantics

**Root cause**: No convention or enforcement mechanism requires a reporting/derived-metric consumer to call the owning module's calculation rather than reimplement it against raw tables.

**Findings clustered here**: CONTRA-012 (7-10 independent "collected revenue"/"occupancy rate" implementations), the `collection-kpi.service.ts` internal variant not reusing `financials()`, BC-015.

## CUR-01 — Currency Ownership & Aggregation

**Root cause**: Two distinct but related sub-defects: (a) several money-bearing models (`SalesTurnover`, `ParkingMonthlyStatement`/`.Line`/`.DebtPayment`, `UnitSlot`/`SlotBooking`) have no currency field at all, making correct currency handling structurally impossible without a schema change; (b) aggregation/formula code that *does* have currency-aware inputs available doesn't consistently filter/bucket by currency.

**Findings clustered here**: P0-001 (invoice-summary mixing), P0-003 (revenue-share mixing), CONTRA-005, CONTRA-009, CONTRA-010, CONTRA-011, XMOD-010/014, BC-001, 004, 005.

**Relationship to AUTH-01**: independent root causes — do not conflate. A currency fix does not touch authorization code and vice versa, though both clusters happen to concentrate in Billing/Reporting-adjacent modules.

## EVT-01 — Durable Cross-Module Events

**Root cause**: The outbox-durable-event pattern exists and is proven (used correctly for `contract.activated` and `approval.workflow.completed`) but was not applied uniformly to every event that has a downstream consumer with state to update.

**Findings clustered here**: CONTRA-002 / XMOD-006 (`approval.workflow.rejected`), the SAP retry/reconciliation automation gap (CONTRA-006, XMOD-016's retry loop), CONTRA-007 (dead duplicate cron job — related in that it's the same "scheduled/event infrastructure applied inconsistently" family, though the specific defect is different — a landmine, not a durability gap).

## CRM-01 — Weak Write-Boundary Discipline in the Core Leasing Chain

**Root cause**: CRM, Proposals, and Contracts — the platform's highest-value chain — allow direct cross-module writes to their Prisma tables, bypassing their own service layer. This produces divergent duplicate logic (not data-ownership violations at rest, since Prisma writes are still correctly scoped by whatever code performs them, but *logic* duplication because each writer re-derives its own version of "how do I write this correctly").

**Findings clustered here**: CONTRA-001 (duplicate pricing-calc between Proposal's `calcFinancials()` and Booking's inline conversion calc), CONTRA-004 (the boundary-weakness finding itself), CONTRA-016 (Spaces merge/split bypassing `UnitStatusService` — same *family* of defect: a second implementation path around a shared service, even though the module is different), BC-002 (dead enum values — a downstream symptom of scattered, ad hoc status logic rather than centralized state-machine enforcement).

**Note on scope**: this cluster does NOT include the general "data ownership" template category (`DATA-01`) as a separate cluster — investigation found no evidence of a distinct data-ownership defect class beyond what CRM-01 already covers (the bidirectional Billing↔Parking/ServiceContracts write-back pattern noted in System Truth is architecturally intentional, not a defect, per `docs/system-truth/02-DOMAIN-OWNERSHIP.md`).

## OPS-01 — Transaction Boundary & Batch-Job Resilience Gaps

**Root cause**: Transaction-hardening and per-item batch-failure isolation were applied reactively, per-incident, rather than as a blanket module standard — evidenced by the same module (Contracts, Billing) being best-in-class for one operation and gapped for a sibling operation.

**Findings clustered here**: CONTRA-014 (Contract termination not fully atomic), CONTRA-015 (Slots double-booking, no transaction + no idempotency), the Parking/Analytics batch-job per-item-isolation gaps, XMOD-007/008/009 (UNKNOWN transactional atomicity, flagged for follow-up investigation under this cluster).

## Cluster-to-finding coverage check

Every P0/P1/P2 finding from `docs/system-truth/ARCHITECTURE_CONTRADICTIONS.md` and every XMOD risk flagged in `06-XMOD-RISK-REVIEW.md` maps to exactly one cluster above, except CONTRA-013 (no Company entity — a documentation-only correction, not an architectural defect, tracked separately in `docs/ai-erp-team/13-PROGRAM-BOARD.md`'s low-effort corrections list) and CONTRA-003/BC-020 (Tickets tenant-isolation gap — this is genuinely closest to `AUTH-01`'s pattern but is Tenant-scoping, not Mall-scoping; included in `AUTH-01` as a related-but-distinct sub-item since the fix (explicit ownership checks on 3 specific endpoints) is much narrower than the rest of the cluster and shouldn't dilute `AUTH-01`'s primary architectural fix).
