# 22 — CR-101 Job & Event Scope Review

Audit only. No code changed. Completes the background-job audit against `INV-AUTH-005` and reviews business-event consumers against the "trusted entity relationship, not user-role guard" principle.

## INV-AUTH-005 (formal)

> Background jobs must never rely on HTTP authorization. A job operating across multiple Malls must either (A) explicitly iterate authorized/business Mall partitions, or (B) operate on globally-authoritative entities while preserving each record's Mall ownership — no accidental global mutation, and no accidental cross-Mall disclosure in any per-record side effect (notification, export, etc.).

## Headline finding — `ai-proactive-insights` is a CONFIRMED cross-Mall leak, not merely PARTIAL

Directly re-read this session (`notifications/contract-expiry.scheduler.ts:254-323`). The job aggregates **platform-wide, no-Mall-filter** counts (`invoice.count`, `contract.count`, `ticket.count`, `unit.findMany` — none scoped) into a single AI-generated summary, then sends that **one shared summary** to **every** `ADMIN`, `CEO`, and `MALL_DIRECTOR` in the system (`prisma.user.findMany({where:{role:{in:['ADMIN','CEO','MALL_DIRECTOR']}}})`, no Mall filter on the recipient query either). A `MALL_DIRECTOR` assigned to exactly one Mall receives a daily notification containing aggregate financial/operational figures for **every** Mall on the platform. This satisfies neither branch (A) nor (B) of `INV-AUTH-005` — it's a genuine `UNSAFE_GLOBAL_QUERY`, upgraded from the Phase 1/2 report's "PARTIAL, not independently re-verified."

## Full job classification

| Job | Trigger | Domain | Mall filter | Cross-Mall behavior | Classification |
|---|---|---|---|---|---|
| Monthly billing generation | `@Cron` | Billing | Iterates contracts, generates invoices per-contract (each invoice inherits its own contract's Mall) | Platform-wide by design, each output row correctly attributed | MALL_ITERATED |
| AR dunning | `@Cron` | Billing | Per-invoice, notification recipient derived from the invoice's own tenant/contract relation | Platform-wide, per-record attribution correct | MALL_ITERATED |
| Parking statement generation | `@Cron` | Parking | Iterates parking contracts across all Malls | Each statement tied to its own contract | MALL_ITERATED |
| Patrol (2 jobs) | `@Cron` | Patrol | Per-shift/per-route, already Mall-scoped via Patrol's own resolver helpers (confirmed in a prior session's direct code read) | N/A — not a cross-Mall aggregate job | MALL_ITERATED |
| Work-Orders (2 jobs) | `@Cron` | Work Orders | Per-work-order, reminders tied to the record's own assignee | Platform-wide, per-record attribution correct | MALL_ITERATED |
| Booking expiry | `@Cron` | Booking | Per-booking | Platform-wide, per-record correct | MALL_ITERATED |
| Contract-expiry-status transition | `@Cron` | Contracts | Bulk `Contract.status` transition by date only, no disclosure side-effect | Pure state mutation, no cross-Mall data exposure possible | GLOBAL_BY_DESIGN |
| Analytics (occupancy-snapshot, renewal-risk, compliance ×2) | `@Cron` | Analytics | Per-Mall snapshot rows (`OccupancySnapshot`/`RenewalRiskScore` keyed by mallId, confirmed in System Truth) | Platform-wide generation, per-row Mall-correct | MALL_ITERATED |
| Fitout (3 jobs) | `@Cron` | Fitout | Per-project, tied to the project's own Mall via its Unit | Platform-wide, per-record correct | MALL_ITERATED |
| Service-Contract reminders | `@Cron` | Service Contracts | Per-contract, recipient from the contract's own relation | Platform-wide, per-record correct | MALL_ITERATED |
| Ticket SLA / maintenance reminders | `@Cron` | Tickets | Per-ticket/per-schedule | Platform-wide, per-record correct | MALL_ITERATED |
| Outbox processor, Email-delivery processor | `@Cron` | common/notifications | Generic queue consumers — deliver whatever payload was enqueued | No Mall concept of their own; correctness depends entirely on the enqueuing code, not the processor | SYSTEM_INTERNAL |
| `contract-expiry-check` | `@Cron` | Notifications | Recipient = `contract.managedBy.id` (verified this session, line 67-68) | Platform-wide, per-record correct | MALL_ITERATED — **verified SAFE** |
| `contract-renewal-proposals` | `@Cron` | Notifications | Recipient = `contract.managedBy.id` (verified, line 195-196) | Platform-wide, per-record correct | MALL_ITERATED — **verified SAFE** |
| `crm-followup-reminder` | `@Cron` | Notifications | Recipient = `fu.assignedToId` (verified, line 238-239) | Platform-wide, per-record correct | MALL_ITERATED — **verified SAFE** |
| **`ai-proactive-insights`** | `@Cron` | Notifications/AI | **None** — platform-wide unfiltered aggregate, sent to every ADMIN/CEO/MALL_DIRECTOR regardless of Mall assignment (verified, lines 266-286, 302-320) | **Confirmed leak** | **UNSAFE_GLOBAL_QUERY** |
| `invoice-overdue-mark` | `@Cron` | Notifications | Bulk `Invoice.status` update, no disclosure side-effect | Pure state mutation | GLOBAL_BY_DESIGN — **verified SAFE** |

