# CR-120 — Systemic Mall Isolation Finalization

## CHANGE ID
CR-120

## BUSINESS REASON
Prevent an authenticated user whose authority is limited to one Mall from reading, changing, exporting, aggregating, inferring, or triggering effects for another Mall. Separately preserve the stricter Tenant Portal boundary. This is the release-gate continuation of the runtime-proven MALL-001 financial-control bypass.

## CURRENT BEHAVIOR
The global `MallAccessGuard` validates a Mall only when its heuristic extracts a recognized request field or path shape. If no Mall source resolves, `MallAccessService.extractAndValidateMallAccess()` returns without checking access. Most established controllers compensate with explicit resolver calls or server-derived Mall filters, but this is not guaranteed by the guard or descriptive `@Scope` metadata. Security Batch A already fixed SalesTurnover and Announcements leaks in the preserved worktree. The current route inventory has drifted to 558 routes/46 controllers and found nine new Billing Add-In routes absent from the earlier CR-101 inventory; their declarations and runtime security must be verified. SAP visibility and CRM Customer ownership retain documented unresolved business-policy questions.

## EXPECTED BEHAVIOR
Every in-scope route is inventoried and ends as `PROVEN_SAFE`, `FIXED`, `GAP`, or `NOT_APPLICABLE`; excluded operational routes are explicitly `NOT_ASSESSED_OUT_OF_SCOPE`. Every Mall-scoped route has an authoritative Mall source and denies cross-Mall IDs, spoofed parents, and unauthorized explicit Mall filters before data return or side effects. Omitted Mall filters restrict to the caller's authorized Mall set or reject. Tenant routes derive tenant identity from the authenticated user. Only the approved ADMIN bypass and explicitly opted-in CEO cross-Mall read paths remain unrestricted.

## PRIMARY DOMAIN
Security Architecture / Multi-Mall Architecture, with Finance, Leasing, Tenant Experience, Reporting, Integration, Master Data, and Reliability reviewers required for their owned surfaces.

## AFFECTED JOURNEYS
BP-001 through BP-004, BP-006, BP-007, BP-010 through BP-013; GS-01, GS-04 through GS-10, and GS-14. The dedicated security regression scenarios SEC-MALL-001 through SEC-MALL-010 and SEC-TENANT-001/002 supplement GS-09 and GS-10.

## UPSTREAM IMPACT
Depends on JWT identity, `RolesGuard`, `UserMallAccess`, authoritative Prisma relationships, approved CEO cross-Mall read policy, existing resolver behavior, and the preserved Security Batch A changes. A missing/nullable ownership chain is treated as fail-closed for a known existing object; it is not assigned an invented Mall.

## DOWNSTREAM IMPACT
Checked surfaces include CRM/Lead, Spaces, Booking, Proposal, Approval, Contract, Tenant, Fitout/Handover, Billing Schedule/Add-In/Invoice/AR/Payment/Revenue/SalesTurnover, SAP financial integration, Tickets/Work Orders/Service Contracts/Announcements, Dashboard/Reports/Analytics/AI, Users/Mall Access/Categories/Audit/Notifications/Files/Email Settings, related exports/downloads, notifications, audit writes, outbox/events, and the Parking-to-AR boundary only. Patrol, Parking internals/dashboard, and Inventory/Warehouse remain out of scope.

## DATA OWNERSHIP IMPACT
No ownership transfer or cross-domain business write is authorized. Security fixes may add read-only ownership resolution and scoped predicates at existing domain controller/service boundaries. SalesTurnover remains owned through Unit; Billing Add-In entries through Contract→Unit; financial objects use their documented Invoice/Contract/BillingParty chains.

## STATE MACHINE IMPACT
No legal status transition changes. Authorization must execute before existing approval, issue, pay, confirm, reopen, activate, terminate, cancel, handover, or SAP-sync transitions. Negative mutation tests must prove the existing state is unchanged.

## FINANCIAL IMPACT
No amount, formula, rounding, tax, balance, revenue-share, or status semantics may change. The audit protects visibility and mutation authority for Billing Schedule, Invoice, AR, Payment, Revenue, SalesTurnover, Billing Add-In, and SAP financial objects. A denial must create no invoice, payment, adjustment, audit, notification, outbox, or SAP-log side effect.

## CURRENCY IMPACT
No currency behavior or stored currency changes. Tests may inspect response isolation but must not alter conversion, aggregation, or formatting rules.

