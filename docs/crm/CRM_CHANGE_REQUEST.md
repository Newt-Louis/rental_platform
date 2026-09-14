# CR-121 / CR-CRM-BUSINESS-EVENT-001 — CRM lifecycle integrity, activity history, and KPI correctness

## CHANGE ID

CR-121 (repository sequence) / CR-CRM-BUSINESS-EVENT-001 (business-event workstream alias)

## STATUS

IMPLEMENTED IN WORKTREE FOR VERIFICATION — production release and commit remain unapproved pending the architecture and functional review required for a P1/Tier 1 cross-domain change. Safe fallbacks are applied; this document does not self-approve deployment.

## BUSINESS REASON

Leasing staff and managers need one trustworthy account of who contacted a prospect, who moved an opportunity, why it moved, and what happened downstream. Current CRM screens can omit early Lead activity, lifecycle changes are not represented as immutable business events, and several management KPIs infer history from current snapshots. This prevents reliable coaching, accountability, stale-lead handling, and pipeline analysis.

## CURRENT BEHAVIOR

- `LeadActivity` and `POST /crm/leads/:id/activities` exist, but Lead detail renders `customer?.activities`; a Lead without a Customer profile cannot add or see activity in the primary UI (`apps/frontend/src/pages/crm/CrmPage.tsx:582,1017-1029`).
- Lead status is written independently by CRM move/update/bulk/automation, Customer status synchronization, Booking, and Proposals (`apps/backend/src/modules/crm/crm.service.ts:171-219,362-448,621-627,907-927`; cross-module paths are inventoried in `CRM_IMPACT_MAP.md`). These paths do not share one lifecycle validator or one business-event writer.
- `CrmService.update()` guards entry to WON, while `moveLead()`, bulk status update, Customer-to-Lead sync, and direct cross-module writes do not apply that same guard (`apps/backend/src/modules/crm/crm.service.ts:362-377,171-219,621-627`; `apps/backend/src/modules/crm/customers.service.ts:333-353`).
- Deal Timeline projects current Booking/Proposal/Approval/Contract state onto creation dates. It omits Lead activity actors and individual approval decisions/comments (`apps/backend/src/modules/crm/crm.service.ts:1207-1361`).
- Follow-up records do not retain creator/completer, completion result, cancellation, or change history; the business delete endpoint physically deletes the row (`apps/backend/prisma/schema.prisma:3134-3149`; `apps/backend/src/modules/crm/crm.service.ts:528-569`).
- Pipeline conversion and close-time metrics are derived from current Lead counts and `updatedAt`, not historical transitions (`apps/backend/src/modules/crm/crm.service.ts:700-724,790-793`).
- Stale detection reads `Lead.lastActivityAt`, but the primary Lead UI records Customer activity, which does not update that projection (`apps/backend/src/modules/crm/crm.service.ts:460-473,880-902`; `apps/backend/src/modules/crm/customers.service.ts:370-384`).
- The Pipeline Stats consumer selects `byLeaseTerm.*`, then reads fields that are only present at the response root, producing false zeroes and potentially `NaN%` (`apps/frontend/src/pages/pipeline-stats/SalesPipelineStatsPage.tsx:106-167,287-335`; `apps/backend/src/modules/crm/crm.service.ts:795-875`).
- Auto-assignment rules are hard-coded and not Mall-scoped configuration (`apps/backend/src/modules/crm/crm.service.ts:930-975`).

## EXPECTED BEHAVIOR

- A Lead can record and display contact activity before it is linked to a Customer. Linking later preserves one event identity and does not duplicate history.
- Every Lead status write uses one lifecycle service, one authorization-aware context, and one atomic append-only event write. LOST, backward, and reopen transitions require a reason. All entry paths to WON enforce the same existing Proposal precondition.
- Automation is represented as SYSTEM with an explicit source, never as a human actor.
- Follow-ups retain creator, assignee, completer/canceller, result/reason, and append-only change events. Normal business APIs cancel rather than physically delete.
- Timeline returns stable, paginated real events with actor, occurred time, before/after, reason/outcome, provenance, and valid source links. Approval decisions use actual `decidedAt`, approver, and comment.
- Current distribution, historical conversion, activity/productivity, and time-performance metrics are distinct contracts. Historical metrics expose coverage and return `null`/`INSUFFICIENT_DATA` rather than fabricated zeroes.
- Stale uses meaningful contact for the specific Lead. Customer activity only refreshes a Lead when that Lead is explicitly identified.
- Configuration that is safe to externalize is Mall-scoped and audited; lifecycle stages remain code-defined until a separate state-machine design approves dynamic stages.

