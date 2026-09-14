# CRM event lifecycle integrity — Impact Map and write-path inventory

This file is the repository-equivalent `CRM_EVENT_IMPACT_MAP.md` requested by
CR-CRM-BUSINESS-EVENT-001. It is reused instead of creating a second,
conflicting impact-map document.

Status: Wave 0 VERIFIED by direct code inspection on 2026-09-12. This is an implementation inventory, not architecture approval.

## Scope and source of truth

Primary source: `apps/backend/prisma/schema.prisma`, CRM controllers/services, and every direct `Lead` writer found under `apps/backend/src/modules`. System Truth confirms CRM nominally owns Lead/Customer while Booking and Proposals write Lead directly (`docs/system-truth/03-DATA-OWNERSHIP.md`).

## Lead and Customer write paths

| Entity/action | Entry point | Implementation | Transaction | Validation | Authorization / Mall scope | Side effects and missing event | Current tests |
|---|---|---|---|---|---|---|---|
| Lead create | `POST /crm/leads` | `CrmService.create`, `crm.service.ts:299-343` | No | DTO, category/currency checks | Controller validates provided Mall; executive forced self-assignment, `crm.controller.ts:101-107` | No immutable creation actor on Lead; generic HTTP audit only | Currency/category/controller authorization specs; no business-event test found |
| Lead detail update/status | `PUT /crm/leads/:id` | `CrmService.update`, `crm.service.ts:362-448` | No; Lead then Customer side effect | WON guard exists only here; no general adjacency/reason guard | `assertLeadEditAccess` + accessible Mall set, `crm.controller.ts:109-114` | Customer sync/create may fail after Lead commit; no transition event | Currency/category specs; no all-path lifecycle parity test |
| Lead Kanban move/status | `PUT /crm/leads/:id/move` | `CrmService.moveLead`, `crm.service.ts:171-219` | No; Lead then Customer side effect | No WON Proposal guard; no reason | `assertLeadEditAccess`, `crm.controller.ts:69-79` | Customer sync/create; no transition event | No focused lifecycle parity/event test found |
| Lead bulk assignment/status/priority/delete | `POST /crm/leads/bulk` | `CrmService.bulkAction`, `crm.service.ts:598-650` | One `updateMany`, not event-atomic | Controller prechecks each ID; status bypasses lifecycle guards/reason | Per-ID edit access; manager restriction only assign/delete, `crm.controller.ts:190-215` | No per-record before/after/actor; response cannot identify per-record outcome | No focused event/lifecycle test found |
| Lead soft delete | `DELETE /crm/leads/:id` | `CrmService.remove`, `crm.service.ts:451-457` | No | Existence only | Manager roles + edit access | No delete event/reason | No focused history test found |
| Lead activity create | `POST /crm/leads/:id/activities` | `CrmService.addActivity`, `crm.service.ts:460-476` | `Promise.all`, not a DB transaction | DTO requires type/note | Edit access and Mall scope | Activity and `lastActivityAt` can split on failure; frontend API is unused | No focused atomicity/UI test found |
| Lead stale evaluation | `POST /crm/leads/auto-move-stale` | `CrmService.autoMoveStaleToLost` | Read-only `findMany` | Preserves the legacy candidate predicate while `lastActivityAt` remains incomplete | ADMIN/LEASING_MANAGER + accessible Mall set | `AUTO_LOST_MODE=DRY_RUN`; returns scoped candidates and deterministic reason; no Lead/event write | AUTOLOST-001..008 unit coverage; runtime Mall E2E requires PostgreSQL fixture |
| Lead auto-assign | `POST /crm/leads/:id/auto-assign` | `CrmService.autoAssignLead`, `crm.service.ts:930-975` | No | Hard-coded category/role; oldest user, described as round-robin | Edit access; assignee filtered to accessible Mall | No assignment event; rules not Mall configuration | No focused configuration/event test found |
| Lead auto-follow-up | `POST /crm/leads/:id/auto-followup` | `CrmService.createAutoFollowUp`, `crm.service.ts:979-1000` | No | Lead/assignee existence | Lead edit access in controller | No creator field/event; fixed default 7 days | No actor/history test found |
| Customer create | `POST /crm/customers` | `CustomersService.create`, `customers.service.ts:258-297` | No | Currency/category/optional Lead checks | Module role; Customer Mall scope unresolved (BC-016) | May connect Lead but no customer-created/link event | Customer/category/currency specs |
| Customer update/status | `PUT /crm/customers/:id` | `CustomersService.update`, `customers.service.ts:300-357` | No; Customer then Lead `updateMany` | Customer status mapping; no Lead WON guard | Executive ownership only; no Mall boundary due BC-016 | Can mass-WON/LOST/NEGOTIATION linked Leads without per-Lead guard/events | Customer specs cover selected sync behavior, not lifecycle parity |
| Customer soft delete | `DELETE /crm/customers/:id` | `CustomersService.remove`, `customers.service.ts:360-368` | No | Existence/ownership | No Mall boundary due BC-016 | No delete event/reason | No focused history test found |
| Customer activity create | `POST /crm/customers/:id/activities` | `CustomersService.addActivity`, `customers.service.ts:370-384` | Single insert | Activity DTO | Executive ownership; no Mall boundary due BC-016 | Does not identify/update one Lead's meaningful-contact projection | UI path exists; no stale-isolation test found |
| Create Customer from Lead | CRM WON/profile flow | `CustomersService.createFromLead`, `customers.service.ts:432-470` | No | Dedup/link and currency rules | Caller is previously Lead-authorized | Customer creation + Lead link can split; no link event | Customer service tests; no event atomicity test |
| Sync Lead to Customer | `POST /crm/leads/:id/sync-customer` | `CustomersService.syncFromLead`, `customers.service.ts:472-501` | `$transaction` for Customer + Lead | Currency compatibility | Lead edit access; Customer Mall unresolved | No sync/link event | Currency/customer specs |
| Link Customer to Tenant | `PATCH /crm/customers/:id/link-tenant` | `CustomersService.linkTenant`, `customers.service.ts:503-512` | No | Tenant existence/ownership checks require re-verification | Customer edit access; Mall unresolved | Activates Customer without CRM business event | No focused CRM-history test found |

