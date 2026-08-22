# System Truth — 08 — Transaction Boundaries

## Well-hardened (positive examples)

| Operation | Atomic? | Evidence |
|---|---|---|
| Booking create/update/cancel/reinstate/expire | Yes — Serializable + P2034 retry (×3) | `booking.service.ts:1034-1051`, wraps booking write + unit-status transition + lead update + activity log |
| Proposal submit() | Yes — Serializable + P2002 idempotent-race resolution | `proposals.service.ts:385-423` |
| Proposal → Contract conversion | Yes — Serializable + P2002 resolution | `proposals.service.ts:677-770` |
| Contract activation | Yes — Serializable, closes a documented prior "ACTIVE with no billing schedule" gap | `contracts.service.ts:393-438` |
| Approvals approve()/reject() | Yes — Serializable, step update + workflow completion + outbox enqueue in one tx | `approvals.service.ts:206-283, 285-331` |
| Fitout advanceStatus() | Yes — Serializable, stale-read rejected, joins UnitStatusService's tx | `fitout.service.ts:195-290` |
| Billing issueInvoice() | Yes — Serializable, idempotent replay | `billing.service.ts:839-859` |
| Billing recordPayment() | Yes — Serializable + P2034 retry ×3, idempotency-key + hash dedupe | `billing.service.ts:1028-1099` |
| Parking addPayment() | Yes — Serializable, balance-check inside tx prevents overpayment race | `parking.service.ts:494-522` |
| Inventory createTransaction() | Yes — Serializable, re-reads item, rejects negative stock | `inventory.service.ts:204-221` |

## Confirmed gaps

| Operation | Atomic? | Gap | Severity |
|---|---|---|---|
| ContractTermination.complete() | Partial | Contract+Termination commit atomically; the subsequent Unit-status release is **outside** the transaction | P1 |
| ContractTermination.initiate() | No | Termination-record upsert and `Contract.status=TERMINATING` are two separate unwrapped writes | P1 |
| Billing createInvoiceFromPending() | Inconsistent | LEASE_CONTRACT/SERVICE_CONTRACT branches use plain `$transaction`; PARKING/SHORT_TERM_BOOKING branches use Serializable — same method, different isolation levels | P2 |
| CRM moveLead()/update() | No | Lead update and Customer status sync are separate, unwrapped writes — a crash between them leaves Lead moved but Customer stale | P2 |
| Sales create()/approveSales()/disputeSales() | No | Turnover write and audit-trail write are two separate sequential `await`s, not wrapped — a crash leaves a turnover record with no audit entry | P2 |
| Slots createBooking()/updateSlotBooking() | No | Conflict-check-then-create is not transactional, no DB unique constraint — **live double-booking race**, not just an audit-trail gap | P1 |
| Work Orders transition()/review() | No | Status update and `WorkOrderEvent` audit write are two separate statements — status itself stays consistent, only the audit trail can go missing | P3 |
| ServiceContracts transferPaymentToBilling() | Partial | Wrapped in plain `$transaction` (not Serializable, unlike Billing's equivalent SERVICE_CONTRACT branch) | P2 (isolation-level inconsistency, not itself a proven bug) |
| Proposals convertToContract() (tenant-less proposal path) | Partial | Tenant+User creation is its own `$transaction`, separate from the subsequent `createContractFromProposal` transaction — two transactions, not one atomic unit; the Contract-creation half is idempotent on retry, the Tenant-creation half is not | P2 |
| Parking generateDueStatementsUnlocked() | No per-item isolation | One contract's failure aborts the whole cron run for other contracts (unlike Billing's scheduler, which has explicit per-contract try/catch) | P2 |
| Analytics occupancy-snapshot / renewal-risk-calc jobs | No per-item isolation | Same pattern — one mall/contract's query failure aborts the whole batch | P2 |
| SAP integration log write | Not atomic with source write | Log write happens after the external HTTP call resolves, in the same async function but not in a DB transaction with any other write | P3 (append-only log, low corruption risk) |

## Pattern observed

Every gap above sits in a module that otherwise **also contains** well-hardened examples elsewhere in the same codebase (Contracts is the best-transacted module for activation but the worst for termination; Billing is Serializable for 2 of 4 invoice-source branches). This suggests transaction discipline was applied **incrementally, operation-by-operation, in response to specific incidents** (per the inline code comments citing `docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md` and `docs/program/02-E2E-WORKFLOW.md`) rather than as a blanket module-level standard — meaning newly-added operations in an already-hardened module cannot be assumed atomic without individually checking. See `ANTI_PATTERNS.md`.
