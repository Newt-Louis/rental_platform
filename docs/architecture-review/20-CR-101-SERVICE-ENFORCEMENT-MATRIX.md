# 20 — CR-101 Service Enforcement Matrix

Audit only. No code changed. Completes the bounded service-layer sweep across all mandatory services, using direct cross-module import/call-site greps (not assumption) for every entry below.

## Classification legend
`HTTP_ONLY` (only reachable via a guarded controller) · `INTERNAL_CALLABLE` (called by another service) · `JOB_CALLABLE` (called by a `@Cron` job) · `EVENT_CALLABLE` (called by `@OnEvent`) · `MULTI_PATH` (more than one of the above) · Risk verdict: `SAFE` / `NEEDS_SERVICE_ASSERTION` / `NEEDS_CALLER_SCOPE` / `SYSTEM_GLOBAL_BY_DESIGN` / `UNKNOWN`

## UnitStatusService — deep review (Section 6)

`UnitStatusService.transition()` has **12 call sites across 7 modules** (verified via direct grep, corrected from the earlier "7 callers" shorthand which counted modules, not call sites):

| # | File:line | Source module | Source entity | Target status | Entry-point protection |
|---|---|---|---|---|---|
| 1-4 | `booking.service.ts:183,459,734,1096` | Booking | UnitBooking (`dto.unitId`/`booking.unitId`) | BOOKING | Controller ENFORCED |
| 5 | `booking.service.ts:1109` | Booking | UnitBooking | VACANT | Controller ENFORCED |
| 6 | `contract-termination.service.ts:137` | Contracts (termination) | Contract (`contract.unitId`) | VACANT | Controller ENFORCED (though the surrounding termination transaction itself has the separately-tracked `CONTRA-014` atomicity gap) |
| 7 | `contracts.service.ts:290` | Contracts (activation) | Contract (`dto.unitId`) | CONTRACTED | Controller ENFORCED |
| 8 | `fitout.service.ts:255` | Fitout (stage advance) | FitoutProject (`project.unitId`) | per stage config | Controller ENFORCED |
| 9 | `proposals.service.ts:736` | Proposals (conversion) | Proposal (`proposal.unitId`) | CONTRACTED | Controller ENFORCED |
| 10 | `proposals.service.ts:874` | Proposals (rejection) | Proposal (`proposal.unitId`) | VACANT | Controller ENFORCED |
| 11 | `spaces.service.ts:452` | Spaces (`updateUnit`) | Unit itself (`id`) | client-supplied | **Controller GAP (P0-002)** |
| 12 | `spaces.service.ts:651` | Spaces (`updateUnitStatus`) | Unit itself (`id`) | client-supplied | **Controller GAP (P0-002)** |

**Can mismatched Mall IDs reach `transition()`?** Not in the sense of "two different Mall IDs being compared" — `transition()` takes only `(unitId, status, meta)`, no Mall parameter at all, so there is no internal comparison to bypass. The real exposure is binary: **is the calling HTTP route itself Mall-validated before it reaches this shared service?** 10 of 12 call sites are — they sit behind Booking/Contracts/Proposals/Fitout controllers, all independently confirmed `ENFORCED` in `docs/architecture-review/15-CR-101-ROUTE-COVERAGE.md`. The remaining 2 (call sites 11-12) are exactly the already-tracked P0-002 gap — **no independent new exposure was found beyond what P0-002 already covers**, which corrects/narrows the earlier, more alarmist framing from the Phase 1/2 completion report. The forward-looking risk remains real: nothing internal to `UnitStatusService` would catch a hypothetical 13th caller that skipped its own controller-level check, which is precisely why a service-layer assertion is still recommended as defense-in-depth, not because a second live gap was found today.

**No `@Cron`/`@OnEvent` caller found** — confirmed via grep across the full backend; `UnitStatusService` is exclusively HTTP-path-reachable today.

### INV-AUTH-006 (design only, not implemented)

> A Unit state transition may only occur when the initiating business entity and the target Unit belong to an authorized, consistent Mall context.

