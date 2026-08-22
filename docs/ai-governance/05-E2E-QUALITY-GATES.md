# 05 — E2E Quality Gates

Every change with a financial, authorization, state-machine, or
cross-module surface must pass through these gates in order. A change
that only reaches Gate 1 is not "done" — it is unverified beyond its own
module.

## Gate 1 — Unit / build / typecheck

Standard build, typecheck, and unit tests pass. This proves the code
compiles and the units behave as their own tests expect. It proves
nothing about cross-module correctness.

## Gate 2 — Module integration

The module's own integration tests (service + repository + real/local DB)
pass, including any new tests added for this change.

## Gate 3 — Cross-module contracts

Every `XMOD-xxx` contract (`docs/change-templates/XMOD-TEMPLATE.md`,
catalog in `docs/system-truth-templates/05-CROSS-MODULE-CONTRACTS.md`)
touched by this change is re-verified: inputs, guaranteed outputs,
idempotency, and failure behavior still hold.

## Gate 4 — Golden E2E

The relevant Golden Scenario(s) below pass end-to-end, not just at the
API layer where the journey is user-facing.

## Gate 5 — Failure injection

Deliberately fail a step (network loss, DB error, downstream 500) at each
point the change introduces and confirm the system fails safely: no
partial financial state, no silently lost event, a visible error or
retry.

## Gate 6 — Concurrency

Deliberately race the change against itself (two concurrent bookings for
one slot, two concurrent invoice-generation runs) and confirm no
double-write, double-charge, or lost update.

## Gate 7 — Authorization

Confirm the change is denied for a user outside the correct Mall/Tenant/
role scope, not just permitted for a user inside it. A test that only
proves "the right user can" without proving "the wrong user can't" has
not verified authorization.

## Gate 8 — Reconciliation

Every value from the CR's RECONCILIATION section matches across all
surfaces that display it (module UI, Dashboard, Reports, exports).

## Gate 9 — Reporting / financial consistency

Any metric in Dashboard/Reports/Analytics affected by this change is
re-verified against its formula definition in
`docs/ai-erp-team/07-ERP-FINANCIAL-MODEL.md` and
`docs/system-truth-templates/12-FINANCIAL-SEMANTICS.md`.

---

## Golden Scenario baseline (permanent)

These are the fixed regression baseline. New Golden Scenarios may be
*added* as the platform grows; these are not removed without an ADR.

```text
GS-01  Lead → Booking → Proposal → Contract
GS-02  Booking concurrency
GS-03  Proposal rejection
GS-04  Contract → Billing
GS-05  Contract → Fitout
GS-06  Invoice → Payment
GS-07  Contract termination
GS-08  Fitout → Handover
GS-09  Cross-Mall denial
GS-10  Tenant isolation
GS-11  VND lifecycle
GS-12  USD lifecycle where supported
GS-13  MMK lifecycle where supported
GS-14  Mixed-currency reporting
GS-15  Retry after commit/network loss
```

Full fillable detail for each scenario (actors, preconditions, steps,
expected state, failure variants) lives in
`docs/system-truth-templates/17-E2E-GOLDEN-SCENARIOS.md` once populated,
using `docs/change-templates/GS-TEMPLATE.md` as the per-scenario format.
Any new Change Request that introduces a journey not covered above must
add a new `GS-xx` entry rather than skip E2E coverage.
