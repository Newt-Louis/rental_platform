# 03 — Change Impact Protocol

## Mandatory rule

> **NO IMPACT MAP → NO IMPLEMENTATION**

Any change beyond a single-file, single-function, purely local fix
requires a completed Change Request with a full Impact Map, produced
*before* implementation begins. The full fillable template is
`docs/change-templates/CR-TEMPLATE.md`; this document defines what each
section means and why it's required.

## Change Request format

```text
CHANGE ID
BUSINESS REASON
CURRENT BEHAVIOR
EXPECTED BEHAVIOR

PRIMARY DOMAIN
AFFECTED JOURNEYS

UPSTREAM IMPACT
DOWNSTREAM IMPACT

DATA OWNERSHIP IMPACT
STATE MACHINE IMPACT
FINANCIAL IMPACT
CURRENCY IMPACT
MALL/COMPANY IMPACT
TENANT IMPACT
AUTHORIZATION IMPACT
REPORTING IMPACT
TRANSACTION IMPACT
EVENT/JOB IMPACT
DOCUMENT IMPACT
API IMPACT

MIGRATION
BACKWARD COMPATIBILITY
GOLDEN E2E SCENARIOS
RECONCILIATION
ROLLBACK
OPEN BUSINESS QUESTIONS
```

## Section-by-section intent

- **CHANGE ID** — `CR-xxx`, unique, referenced in commits/PRs.
- **BUSINESS REASON** — why, in business terms, not "refactor" or "clean
  up." If there isn't a business reason, question whether the change is
  in scope at all.
- **CURRENT BEHAVIOR / EXPECTED BEHAVIOR** — precise enough that a
  functional consultant could confirm or reject it without reading code.
- **PRIMARY DOMAIN** — from `docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`.
- **AFFECTED JOURNEYS** — from `docs/ai-erp-team/04-BUSINESS-PROCESS-CATALOG.md`
  (BP-xxx) and/or Golden Scenarios (GS-xxx).
- **UPSTREAM IMPACT** — what produces the data/state this change consumes;
  could an upstream assumption this change relies on be wrong or change?
- **DOWNSTREAM IMPACT** — every consumer of what this change produces:
  other modules, jobs, reports, exports, notifications, SAP integration.
  This is the section most often under-scoped — walk
  `docs/system-truth-templates/PLATFORM_DEPENDENCY_MATRIX.md` explicitly,
  don't rely on memory.
- **DATA OWNERSHIP IMPACT** — does this change write to data owned by
  another domain? See `docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md` note that
  agent ownership ≠ data ownership.
- **STATE MACHINE IMPACT** — does this add/remove/reorder a status or
  transition? List every module that reads that status.
- **FINANCIAL IMPACT** — does this change a money field, a formula, or
  the inputs to one? List every surface where the resulting number is
  displayed or exported.
- **CURRENCY IMPACT** — mandatory section even when the change looks
  currency-unrelated; see `08-MULTI-CURRENCY-GUARDRAILS.md`.
- **MALL/COMPANY IMPACT** — does this change cross-Mall visibility,
  aggregation, or isolation?
- **TENANT IMPACT** — does this change what a Tenant (portal user) can
  see, do, or is billed for?
- **AUTHORIZATION IMPACT** — new/changed endpoint, query, or job: what
  guard enforces Mall/Tenant/role scoping, and is it tested?
- **REPORTING IMPACT** — Dashboard, Reports, Analytics, Pipeline Stats:
  does the change affect any metric they compute or display?
- **TRANSACTION IMPACT** — does this need to be atomic with something
  else? What happens on partial failure?
- **EVENT/JOB IMPACT** — new/changed outbox events, queued jobs, cron
  jobs; are they idempotent under at-least-once delivery?
- **DOCUMENT IMPACT** — contract PDFs, invoices, exports affected.
- **API IMPACT** — request/response shape changes and who consumes them
  (frontend pages, SAP integration, Tenant Portal).
- **MIGRATION** — schema/data migration needed, and its safety under
  concurrent production traffic.
- **BACKWARD COMPATIBILITY** — what happens to in-flight data/records
  created under the old behavior.
- **GOLDEN E2E SCENARIOS** — which GS-xxx from
  `05-E2E-QUALITY-GATES.md` must still pass; add a new one if the change
  introduces a journey not yet covered.
- **RECONCILIATION** — which duplicated values need to be checked for
  consistency post-change.
- **ROLLBACK** — how to revert if the change is bad in production.
- **OPEN BUSINESS QUESTIONS** — anything unresolved, tagged
  `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` and logged as `BC-xxx` per
  `06-BUSINESS-CONFIRMATION-PROTOCOL.md`.

## When the protocol can be skipped

Only for changes meeting ALL of:

- Single file, single function/component.
- No financial, currency, authorization, or state-machine surface.
- No cross-module consumer.
- Covered by existing tests, or trivially verifiable.

If in doubt, do the Impact Map — the cost of doing it unnecessarily is
far lower than the cost of a locally-correct, globally-wrong change.
