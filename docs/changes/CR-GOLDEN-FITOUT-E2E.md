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
- New Change Orders inherit the Fitout Project Contract's authoritative,
  immutable `currencyCode`; client currency is not authoritative and an
  unavailable Contract currency blocks creation instead of defaulting to VND.
  A legacy matching currency field remains compatible, while a supplied value
  that differs from the Contract currency is rejected to prevent silent monetary
  reinterpretation.
- Limit SLA escalation, submittal approvers and staff selections to active
  users with active access to the project's Mall. Active ADMIN is the only
  global Fitout exception. CEO requires ordinary active Mall access and TENANT
  is never a staff recipient.
- Require adjacent-only stage advancement. Only ADMIN/MALL_DIRECTOR may bypass
  unmet document gates, always with a non-empty reason. OPERATION,
  MALL_DIRECTOR and ADMIN may perform ordinary adjacent advancement.
- Restrict global stage, gate, SLA and form-type configuration mutations to
  ADMIN. Manager/owner/assignee/distribution selections must validate the
  approved target role and active project-Mall access before persistence.
- Give TENANT read access only to its own Fitout project Overview/Documents and
  allow create/upload/resubmit only for its own submittals. TENANT cannot
  configure, assign, advance, override, approve, publish or access staff-only
  workspaces. Attachment mutation is limited to the current SUBMITTED/IN_PROGRESS
  revision; REJECTED must be resubmitted first and terminal revisions remain
  immutable under the existing approval lifecycle. Upload finalization must
  atomically re-check both the submittal revision and owning workflow after
  external storage I/O, and must remove the saved blob when that finalization
  loses a concurrent approval/rejection race.
- Make Risk/Change Order numbering and terminal Change Order decisions safe
  under concurrent writers without changing visible numbering or decisions.
- Make submittal attachment finalization reject concurrent terminal workflow
  decisions without leaving an orphaned stored file.
- Enforce same-project ownership for Contractor/Worker, Issue Unit, Daily
  Report contractor and Gantt parent/dependency/contractor references.
- Complete dense Golden Fitout presentation/localization, responsive rendering,
  accessibility, error/loading/empty states and action hierarchy using existing
  ERP components and routes.
- Preserve all other state, financial, approval and document semantics.

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
auto-create source. The approved 2026-08-25 policy makes the source Contract's
immutable `currencyCode` authoritative for every new Fitout Change Order.

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

Stage definitions, Unit triggers, document gates, checklist semantics and issue
semantics are unchanged. Forward-only validation is tightened to the next
adjacent active stage. Non-adjacent skipping is rejected. Only
ADMIN/MALL_DIRECTOR may override an unmet document gate, with a mandatory reason;
ordinary adjacent advance is limited to OPERATION/MALL_DIRECTOR/ADMIN.

## FINANCIAL IMPACT

No amount, approval calculation or cost sign rule changes. The unsafe summary
is presentation/aggregation corrected from bare cross-currency totals to exact
per-currency groups. No FX, rounding or implicit consolidation is introduced.

## CURRENCY IMPACT

READ/DISPLAY/CALCULATION/CREATE surfaces are affected. Persisted
`FitoutChangeOrder.currency` remains authoritative for existing records. New
records inherit the project Contract's immutable `currencyCode`; the client
cannot choose or default currency. Tests must prove inheritance, no
mixed-currency sum and lossless Decimal transport/formatting. Unsupported
legacy currency codes must retain their exact raw code and decimal amount in
presentation rather than being rounded through a supported-currency formatter.

## MALL/COMPANY IMPACT

Aggregate reads must be constrained to accessible Mall IDs through
`FitoutProject.unit.mallId` (with existing authoritative resolver conventions).
ADMIN keeps the existing documented bypass. Fitout staff recipients and target
users require active project-Mall access, except active ADMIN. CEO remains
ordinary Mall-scoped in Fitout because CR-101 grants CEO cross-Mall read only to
other explicitly opted-in oversight domains. TENANT isolation remains
service-level by authenticated `tenantId`. No Company model is introduced.

## TENANT IMPACT

Tenant Fitout project/detail visibility remains server-forced through the
authenticated Tenant relation. TENANT receives own-project Overview/Documents
reads and own-submittal create/upload/resubmit only. Every Tenant route must
prove project/submittal tenant ownership at the service layer; MallAccess's
TENANT bypass is not sufficient. All staff/config/stage/approval/publish actions
remain denied.

## AUTHORIZATION IMPACT

Existing aggregate and nested-resource routes receive stricter
data-query/parent-child enforcement and negative tests. Configuration writes
are ADMIN-only; ordinary stage advance is OPERATION/MALL_DIRECTOR/ADMIN; gate
override is ADMIN/MALL_DIRECTOR with a reason. Assignment targets must be active
OPERATION users with active project-Mall access. Risk owners, issue assignees
and submittal distribution/approver targets likewise require an authoritative
staff role plus active project-Mall access. UI hiding is never authorization.

## REPORTING IMPACT

