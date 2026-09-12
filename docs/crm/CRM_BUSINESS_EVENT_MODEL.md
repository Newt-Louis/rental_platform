# CRM business event model

Status: DESIGN COMPLETE, IMPLEMENTATION BLOCKED pending CR-121 / CR-CRM-BUSINESS-EVENT-001 sign-off and open business confirmations.

## Purpose and authority

`CrmBusinessEvent` is the append-only business ledger for CRM facts. It
answers who acted, what changed, when the business action occurred, why it
happened, which module/entity caused it, and what result was recorded.

It does not replace the generic HTTP `AuditLog`, Booking/Proposal/Approval/
Contract source records, or the outbox. `AuditLog` is best-effort request
telemetry; source-domain records remain authoritative for their own state; the
outbox is transport. A CRM event is durable business evidence committed with
the authoritative mutation.

## Proposed persisted shape

No Prisma migration is approved yet. The reviewed implementation should add
the repository equivalent of:

| Field | Proposed type / rule |
|---|---|
| `id` | `String @id @default(cuid())` |
| `leadId` | required for Lead lifecycle/activity events; relation to `Lead` |
| `customerId` | nullable reference only; linking never copies an event |
| `mallId` | required authoritative ownership for new events; never accepted from an unvalidated client payload |
| `eventType` | `CrmEventType` enum |
| `occurredAt` | business instant supplied/derived by the authoritative action; never `updatedAt` |
| `recordedAt` | immutable ingestion time, default `now()` |
| `actorUserId` | nullable relation to `User`; required when `actorType=USER` |
| `actorType` | `USER` or `SYSTEM` enum |
| `sourceModule` | enum or constrained vocabulary (`CRM`, `CUSTOMER`, `BOOKING`, `PROPOSAL`, `APPROVAL`, `CONTRACT`, `AUTOMATION`, `IMPORT`) |
| `sourceEntityType` / `sourceEntityId` | stable source reference; both nullable only for a truly manual Lead event |
| `fromStatus` / `toStatus` | nullable `LeadStatus`; both required for `LEAD_STATUS_CHANGED` |
| `reason` | nullable generally; required by the approved lifecycle policy for LOST/backward/reopen |
| `comment` | nullable; read projection blocked until BC-028 resolves visibility |
| `metadata` | nullable JSON for typed, non-secret supplemental facts; never a substitute for indexed core fields |
| `idempotencyKey` | nullable unique key; required for retryable cross-module/system actions |
| `correctionOfEventId` | nullable self-reference; correction appends a new event rather than editing history |

Minimum indexes: `(leadId, occurredAt, id)`, `(customerId, occurredAt, id)`,
`(mallId, occurredAt, id)`, `(actorUserId, occurredAt)`, and
`(eventType, occurredAt)`, plus unique `idempotencyKey`.

### Null-Mall blocker

`Lead.mallId` and `CreateLeadDto.mallId` are currently nullable. Existing
scope code may infer visibility for legacy null-Mall Leads from assignee or
downstream relations. That inference is not safe enough to persist immutable
event ownership. BC-030 must decide whether future Leads require Mall, whether
events may be nullable-Mall, or whether another approved ownership key exists.

## Event vocabulary

The proposed `CrmEventType` enum contains:

`LEAD_CREATED`, `LEAD_UPDATED`, `LEAD_STATUS_CHANGED`, `ACTIVITY_ADDED`,
`FOLLOW_UP_CREATED`, `FOLLOW_UP_COMPLETED`, `FOLLOW_UP_CANCELLED`,
`BOOKING_CREATED`, `BOOKING_LINKED`, `PROPOSAL_CREATED`,
`PROPOSAL_SUBMITTED`, `PROPOSAL_APPROVED`, `PROPOSAL_REJECTED`,
`CUSTOMER_CREATED`, `CUSTOMER_LINKED`, `LEAD_CONVERTED`, `LEAD_WON`,
`LEAD_LOST`, `OWNER_CHANGED`, `CATEGORY_CHANGED`, and `LEGACY_BASELINE`.

`LEAD_WON`/`LEAD_LOST` and `LEAD_CONVERTED` are semantic terminal events;
the implementation must define whether they are emitted in addition to or
instead of `LEAD_STATUS_CHANGED` without double-counting KPIs. Recommended
contract: one canonical transition event with `eventType` specialized to
`LEAD_WON`/`LEAD_LOST` when terminal, and KPI queries consume a documented
set exactly once.

## Append-only and transaction contract

- Application services expose create/read only. No normal update/delete API
  exists for CRM events.
- Mutation, synchronous projection, and event insert share the caller's Prisma
  transaction. Cross-domain callers pass a `Prisma.TransactionClient`; the CRM
  helper never starts a nested transaction.
- Manual transitions read the Lead inside a Serializable transaction and retry
  the repository's recognized P2034 conflict condition.
