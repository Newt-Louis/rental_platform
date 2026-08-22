# System Truth — 17 — E2E Golden Scenarios

Verification of the GS-01..GS-15 baseline (`docs/ai-governance/05-E2E-QUALITY-GATES.md`) against what current code actually supports.

| GS-xx | Currently executable against code? | Notes |
|---|---|---|
| GS-01 Lead → Booking → Proposal → Contract | Yes | Verified end-to-end; note the duplicate pricing-calc divergence between direct-Proposal and Booking-conversion entry points (`01-END-TO-END-BUSINESS-PROCESS.md` BP-001) means this scenario's expected financial state depends on which entry point is used — the Golden Scenario detail should specify both variants. |
| GS-02 Booking concurrency | Yes | Booking module's Serializable+P2034-retry pattern is real and testable. |
| GS-03 Proposal rejection | Yes | Compensating logic (Lead revert, Unit release) confirmed correct. |
| GS-04 Contract → Billing | Yes | Activation→schedule-generation is idempotent and well-transacted; but the currency-mixing bug in `findAllInvoices()` summary means this scenario's "expected financial state" must specify a single-currency test fixture to pass reliably, or the scenario should be split to also exercise the bug. |
| GS-05 Contract → Fitout | Yes | Best-verified scenario in the platform — matches docs exactly. |
| GS-06 Invoice → Payment | Yes | `recordPayment` idempotency-key/hash dedupe confirmed. |
| GS-07 Contract termination | **Partially blocked** | The termination transaction-boundary gap (`08-TRANSACTION-BOUNDARIES.md`) means a failure-injection variant of this scenario (Gate 5) would currently show a real partial-state defect, not a false negative — this scenario should explicitly test the failure path, not just the happy path. |
| GS-08 Fitout → Handover | Yes | Confirmed correct (`OPENED` stage = Unit OCCUPIED, distinct from `APPROVED_TO_OPEN`). |
| GS-09 Cross-Mall denial | **Currently would FAIL for several modules** | Spaces (units), Analytics, Reports, Sales, Parking-Dashboard, Fitout-controls, Fitout-gantt (mutate/delete), AI chat all lack enforcement — a negative-case test hitting these would currently succeed when it should be denied. This is the most important Golden Scenario gap found. |
| GS-10 Tenant isolation | **Partially blocked** | Tickets' `escalations`/`rate`/`rating`/SLA-policy endpoints would fail a negative-case test. Core CRUD (Tickets/Billing/Sales) passes. |
| GS-11 VND lifecycle | Yes | Fully supported across the core chain. |
| GS-12 USD lifecycle where supported | Yes for core leasing chain; **not supported** (no currency field) for Parking/Sales/Slots | Scenario needs to specify "where supported" precisely per `16-MULTI-CURRENCY-SEMANTICS.md`. |
| GS-13 MMK lifecycle where supported | Same as GS-12 | |
| GS-14 Mixed-currency reporting | **Would currently FAIL** | `findAllInvoices()` summary and several reporting aggregates mix currencies or silently exclude non-VND data — this scenario should be added to the active regression suite immediately, not left as an aspirational baseline entry. |
| GS-15 Retry after commit/network loss | Partially yes | Strong for Billing/Booking/Proposal/Contract/Fitout/SAP (P2002/P2034 patterns, SAP circuit breaker); **would FAIL** for Slots booking creation (no idempotency at all) and is **untested** for the non-durable approval-rejection event path. |

## Coverage gaps (consolidated)

| GS-xx | Blocking gap |
|---|---|
| GS-07 | Contract termination not fully atomic |
| GS-09 | Multiple confirmed Mall-scoping gaps (see `15-MULTI-MALL-MULTI-COMPANY.md`) |
| GS-10 | Tickets tenant-isolation gap on 3 endpoints |
| GS-14 | Currency-mixing bugs, confirmed live |
| GS-15 | Slots has no idempotency; approval-rejection event non-durable |

## New scenarios proposed

- **GS-16 — Cross-currency revenue-share invoicing**: exercise `calculateRevenueShare` with a non-VND contract and a `SalesTurnover` record, to make the currently-latent formula-mismatch bug executable and regression-tested.
- **GS-17 — Slot double-booking under concurrency**: two simultaneous booking requests for an overlapping window on the same slot — currently would both succeed (a confirmed bug), should become a permanent regression test once fixed.
- **GS-18 — Reporting mall-scoping negative case**: a Mall-A-restricted user hitting Reports/Analytics endpoints without a `mallId` param, asserting the response is restricted to their accessible malls — currently would fail, should be added as a permanent regression gate once fixed.

Both new scenarios and the coverage-gap notes above should be incorporated into `docs/ai-governance/05-E2E-QUALITY-GATES.md`'s baseline once P1/P3 program-board work (see `SYSTEM_TRUTH_EXECUTIVE_SUMMARY.md`) begins.
