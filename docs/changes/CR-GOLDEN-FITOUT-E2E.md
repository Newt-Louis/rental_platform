# CR-GOLDEN-FITOUT-E2E — Golden Fitout end-to-end completion

## CHANGE ID

CR-GOLDEN-FITOUT-E2E

## BUSINESS REASON

Fitout is the operational handoff from an active lease Contract to an opened,
occupied Unit. Operators need one Golden workspace whose project, field,
schedule, document and cost context is trustworthy within the user's Mall
scope. The current candidate UI is strong, but confirmed adjacent endpoints
can expose all-Mall aggregates, accept child IDs from another project and
produce an authoritative-looking mixed-currency cost total.

## CURRENT BEHAVIOR

- Contract activation idempotently creates one Fitout Project and first
  milestone. The config-driven, forward-only pipeline and Unit side effects are
  atomic and already authoritative.
- The Golden Fitout worklist/detail presentation is implemented but has not
  completed current rendered and human final gates.
- global progress/dashboard reads do not apply accessible-Mall filters;
- some nested Contractor/Worker/Daily Report/Gantt writes authorize a parent
  project but do not prove submitted child IDs belong to that project;
- Fitout change summary adds persisted amounts without grouping currency;
- Fitout master-configuration mutations inherit all Fitout operational roles;
- sequential number generation for Risks/Change Orders races on `count + 1`;
- change-order creation still defaults an omitted currency to VND;
- the project transition accepts any later configured stage, not only the next
  adjacent stage; existing documentation does not establish whether this is a
  deliberate skip capability.

## EXPECTED BEHAVIOR

- Preserve Contract→Fitout→OPENED business semantics, document gates,
  checklist/issue non-gating semantics, API routes and database schema.
- Apply authoritative accessible-Mall scope to aggregate/project worklists.
- Reject every nested child/reference ID that does not belong to the already
  authorized Fitout Project.
- Return exact change-order money grouped by persisted currency; never expose a
  mixed-currency sum or invent FX.
- Preserve global configuration and override roles pending BC-FIT-005.
- Make Risk/Change Order numbering and terminal Change Order decisions safe
  under concurrent writers without changing visible numbering or decisions.
- Enforce same-project ownership for Contractor/Worker, Issue Unit, Daily
  Report contractor and Gantt parent/dependency/contractor references.
- Complete dense Golden Fitout presentation/localization, responsive rendering,
  accessibility, error/loading/empty states and action hierarchy using existing
  ERP components and routes.
- Quarantine unresolved creation-currency and stage-skip semantics rather than
  silently changing them.

## PRIMARY DOMAIN

Fitout (Tier 2), with Tier 0 authorization and money/currency overlays.

## AFFECTED JOURNEYS

- BP-003 Contract-to-Fitout-to-Handover
- BP-013 Multi-Mall Operations
- GS-05 Contract → Fitout
- GS-08 Fitout → Handover
- GS-09 Cross-Mall denial
- GS-10 Tenant isolation
- GS-11/12/13/14 currency lifecycle and mixed-currency reporting
- GS-15 retry after commit/network loss

## UPSTREAM IMPACT

Contract `ACTIVE` and its durable `contract.activated` event remain the only
auto-create source. Contract currency is readable upstream but is not adopted
as Fitout change-order currency without BC-FIT-001 approval.

## DOWNSTREAM IMPACT

Unit transitions to `UNDER_FITOUT` and `OCCUPIED`, Fitout SLA notifications,
Unified Documents, Dashboard readers and Fitout UI/API adapters are checked.
No downstream formula, Contract, Billing, Invoice, Report or Dashboard behavior
is modified by this CR.

## DATA OWNERSHIP IMPACT

Only Fitout-owned tables are involved.
Unit writes continue exclusively through `UnitStatusService`. Notifications
continue through the existing Notifications/Email Delivery services.

## STATE MACHINE IMPACT

None. Stage definitions, ordering, forward-only validation, override behavior,
document gates, Unit triggers, checklist semantics and issue semantics are
unchanged. Stage skipping remains quarantined pending BC-FIT-004.

## FINANCIAL IMPACT

No amount, approval calculation or cost sign rule changes. The unsafe summary
is presentation/aggregation corrected from bare cross-currency totals to exact
per-currency groups. No FX, rounding or implicit consolidation is introduced.

## CURRENCY IMPACT

READ/DISPLAY/CALCULATION surfaces are affected. Persisted
`FitoutChangeOrder.currency` remains authoritative for existing records.
CREATE remains UNKNOWN under BC-FIT-001. The CR must prove no mixed-currency sum
and preserve Decimal precision in API and UI formatting.

## MALL/COMPANY IMPACT

Aggregate reads must be constrained to accessible Mall IDs through
`FitoutProject.unit.mallId` (with existing authoritative resolver conventions).
ADMIN keeps the existing documented bypass. Recipient selection remains
unchanged pending BC-FIT-003. No Company model or new cross-Mall role policy is
introduced.

## TENANT IMPACT

Tenant Fitout project/detail visibility remains server-forced through the
authenticated Tenant relation. No new Tenant write capability is introduced.

## AUTHORIZATION IMPACT

Existing aggregate and nested-resource routes receive stricter
data-query/parent-child enforcement and negative tests. Configuration and gate
override roles remain unchanged pending BC-FIT-005. UI hiding is not treated as
authorization.

## REPORTING IMPACT

