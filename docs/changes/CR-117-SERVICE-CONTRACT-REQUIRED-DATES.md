# CR-117 — Required Service Contract effective dates

## CHANGE ID
CR-117

## BUSINESS REASON
Every newly created or renewed Service Contract needs a defined effective period so Operations and Finance can rely on expiry alerts, payment planning, and lifecycle timing. Users also need consistent visual indication of every required form field.

## CURRENT BEHAVIOR
The create form marks `startDate` and `endDate` as HTML-required, but the API DTO accepts both as optional and their asterisks use the nonexistent `text-red` utility. Other required create fields use unstyled text asterisks. The edit form does not require either date. The renew form and DTO require only `endDate`; the service silently falls back to the old contract's end date when `startDate` is absent.

## EXPECTED BEHAVIOR
Create and renew requests require valid `startDate` and `endDate` values at the API boundary. Create, edit, and renew forms require both dates. Every field carrying the HTML `required` attribute in these forms displays the same red asterisk. Existing chronological validation remains in force.

## PRIMARY DOMAIN
Service Contracts.

## AFFECTED JOURNEYS
BP-006 Service-Contract-to-Cash: creation, pre-activation editing, renewal, expiry monitoring, and payment planning consume the contract effective period.

## UPSTREAM IMPACT
Frontend form values and direct API clients provide ISO date strings. The global ValidationPipe applies class-validator DTO rules.

## DOWNSTREAM IMPACT
Service Contract reminders, expiry alerts, detail/list displays, exports, recurring payment planning, and Billing transfer read the effective period. Their logic is checked but not changed; new records become more complete.

## DATA OWNERSHIP IMPACT
Only Service Contracts owns and writes the affected fields.

## STATE MACHINE IMPACT
No status or transition changes. Renewal continues to be restricted to `EXPIRING` and `EXPIRED` contracts.

## FINANCIAL IMPACT
No amount, rate, VAT, invoice, or formula changes. Dates may guide user planning but do not alter existing financial calculations in this change.

## CURRENCY IMPACT
N/A — no currency field, conversion, aggregation, or historical currency inference changes.

## MALL/COMPANY IMPACT
No scope change. Existing Mall access checks remain unchanged.

## TENANT IMPACT
No tenant access or portal behavior change.

## AUTHORIZATION IMPACT
No endpoint, role, Mall resolver, tenant check, or data-access authorization change.

## REPORTING IMPACT
No report formula changes. Future records will consistently contain the dates already displayed/exported.

## TRANSACTION IMPACT
Invalid create/renew requests fail validation before database transactions. Existing create and renew transaction boundaries remain unchanged.

## EVENT/JOB IMPACT
No event/job code changes. Reminder jobs continue reading `endDate`; the new invariant reduces null dates for future records.

## DOCUMENT IMPACT
No uploaded/generated document behavior changes.

## API IMPACT
`POST /api/service-contracts` and `POST /api/service-contracts/:id/renew` now reject missing start/end dates with HTTP 400. The update endpoint remains patch-compatible, while the edit UI requires both dates and the service prevents a successful edit from leaving either effective date null.

## MIGRATION
No schema or data migration. Nullable database columns are retained for backward compatibility with legacy records; the application enforces the invariant on create, edit, and renew paths.

## BACKWARD COMPATIBILITY
Existing rows with null dates remain readable. Opening their edit form requires users to supply both dates before saving. Direct partial updates to a legacy row cannot leave it without an effective period.

## GOLDEN E2E SCENARIOS
Gate 1: DTO tests prove create/renew reject missing dates; service tests prove edit cannot preserve missing dates; frontend tests prove required attributes and red markers in create/edit/renew. Gate 4: authenticated user creates, edits, and renews with valid periods and sees browser validation when either date is empty. BP-006 downstream behavior is checked but unchanged.

## RECONCILIATION
No duplicated monetary/status value. Confirm frontend required fields match API create/renew requirements and effective date ordering remains consistent.

## ROLLBACK
Revert DTO/service date enforcement and the three form required-marker changes. No stored data rollback is needed.

## OPEN BUSINESS QUESTIONS
None. The request explicitly establishes both dates as mandatory for create, edit, and renew.

---

## Severity classification
Priority: P2 — Tier: 1. Effective dates drive operational expiry behavior inside BP-006, but no status transition, financial formula, authorization, or cross-domain write changes.

## Gate results
Gate 1 — PASS: `cd apps/backend && npm test -- service-contract.dto.spec.ts service-contracts.service.spec.ts service-contracts.controller.spec.ts` (3 suites, 19 tests); `cd apps/frontend && npm test -- --run src/pages/service-contracts/ServiceContractsPage.test.tsx` (1 file, 6 tests). Backend and frontend production builds pass; frontend emits only the pre-existing third-party pure-annotation and large-chunk warnings.

Gate 2 — PASS at focused module unit/service/controller level. A real-database write smoke was not run because this change requires no schema/data mutation and should not create disposable business contracts in the shared development database.

Gate 3 — PASS by inspection: BP-006 downstream readers retain the same date field names/types; no Billing transfer response or cross-module contract changed.

Gate 4 — PENDING USER UAT: authenticated browser create/edit/renew flows are not controlled by this agent. DOM tests exercise all three forms, confirming 8/8, 5/5, and 3/3 required-field-to-red-marker parity respectively.

Gate 5 — PASS: DTO and service tests deliberately omit dates and confirm rejection before write; edit of a legacy record with both dates null is also rejected.

Gate 7 — N/A for changed logic: existing guards, roles, Mall validation, and queries are unchanged. The focused controller tests remain green.

Runtime — PASS: backend watch compilation recovered to zero errors and Nest restarted successfully; backend readiness and the live Service Contracts page module return HTTP 200.

Gates 6, 8, and 9 — N/A: no concurrency-sensitive write algorithm, duplicated value, reporting metric, money, or currency logic changed.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Request owner | User | 2026-09-05 | Approved required start/end dates and red required markers for create/edit/renew |
| Implementation agent | Codex | 2026-09-05 | Implemented and verified the scoped Service Contracts validation and form changes; authenticated browser UAT remains for the request owner |
