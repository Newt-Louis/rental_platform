# CR-xxx — [Short Title]

> Copy this file, assign the next `CR-xxx` number, fill every section.
> No section may be deleted; write "N/A — [reason]" if genuinely
> inapplicable. See `docs/ai-governance/03-CHANGE-IMPACT-PROTOCOL.md` for
> what each section means and why it's required.

## CHANGE ID
CR-xxx

## BUSINESS REASON
(Why, in business terms. Not "refactor" or "cleanup.")

## CURRENT BEHAVIOR
(Precise enough for a Functional Consultant to confirm without reading code.)

## EXPECTED BEHAVIOR
(Same standard.)

## PRIMARY DOMAIN
(From `docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`.)

## AFFECTED JOURNEYS
(BP-xxx from `docs/ai-erp-team/04-BUSINESS-PROCESS-CATALOG.md` and/or
GS-xxx from `docs/ai-governance/05-E2E-QUALITY-GATES.md`.)

## UPSTREAM IMPACT
(What this change depends on; could an upstream assumption be wrong?)

## DOWNSTREAM IMPACT
(Every consumer: modules, jobs, reports, exports, notifications, SAP.
Walk `docs/system-truth-templates/PLATFORM_DEPENDENCY_MATRIX.md`
explicitly.)

## DATA OWNERSHIP IMPACT
(Does this write to data owned by another domain?)

## STATE MACHINE IMPACT
(New/changed/removed status or transition; every reader of that status.)

## FINANCIAL IMPACT
(Money field/formula touched; every surface where the result is shown.)

## CURRENCY IMPACT
(Mandatory even if seemingly unrelated. See
`docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md`.)

## MALL/COMPANY IMPACT
(Cross-Mall visibility, aggregation, or isolation effects.)

## TENANT IMPACT
(What a Tenant Portal user can see/do/is billed for.)

## AUTHORIZATION IMPACT
(Guard/scoping for every new/changed endpoint, query, job.)

## REPORTING IMPACT
(Dashboard/Reports/Analytics/Pipeline Stats metrics affected.)

## TRANSACTION IMPACT
(Atomicity needs; partial-failure behavior.)

## EVENT/JOB IMPACT
(New/changed events/jobs; idempotency under at-least-once delivery.)

## DOCUMENT IMPACT
(Contract PDFs, invoices, exports affected.)

## API IMPACT
(Request/response shape changes and every consumer.)

## MIGRATION
(Schema/data migration needed; safety under concurrent production traffic.)

## BACKWARD COMPATIBILITY
(What happens to in-flight data/records created under prior behavior.)

## GOLDEN E2E SCENARIOS
(Which GS-xxx must still pass; new GS-xx added if this introduces an
uncovered journey.)

## RECONCILIATION
(Which duplicated values need post-change consistency checks.)

## ROLLBACK
(How to revert in production.)

## OPEN BUSINESS QUESTIONS
(Any `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` item, logged as `BC-xxx`
via `docs/change-templates/BC-TEMPLATE.md`.)

---

## Severity classification
Priority: P0 / P1 / P2 / P3 — Tier: 0 / 1 / 2 / 3
(Per `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`.)

## Gate results
(Filled in during implementation — Gate 1 through Gate 9 per
`docs/ai-governance/05-E2E-QUALITY-GATES.md`.)

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
