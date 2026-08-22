# 11 — Implementation Waves

Priority order per this review's mandate: SECURITY → DATA/FINANCIAL INTEGRITY → AUTHORIZATION → E2E PROCESS CORRECTNESS → RELIABILITY → REPORTING → UX → TECHNICAL CLEANUP, with dependency order (`09-REMEDIATION-DEPENDENCY-GRAPH.md`) overriding strict severity ordering where the two conflict.

## WAVE 0 — Immediate, out-of-band (pre-dates formal wave sequencing)

- **Objective**: Close the confirmed, zero-dependency, zero-business-ambiguity defects that don't require waiting for any BC confirmation.
- **CRs**: CR-102 (currency-mixing bugs — the two confirmed live P0/P0-adjacent defects), the TECH-01 dead-cron-file deletion sub-item of CR-108 (removes a live crash risk for any future refactor).
- **Domains**: Billing.
- **Dependencies**: None.
- **Risk**: Low.
- **Expected invariants restored**: INV-002 (no mixed-currency SUM) for the two confirmed instances.
- **Required tests**: Unit tests asserting `findAllInvoices` summary correctly excludes/buckets non-VND invoices; a currency-consistency guard test for `calculateRevenueShare`.
- **Required Golden Scenarios**: GS-14 added to active regression.
- **Required reconciliation**: Confirm `findAllInvoices` summary matches `getArAging` totals per currency post-fix.
- **Exit criteria**: Both confirmed bugs have a merged, tested fix; GS-14 passes in CI.

## WAVE 1 — Security + Data/Financial Integrity (combined, per dependency override)

- **Objective**: Close the AUTH-01 architectural gap and begin CUR-01's structural work, since AUTH-01 is both the highest-severity cluster and gates correct scoping for several other waves' reporting fixes.
- **CRs**: CR-101 (Mall-scoping architectural fix).
- **Domains**: Spaces, Analytics, Reports, Sales, Parking-Dashboard, Fitout (controls/gantt/daily-report), AI, CRM, Files.
- **Dependencies**: BC-009, BC-013, BC-017, BC-020 should be confirmed during this wave (in parallel with design/implementation start, not strictly before) to finalize rollout scope.
- **Risk**: Medium — phased rollout required to avoid breaking any undetected legitimate cross-mall usage.
- **Expected invariants restored**: INV-007.
- **Required tests**: Negative-case (Gate 7) tests for every route listed in `03-MALL-AUTHORIZATION-ARCHITECTURE.md`'s MISSING cells.
- **Required Golden Scenarios**: GS-09 extended to explicitly enumerate every previously-gapped route.
- **Required reconciliation**: N/A (authorization fix, not a data-consistency fix).
- **Exit criteria**: MALL_AUTHORIZATION_COVERAGE_MATRIX shows zero MISSING cells for READ/CREATE/UPDATE/DELETE/DOCUMENT ACCESS across all domains; Gate 7 tests pass for every previously-gapped route.

## WAVE 2 — Authorization completion + E2E Process Correctness + Reliability (combined, per dependency override — these are independent of each other and of Wave 1's remaining rollout, so run in parallel within this wave)

- **Objective**: Finish AUTH-01's Reports/Analytics/AI rollout (sequenced after Wave 1's core guard fix per the dependency graph); fix the core-leasing-chain duplicate-calculation defect; fix the transaction-boundary and currency-schema gaps that don't require Wave 1 to complete first.
- **CRs**: CR-103 (currency fields, pending BC-004/005 — start the confirmation process at the beginning of this wave, not at the end), CR-105 (durable events + SAP automation), CR-106 (duplicate pricing-calc consolidation), CR-107 (transaction boundary hardening).
- **Domains**: Sales, Parking, Slots, Billing, Approvals, Proposals, SAP, CRM, Booking, Contracts.
- **Dependencies**: CR-103 depends on BC-004/BC-005; CR-105/106/107 have no blocking dependencies and can start immediately at Wave 2's start.
- **Risk**: Medium (schema migration for CR-103 and CR-107's Slots constraint).
- **Expected invariants restored**: INV-001, INV-002 (fully, once CR-103 lands), INV-005, INV-010.
- **Required tests**: Concurrency test for Slots double-booking (two simultaneous requests, assert only one succeeds); atomicity failure-injection test for Contract termination; unit tests for the consolidated pricing-calc function.
- **Required Golden Scenarios**: GS-01 (extended), GS-07 (failure-injection variant), GS-12/13 (extended to Sales/Parking/Slots), new GS-16, GS-17.
- **Required reconciliation**: One-time data check for existing overlapping Slot bookings before the DB constraint lands.
- **Exit criteria**: All CR-103/105/106/107 tests pass; no existing data violates the new Slots constraint (or violations are remediated first).

## WAVE 3 — Reporting

- **Objective**: Consolidate canonical financial semantics now that currency-bucketing (Wave 1/2) and Mall-scoping (Wave 1) are in place for the consuming reports.
- **CRs**: CR-104.
- **Domains**: Billing (canonical owner), Dashboard, Reports, Analytics, AI.
- **Dependencies**: Wave 1 (Mall-scoping) and Wave 2 (currency-bucketing) should be substantially complete before this wave starts, per `09-REMEDIATION-DEPENDENCY-GRAPH.md`.
- **Risk**: Medium — verify the canonical formula's correctness thoroughly before 4+ consumers depend on it (a bug here would now affect every consumer at once, versus today's independent-but-isolated bugs).
- **Expected invariants restored**: Establishes the mechanism to prevent future INV-002-class reporting violations.
- **Required tests**: Cross-consumer consistency test (same period/mall/currency scope, same figure, across Dashboard/Reports/Analytics/AI).
- **Required Golden Scenarios**: New cross-consumer consistency scenario (see CR-104).
- **Required reconciliation**: Permanent reconciliation check added per `docs/system-truth/18-SYSTEM-INTEGRITY-CHECKS.md`.
- **Exit criteria**: All 4+ consumers call the canonical service; the reconciliation check passes continuously for a defined soak period before being considered stable.

## WAVE 4 — UX / Technical Cleanup

- **Objective**: Low-risk, no-user-facing-urgency items.
- **CRs**: Remainder of CR-108 (dead enum removal, documentation corrections).
- **Domains**: Governance docs, Proposals/Approvals schema.
- **Dependencies**: None.
- **Risk**: Very low.
- **Expected invariants restored**: None new — pure cleanup.
- **Required tests**: Standard regression only.
- **Required Golden Scenarios**: None new.
- **Required reconciliation**: N/A.
- **Exit criteria**: Governance docs corrected; dead code removed; no regressions.

## Explicit note on parallelization

Waves 0 and 1 should begin immediately and in parallel (different teams/root-causes, zero shared dependency). Wave 2's four CRs are themselves independent of each other and can be parallelized within the wave. Wave 3 is the only wave with a hard sequencing dependency on prior waves' completion (not just start) — do not begin CR-104 implementation until Wave 1/2's relevant sub-scopes (Mall-scoping for Reports/Analytics/AI; currency-bucketing for Billing) are merged, per the dependency graph.