## MALL/COMPANY IMPACT
Defines MALL-ISO-01: a Mall-A-only user cannot access or affect Mall B by omitted/explicit/spoofed/nested IDs, batch, export, aggregate, or direct API calls. There is no Company entity. ADMIN remains the platform bypass; CEO remains unrestricted only on explicit `crossMallRead` read paths.

## TENANT IMPACT
Defines TENANT-ISO-01: a Tenant user cannot read or mutate another tenant's contract, unit, invoice, ticket, inspection, activation, document, or related portal data, including within the same Mall.

## AUTHORIZATION IMPACT
This is a Tier 0 cross-cutting authorization audit. The descriptive `@Scope` decorator is not treated as enforcement. Each route must identify direct Mall input, authenticated Mall-set filtering, entity resolver, parent relation, tenant-service check, explicit global intent, or a documented gap. Remediation is limited to proven P0/P1 routes with authoritative ownership and no open business decision.

## REPORTING IMPACT
No metric formula changes. Dashboard, Reports, Analytics, AI context, and exports are checked for explicit/omitted Mall leakage and approved CEO access.

## TRANSACTION IMPACT
No transaction design changes are planned. Authorization is required before writes or external calls. Tests compare primary and relevant side-effect tables before/after denied mutations.

## EVENT/JOB IMPACT
No scheduler/event behavior changes unless a proven HTTP authorization defect can trigger a current job or integration side effect. System-internal all-Mall jobs remain separately declared; their manual trigger role policy is audited but not guessed.

## DOCUMENT IMPACT
Adds the authoritative `SECURITY_ROUTE_MATRIX.md` and updates security governance evidence. File/download/export routes are audited for parent ownership. No generated preview/email artifacts are included.

## API IMPACT
Successful request/response shapes remain unchanged. Proven unauthorized requests may change from data/success to 403 or ownership-safe 404. No new public endpoints.

## MIGRATION
No Prisma schema or production data migration.

## BACKWARD COMPATIBILITY
Authorized same-Mall and approved global access must continue to work. Any consumer depending on unauthorized cross-Mall access is intentionally denied. Existing data remains unchanged.

## GOLDEN E2E SCENARIOS
GS-09 Cross-Mall denial and GS-10 Tenant isolation are mandatory. Financial/read surfaces also exercise GS-04 Contract→Billing, GS-06 Invoice→Payment, and GS-14 Mixed-currency reporting without changing values. SEC-MALL-001..010 and SEC-TENANT-001..002 cover the exact attack matrix.

## RECONCILIATION
For denied writes, reconcile primary record state and counts for audit logs, notifications, outbox/events, BillingScheduleEntry, Invoice, Payment, SAP logs/queues, and Unit status. For reads/aggregates, assert Mall B identifiers and amounts never appear in Mall A responses or totals.

## ROLLBACK
Revert only CR-120 scoped predicates/resolver wiring/tests/docs. Preserve the earlier CR-119 commits and Security Batch A work. No data rollback is required.

## OPEN BUSINESS QUESTIONS
- **UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** BC-016: CRM `Customer` has no authoritative Mall relationship; whether it is global, assignee-scoped, or Mall-scoped cannot be invented.
- **UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** FINANCE visibility and mutation authority for SAP logs, statistics, reconciliation, entity mappings, and platform-wide manual batch triggers remains explicitly undecided in existing governance.
- Routes blocked by these questions remain `GAP` with an explicit blocker; they are not silently declared safe.

---

## Severity classification
Priority: P0 — Tier 0. MALL-001 was a runtime-proven unauthorized cross-Mall financial mutation; this batch is its platform-wide release gate. Individual new issues follow evidence-based P0/P1/P2 classification.

## Gate results
Pending implementation and verification. Required: route inventory; static ownership trace; focused controller/service tests; HTTP/runtime tests where the repository test environment supports them; zero-side-effect checks; full backend tests; backend TypeScript build/typecheck; `git diff --check`. Frontend is required only if security-facing frontend code changes.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Principal Application Security Engineer | Codex | 2026-09-08 | Audit/remediation execution only; cannot self-approve Tier 0 release |
| Multi-Mall Architect | Required reviewer | — | Pending |
| Security Architect | Required reviewer | — | Pending |
| Finance/Reporting/SAP owners | Required reviewers for owned routes | — | Pending |
