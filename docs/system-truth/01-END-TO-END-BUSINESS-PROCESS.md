# System Truth — 01 — End-to-End Business Process

Verified against `docs/ai-erp-team/04-BUSINESS-PROCESS-CATALOG.md`'s BP-xxx hypotheses.

### BP-001 — Lead-to-Lease (CRM → Booking → Proposal → Approvals → Contract)
- **Verified: MATCHES**, with findings.
- Two independent entry points create a Proposal: `BookingService.convertToProposal()` (from an ACTIVE booking) and direct `POST /proposals`. **These two paths compute `totalContractValue` differently** — Proposal's own `calcFinancials()` applies discount% and rent-free-month deduction; Booking's inline conversion calc does not. Same inputs, different outputs depending on entry point. → `CONTRA-001`.
- Approval trigger is genuinely data-driven (`ApprovalPolicyRule`: DISCOUNT_PCT/RENT_FREE_DAYS/INDUSTRY_TAG/HAS_AR_DEBT/PRICE_BELOW_MIN/PRICE_DEVIATION_PCT), not hardcoded thresholds — role-gated at both controller and service layers (genuine defense-in-depth).
- Contract creation has two independent code paths (`ContractsService.create()` direct, and `ProposalsService.createContractFromProposal()` conversion) that both correctly resolve currency from the Proposal's `rentCurrency` when a `proposalId` is present — **currency propagation end-to-end verified correct**, no silent VND-reset found.
- Reject path correctly reverts Lead status and releases the Unit — clean compensating logic.
- **Reliability asymmetry**: `approval.workflow.completed` event is outbox-durable (survives a crash); `approval.workflow.rejected` is a plain in-memory EventEmitter (lost on crash before delivery). → `CONTRA-002`.
- Confidence: MEDIUM (verified against code + specs; some conversion-path edge cases not independently tested here).

### BP-002 — Contract-to-Cash (Contract → Billing → Invoice → Payment → AR)
- **Verified: MATCHES**, with confirmed bugs.
- Invoice creation from 4 sources (LEASE_CONTRACT, SERVICE_CONTRACT, PARKING, SHORT_TERM_BOOKING) — LEASE_CONTRACT/SERVICE_CONTRACT branches use non-Serializable `$transaction`; PARKING/SHORT_TERM_BOOKING branches use Serializable — inconsistent isolation level within the same method (`createInvoiceFromPending`).
- `findAllInvoices()` summary sums across currencies with no filter — confirmed live bug (`CONTRA-005` in Financial Semantics). AR aging, dashboard, collection-KPI all correctly VND-filter/currency-bucket; this one summary was missed.
- Confidence: HIGH (extensively verified with file:line and cross-checked against 5 sibling formula implementations).

### BP-003 — Contract-to-Fitout-to-Handover
- **Verified: MATCHES existing docs exactly** (`docs/program/05-FITOUT-STATE-MACHINE.md`, `05-FITOUT-HANDOVER-COMPLETION.md`) — no contradiction found.
- Trigger: `@OnEvent('contract.activated')`, emitted from Contract activation's Serializable transaction via the durable outbox.
- 9-stage config-driven pipeline (`FitoutStageConfig`, DB-seeded, not a hardcoded enum), forward-only, gate-document-enforced with auditable override.
- Handover = reaching stage `OPENED` (Unit→OCCUPIED); `APPROVED_TO_OPEN` (stage 8, handover-form-approved) is a distinct, earlier step — Unit stays `UNDER_FITOUT` until explicit advance to `OPENED`.
- Confidence: HIGH.

### BP-004 — Tenant-to-Ticket-to-Resolution
- **Verified: MATCHES**, with a confirmed tenant-isolation gap.
- Confirmed to be the Tenant Portal's ticket system (`TenantPortalPage.tsx` calls `ticketsApi`).
- Core CRUD/comment/photo/transition paths correctly force `currentUser.tenantId` server-side, never trust client-supplied tenantId.
- `escalations`/`rate`/`rating` endpoints and SLA-policy admin endpoints bypass the ownership check entirely (no `currentUser` passed to the service at all) — exploitable at the API level even though the current frontend never calls them for tenants. → `CONTRA-003`.
- Confidence: HIGH.

### BP-005 — Parking-to-Cash
- **Verified: MATCHES**, VND-only at the money-bearing-model level (statement/line/payment have no currency field at all — not just "free-text unvalidated" as the contract-level field is; a deeper, undocumented gap).
- Confidence: HIGH.

### BP-006 — Service-Contract-to-Cash
- **Verified: MATCHES**, with a confirmed currency bug: two independent "transfer to billing" implementations exist, only one of which sets `Invoice.currencyCode`.
- Confidence: HIGH.