## Cross-module Lead status writers

| Source | Write and trigger | Transaction / actor | Existing source history | CRM gap |
|---|---|---|---|---|
| Booking create | ACTIVE booking sets Lead → PROPOSAL, `booking.service.ts:227-243` | Inside Booking Serializable transaction; human `createdById` available | BookingActivity records creation/activation | No Lead transition event; BookingActivity is not included in current CRM timeline |
| Booking convert to Proposal | Sets Lead → PROPOSAL, `booking.service.ts:1361-1432` | Proposal/Booking/Lead in one DB transaction; human actor available | CONVERTED BookingActivity is written after the transaction (`booking.service.ts:1434+`) | Lead transition lacks CRM event; post-transaction activity can be lost |
| Direct Proposal create | Early Lead → PROPOSAL, `proposals.service.ts:268-279` | Proposal create/snapshot/Lead write are not one transaction | Proposal snapshot exists | Lead transition can fail after Proposal creation; no CRM event |
| Proposal rejection | Lead PROPOSAL → NEGOTIATION, `proposals.service.ts:918-937` | Proposal update then Lead update, unwrapped | Proposal snapshot records REJECTED | No Lead transition actor/reason event; partial failure possible |
| Proposal → Contract | Lead → WON, `proposals.service.ts:797-823` | Same Serializable transaction as Contract/Proposal/Booking changes; creator actor available | Contract/Proposal records | No CRM event; this is the strongest candidate for transaction-capable CRM event helper |
| Approval completion/rejection | Approvals changes Proposal asynchronously through outbox/listener | Approval transaction records approver/comment/decidedAt; completion durable, rejection path must be rechecked against current outbox implementation | ApprovalStep is authoritative | Current CRM timeline collapses workflow and does not show individual decisions |
| Contract | No direct Lead status writer found in the scoped grep | N/A | Contract events exist | Timeline should link source truth; must not infer Lead transitions from Contract snapshot |

## Follow-up paths

| Action | Current behavior | Gap |
|---|---|---|
| Create | Stores Lead/Customer, assignee, due date, note | No creator or creation event; Customer-only Mall scope is ambiguous |
| Complete | Sets `isDone=true`, `completedAt=now()` | No completer, contact type, result, idempotency semantics, or event |
| Delete | Physical delete | Erases responsibility and change history |
| Reschedule/reassign | No dedicated API | No auditable supported path; future direct updates would lack history |

