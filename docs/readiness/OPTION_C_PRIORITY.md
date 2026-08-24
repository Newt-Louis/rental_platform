# Option C Program Priority

Review date: 2026-08-18  
Constraint: Option C is not authorized to start by this review. Reliability/security blockers remain a separate pre-production track.

## Scoring model

Each factor is 1 (low) to 5 (high). Higher effort and technical risk reduce priority.

`Priority = 2×Business Impact + User Frequency + User Pain + 2×Operational Risk + Revenue Impact + Cross-module Dependency - Implementation Effort - Technical Risk`

Operational risk and business impact are doubled because this ERP controls approvals, contracts and finance. Revenue impact is kept separate from general business impact; cross-module dependency rewards work that unlocks multiple journeys. Scores rank investigation order, not automatic authorization.

## Programs and scores

| Program | Business Impact | User Frequency | User Pain | Operational Risk | Revenue Impact | Cross-module Dependency | Effort | Technical Risk | Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C1 — CRM + Booking Experience | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 4 | **29** |
| C2 — Contract Lifecycle Experience | 5 | 4 | 4 | 5 | 5 | 5 | 4 | 4 | **30** |
| C3 — Fitout Operational Experience | 4 | 4 | 5 | 4 | 3 | 4 | 4 | 3 | **25** |
| C4 — Billing & Finance Experience | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | **30** |
| C5 — Search & Information Discovery | 4 | 5 | 4 | 2 | 2 | 5 | 3 | 2 | **23** |
| C6 — Reporting & Management Insight | 4 | 4 | 4 | 3 | 4 | 5 | 4 | 3 | **24** |
| C7 — Design System Consolidation | 3 | 5 | 3 | 3 | 2 | 5 | 4 | 3 | **20** |
| C8 — Role / Operation Sub-scoping | 5 | 4 | 4 | 5 | 3 | 5 | 4 | 5 | **27** |

## Recommended first Option C program

**C4 — Billing & Finance Experience**, only after the P0 security and reliability A0 gates close.

Why:

- Billing has approximately 11 tabs, mixed Vietnamese/English terminology and high action/reference density.
- It is a daily/high-frequency surface with direct cash, invoice, payment, dunning and audit consequences.
- Finance errors have the highest operational and revenue cost; the readiness review still requires confidence across all invoice producers, payment idempotency and scheduler ownership.
- C4 ties the visible Contract handoff to the actual revenue lifecycle and makes reliability state actionable to Finance users.

Expected UX improvement:

- Reorganize into Invoices, Collections, Billing Rules and Finance Control.
- Separate “action required” from reference/history, standardize status and terminology, expose source Contract/Mall/period and recovery state.
- Reduce tab scanning, make overdue/payment/adjustment next actions explicit and surface last refresh/error/retry.

Business impact: faster collections and reconciliation, fewer duplicate/incorrect actions, clearer activation-to-revenue ownership, and stronger auditability.

Dependencies:

1. Close scheduler/static gate and validate deterministic keys for every invoice producer.
2. Protect billing documents behind authorized download endpoints.
3. Approve finance terminology, KPI definitions and permission matrix.
4. Establish current UAT fixtures and a rollback-safe migration approach.

Estimated risk: **HIGH** because the module is financially sensitive and technically coupled. Use thin vertical slices and feature flags; do not combine data-model rework and wholesale UI replacement in one release.

Tie-break with C2: Contract Lifecycle has the same score and should be the next program. C4 goes first because frequency, immediate revenue exposure and current UI density are higher; C2's core activation is already partially durable and Option B added handoff visibility.

## Cross-module root causes to fix once

| Shared root cause | Seen in | Strategy |
| --- | --- | --- |
| Ad-hoc loading/error/empty/retry states | CRM, Booking, Dashboard, reports and multiple detail tabs | Mature one `AsyncState/QueryBoundary` contract and migrate by risk. |
| Repeated filter/search/table action patterns | Proposals, Contracts, Billing, Bookings, Fitout | Create accessible filter-bar, active-filter summary, clear-all and table-action primitives before module rewrites. |
| Status vocabulary/color drift | Proposal, Approval, Contract, Fitout, Billing, tasks | Create domain status registry with label, tone, allowed next actions and localization ownership. |
| High tab count / non-scrolling navigation | Billing, Fitout, Contracts, Admin | Create responsive workspace navigation and progressive disclosure once. |
| Header/action placement inconsistency | Large legacy pages | Adopt a single PageHeader/action/last-refreshed pattern. |
| Protected document handling | Contracts, Billing, Fitout, Tickets, Parking, Work Orders | Build one authorized document service/download component; do not patch each public URL independently. |
| Resource/Mall authorization boilerplate | Most backend modules | Use explicit resource-policy abstraction plus reusable negative IDOR contract tests. |
| Job visibility/retry | Billing, notifications, operations | Build a shared JobRun/outbox operator pattern before module-specific dashboards. |

## Design system strategy

| Classification | Components/patterns | Decision |
| --- | --- | --- |
| **STABLE — KEEP** | Core Button/Dialog/Tabs/Badge primitives; tested `AsyncState`; Tickets and Tenant Portal empty/error/action patterns; Option B primary CTA and handoff cards | Reuse and document behavior/accessibility. |
| **DUPLICATED — CONSOLIDATE** | `ConfirmDialog`, `confirm-action-dialog`, reason/action variants; ad-hoc page headers, filters, status badges and table actions | Select canonical APIs, provide migration adapters, then remove duplicates incrementally. |
| **LEGACY — DEPRECATE** | Page-local tab strips, native-like custom confirmations, silent query-empty fallbacks, hard-coded status colors/terms | Mark deprecated and block new usage through lint/review rules. |
| **MISSING — CREATE** | Authorized document download, responsive workspace nav, query boundary, job/delivery state, filter summary, status registry | Create only when the first ranked program supplies concrete use cases and tests. |

Do not run C7 as a full cleanup project. Fold proven shared components into C4/C2 slices and migrate other modules only when touched.

## Product operating model review

| Layer | Current fit | Modules breaking the model |
| --- | --- | --- |
| HOME | Dashboard now has better role actions and Fitout SLA visibility. | Overlapping pipeline/cross-Mall analytics still blur Home vs Reporting. |
| MY WORK | Notification Center separates tasks from information; Approvals is actionable. | There is no canonical complete personal queue across approvals, tickets, work orders, follow-ups and SLA tasks; notifications are capped/client-classified. |
| BUSINESS WORKSPACES | Navigation is task-clustered. | CRM/Bookings monoliths and high-tab Contract/Fitout/Billing screens mix workspaces, reference data and configuration. |
| REPORTING | Rich coverage exists. | Dashboard, Reports, Analytics, Cross-Mall, Pipeline Stats and Deal Pipeline overlap and KPI ownership is unclear. |
| ADMINISTRATION | Admin roles and routes exist. | Admin remains a large mixed-permission workspace; Fitout/finance/operations configuration needs explicit permission domains. |

## Suggested sequence after gates

1. C4 Billing & Finance Experience.
2. C2 Contract Lifecycle Experience.
3. C1 CRM + Booking Experience.
4. C8 Role / Operation Sub-scoping (or pull critical permission slices forward).
5. C3 Fitout Operational Experience.
6. C6 Reporting & Management Insight.
7. C5 Search & Information Discovery after canonical entities/statuses are clearer.
8. C7 remains an enabling stream, not a big-bang program.