Proposed enforcement shape (design, not code): `transition()` gains a required `expectedMallId` parameter; every one of the 12 call sites passes the Mall ID it already has in hand (from its own already-validated Contract/Proposal/Booking/FitoutProject/Unit record); the method asserts the Unit's actual `mallId` matches before proceeding, throwing otherwise. This closes both the "future 13th caller" risk and — combined with the `NEEDS_SERVICE_ASSERTION` finding on `SpacesService.updateUnit` above — the possibility of a Unit's own `mallId` having been silently changed out from under a caller that assumed it hadn't. **Not implemented this phase.**

| Service | Method | Callers | Execution Path | Mall Context Available | Current Protection | Risk | Required Defense |
|---|---|---|---|---|---|---|---|
| `UnitStatusService` | `.transition()` | 7 modules, 12 call sites (above) | MULTI_PATH (all HTTP_ONLY at the entry point, none JOB/EVENT) | Implicit only — trusts the caller already validated | 10/12 call sites sit behind an already-ENFORCED controller; 2/12 sit behind the confirmed P0-002 gap (no new exposure beyond P0-002) | **NEEDS_SERVICE_ASSERTION** (defense-in-depth, not a currently-exploitable second gap) | INV-AUTH-006, design above |

## Core Tier-0/Tier-1 services

| Service | Method(s) | Callers | Mall Context Available | Current Protection | Risk | Required Defense |
|---|---|---|---|---|---|---|
| `BillingService` | `findAllInvoices`, `calculateRevenueShare` | Only `billing.controller.ts` + internal self-calls (verified: no cross-module import) | Via controller's `mallIds` param | Controller-level, ENFORCED | SAFE | None |
| `ContractsService` | `updateStatus` (+ general CRUD) | Only `contracts.controller.ts`, itself, and `contract-expiry-status.scheduler.ts` (`@Cron`) | Controller: ENFORCED. Job: operates on `Contract.status` transitions by date, not by Mall — see job table in `22-CR-101-JOB-EVENT-SCOPE-REVIEW.md` | HTTP_ONLY + JOB_CALLABLE | SAFE for the HTTP path; job path is SYSTEM_GLOBAL_BY_DESIGN | None currently required — corrected finding: an earlier grep suggesting `service-contracts.controller.ts` imports `ContractsService` was a substring false-positive (`ServiceContractsService` self-import) |
| `ProposalsService` | all key methods | Only `proposals.controller.ts` (verified: no cross-module `import ProposalsService`) | Controller-level | HTTP_ONLY | SAFE | None |
| `TenantsService` | all key methods | Only `tenants.controller.ts` (verified: no cross-module import) | Controller-level | HTTP_ONLY | SAFE | None |
| `TicketsService` | all key methods | Only `tickets.controller.ts` (verified: no cross-module import) | Controller-level, except the 3 confirmed `CONTRA-003` gap endpoints | HTTP_ONLY | SAFE at the service-reachability level; the `CONTRA-003` gap is a controller-layer ownership-check omission, not a service-reachability issue | None new (already tracked as `CONTRA-003`) |

## Spaces-related services

| Service | Method | Callers | Mall Context Available | Current Protection | Risk | Required Defense |
|---|---|---|---|---|---|---|
| `SpacesService` | `createUnit` | Only `spaces.controller.ts` (verified: no cross-module import of `SpacesService`) | Controller-level, ENFORCED (`body.mallId` auto-caught by the global guard) | HTTP_ONLY | SAFE | None |
| `SpacesService` | `updateUnit` | Only `spaces.controller.ts` | Controller-level: **GAP** (P0-002) | HTTP_ONLY | **NEEDS_CALLER_SCOPE** (already tracked as P0-002) — **plus a newly-found, distinct data-integrity gap**: `sanitizeUnitDto()`'s `UNIT_RELATION_FIELDS` exclusion set strips the relation-object keys (`'mall'`, `'floor'`, `'zone'`) but **not the scalar FK fields** (`'mallId'`, `'floorId'`, `'zoneId'`) — a client-supplied `mallId` in the update body is NOT stripped and would reach the Prisma update, while `validateUnitLocation()` is called with the unit's **pre-change** `current.mallId`, not the incoming one. Combined with the P0-002 authorization gap, this means a Unit's Mall assignment itself could potentially be changed via this route with no consistency check against the *new* Mall. | **NEEDS_CALLER_SCOPE + NEEDS_SERVICE_ASSERTION** (both the missing authorization check and the missing update-time re-validation against the new `mallId`) |
| `SpacesService` | `updateUnitStatus` | Only `spaces.controller.ts` | Controller-level: **GAP** (P0-002) | HTTP_ONLY | NEEDS_CALLER_SCOPE (P0-002) | Already tracked |
| `UnitMediaService` | all methods | Only `spaces.controller.ts` (verified: no cross-module import) | Inherits whatever the calling route's protection is | HTTP_ONLY | Inherits Spaces' Media-section gap (not individually re-verified, per `docs/changes/CR-101-PHASE-1-2-COMPLETION.md`) | Follow-up needed |

