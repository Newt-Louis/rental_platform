# CRM Lead lifecycle matrix

Status: CURRENT BEHAVIOR VERIFIED; TARGET ADJACENCY NOT APPROVED.

This document records what the code currently permits. It is not an endorsement
of those transitions and does not infer an intended sequence from enum order.

## Status vocabulary

`NEW`, `CONTACTED`, `QUALIFIED`, `PROPOSAL`, `NEGOTIATION`, `WON`, `LOST`.

System Truth describes the desired-looking sequence as
`NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → WON/LOST`, but current
enforcement is partial. Exact legal adjacency remains BC-027.

## Current effective transition matrix

| From | To currently possible | Source module/path | Trigger | Comment required? | Reversible today? | Authoritative CRM event today? |
|---|---|---|---|---|---|---|
| none | Any DTO-supplied status; otherwise NEW | CRM `create` | Manual/API import using normal endpoint; CRM module roles | No | N/A | No |
| Any | Any enum status | CRM Kanban `moveLead` | Manual; authorized Lead editor | No | Yes, including terminal reopen | No |
| Any except current WON | WON only with linked APPROVED/CONVERTED Proposal | CRM detail `update` | Manual; authorized Lead editor | No | Yes through another path | No |
| Any | Any non-WON enum status | CRM detail `update` | Manual; authorized Lead editor | No | Yes | No |
| Any | Any enum status | CRM bulk `changeStatus` | Manual; CRM module user after per-ID edit checks | No | Yes | No |
| Any open status | no transition | CRM stale evaluation (`autoMoveStaleToLost`) | Manual endpoint/future scheduler; ADMIN/LEASING_MANAGER | Candidate reason returned | N/A | No; `AUTO_LOST_MODE=DRY_RUN` |
| Any | PROPOSAL | Booking create when booking becomes ACTIVE | Automatic side effect in Booking transaction | No | Yes through CRM/Proposal paths | No Lead event; Booking has source activity |
| Any | PROPOSAL | Booking convert-to-Proposal | Manual Booking action inside source transaction | No | Yes | No Lead event; Booking activity is post-transaction |
| NEW/CONTACTED/QUALIFIED | PROPOSAL | Direct Proposal create | Manual Proposal action | No | Yes | No |
| Any linked status | WON | Proposal→Contract conversion | Manual Proposal action inside Serializable transaction | No | Yes through unrestricted paths | No Lead event |
| PROPOSAL | NEGOTIATION | Proposal rejection | Manual manager action | Rejection reason exists at Proposal call, not recorded on Lead | Yes | No Lead event |
| Any open status | WON | Customer status→ACTIVE | Manual Customer update; updates all linked open Leads | No | Yes through unrestricted paths | No |
| Any non-WON status | LOST | Customer status→INACTIVE | Manual Customer update; updates all linked Leads | No | Yes | No |
| NEW/CONTACTED/QUALIFIED | NEGOTIATION | Customer status→NEGOTIATING | Manual Customer update | No | Yes | No |

Current writer roles are inherited from module permissions and then narrowed by
endpoint/service checks. CRM roles are ADMIN, LEASING_MANAGER,
LEASING_EXECUTIVE, MALL_DIRECTOR; an executive may edit only an assigned Lead.
Booking/Proposal roles include their module-specific grants. Customer endpoints
remain Mall-ownership-blocked under BC-016.

## Direct runtime `Lead.status` write inventory

| Location | Write |
|---|---|
| `crm.service.ts:176` | Kanban move to caller-supplied status |
| `crm.service.ts:412` | Detail update to caller-supplied status |
| `crm.service.ts:623` | Bulk status `updateMany` |
| `customers.service.ts:337` | Customer ACTIVE → linked open Leads WON |
| `customers.service.ts:343` | Customer INACTIVE → linked non-WON Leads LOST |
| `customers.service.ts:349` | Customer NEGOTIATING → linked early Leads NEGOTIATION |
| `booking.service.ts:229` | ACTIVE Booking → Lead PROPOSAL |
| `booking.service.ts:1458` | Booking conversion → Lead PROPOSAL |
| `proposals.service.ts:275` | Direct Proposal create → early Lead PROPOSAL |
| `proposals.service.ts:816` | Proposal conversion to Contract → Lead WON |
| `proposals.service.ts:935` | Proposal rejection → Lead NEGOTIATION |

No runtime status writer was found in imports or admin tools. `prisma/seed.ts`
creates fixture Leads at varied statuses; category migration/backfill scripts
change category fields only. Tests create/delete fixture Leads and are excluded
from production lifecycle routing.

## Target lifecycle service boundary

The reviewed implementation should expose transaction-capable operations, not
raw Prisma writes:

```text
transitionLead({
  leadId,
  toStatus,
  actor: USER | SYSTEM,
  sourceModule,
  sourceEntityType?,
  sourceEntityId?,
  occurredAt?,
  reason?,
  comment?,
  idempotencyKey?,
}, tx?)
```

Required sequence: load authoritative Lead in the transaction; resolve and
validate Mall; validate only approved transition rules; apply status/derived
projection; append one idempotent CRM event; commit atomically. When joining a
Booking/Proposal transaction, the caller passes its transaction client.

Until BC-027 is answered, the service design may preserve current source-
specific transitions and the existing Proposal prerequisite for WON, but it
must not activate a guessed global adjacency matrix. LOST/backward/reopen
reason requirements are also not production-approved merely because they are a
proposed default in `CRM_BUSINESS_DECISIONS.md`.

## Activity write paths

| Path | Current actor/time | Transaction | Gap |
|---|---|---|---|
| `POST /crm/leads/:id/activities` | authenticated user / server `createdAt` | `LeadActivity.create` and `Lead.lastActivityAt` run independently in `Promise.all` | API unused by main UI; no event; partial write possible; all types refresh stale |
| `POST /crm/customers/:id/activities` | authenticated user / server `createdAt` | single CustomerActivity insert | no explicit Lead association/projection; Customer Mall unresolved |
| Seed fixtures | seeded actor/time | setup only | not runtime evidence |

Lead and Customer activities remain separate source histories and are unified
by referenced read projection, not copying. Whether a Customer activity counts
for a Lead requires an explicit Lead association and approved BC-016/Mall rule.

## Follow-up write paths

| Path | Current mutation | Actor retained? | Event? |
|---|---|---|---|
| create | insert Lead/Customer, assignee, due date, note | creator passed to service but not persisted | No |
| complete | `isDone=true`, `completedAt=now()` | No completer/result | No |
| delete | physical row delete | No canceller/reason | No; history erased |
| auto-follow-up | insert with assigned Lead owner and default seven-day due date | No creator; source not persisted | No |

The proposed OPEN/COMPLETED/CANCELLED lifecycle is documented but not approved
for schema/API activation. Normal hard deletion should be removed only together
with a reviewed cancellation contract so users retain an operational path.

## Phase A safety decision

CR-CRM-BUSINESS-EVENT-001A was approved and activated on 2026-09-12. Stale Lead
evaluation now runs in `DRY_RUN`, preserves the prior candidate predicate, and
performs no Lead or event write. This approval does not authorize a future
automatic LOST rule. Physical follow-up deletion likewise must not be replaced
by an invented cancellation contract while D-CRM-006 is only proposed.

## Business confirmations blocking activation

- BC-016: Customer Mall ownership.
- BC-027: exact Lead transition adjacency.
- BC-028: internal comment visibility.
- BC-029: whether auto-LOST may ever mutate status.
- BC-030: authoritative event Mall for null-Mall Leads.