## Timeline/read consumers

- Lead detail loads both `lead.activities` and `customer.activities`, but renders only the Customer collection (`crm.service.ts:222-270`; `CrmPage.tsx:572-583`).
- `getLeadTimeline()` reads no activity actor and constructs Booking/Proposal events from their current status plus `createdAt`; Approval is one workflow-created event (`crm.service.ts:1207-1361`).
- `DealTimeline.tsx` has no actor/reason/provenance fields and does not render event metadata (`DealTimeline.tsx:12-20,101-143`).
- Customer detail displays Customer activities with actor, but not Lead activities aggregated across accessible linked Leads (`CrmPage.tsx:2239-2269,2594-2600`).

## Authorization impact

- Lead endpoints have explicit accessible-Mall resolution and assignment-based edit control.
- Customer has no Mall field and the controller is explicitly marked `PENDING_BUSINESS_CONFIRMATION` (`customers.controller.ts:14-22`). This blocks a new globally queryable Customer event stream.
- Timeline deep links must independently authorize source records.
- Existing internal comments are not exposed to Tenant Portal; CR-121 must preserve this default.

## Transaction and concurrency impact

- CRM `moveLead/update` are known non-atomic Lead→Customer writes (`docs/system-truth/08-TRANSACTION-BOUNDARIES.md`).
- New lifecycle transition must re-read current Lead inside Serializable transaction, validate against that state, write dependent CRM projection/event in the same transaction, and retry P2034 using the Booking pattern.
- Cross-module helpers must accept a Prisma transaction client; starting a nested independent transaction would break source atomicity.
- Deduplication key must be unique and deterministic for retried source actions. A nullable key allows truly manual one-off events.
- Stable timeline pagination requires `(occurredAt DESC, id DESC)` ordering and a matching index/cursor contract.

## API compatibility, migration, rollback, and load

- Additive event/follow-up fields allow old application versions to read existing tables.
- Response DTOs should version or preserve legacy fields while adding honest `metricStatus`/coverage; clients must not default missing data to zero.
- Event indexes required at minimum: Lead/time/id, Customer/time/id, Mall/time/id, actor/time, event type/time, unique dedupe key.
- Customer 360 should query one paginated event stream, not N queries per linked Lead.
- Rollback disables new reads/writes while retaining event rows; no rollback deletes audit history.

## Checked but not changed in Wave 0

- Generic AuditLog: useful forensic evidence but best-effort, request-oriented, lacks before state, and classifies `/api/crm/...` as CRM rather than Lead (`audit-log.interceptor.ts:42-120`). It is not the business-event source.
- Existing Outbox/Booking transaction/idempotency patterns: suitable reference implementations.
- Currency propagation through Lead→Booking→Proposal→Contract: checked; CR-121 must not alter it.

## Required discovery output index

| Required output | Authoritative document/section | Status |
|---|---|---|
| A. Lead status matrix | `CRM_LIFECYCLE_MATRIX.md` | VERIFIED current behavior; target adjacency BLOCKED by BC-027 |
| B. All direct `Lead.status` writes | `CRM_LIFECYCLE_MATRIX.md`, this file's cross-module inventory | VERIFIED across runtime modules, seed/test/import scripts classified separately |
| C. Activity write paths | This file's Lead/Customer write-path inventory | VERIFIED |
| D. Follow-up write paths | This file's Follow-up paths | VERIFIED |
| E. KPI formula map | `CRM_KPI_DICTIONARY.md` | VERIFIED current formulas; target historical semantics proposed |
| F. Customer Mall ownership | Authorization impact; BC-016 | **UNKNOWN — BUSINESS CONFIRMATION REQUIRED** |
| G. Comment visibility | `CRM_BUSINESS_EVENT_MODEL.md`; BC-028 | **UNKNOWN — BUSINESS CONFIRMATION REQUIRED** |
| H. Event source map | `CRM_BUSINESS_EVENT_MODEL.md` | VERIFIED source inventory; implementation pending review |

The whole-repository writer sweep also found only non-runtime Lead writes in
`prisma/seed.ts`, category-only migration/backfill scripts, and test setup/
cleanup. Category scripts do not write `Lead.status`; seed/test fixtures are
not production lifecycle entry points and must not emit runtime CRM events.

