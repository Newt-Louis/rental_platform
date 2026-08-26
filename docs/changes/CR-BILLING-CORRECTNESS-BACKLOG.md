# CR-BILLING-CORRECTNESS — Currency and remaining-amount correctness backlog

## CHANGE ID
CR-BILLING-CORRECTNESS

## STATUS
BACKLOG — explicitly outside Golden Billing UI implementation authorization.

## BUSINESS REASON
Tier 0 Billing correctness concerns must be investigated and approved independently so a UI program does not silently change invoice currency or payment semantics.

## CURRENT BEHAVIOR
1. Penalty invoice creation does not consistently carry an authoritative currency.
2. Dunning presentation/notifications contain an implicit or hard-coded VND assumption.
3. A frontend payment remaining calculation can differ from the backend-authoritative invoice `balance`.

## EXPECTED BEHAVIOR
UNKNOWN — BUSINESS CONFIRMATION REQUIRED before implementation. Currency provenance, historical behavior, downstream consumers, and authoritative payment-balance semantics must be reconstructed and approved in this CR.

## PRIMARY DOMAIN
Billing / Invoice & Payment, with Collections/Dunning downstream impact.

## AFFECTED JOURNEYS
GS-04, GS-06, GS-11 through GS-15.

## UPSTREAM IMPACT
Potential Contract, Invoice, Payment, Mall currency, and penalty-rule provenance. Must be reconstructed before code.

## DOWNSTREAM IMPACT
Potential invoices, dunning notifications, exports, reports, Dashboard, Tenant Portal, reconciliation, and integrations. Not yet authorized.

## DATA OWNERSHIP IMPACT
Potential Billing-owned invoice/payment data. To be mapped during correctness investigation.

## STATE MACHINE IMPACT
Unknown until investigation; no state change is authorized.

## FINANCIAL IMPACT
Tier 0: invoice currency and remaining balance semantics. No formula or persisted value may be changed under Golden Billing.

## CURRENCY IMPACT
Tier 0: penalty and dunning currency provenance must not default silently to a Mall's current currency or VND.

## MALL/COMPANY IMPACT
Must verify historical currency and Mall scoping independently.

## TENANT IMPACT
Potential tenant-facing invoice/dunning accuracy. No Tenant Portal change authorized.

## AUTHORIZATION IMPACT
Must be verified for every investigated endpoint/job; no authorization change approved.

## REPORTING IMPACT
Potential reconciliation with Dashboard/Reports; not part of Golden Billing implementation.

## TRANSACTION IMPACT
Potential invoice/payment mutation paths; concurrency and retries require a separate design.

## EVENT/JOB IMPACT
Dunning jobs/notifications may be affected. Idempotency and historical retries require analysis.

## DOCUMENT IMPACT
Potential penalty invoices, notices, and exports. No document behavior changed here.

## API IMPACT
Unknown; none authorized.

## MIGRATION
Unknown; none authorized.

## BACKWARD COMPATIBILITY
Historical currency and balance behavior must be reconciled before a correction is proposed.

## GOLDEN E2E SCENARIOS
GS-04, GS-06, GS-11, GS-12, GS-13, GS-14, GS-15.

## RECONCILIATION
Required across invoice, payment, dunning, export, Dashboard, Reports, and Tenant Portal before implementation approval.

## ROLLBACK
To be defined after an implementation design is approved.

## OPEN BUSINESS QUESTIONS
- What is the authoritative currency source for each penalty invoice at creation time?
- Which currency must dunning notices display for mixed-currency receivables?
- Is backend `Invoice.balance` always the sole authoritative remaining amount for every payment state and adjustment path?

---

## Severity classification
Priority: P1 — Tier: 0.

## Gate results
Not started; implementation is not authorized.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Business owner | User | 2026-08-24 | Track separately; exclude from Golden Billing |