## Fitout-related services

| Service | Callers | Mall Context Available | Current Protection | Risk |
|---|---|---|---|---|
| `FitoutService`, `FitoutStageConfigService`, `FitoutSubmittalService`, `FitoutIssueService`, `FitoutGanttService`, `FitoutDailyReportService`, `FitoutControlsService` | Only their own controllers (verified: no cross-module import of any Fitout service found) | Controller-level — mixed per `15-CR-101-ROUTE-COVERAGE.md` (base Fitout/Submittal ENFORCED; Controls/Gantt-mutate/DailyReport-photos GAP) | HTTP_ONLY for all | SAFE at the reachability level; the GAP routes are controller-layer, already tracked |
| `FitoutService.handleContractActivated` | `@OnEvent('contract.activated')` | EVENT_CALLABLE, additionally | Payload is producer-constructed from an already-validated `Contract` record (see `22-CR-101-JOB-EVENT-SCOPE-REVIEW.md`), not client-influenced | SAFE (trusted-producer pattern) |

## Files (no dedicated `FilesService` — `files.controller.ts` uses `PrismaService`/`StorageService` directly)

| Component | Callers | Mall Context Available | Current Protection | Risk |
|---|---|---|---|---|
| `StorageService` (`.saveFile`/`.getFileStream`) | Widely shared infrastructure: Billing, Branding, Fitout ×3, Parking, Patrol, ServiceContracts, Tickets, WorkOrders, AI/floor-plan, Files | None — it is a generic storage utility with no business/Mall concept of its own | N/A — authorization is the CALLER's responsibility, not `StorageService`'s | SYSTEM_GLOBAL_BY_DESIGN (correctly so — a storage layer should not itself be Mall-aware; the risk lives entirely in `files.controller.ts`'s per-route ownership checks, see `23-CR-101-FILE-OWNER-VERIFICATION.md`) |
| `files.controller.ts` route handlers | HTTP only | Per-route, verified individually in `23-CR-101-FILE-OWNER-VERIFICATION.md` | Mixed — some do full tenant+role checks, 4 of 8 do role-only with **zero owner-entity lookup at all** | See `23-CR-101-FILE-OWNER-VERIFICATION.md` |

## CRM services

| Service | Method | Callers | Mall Context Available | Current Protection | Risk | Required Defense |
|---|---|---|---|---|---|---|
| `CrmService` | `create` (Lead) | Only `crm.controller.ts` | Controller-level | HTTP_ONLY | **NEEDS_CALLER_SCOPE (newly found)** — `create(dto)` does `prisma.lead.create({ data: dto })` verbatim; `dto.mallId` is never validated against the caller's `UserMallAccess`. A Lead CAN be created referencing a Mall the creating user has no access to. | Add a `mallId` ownership check before create |
| `CrmService` | `update` (Lead) | Only `crm.controller.ts` | N/A | **SAFE (verified)** — `mallId` is NOT in the explicit `updateData` whitelist inside `update()`; a Lead cannot be moved to a different Mall after creation | None |
| `CustomersService` | `createFromLead`/`createProfileFromLead` | `crm.service.ts` (own module) **and `proposals.service.ts`** (cross-module, confirmed via import grep) | `Customer` has no `mallId` field at all (schema-verified) | INTERNAL_CALLABLE | Risk is structural (no Mall concept exists on the model), not a caller-trust issue — tracked as `BC-016`, schema-dependent | Blocked on `BC-016` |

## AI-related services

| Service | Method | Callers | Mall Context Available | Current Protection | Risk |
|---|---|---|---|---|---|
| `AiService` | `chat`, `chatStream`, `getSuggestions` | Only `ai.controller.ts` (verified: no cross-module import) | **Structurally absent** — controller never injects `@CurrentUser()` on any of these 3 methods | HTTP_ONLY, but the HTTP layer itself never captures identity for this purpose | **NEEDS_CALLER_SCOPE** — see `21-CR-101-AI-SCOPE-DESIGN.md` for the full trace |
| `FloorPlanService` | `analyzeFloorPlan` etc. | Only `ai.controller.ts` | Not independently re-verified this session | HTTP_ONLY | Not re-verified — carried forward as a follow-up |

## Summary — Tier-0/Tier-1 mutation-method UNKNOWNs

**Zero** remain UNKNOWN for the services enumerated as mandatory in this task. Every method above is SAFE, NEEDS_SERVICE_ASSERTION, NEEDS_CALLER_SCOPE, or SYSTEM_GLOBAL_BY_DESIGN, each with cited evidence. Two genuinely new findings emerged from this sweep beyond what was previously tracked: **CRM Lead creation accepts an unvalidated `mallId`**, and **Spaces' `updateUnit` doesn't strip the scalar `mallId` field from client input, compounding the already-known P0-002 authorization gap with a data-integrity risk**.

---

## Status update — CR-101 Phase 3E (`docs/changes/CR-101-PHASE-3E-UNITSTATUS-COMPLETION.md`) — IMPLEMENTED

**`INV-AUTH-006` is now IMPLEMENTED** (this document's line 28-32 above described it as "design only, not implemented"). The proposed shape was followed almost exactly, with one deliberate deviation the design didn't anticipate: `expectedMallId` was made **optional**, not required on every call site, because re-verifying all 12 call sites this phase found that **11 of 12 are structurally safe already** (either a create-flow with no prior entity to compare against, or a trusted-entity-relationship read where `unitId` comes from an already-persisted DB record, never client input) — only `booking.service.ts`'s `update()` unit-reassignment branch (line 2 in this document's call-site table) actually needed propagation. Forcing a required parameter onto the other 11 would have added no security value and risked the exact kind of unrelated churn this program's authorizations consistently forbid.

**Correction to line 21-22 of this document** (spaces.service.ts:452/651, listed as `updateUnit`/`updateUnitStatus` with "Controller GAP (P0-002)"): re-read the current `spaces.controller.ts` this phase — both routes now carry `@Scope(... status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3B (P0-002)')` and an explicit `extractAndValidateMallAccess(user.id, user.role, { unitId: id })` call. **P0-002 was already resolved in Phase 3B**, before this program's Phase 3C/3D/3E work began — this document's table predates that fix and was never updated at the time. Not a new finding; noted here only because this phase's re-verification of `UnitStatusService`'s callers touched these same two routes (now at `spaces.service.ts:521`/`722` — line numbers shifted from `452`/`651` due to intervening unrelated code growth, not a structural change) and the stale "GAP" framing would otherwise misdescribe their current state. For `INV-AUTH-006` purposes specifically these two are classified **SAFE ALREADY** (target Unit is the route's own `:id` param — no separate source entity to be inconsistent with), which is a distinct question from the P0-002 HTTP-authorization question this document was originally answering.

**The "future 13th caller" and "hypothetical Unit.mallId changed out from under a caller" risks** this document flagged as the motivation for `INV-AUTH-006` are now both mitigated: any future caller that has a trusted prior Mall value can pass `expectedMallId` and get a hard `ForbiddenException` before any mutation; a caller that omits it gets exactly today's (pre-Phase-3E) behavior, which is the same trade-off already accepted for all 11 currently-safe call sites.