### BP-007 — Sales-to-Revenue-Share
- **Verified: MATCHES**, with a confirmed cross-currency formula bug: `SalesTurnover.grossSales` (no currency field, implicitly VND) is subtracted against `contract.rent` (denominated in `contract.currencyCode`, which can be non-VND) in `calculateRevenueShare`. Severity depends on whether revenue-share contracts are ever priced non-VND in practice — open `BC` item.
- Confidence: MEDIUM (formula verified in code; real-world currency mix of revenue-share contracts unverified).

### BP-008 — Short-Term Slot Booking
- **Verified: MATCHES**, with a confirmed concurrency bug: `createBooking`'s conflict-check-then-create is not transactional and there is no DB unique constraint on `(slotId, timeRange)` — two simultaneous bookings for an overlapping window can both succeed, double-booking the slot. No currency field on the model at all (VND-only, undocumented gap).
- Confidence: HIGH.

### BP-009 — Work-Order Operations
- **Verified: PARTIALLY MATCHES, corrected.** Hypothesis assumed Work Orders relates to Patrol/Inventory broadly. Verified: **Patrol → Work Orders is a real one-way trigger** (abnormal patrol check auto-creates a `WorkOrder`, category SECURITY). **Inventory and Tickets have no relationship to Work Orders at all** — fully independent modules, no shared foreign keys or event handlers.
- Confidence: HIGH.

### BP-010 — SAP Integration
- **Verified: MATCHES for the push+idempotency+circuit-breaker mechanics**, but **contradicts `docs/OPERATIONS_RUNBOOK.md`'s assumption of scheduled SAP jobs** — retry and reconciliation are manual-trigger-only (`POST` endpoints), no `@Cron` exists for either. → `CONTRA-006`.
- Confidence: HIGH.

### BP-011 — Management Reporting
- **Verified: MATCHES the existence of the journey, but reveals the platform's largest single finding**: revenue/collection and occupancy-rate figures are independently reimplemented (not called from a shared/owning service) in 5–7 different places across Dashboard, Reports, Analytics, Compliance, and AI, each with subtly different formula details. See `13-REPORTING-DEFINITIONS.md`.
- Confidence: HIGH (extensively cross-checked with file:line for every implementation found).

### BP-012 — Tenant Self-Service
- **Verified: MATCHES**, tenantId-based scoping (not Mall-based, by deliberate design — `TENANT` is a `BYPASS_ROLES` member for `MallAccessGuard`) is consistently and correctly enforced on every core CRUD path traced (Tickets, Billing/Invoices, Sales). Gaps are limited to the 3 Tickets endpoints noted under BP-004.
- Confidence: HIGH.

### BP-013 — Multi-Mall Operations
- **Verified: PARTIALLY MATCHES, materially corrected.** No "Company" entity exists (see `00-SYSTEM-OVERVIEW.md`). The one purpose-built cross-mall view (`GET /dashboard/cross-mall`) is correctly gated to `[ADMIN, CEO]`. However, **the same effective capability (portfolio-wide, all-mall data) is reachable through Analytics/Reports/AI endpoints by roles well outside that allow-list**, because those controllers don't enforce Mall scoping as a boundary at all (optional filter only). This is the platform's most severe confirmed finding — see `ARCHITECTURE_CONTRADICTIONS.md` P0/P1 entries.
- Confidence: HIGH.

## Process inventory summary

| BP-xxx | Verified? | Confidence | Key finding |
|---|---|---|---|
| BP-001 | Yes, with findings | MEDIUM | Duplicate pricing-calc logic; async reliability asymmetry |
| BP-002 | Yes, with findings | HIGH | Currency-mixing bug in invoice summary |
| BP-003 | Yes, matches docs exactly | HIGH | None — positive example |
| BP-004 | Yes, with findings | HIGH | Tenant-isolation gap on 3 endpoints |
| BP-005 | Yes | HIGH | VND-only at model level, undocumented |
| BP-006 | Yes, with findings | HIGH | Currency bug in one of two transfer paths |
| BP-007 | Yes, with findings | MEDIUM | Cross-currency formula bug (severity unconfirmed) |
| BP-008 | Yes, with findings | HIGH | Concurrency/double-booking bug |
| BP-009 | Corrected | HIGH | Inventory/Tickets not actually linked to Work Orders |
| BP-010 | Yes, with findings | HIGH | No scheduled retry/reconciliation, contradicts runbook |
| BP-011 | Yes, major finding | HIGH | 5-7 independent formula reimplementations |
| BP-012 | Yes | HIGH | Consistent tenantId scoping (positive example) |
| BP-013 | Corrected, major finding | HIGH | No Company entity; cross-mall leak via Analytics/Reports/AI |