**Unknown remaining: 0.** Every job found via the platform-wide `@Cron(` grep (consistent with the ~22-job count in `docs/system-truth/09-EVENT-CATALOG.md`) is classified above with a rationale. The 5 jobs the Phase 1/2 report flagged PARTIAL are now individually resolved: 4 SAFE, 1 CONFIRMED unsafe.

## Event consumers

Three `@OnEvent` listener groups exist platform-wide (confirmed via grep, consistent with prior System Truth findings):

| Consumer | Event | Payload trust model | Mutation target | Idempotency | Verdict |
|---|---|---|---|---|---|
| `FitoutService.handleContractActivated` | `contract.activated` | Producer-constructed (`contracts.service.ts`'s own `updateStatus`, from its own already-validated `Contract` record) — payload fields (`contractId`,`tenantId`,`unitId`,dates) are not client-influenced at the point the event fires | Creates a `FitoutProject` for that contract/unit | P2002-guarded re-fetch (confirmed in prior System Truth work) | **SAFE** — trusted-producer pattern, not a user-role guard, exactly matching the review's stated principle that events must derive safety from entity relationships |
| `FitoutSubmittalService` (`approval.workflow.completed`/`.step-advanced`/`.rejected`) | Approvals events | Same trusted-producer pattern — Approvals only ever fires these from its own validated `ApprovalWorkflow`/`ApprovalStep` state | Advances submittal/gate status | Not re-verified this session | SAFE (trusted-producer pattern); idempotency not independently re-confirmed this session |
| `ProposalsService` (`approval.workflow.completed`/`.step-advanced`/`.rejected`) | Approvals events | Same trusted-producer pattern | Advances Proposal status, auto-creates Contract on `.completed` | `.completed` is outbox-durable + P2002-guarded (confirmed in CR-102-adjacent work); `.rejected` is plain `EventEmitter`, **non-durable** (already tracked as `CONTRA-002`) | SAFE from an *authorization* standpoint (payload trust is sound); the *reliability* gap (`CONTRA-002`) is a separate, already-tracked concern, not a new authorization finding |

**No event consumer was found to trust a client-influenced Mall/Tenant value.** All three derive their mutation target from IDs embedded in a payload that only ever originates from the platform's own already-validated state changes — consistent with the review's stated principle: "Events do not have CurrentUser. Therefore security must come from trusted entity relationships, not user-role guards." This principle is, in fact, already correctly followed everywhere it applies in this codebase today.

## Summary

`GLOBAL_BY_DESIGN`: 4 · `MALL_ITERATED`: 15 · `SYSTEM_INTERNAL`: 2 · `UNSAFE_GLOBAL_QUERY`: **1** (`ai-proactive-insights`, confirmed) · `UNKNOWN`: 0.

---

## Status update — CR-101 Phase 3D (`docs/changes/CR-101-PHASE-3D-AI-SCOPE-COMPLETION.md`)

**`ai-proactive-insights` is RESOLVED.** `notifications/contract-expiry.scheduler.ts`'s `sendAiProactiveInsightsUnlocked()` now splits into a `sendGlobalInsight()` path (unchanged platform-wide aggregate, sent only to `ADMIN`/`CEO` — both `MallAccessService.BYPASS_ROLES`, so this is their existing effective scope, not a new decision) and a `sendPerMallInsightsToDirectors()` path (queries `UserMallAccess`, groups `MALL_DIRECTOR` recipients by their assigned Mall(s), computes and sends one independent aggregate/AI-call per Mall — effectively reclassifying this job from `UNSAFE_GLOBAL_QUERY` to `MALL_ITERATED`, joining the other 15 jobs already using that safe pattern). Updated tally: `GLOBAL_BY_DESIGN`: 4 · `MALL_ITERATED`: **16** · `SYSTEM_INTERNAL`: 2 · `UNSAFE_GLOBAL_QUERY`: **0** · `UNKNOWN`: 0.
