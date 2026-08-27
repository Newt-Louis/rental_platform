# 06 — Cross-Module Contract (XMOD) Risk Review

Classification of all 16 XMOD contracts from `docs/system-truth/05-CROSS-MODULE-CONTRACTS.md`. Two are analyzed in depth per this review's instruction (prioritized, not automatically "fixed" — business criticality assessed first).

## Priority analysis 1 — XMOD-006 (`approval.workflow.rejected`, plain EventEmitter, non-durable)

**Classification: NON-DURABLE.**

**Business criticality assessment (before recommending any fix)**: What actually depends on this event firing?
- `ProposalsService`'s `@OnEvent('approval.workflow.rejected')` listener sets `Proposal.status = REJECTED`, reverts the Lead to NEGOTIATION, and releases the Unit if uncommitted (per `docs/system-truth/01-END-TO-END-BUSINESS-PROCESS.md` BP-001/BP-003 findings — not re-read line-by-line this session, carried forward).
- **If this event is lost** (process crash between the Approvals transaction commit and event delivery): the `ApprovalWorkflow`/`ApprovalStep` rows are already correctly committed as REJECTED (that part is transactional and durable, per `05-CROSS-MODULE-CONTRACTS.md` XMOD contract detail) — only the **downstream** Proposal/Lead/Unit state update is at risk of never happening. This would leave a Proposal stuck in SUBMITTED/UNDER_REVIEW status indefinitely, with its Unit potentially still held, even though the approval workflow itself correctly shows REJECTED.
- **Recovery path**: none automatic — no reconciliation job checks for a REJECTED `ApprovalWorkflow` whose linked Proposal is not REJECTED. This would require manual detection (a support ticket, or a human noticing a "stuck" proposal).

**Recommendation, not a fix**: This qualifies as a genuine reliability gap with a plausible, if narrow, operational impact (a proposal silently stuck rather than data corrupted). It does **not** automatically warrant "switch EventEmitter to Outbox" as a reflexive fix — the correct question, per this review's instruction, is whether crash-timing-window event loss is a realistic risk at current deployment scale/frequency of rejections, versus the cost of adding outbox durability (moderate — the pattern already exists and is proven for the `.completed` sibling event). **Recommended path**: route `.rejected` through the same `OutboxService` mechanism as `.completed`, since the infrastructure already exists and the asymmetry itself (two branches of one workflow having different reliability guarantees) is an architecture smell independent of how often rejections actually occur. This is a **FIN/EVT-class fix, low complexity, no schema change** — appropriate for an early implementation wave. See `EVT-01` in `08-ROOT-CAUSE-CLUSTERS.md`.

## Priority analysis 2 — ServiceContracts → Billing (XMOD-010 / XMOD-011 pair)

**Classification: CURRENCY-RISK, and separately NON-IDEMPOTENT-INCONSISTENT (two different idempotency schemes for the same operation).**

**Business criticality assessment**: This is not a reliability question (both paths are individually transactional and each guards against duplicate invoice creation within itself) — it is a **correctness** question with two independent defects:
1. **Currency-risk**: `ServiceContractsService.transferPaymentToBilling()` omits `Invoice.currencyCode`, silently defaulting to VND regardless of the payment's actual currency. This is live-reachable from the Service Contracts UI's own "transfer to billing" action — not a rare code path.
2. **Duplicate-implementation risk**: the same conceptual operation exists twice with different invoice-numbering schemes (`SC-${year}-${Date.now()...}` wall-clock-based, vs. `SC-PAYMENT-${payment.id}` deterministic). Two teams/features touching "transfer a service-contract payment to billing" independently is itself evidence the boundary between Billing and ServiceContracts for this specific operation was never clearly assigned to one owner.

**Recommendation, not a fix**: The two paths should be consolidated to one implementation (Billing's `createInvoiceFromPending` SERVICE_CONTRACT branch is the currency-correct one and should become the sole path; `ServiceContractsService.transferPaymentToBilling()` should call it rather than reimplementing). This is a **CUR-01 + FIN-01 combined fix** — currency correctness and duplicate-implementation elimination are the same underlying change here. See `08-ROOT-CAUSE-CLUSTERS.md`.

## Full classification — all 16 XMODs

| XMOD-xxx | Contract | Classification |
|---|---|---|
| XMOD-001 | Booking → Proposal | SAFE (transactional, partially idempotent) |
| XMOD-002 | Proposal → Contract | SAFE (Serializable, P2002-idempotent) |
| XMOD-003 | Contract → Fitout (event) | SAFE (outbox-durable, P2002-idempotent) |
| XMOD-004 | Contract → Billing (schedule) | SAFE (Serializable, replay-idempotent) |
| XMOD-005 | Approvals → Proposal (`.completed`) | SAFE (outbox-durable) |
| XMOD-006 | Approvals → Proposal (`.rejected`) | **NON-DURABLE** (see above) |
| XMOD-007 | Patrol → WorkOrders | AUTHORIZATION-RISK: N/A (internal trigger, no external actor) — reclassify as **UNKNOWN** for transactional atomicity with the PatrolCheck write (not independently verified either session) |
| XMOD-008 | Billing → Parking (write-back) | UNKNOWN (transactional atomicity not independently verified) |
| XMOD-009 | Billing → ServiceContracts (write-back) | UNKNOWN (same) |
| XMOD-010 | ServiceContracts → Billing (`transferPaymentToBilling`) | **CURRENCY-RISK, NON-IDEMPOTENT-INCONSISTENT** (see above) |
| XMOD-011 | Billing → ServiceContracts (`createInvoiceFromPending`) | SAFE in isolation, but paired with XMOD-010's inconsistency |
| XMOD-012 | Parking → Billing | SAFE (Serializable, deterministic invoice numbering) |
| XMOD-013 | Slots → Billing | SAFE for the Billing side; **the Slots side itself is NON-ATOMIC** (see P0-verification-adjacent finding: `CONTRA-015`, slot double-booking — not an XMOD defect per se, but the upstream data this XMOD reads can already be corrupted by the time it runs) |
| XMOD-014 | Sales → Billing (revenue-share read) | **CURRENCY-RISK** (see `01-P0-VERIFICATION.md` P0-003) |
| XMOD-015 | Booking → Proposal → Contract (currency propagation) | SAFE — verified correct end-to-end, both this session and the prior pass |
| XMOD-016 | SAP push | SAFE for idempotency/retry mechanics (circuit breaker, idempotency-key); **NON-DURABLE for retry automation** (manual-trigger only, see `docs/system-truth/09-EVENT-CATALOG.md`) — reclassify as **AUTHORIZATION-RISK: N/A**, correctly **NON-DURABLE for the retry/reconciliation loop specifically**, not for the push itself |

## Summary

Of 16 XMODs: **10 SAFE**, **2 CURRENCY-RISK** (XMOD-010, XMOD-014), **2 NON-DURABLE** (XMOD-006, XMOD-016's retry loop), **1 NON-IDEMPOTENT-INCONSISTENT** (XMOD-010, same as its currency-risk classification), **3 UNKNOWN** (XMOD-007, 008, 009 — transactional atomicity not independently verified in either research pass; recommended as a follow-up investigation, not assumed safe by default). No XMOD was found to have a pure AUTHORIZATION-RISK classification distinct from the broader `AUTH-01` cluster.