## PRIMARY DOMAIN

CRM — Leasing Functional Consultant. Cross-domain reviewers: Workflow Architect, Reporting Architect, Security Architect, Multi-Mall Architect, and the functional owners of Booking, Proposals, Approvals, and Contracts.

## AFFECTED JOURNEYS

- BP-001 / GS-01 — Lead → Booking → Proposal → Approval → Contract.
- BP-011 — Management reporting.
- GS-09 — cross-Mall denial for all new event/timeline/KPI endpoints.
- GS-14 — mixed-currency reporting; no cross-currency aggregation may be introduced.
- GS-15 — retry after commit/network loss and idempotent event persistence.
- Proposed GS-19 — Lead activity before Customer linkage; link without loss/duplication.
- Proposed GS-20 — lifecycle event atomicity, retry, and concurrency across every Lead writer.
- Proposed GS-21 — CRM KPI cohort/coverage/timezone correctness and Pipeline Stats contract.

## UPSTREAM IMPACT

- User identity and `UserMallAccess` provide human actor and Mall scope.
- Lead is the authoritative opportunity and carries `mallId`; Customer currently has no Mall ownership field (BC-016).
- Booking, Proposal, Approval, and Contract remain owners of their own records and timestamps; CRM must not rewrite those entities to create timeline history.
- Existing outbox/idempotency/Serializable-transaction patterns are reused where asynchronous projection or cross-module publication is required.

## DOWNSTREAM IMPACT

- CRM and Customer 360 UI, Deal Pipeline, CRM Overview, Pipeline Stats.
- Booking and Proposal direct Lead writers.
- Approval decision projection into CRM timeline.
- Contract source navigation and terminal lifecycle visibility.
- Dashboard/Reports/Analytics/AI consumers that read Lead status or CRM metrics must be checked; they are not silently migrated to new formula semantics.
- Notifications using follow-up/stale data must be reconciled before enabling automated status mutation.
- SAP reads CRM customer/lead data but is not changed by the proposed event model; checked-only unless an API contract is discovered during implementation.

## DATA OWNERSHIP IMPACT

- CRM owns Lead, Customer, CRM business events, and follow-ups.
- Booking/Proposals currently write Lead directly. CR-121 must route status transitions through an explicit CRM lifecycle boundary or a transaction-capable CRM helper; it must not make CRM write Booking/Proposal/Approval/Contract state.
- Approval remains the source of decision actor/comment/time. CRM timeline consumes it or records an idempotent reference event; it does not copy editable approval truth into a second mutable source.

## STATE MACHINE IMPACT

No new Lead status is proposed. Existing statuses remain `NEW, CONTACTED, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST`. CR-121 centralizes guards and records transitions. Exact adjacency beyond the required WON/LOST/backward/reopen policies is PROPOSED and requires functional review; it must not be inferred from enum order.

## FINANCIAL IMPACT

No financial amount or formula is changed. CRM pipeline and Proposal value display are affected reporting surfaces. Amounts remain grouped by currency; no FX engine or combined cross-currency total is introduced.

## CURRENCY IMPACT

Lead and Proposal values retain their stored currencies. KPI APIs must return currency buckets or an explicit currency scope. Historical events may reference amount snapshots only with an explicit currency. Legacy unknown currency remains `UNKNOWN`, never defaulted to VND.

## MALL/COMPANY IMPACT

- Lead events are Mall-scoped by the Lead's persisted `mallId`, never a client-only Mall ID.
- There is no Company model.
- Customer-only event scope is blocked by BC-016 because Customer has no `mallId`. No new endpoint may broaden current Customer visibility while this remains unresolved.

## TENANT IMPACT

No Tenant Portal capability is added. Internal comments remain inaccessible to Tenant-role users. Source links must re-authorize the target entity rather than relying on timeline visibility.

## AUTHORIZATION IMPACT

- New Lead event reads reuse `assertLeadAccess`; writes reuse `assertLeadEditAccess` and validate the persisted Lead Mall.
- Customer 360 aggregation must intersect each linked Lead with the caller's accessible Mall set and must not leak events from inaccessible Leads.
- New configuration endpoints require ADMIN or the existing Mall configuration administration role after review.
- Negative cross-Mall and comment-visibility tests are mandatory.

## REPORTING IMPACT

CRM Overview and Pipeline Stats contracts change. Snapshot distribution remains available under an honest name. Historical conversion/time/activity endpoints require date range, timezone/cutoff, scope, and coverage metadata. Existing consumers receive a compatibility window; deprecated misleading fields are not silently redefined.

## TRANSACTION IMPACT

