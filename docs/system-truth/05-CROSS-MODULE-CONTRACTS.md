# System Truth — 05 — Cross-Module Contracts

## Contract index

| XMOD-xxx | Source | Destination | Trigger | Idempotent? | Transactional? | Confidence |
|---|---|---|---|---|---|---|
| XMOD-001 | Booking | Proposal | `convertToProposal()` direct call | Partial — `$transaction` covers Proposal create + booking status + lead update, but not P2002-hardened like Proposal's own submit/convert paths | Yes (plain `$transaction`) | HIGH |
| XMOD-002 | Proposal | Contract | `createContractFromProposal()` direct call | Yes — P2002 on `Contract.proposalId` unique constraint resolved to existing record | Yes (Serializable) | HIGH |
| XMOD-003 | Contract | Fitout | `contract.activated` outbox event | Yes — P2002 on auto-create resolved by re-fetch | Yes (event durably queued; handler is Serializable) | HIGH |
| XMOD-004 | Contract | Billing (schedule) | `updateStatus(ACTIVE)` direct call, same transaction | Yes — re-running on already-ACTIVE contract replays schedule build idempotently (documented recovery mechanism) | Yes (Serializable, joined) | HIGH |
| XMOD-005 | Approvals | Proposal | `approval.workflow.completed` outbox event | Yes (P2002-guarded on the Proposal side) | Outbox-durable | HIGH |
| XMOD-006 | Approvals | Proposal | `approval.workflow.rejected` plain EventEmitter | Not verified — no outbox durability | **No** — in-memory only, lost on crash before delivery | HIGH (gap confirmed) |
| XMOD-007 | Patrol | WorkOrders | Direct create on ABNORMAL check result | Yes — checks for existing WorkOrder before creating | Not independently verified as transactional with the PatrolCheck write | MEDIUM |
| XMOD-008 | Billing | Parking (write-back) | Direct write of `paidAmount`/`status`/`reconciliationStatus` onto `ParkingMonthlyStatement` | Not verified | Not verified | MEDIUM |
| XMOD-009 | Billing | ServiceContracts (write-back) | Direct write of `transferredToBillingAt`/`billingError` onto `ServiceContractPayment` | Not verified | Not verified | MEDIUM |
| XMOD-010 | ServiceContracts | Billing (invoice create) | `transferPaymentToBilling()` direct call | Yes — P2002 recovery present | Yes (plain `$transaction`, not Serializable) | HIGH — **currency-field bug confirmed** (see `12-FINANCIAL-SEMANTICS.md`) |
| XMOD-011 | Billing | ServiceContracts (invoice create, alternate path) | `createInvoiceFromPending` SERVICE_CONTRACT branch | Yes | Yes (plain `$transaction`) | HIGH — this is a **second, inconsistent implementation** of XMOD-010's same conceptual operation |
| XMOD-012 | Parking | Billing (pending receivables read + invoice create) | `createInvoiceFromPending` PARKING branch | Yes (deterministic invoice number) | Yes (Serializable) | HIGH |
| XMOD-013 | Slots | Billing (pending receivables read + invoice create) | `createInvoiceFromPending` SHORT_TERM_BOOKING branch | Yes | Yes (Serializable) | HIGH |
| XMOD-014 | Sales | Billing (revenue-share calc) | `calculateRevenueShare()` read of `SalesTurnover` | N/A (read-only) | N/A | HIGH — **cross-currency formula risk confirmed**, see `12-FINANCIAL-SEMANTICS.md` |
| XMOD-015 | Booking → Proposal → Contract | Currency propagation | Value carried through `dto.rentCurrency ?? booking.currencyCode ?? 'VND'` at each hop | N/A | N/A | HIGH — **verified correct end-to-end, no gap** |
| XMOD-016 | SAP | Billing/CRM (push) | Manual `POST /sap/sync-*` | Yes — idempotency key = `entityType:entityId:endpoint`, DB-unique-enforced | Not atomic with the source write (SAP log write happens after the external HTTP call resolves) | HIGH |

## Contracts with no failure/retry handling found

- **XMOD-006** (approval rejection event) — no durability; a process crash between the DB commit and event delivery silently drops the notification/side-effect for a rejected proposal. Lower severity than it sounds because the *state change itself* (workflow REJECTED) is committed transactionally — only the downstream *notification* of that rejection to Proposals is at risk, meaning a rejected proposal could be left in a stale status if ProposalsService's `@OnEvent('approval.workflow.rejected')` listener never fires. **Needs confirmation of actual blast radius.**
- **XMOD-010** — currency field silently dropped, not a failure-handling gap but a data-correctness gap with no validation catching it.

## Duplicate-conceptual-contract pairs (worth flagging as its own category)

XMOD-010 and XMOD-011 both implement "turn a ServiceContractPayment into an Invoice" independently, with different invoice-numbering schemes (`SC-${year}-${Date.now()...}` wall-clock-based vs. `SC-PAYMENT-${payment.id}` deterministic) and different currency-field correctness. This is the clearest concrete instance of the "same cross-module contract implemented twice, inconsistently" failure class this governance framework was built to catch.
