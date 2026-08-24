# 06 — Backbone Consolidation Gate

**Date:** 2026-08-19. Cross-module validation pass after Phases 0-5. Not a
re-audit — focused only on module boundaries, event handoffs, transaction
handoffs, async side effects, retry behavior, state consistency, and
cross-module authorization, per this gate's own scope rule.

## Handoff map

| Source | Trigger | Destination | Sync/Async | Transaction | Retry | Idempotent |
|---|---|---|---|---|---|---|
| Proposal (DRAFT) | `POST /proposals/:id/submit` | ApprovalWorkflow created | Sync | One Serializable tx (Phase 3) | Client retry only (no server-side auto-retry) | Yes — P2002 repair on `ApprovalWorkflow.proposalId @unique` |
| ApprovalStep (last, approved) | In-process, same request | ApprovalWorkflow → APPROVED | Sync | Serializable tx (pre-existing) | N/A | N/A |
| ApprovalWorkflow → APPROVED | `approval.workflow.completed` | Proposal → APPROVED, then `createContractFromProposal` | **Async** (outbox) | Enqueue is atomic with the approval decision; consumption is a separate transaction (Phase 3, unchanged) | Outbox cron, 10s poll, exp. backoff | Yes — idempotency check + P2002 repair |
| Proposal APPROVED (+tenant assigned) | `createContractFromProposal` (event-driven or manual `/convert`) | Contract (DRAFT) created | Sync | Serializable tx (pre-existing, re-verified) | Client retry / event redelivery | Yes — pre-check + in-tx re-check + P2002 repair |
| Contract status → ACTIVE | `PATCH /contracts/:id/status` | `ContractEvent`, outbox enqueue, **Billing schedule generated in the same transaction** | Sync (billing) | **One Serializable tx (Phase 3)** — status + event + outbox + billing schedule | Client retry (idempotent replay) | Yes — P2034 repair + idempotent same-status replay |
| Contract status → ACTIVE | `contract.activated` outbox event | **FitoutProject created — separate, async transaction** | **Async** (outbox) | One Serializable tx for the create itself (Phase 5); **decoupled from the activation transaction** | Outbox cron; **but the consumer's own try/catch swallows errors, so a genuine failure here is never retried** (see finding B below) | Yes — P2002 repair (Phase 5) |
| Invoice generated (DRAFT) | `POST /invoices/:id/issue` or auto-issue in `generateDueInvoices` | Invoice → ISSUED, tenant notification queued | Sync (status), async (email send) | One Serializable tx covers status + notification-queue write (Phase 4); actual SMTP send is out-of-transaction, retryable | Client retry (idempotent replay, Phase 4); email cron 15s poll | Yes, both layers |
| Invoice ISSUED | `POST /invoices/:id/payment` | Payment created, Invoice status recomputed | Sync | Serializable tx + idempotency key (pre-existing gold standard) | Client retry via `Idempotency-Key` | Yes |
| Invoice ISSUED/OVERDUE | `ar-dunning-check` cron (daily) | AR reminder notification | Async (cron) | Not transactional with any invoice write — read-then-notify | 15s email-delivery poll for the send itself; no re-check before send | Yes for the *send* (dedup via `ArDunningLog @@unique`); **no** for the read-then-send window (accepted eventual-consistency gap, `04-BILLING-CONCURRENCY.md` #5) |
| FitoutSubmittal submitted | `POST /fitout-submittals` | ApprovalWorkflow created (`entityType: FITOUT_SUBMITTAL`) | Sync | Serializable tx (pre-existing, shared engine) | Client retry | Not specifically hardened this program (shared engine's own guarantees apply) |
| FitoutSubmittal ApprovalWorkflow → step advances/completes | `approval.workflow.step-advanced`/`.completed`/`.rejected` | `FitoutSubmittal.status` updated, next-approver notified | Async (`completed`/`rejected` via outbox, retried; `step-advanced` via direct emit, **not** retried) | N/A (notification-only for `step-advanced`) | Outbox for 2 of 3 event types | See finding A below |
| FitoutProject status advance | `PUT /fitouts/:id/status` | `Unit.status` (conditional), `FitoutMilestone` ×2, optional gate-override `AuditLog` | Sync | **One Serializable tx (Phase 5)** | Client retry (idempotent replay on exact-match, clear conflict on stale-read, P2034 repair) | Yes |
| FitoutProject → `OPENED` (terminal) | Same `advanceStatus` call, `HANDOVER_FORM`-gated | `Unit.status → OCCUPIED` | Sync, same transaction | Same as above — Handover is not a separate handoff | Same as above | Same as above |

## Cross-module invariants — defined and checked

1. **A Contract created from a Proposal must reference exactly one valid Proposal.** ✅ Enforced by `Contract.proposalId @unique` — verified 0 violations live (`06-BACKBONE-RECONCILIATION.md`).
2. **An ACTIVE Contract must satisfy mandatory Billing readiness.** ✅ Structurally guaranteed for contracts activated *through the app* (Phase 3's atomic transaction) — but **verified NOT universally true in the current dev database**: 12 of 12 seeded ACTIVE/EXPIRING contracts have zero `BillingScheduleEntry` rows, because `prisma/seed.ts` inserts them directly via `prisma.contract.create({ data: { status: ContractStatus.ACTIVE, ... } })`, bypassing `ContractsService.updateStatus()` entirely. **This is a seed-data construction gap, not a code defect** — the invariant holds for every code path that actually runs, but nothing enforces it for data inserted outside the application layer. See `06-BACKBONE-RECONCILIATION.md` for the full evidence and a recommendation.
3. **A Contract requiring Fitout must not silently fail Fitout initialization.** ⚠️ **Partially true.** The *creation* step is now atomic+idempotent (Phase 5), but the outer event-handler boundary (`FitoutService.handleContractActivated`) still only logs a genuine failure — it is never retried, and nothing surfaces it to an operator. See finding B below.
4. **An issued Invoice must belong to a valid Contract/Billing context.** ✅ Verified live — 0 invoices reference a soft-deleted contract; `contractId`/`tenantId` FKs are non-optional at the DB level for the lease-contract path.
5. **A completed Fitout must belong to an active/valid Contract state.** ⚠️ **Not enforced.** `FitoutService.advanceStatus` never reads `Contract.status`. Verified live: 0 current violations (no terminated contracts exist in this dataset with an in-progress fitout), but this is because the data happens not to exercise it, not because the code prevents it. See finding C below.

## Finding A — `step-advanced` re-evaluated at backbone level (per gate section 6)

**Question:** can loss of `step-advanced` create a business-state
inconsistency across Proposal/Contract/Fitout?

**Answer: NO — re-confirmed, not promoted.** Traced both consumers
(`ProposalsService.onApprovalWorkflowStepAdvanced`,
`FitoutSubmittalService`'s equivalent notify-only path): both exclusively
call a notification method. The actual state transition
(`ApprovalStep.status`) already committed, durably, inside
`ApprovalsService.approve()`'s own Serializable transaction *before* this
event is emitted. No downstream consumer mutates Proposal, Contract, or
Fitout state in response to `step-advanced` — only `completed`/`rejected`
do, and those already go through the retried outbox path. Kept as
notification-reliability debt (`RELIABILITY_BACKLOG.md` item 8), not
promoted to a workflow-blocking severity.

## Finding B — Fitout auto-create failure is still a silent, unretried gap (NEW, this gate)

Contract activation and Fitout-project creation are **asymmetric** in a
way worth stating plainly: Billing-schedule generation is *inside* the
activation transaction (fails together, succeeds together — Phase 3).
Fitout-project creation is *outside* it, async via the outbox, and — even
after Phase 5's atomicity fix — a genuine failure inside
`createFromContract` (e.g., zero active `FitoutStageConfig` rows) is
caught by `handleContractActivated`'s try/catch, logged, and **never
retried**, because the throw never propagates back to the outbox
processor. The Contract ends up `ACTIVE` with billing correctly
initialized and Fitout silently missing, with no operator-visible signal
beyond the Contract detail page's existing "Fitout chưa bắt đầu" badge
(which reads as "not started yet," not "failed to start" — a normal-looking
state, not an error state). **Severity: P1** (business workflow can
silently fail, requires an operator to notice the badge and manually
investigate why — no admin repair path exists beyond re-running the
contract-activation event, which isn't exposed anywhere). Not fixed in
this gate (gate scope is validation, not broad feature work) — recorded as
`RELIABILITY_BACKLOG.md` item 15, owned by the Fitout phase's continuation
or a dedicated observability pass.

## Finding C — Fitout stage can advance on a terminated Contract (NEW, this gate)

`FitoutService.advanceStatus` never reads `Contract.status`. Nothing in
the code prevents advancing (or even completing) a fitout project whose
contract has moved to `TERMINATING`/`TERMINATED`. Symmetric to the gap
Phase 4 found and fixed on the Billing side (`buildScheduleForContract`
now requires `ACTIVE`/`EXPIRING`) — the equivalent guard was never added
on the Fitout side. **Severity: P2** (recoverable operational inconsistency, per this gate's
own severity model — nothing fails silently and no manual repair is
required if it never happens; the risk is a terminated tenant's fitout
being allowed to progress toward "handover," which is operationally
nonsensical but not a data-corruption or financial-correctness issue,
since `FitoutProject`/`Contract` are separate tables with no shared
invariant enforced by a DB constraint). Verified 0 current occurrences in live data
(no terminated contracts with fitout projects exist yet in this dataset)
— this is a **code-level gap found by reading `advanceStatus`**, not a
live-data violation. Not fixed in this gate (see rule: gate is validation,
not implementation) — recorded as `RELIABILITY_BACKLOG.md` item 16, and
flagged as the top candidate for Phase 6 or an immediate small follow-up
given how directly it parallels an already-fixed Billing case.

## Billing/Fitout branch independence — verified

Contract → Billing and Contract → Fitout genuinely branch independently
(no shared write, no ordering dependency between them once the contract
is `ACTIVE`). This means the two failure-isolation scenarios in section 9
of the gate brief resolve as follows:
- **Billing succeeds, Fitout fails:** contract is `ACTIVE`, billing
  schedule exists and is fully functional, fitout project missing (Finding
  B). Contract detail's existing handoff badges already surface this
  distinction correctly (see next section) — this was **not** a new gap to
  fix, just to confirm was already handled by Option B's prior work.
- **Fitout succeeds, Billing fails:** **cannot happen** as of Phase 3 —
  billing-schedule generation is inside the same transaction as the
  activation itself, so if it fails, the contract never becomes `ACTIVE`
  at all, and the (async, later) Fitout-creation event never fires either
  (it's triggered by the same `contract.activated` outbox event, which is
  only enqueued once the transaction — including billing — commits).

## Cross-branch health visibility — verified sufficient, no change made

`ContractsService.findOne()` includes `fitoutProject`/`billingSchedule`;
`ContractsPage.tsx` renders both as backend-authoritative status badges
with "View" links (confirmed in Phase 2, re-confirmed unchanged this
gate). This already answers section 10's requirement — no frontend
optimism, no change needed.

## Cross-module authorization — reviewed, no leak found

Compared `role-permissions.ts`'s module role lists directly:
`contracts: [ADMIN, LEASING_MANAGER, MALL_DIRECTOR, FINANCE, LEGAL]`,
`billing: [ADMIN, FINANCE, MALL_DIRECTOR, TENANT]`,
`fitout: [ADMIN, OPERATION, LEASING_MANAGER, MALL_DIRECTOR]`. Notable,
verified-intentional asymmetries: `LEASING_MANAGER` can see Contracts and
Fitout but not Billing; `FINANCE` can see Contracts and Billing but not
Fitout; `LEGAL` can see Contracts only. No role can reach a document type
its module role list excludes — confirmed by re-reading `FilesController`
(Phase 4's own fix already closed the one real gap found there: invoice
documents). No new cross-module authorization leak found this gate.

## Termination cross-module review (section 15's questions, answered from code — not changed)

1. **Future Billing schedule:** `ContractTerminationService` never touches
   `BillingScheduleEntry`. Future `PENDING` rows remain in the table,
   inert — `generateDueInvoices`'s `ACTIVE`/`EXPIRING` filter and Phase
   4's `buildScheduleForContract` guard both prevent them from ever being
   processed once the contract leaves `ACTIVE`/`EXPIRING`.
2. **Issued invoices:** untouched by termination — no automatic
   cancellation/voiding. The existing manual `voidInvoice()` (blocked if
   any active payment or approved adjustment exists) is the only path to
   remove an issued invoice, and it isn't triggered by termination. This
   is documented current behavior, not changed — whether termination
   *should* auto-void future-dated unpaid invoices is a business-policy
   question for the domain owner, not a reliability defect.
3. **Current Fitout:** **can continue advancing** — Finding C above.
4. **Can Fitout continue:** yes, unconditionally, today.
5. **Does termination block stage advance:** no.
6. **Is downstream state visible:** partially — the Contract detail
   handoff badges show Fitout/Billing *readiness*, not termination-vs-fitout
   *conflict*. Not evaluated as a UX gap this gate (UX explicitly out of
   scope).

## Termination invariant regression check

`TERMINATED Contract + new billing schedule generated` — **confirmed still
impossible**, Phase 4's guard re-verified unchanged and covered by its
existing test (`billing-schedule.service.spec.ts`).

`TERMINATED Contract + new Fitout project auto-created` — **also
impossible**, but for a different reason than intended: `createFromContract`
is only ever invoked by the `contract.activated` event, which only fires
on transition *to* `ACTIVE` — a terminated contract can't re-fire that
event through any normal path. Not a designed guard, an incidental one
(no explicit status check exists in `createFromContract` the way Phase 4
added one to `buildScheduleForContract`) — low risk today, but if a future
change ever added a manual "recreate fitout project" admin action (as
Finding B's remediation might reasonably want), it would need its own
explicit status guard, since none exists to reuse.
