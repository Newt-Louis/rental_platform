# CR-GOLDEN-BILLING — Golden Billing implementation

**GOLDEN BILLING:** CLOSED

**HUMAN VISUAL SIGN-OFF:** PASS — 2026-08-24

**Technical gate:** PASS

## CHANGE ID
CR-GOLDEN-BILLING

## BUSINESS REASON
Billing operators need a dense, auditable invoice workspace where exact amounts and currencies are unambiguous, the invoice worklist is the primary surface, and exports preserve financial meaning.

## CURRENT BEHAVIOR
The Billing screen is fragmented across decorative summaries and a non-authoritative workflow strip. Some secondary tables abbreviate money or omit a separate currency column. The invoice export omits currency, does not expose all active filters, and silently caps rows. The detail sheet uses a rigid desktop width.

## EXPECTED BEHAVIOR
The screen follows Command Header → compact Financial Attention Strip → unified Filter Bar → dominant Invoice Worklist → contextual Invoice Detail Sheet. Financial tables and exports use raw numeric amounts with an explicit currency. Export truncation is disclosed. Statuses and actions come only from the existing invoice status model.

## PRIMARY DOMAIN
Billing / Invoice & Payment.

## AFFECTED JOURNEYS
GS-04 Billing generation, GS-06 payment processing, GS-09/GS-10 Mall and Tenant isolation, GS-11 through GS-15 financial and currency correctness.

## UPSTREAM IMPACT
Reads existing Contract, Tenant, Mall, Service Contract, Parking, and Short-term Leasing references. No upstream ownership, calculation, eligibility, or lifecycle behavior changes.

## DOWNSTREAM IMPACT
Billing UI and XLSX invoice export change. Dashboard, Reports, Tenant Portal, SAP integration, e-invoice behavior, notifications, jobs, and other domain screens are checked but not changed.

## DATA OWNERSHIP IMPACT
No writes to another domain. Export and worklist remain read-only views of Billing-owned invoices and existing source references.

## STATE MACHINE IMPACT
None. Only DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, and CANCELLED from the authoritative `InvoiceStatus` model may drive presentation and actions.

## FINANCIAL IMPACT
Presentation/export only. No amount, balance, allocation, tax, rounding, or invoice-generation formula changes. Backend `balance` remains authoritative in payment presentation.

## CURRENCY IMPACT
VND, USD, and MMK values remain separate. Tables and export contain separate Amount and Currency fields. No FX or cross-currency aggregation is introduced. Currency-specific decimal precision is preserved.

## MALL/COMPANY IMPACT
Existing Mall query scoping remains mandatory. No cross-Mall aggregation or visibility expansion.

## TENANT IMPACT
No Tenant Portal behavior or tenant authorization change. Tenant/contract context becomes clearer only for already-authorized Billing operators.

## AUTHORIZATION IMPACT
No new permission. Any additive export filters continue through the existing Mall-scoped Billing controller/service query path.

## REPORTING IMPACT
None. Dashboard, Reports, Analytics, and pipeline metrics are not changed.

## TRANSACTION IMPACT
None. UI reads and XLSX generation add no mutation or transaction boundary.

## EVENT/JOB IMPACT
None. No event, job, retry, or idempotency behavior changes.

## DOCUMENT IMPACT
Invoice XLSX export adds explicit Currency, preserves numeric amount cells, reflects supported active filters, and exposes row-count/truncation metadata. Invoice PDFs are unchanged.

## API IMPACT
Additive only: supported Billing export query filters and response metadata headers may be added. Existing endpoints, request fields, response fields, and consumers remain compatible. No API is removed or reinterpreted.

## MIGRATION
N/A — no schema or data migration.

## BACKWARD COMPATIBILITY
Existing invoices and in-flight records are unchanged. Existing export callers still receive an XLSX body; new headers are optional metadata.

## GOLDEN E2E SCENARIOS
GS-04, GS-06, GS-09, GS-10, GS-11, GS-12, GS-13, GS-14, and GS-15 must remain valid. UI verification also covers invoice discovery, detail review, allowed action visibility, exact money display, export currency, and disclosed truncation.

## RECONCILIATION
For sampled invoices, worklist total/paid/balance, detail total/paid/balance, and exported numeric values/currency must match the backend invoice. Mixed currencies must never be summed into a single unlabeled total.

## ROLLBACK
Revert the Billing frontend, locale, export service/controller, tests, and these documents together. No data rollback is needed.

## OPEN BUSINESS QUESTIONS
None in authorized Golden Billing scope. Penalty/dunning currency and payment remaining mismatch are recorded in `CR-BILLING-CORRECTNESS-BACKLOG.md` and are not authorized for correction here.

---

## Severity classification
Priority: P1 — Tier: 0 (financial presentation/export; no financial calculation change).

## Gate results
- Focused backend Billing: PASS — 9 suites, 53 tests.
- Full backend: PASS — 91 suites, 598 tests.
- Focused frontend Billing + currency: PASS — 2 files, 6 tests.
- Full frontend: BASELINE FAIL — 2 unrelated files, 10 failures (`permissions.test.ts` and `BookingsPage.test.tsx`); 33 files and 214 tests pass. Golden Billing focused tests pass.
- TypeScript / production builds: PASS for frontend and backend.
- Docker production rebuild: PASS; frontend and backend respond HTTP 200 and backend is healthy.
- `git diff --check`: PASS.
- Rendered viewport review: PASS — human review approved the final rendered Golden Billing UI after the final density, hierarchy, action, and color-discipline polish.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Business owner | User | 2026-08-24 | Implementation authorized with stated scope exclusions |
| Human visual reviewer | User | 2026-08-24 | PASS — Golden Billing approved and closed |