Fitout dashboard/progress aggregates become Mall-scoped. Platform Dashboard,
Reports and Analytics formulas are unchanged and checked for regression.

## TRANSACTION IMPACT

Risk/Change Order sequence allocation and terminal Change Order decision use a
transaction and bounded retry on unique/serialization conflicts. Existing
stage-transition transactions are unchanged.

## EVENT/JOB IMPACT

N/A — SLA recipient selection, distributed locking, job ledger, event names,
payloads and idempotent email keys remain unchanged pending BC-FIT-003.

## DOCUMENT IMPACT

Existing Fitout document/submittal/photo routes and storage paths remain.
Parent ownership is tested; no upload/version behavior or PDF/export format
changes.

## API IMPACT

Routes and request DTOs remain compatible. Fitout cost summary receives an
additive per-currency representation; unsafe bare totals are retained only when
the record set has one authoritative currency, otherwise explicitly null.
Frontend consumers are updated together. No external integration consumer was
found.

## MIGRATION

N/A — no schema, migration or data rewrite.

## BACKWARD COMPATIBILITY

Existing persisted projects, stages, documents and change orders remain valid.
Legitimately scoped callers are unaffected. Cross-project ID substitution and
cross-Mall aggregate access begins returning filtered results.

## GOLDEN E2E SCENARIOS

GS-05, GS-08, GS-09, GS-10, GS-11–15 as listed above. Focused failure,
concurrency and negative-authorization cases supplement the available fixture
and rendered gates.

## RECONCILIATION

- Fitout Project stage and Unit status at `FITOUT_IN_PROGRESS`/`OPENED`;
- one Fitout Project per active Contract;
- every nested Contractor/Worker/Task/Report/Issue reference belongs to its
  parent project;
- change-order summaries equal exact per-currency persisted rows;
- Mall-scoped aggregate counts equal the accessible project set.

## ROLLBACK

Revert the Fitout-only checkpoint. No migration rollback or data transformation
is required. Authorization rollback is not recommended because it would reopen
confirmed isolation defects.

## OPEN BUSINESS QUESTIONS

- **BC-FIT-001 — UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** must new Fitout
  change orders inherit immutable Contract currency, require explicit currency,
  or remain deliberately VND-defaulted?
- **BC-FIT-003 — UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** should SLA
  escalation and submittal-role recipients remain global-role recipients or be
  limited to users with explicit access to the project's Mall?
- **BC-FIT-004 — UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** may an authorized
  operator deliberately skip from the current Fitout stage to any later stage,
  or must advancement be strictly adjacent?
- **BC-FIT-005 — UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** are global stage,
  gate, SLA and form-type configuration mutations ADMIN-only or also available
  to MALL_DIRECTOR, which roles may advance/override stages, and what role/Mall
  constraints apply to manager/owner/assignee/distribution selections?
- **BC-FIT-006 — UNKNOWN — BUSINESS CONFIRMATION REQUIRED:** should the Tenant
  portal remain read-only at project/detail level, or expose stage progress,
  timeline and document submission? The current backend intentionally excludes
  TENANT from stage-configuration reads and staff-only document mutations, while
  the redesign target describes broader Tenant capability; repository evidence
  therefore does not authorize expanding Tenant routes or permissions.
- Checklist/issues remain non-gating because backend System Truth proves that
  behavior; changing it would require a separate business CR.

---

## Severity classification

Priority: P0 (cross-Mall confidentiality is the worst plausible failure) —
Tier 0 authorization overlay / Tier 2 Fitout implementation.

## Gate results

- System Truth / impact / architecture / security review: PASS for the provable
  scope; BC-FIT-001/003/004/005/006 remain explicitly quarantined.
- Backend focused Fitout: 6 suites / 69 tests PASS.
- Backend full suite: 104 suites / 705 tests PASS.
- Frontend focused Fitout presentation: 1 file / 9 tests PASS.
- Frontend full suite: 44 files / 268 tests passed; two unrelated tests timed
  out under the parallel full run, then both files passed independently (2
  files / 6 tests). No Fitout regression.
- Backend build: PASS. Frontend TypeScript + production build: PASS.
- Docker production images rebuilt; database, Redis, backend and frontend are
  healthy on localhost. HTTP frontend and API health smoke checks: PASS.
- `git diff --check`: PASS (line-ending notices only).
- Independent adversarial reviewer: PASS — no remaining P0/P1/P2 in the
  Fitout-only diff.
- Rendered viewport gate: NOT EXECUTED because the in-app browser runtime had
  no browser backend available. This is recorded as verification debt, not an
  engineering blocker; human visual review remains required before UI closure.

## Sign-off

| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| BA / Fitout Functional | `fitout_ba_architect` | 2026-08-24 | APPROVED — PROVABLE SCOPE ONLY |
| Solution / Multi-Mall Architect | `fitout_ba_architect` | 2026-08-24 | APPROVED — NO STATE/SCHEMA/RECIPIENT/CONFIG POLICY CHANGE |
| Security Architect | `fitout_backend_security` | 2026-08-24 | APPROVED — ENUMERATED SCOPE; BC-FIT-001/003/004/005 EXCLUDED |
| Implementation | Codex `/root` | 2026-08-24 | IMPLEMENTED — PROVABLE SCOPE ONLY; FINAL GATES PENDING |
| Adversarial / QA | `fitout_frontend_qa` + `fitout_ba_architect` | 2026-08-24 | PASS — NO REMAINING P0/P1/P2 IN PROVABLE SCOPE |