- Event insert failure rolls back the business mutation. AuditLog failure does
  not satisfy or replace this rule.
- A correction appends a new event with `correctionOfEventId` and justification.

## Idempotency contract

Deterministic examples:

| Source action | Event key |
|---|---|
| Booking created/linked | `booking-linked:<bookingId>:<leadId>` |
| Booking converted | `booking-converted:<bookingId>:<leadId>` |
| Proposal created | `proposal-created:<proposalId>:<leadId>` |
| Proposal submitted | `proposal-submitted:<proposalId>:<submissionVersion>` |
| Proposal approval decision | `proposal-decision:<approvalStepId>:<decisionStatus>` |
| Proposal converted to Contract / Lead WON | `proposal-converted:<proposalId>:<contractId>:<leadId>` |
| Follow-up completion | `followup-completed:<followUpId>:<version>` |
| Automation candidate/run | `auto-lost-dry-run:<runId>:<leadId>` only if candidate persistence is approved |

The database unique constraint is the final concurrency guard. A replay returns
the existing event when the payload describes the same source fact; the service
must reject reuse of a key with conflicting material facts.

## Activity ownership and unified read model

Current `LeadActivity` and `CustomerActivity` remain separate source tables:

- Lead activity belongs to one opportunity and works before a Customer exists.
- Customer activity belongs to the customer profile and cannot be assigned to
  a Mall/Lead by inference while BC-016 is open.
- Linking a Lead to a Customer never copies either table.
- Lead timeline combines Lead events with only explicitly related,
  authorization-safe Customer activity. Customer activity counts as a Lead
  touch only when the write explicitly identifies that Lead under the approved
  rule; it never refreshes all of a Customer's Leads.
- Every projected entry exposes provenance (`LEAD_ACTIVITY`,
  `CUSTOMER_ACTIVITY`, or source-domain event) and stable source ID so read-time
  aggregation cannot duplicate it.

## Last-activity projection

`Lead.lastActivityAt` is a materialized projection, not source evidence. The
authoritative source is qualifying activity/event occurrence. If retained, it
is updated in the same transaction as activity + CRM event and is rebuildable
as `max(occurredAt)` over qualifying events.

Which activity types/outcomes qualify is **UNKNOWN — BUSINESS CONFIRMATION
REQUIRED** until D-CRM-002 is approved. Technical updates, notes, assignments,
and status changes must not silently refresh it.

## Timeline read contract

Timeline pages are ordered by `(occurredAt DESC, id DESC)` with an opaque
cursor. Each entry returns event ID/time/type, actor, source, before/after,
reason/comment subject to authorization, source link, and provenance. Source
links independently re-authorize the destination.

Legacy rows are labelled `LEGACY`; a single `LEGACY_BASELINE` may state only
that the record predated reliable event coverage. No fabricated transition or
timestamp is allowed.

## Mall and comment authorization

- Event writes resolve ownership from the persisted Lead/source entity, not a
  client-supplied Mall ID.
- Event lookup always intersects event ownership with the caller's authorized
  Mall set and current Lead read/edit policy.
- A denied write produces zero Lead, projection, event, and outbox effects.
- Tenant Portal receives no CRM internal comment capability.
- Broader comment classifications/read rules are blocked by BC-028.
- Customer-only event ownership/aggregation is blocked by BC-016.
- Null-Mall Lead event persistence is blocked by BC-030.

## Event source map

| Source | Fact and authoritative time/actor | CRM event responsibility |
|---|---|---|
| CRM Lead create/update/move/bulk | Request actor; transaction time or explicit activity occurrence | Lifecycle service writes Lead event atomically |
| Lead activity | Activity actor and `occurredAt` | Activity + event + projection atomically |
| Customer activity | Customer activity actor/time | Project only with explicit Lead link and approved Mall rule |
| Booking create/convert | Booking `createdById` / conversion actor and source transaction | Transaction-capable CRM helper; deterministic booking key |
| Proposal create/submit/reject/convert | Proposal request actor and source transaction | Transaction-capable CRM helper; source ID/version key |
| Approval | ApprovalStep `approver`/`decidedAt`/comment | Read source directly or append idempotent reference event; do not invent workflow-created time as decision time |
| Contract | Contract source record/time | Link source truth; no inferred Lead transition unless source transaction actually changes Lead |
| Follow-up | Creator/completer/canceller and result time | Follow-up lifecycle + event atomically after model approval |
| Automation | `SYSTEM`, job/run identity and evaluated policy | Dry-run does not mutate Lead; future mutation remains blocked by BC-029 |
| Import | Import run, source row ID, confidence | Only unambiguous evidence; never fabricate actor/status path |

## Review gates

Implementation requires Chief ERP Architect, Leasing Functional Consultant,
Workflow, Reporting, Security/Multi-Mall review. BC-016, BC-027, BC-028,
BC-029, and BC-030 constrain activation as described above.