- Audited mutation + CRM event + synchronous projections commit or roll back together.
- Transition reads the current row inside a Serializable transaction so `fromStatus` cannot be stale.
- Idempotency/deduplication keys prevent duplicate events on retry.
- Proposed bulk status behavior is atomic for a bounded batch; review is required before changing the existing partial/opaque semantics.

## EVENT/JOB IMPACT

- Add append-only CRM business events and optional outbox publication in the source transaction.
- Auto-LOST must default to dry-run/disabled until meaningful-contact coverage and Mall configuration are verified.
- Consumers and projection rebuilds must be idempotent and observable.

## DOCUMENT IMPACT

No contract PDF, invoice, or existing export format is changed in the initial implementation. Future CRM KPI exports must use the same canonical query service and coverage metadata.

## API IMPACT

- Add paginated timeline/event reads and Lead-first activity creation.
- Add reason/idempotency inputs to transition/follow-up mutations while keeping a compatibility path for non-risky legacy calls.
- Replace Pipeline Stats' ambiguous shape with a stable typed shape for every lease term. Missing metrics are `null` with a reason/coverage, never zero-filled.
- Existing `GET /crm/leads/:id/timeline` may be versioned or adapted without returning inferred snapshots as historical events.

## MIGRATION

Additive schema migration only. No historical actor/status/time backfill from `createdAt`/`updatedAt`. A separate idempotent dry-run importer may import only strongly evidenced AuditLog records, with provenance/confidence and imported/skipped/unknown/conflict counts. See `CRM_MIGRATION_RUNBOOK.md` after implementation review.

## BACKWARD COMPATIBILITY

- Existing LeadActivity/CustomerActivity rows remain readable as LEGACY records.
- Existing follow-ups map `isDone=true` to COMPLETED and `isDone=false` to OPEN until the new status is fully adopted.
- Deprecated KPI fields stay present only during a documented compatibility window and retain old semantics/labels; new historical fields are separate.

## GOLDEN E2E SCENARIOS

GS-01, GS-09, GS-14, GS-15 and proposed GS-19/20/21. Required failure variants include event-write failure, network retry after commit, two concurrent transitions, cross-Mall event access, and identical-timestamp pagination.

## RECONCILIATION

- Lead current status equals the terminal status produced by ordered transition events after the reliable coverage start.
- `lastMeaningfulContactAt` equals the maximum qualifying event occurrence for that Lead.
- CRM Overview, CRM Analytics, and Pipeline Stats show identical scoped current-distribution counts.
- Historical WON/LOST/time-to-win calculations reconcile to transition events, never `updatedAt`.
- Proposal counts/value reconcile to Proposal source rows by Mall, lease term, and currency.

## ROLLBACK

Disable new UI and KPI/event read paths via feature flags; keep additive tables and events intact. Restore legacy read contracts without deleting business events. Code rollback must remain compatible with added nullable columns/tables. No destructive migration rollback is the default.

## OPEN BUSINESS QUESTIONS

- BC-016 — Customer Mall ownership and visibility remains open and blocks safe Customer-only event scoping.
- BC-030 — future event ownership for legacy/new Leads whose `mallId` is null remains open; a required `CrmBusinessEvent.mallId` cannot be populated by inference without an approved rule.
- Exact allowed adjacency for non-WON Lead transitions requires Leasing Functional Consultant confirmation.
- Internal-comment visibility by manager/role requires Security + Functional confirmation.
- Whether the existing manual auto-LOST operation should remain available after dry-run support requires Functional confirmation.

## Severity classification

Priority: P1 — Tier: 1. It spans Tier 1 lifecycle domains, state consumed cross-module, reporting consumers, and Mall authorization. Per governance, implementation requires Chief ERP Architect + Leasing Functional Consultant review, plus the overlays listed above.

## Gate results

Wave 0 documentation: VERIFIED by direct code inspection on 2026-09-12. Disposable-database verification is tracked separately; test results do not replace reviewer sign-off.

Required discovery outputs A–H are complete in `CRM_LIFECYCLE_MATRIX.md`,
`CRM_IMPACT_MAP.md`, `CRM_KPI_DICTIONARY.md`, and
`CRM_BUSINESS_EVENT_MODEL.md`. Production implementation, including Phase A,
remains blocked by the sign-off table below under the repository's P1/Tier 1
governance rule.

## Sign-off

| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Chief ERP Architect | — | — | PENDING |
| Leasing Functional Consultant | — | — | PENDING |
| Workflow Architect | — | — | PENDING |
| Reporting Architect | — | — | PENDING |
| Security / Multi-Mall Architect | — | — | PENDING |