Fitout dashboard/progress aggregates become Mall-scoped. Platform Dashboard,
Reports and Analytics formulas are unchanged and checked for regression.

## TRANSACTION IMPACT

Risk/Change Order sequence allocation and terminal Change Order decision use a
transaction and bounded retry on unique/serialization conflicts. Existing
stage-transition transactions are unchanged.

## EVENT/JOB IMPACT

SLA and submittal recipient queries become project-Mall scoped, with active
ADMIN as the only global Fitout recipient exception. Distributed locking, job
ledger, event names, payloads and idempotent email keys remain unchanged.

## DOCUMENT IMPACT

Existing Fitout document/submittal/photo routes and storage paths remain.
Parent ownership is tested; no upload/version behavior or PDF/export format
changes.

## API IMPACT

Routes remain stable. Change-order create stops accepting client currency as
authoritative, rejects a supplied mismatch, accepts a matching legacy value and
returns the Contract-inherited persisted currency. Fitout
cost summary receives an additive per-currency representation; unsafe bare totals are retained only when
the record set has one authoritative currency, otherwise explicitly null.
Frontend consumers are updated together. No external integration consumer was
found.

## MIGRATION

N/A — no schema, migration or data rewrite.

## BACKWARD COMPATIBILITY

Existing persisted projects, stages, documents and change orders remain valid.
Legitimately scoped callers are unaffected except that non-adjacent stage skips,
unauthorized role targets, non-ADMIN configuration writes, client-selected
Change Order currency mismatches, terminal/rejected attachment mutations and
Tenant staff actions are now rejected. Cross-project
ID substitution and cross-Mall aggregate/recipient access returns filtered or
denied results.

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

## BUSINESS DECISIONS

Approved by the business owner on 2026-08-25 (`APPROVE RECOMMENDED FITOUT
POLICY`):

- **BC-FIT-001 RESOLVED:** inherit immutable Contract `currencyCode`; no implicit
  VND and no client-selected currency.
- **BC-FIT-003 RESOLVED:** recipients require active project-Mall access; active
  ADMIN is the only global exception under existing CR-101 scope policy.
- **BC-FIT-004 RESOLVED:** adjacent-only advancement.
- **BC-FIT-005 RESOLVED:** config ADMIN-only; advance
  OPERATION/MALL_DIRECTOR/ADMIN; override ADMIN/MALL_DIRECTOR with mandatory
  reason; selection targets enforce the authoritative role and active
  project-Mall access. Operation-manager assignment specifically targets active
  OPERATION users. Other target fields retain their existing authoritative role
  semantics and add active project-Mall enforcement; no new role is invented.
- **BC-FIT-006 RESOLVED:** TENANT own-project Overview/Documents and own-submittal
  create/upload/resubmit only; no staff/config/stage/approval/publish capability.
- Checklist/issues remain non-gating because backend System Truth proves that
  behavior; changing it would require a separate business CR.

---

## Severity classification

Priority: P0 (cross-Mall confidentiality is the worst plausible failure) —
Tier 0 authorization overlay / Tier 2 Fitout implementation.

## Gate results

- Approved-policy implementation gate completed on 2026-08-25.
- Backend focused Fitout + unified-file authorization: 9 suites / 139 tests
  PASS, including Mall/Tenant negative cases, currency inheritance/mismatch,
  adjacent stages, role matrix and approval-versus-upload race cleanup.
- Backend full suite: 106 suites / 739 tests PASS.
- Frontend focused Fitout: 4 files / 24 tests PASS, including role capabilities,
  Tenant actions, Contract currency payload/presentation and unsupported legacy
  currency precision.
- Frontend full suite: 48 files / 280 tests PASS.
- Backend build: PASS. Frontend TypeScript + production build: PASS.
- Docker production images rebuilt; database, Redis, backend and frontend are
  healthy on localhost. HTTP frontend and API health smoke checks: PASS.
- `git diff --check`: PASS (line-ending notices only).
- Independent BA/Architecture/Security adversarial reviewer: PASS — no
  remaining P0/P1/P2 in the Fitout-only diff.
- Rendered viewport gate: NOT EXECUTED because the in-app browser runtime had
  no browser backend available. This is recorded as verification debt, not an
  engineering blocker; human visual review remains required before UI closure.

## Sign-off

| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| BA / Fitout Functional | Business owner + `fitout_ba_architect` | 2026-08-25 | APPROVED / PASS |
| Solution / Multi-Mall Architect | Codex `/root` | 2026-08-25 | APPROVED — EXISTING CR-101 ADMIN/CEO/TENANT SCOPE SEMANTICS PRESERVED |
| Security Architect | `fitout_backend_security` | 2026-08-25 | PASS — MALL/TENANT/ROLE/CONCURRENCY POLICY VERIFIED |
| Implementation | Codex ERP Team | 2026-08-25 | COMPLETE — TECHNICAL GATE PASS |
| Adversarial / QA | `fitout_frontend_qa` + `fitout_ba_architect` | 2026-08-25 | PASS — NO REMAINING P0/P1/P2; HUMAN VISUAL GATE PENDING |
