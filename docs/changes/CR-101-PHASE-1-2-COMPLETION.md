# CR-101 — Phase 1 & 2 Completion (Mall Authorization Architecture, descriptive infrastructure)

Status: **COMPLETED**. ADR-CR101 status: **ACCEPTED — PHASED IMPLEMENTATION**. Phases 3–7 remain unauthorized.

## Scope

Authorized: Phase 1 (annotate already-correct routes, zero behavior change) and Phase 2 (annotate global/exempt routes with a recorded reason). Not authorized and not touched: Phase 3 (fix confirmed gaps), Phase 4 (fail-closed startup enforcement), Phase 5 (CI blocking), Phase 6 (default-deny), Phase 7 (remove heuristic code).

## What was built

1. **`apps/backend/src/common/constants/scope.types.ts`** — `ScopeType` enum (GLOBAL, COMPANY_SCOPED, MALL_SCOPED, TENANT_SCOPED, USER_SCOPED, SYSTEM_INTERNAL), `ScopeDeclaration`/`ScopeResolution` interfaces, `EnforcementStatus` enum (ENFORCED / GAP / PENDING_BUSINESS_CONFIRMATION) so a declaration can honestly record a route's *intended* boundary separately from whether it's *actually enforced today*.
2. **`apps/backend/src/common/decorators/scope.decorator.ts`** — `@Scope(...)` (plus `@GlobalScope()`/`@UserScope()`/`@SystemInternalScope()` shorthands), built on the exact same `SetMetadata`/`Reflector` pattern as the codebase's existing `@Public()`/`@Roles()`. **Purely descriptive** — no guard reads this metadata yet.
3. **`apps/backend/src/common/services/mall-resolver-registry.ts`** — `EXISTING_MALL_RESOLVERS` (18 resolvers, each described from the verified, unchanged, running logic in `MallAccessService.extractAndValidateMallAccess()`) and `PLANNED_MALL_RESOLVERS` (13 new resolver names needed to close confirmed gaps, not yet backed by code).
4. **`apps/backend/scripts/route-scope-inventory.ts`** — a static (TypeScript-compiler-API-based, no live app bootstrap, no DB/env dependency) route/scope inventory tool. Run manually via `npx ts-node scripts/route-scope-inventory.ts`; **not wired into any build/test/CI step** (Phase 5 territory).
5. **`apps/backend/src/common/decorators/scope.decorator.spec.ts`** and **`apps/backend/src/common/services/mall-resolver-registry.spec.ts`** — the parameterized-harness proof-of-concept: metadata discoverability, class-level inheritance, method-level override, `GlobalScope`/`UserScope` shorthands, the UNDECLARED case, and resolver-name-reference integrity (catches typos, not "did you forget to annotate" — that stays out of scope for Phase 1/2).
6. **39 controllers + `files.controller.ts`** annotated with `@Scope(...)` at class level (with method-level overrides for every controller that has genuinely mixed scope types).

## First task — the 3 UNKNOWN route groups resolved

**A. `deal-scoring.controller.ts`** (3 routes): `criteria` GET/POST → GLOBAL (verified: `deal-scoring.service.ts` has no `mallId` reference anywhere — platform-wide scoring config). `proposals/:id` (scoreProposal) → MALL_SCOPED, **GAP** (the `proposal` resolver exists and is trivially wireable, but isn't called today — newly found).

**B. `sap.controller.ts`** (11 routes): `MODULE_ROLES.sap = [ADMIN, FINANCE]` — FINANCE is non-bypass. `syncCustomer` → **GAP** (its sibling `syncInvoice` already validates via the `tenant`/`invoice` resolver pattern; `syncCustomer` has an identical `tenant` resolver available but doesn't call it — newly found, not a BC question). `syncInvoice` → ENFORCED (already correct). The remaining 8 routes (logs/stats/reconciliation/mappings) have no single-entity Mall to resolve and no documented policy on whether FINANCE's SAP visibility should be Mall-restricted or intentionally platform-wide → **PENDING_BUSINESS_CONFIRMATION**, not guessed. `reconciliation/run` and `mappings/sync-pending` → SYSTEM_INTERNAL (manual triggers for platform-wide batch operations).

**C. Spaces base (Malls/Floors/Zones)**: `GET /spaces/malls` → ENFORCED (already correctly uses `getAccessibleMallIds`). `createMall`/`setupMall` → GLOBAL (no existing Mall to scope against; whether non-ADMIN roles should create Malls at all is a separate ROLE AUTH question). **`getMall(:id)`/`updateMall(:id)`/`deleteMall(:id)` → GAP, newly found and more severe than the previously-known Unit-level gap** — a MALL_DIRECTOR assigned to Mall A can read/edit/deactivate any other Mall entity directly. `createFloor`/`createZone` → ENFORCED (guard auto-catches `body.mallId`). `getFloors`/`getZones` → GAP when `mallId` omitted (same shape as the Reports/Analytics gap). `updateFloor`/`deleteFloor`/`updateZone`/`deleteZone` → GAP (keyed by `:id`, the resource's own id, not the guard-recognized `floorId`/`mallId` field names).

No group required a guess — every classification above traces to a specific code read this session.

## Additional gaps found during annotation (beyond the 17 already tracked from the architecture review)

| Location | Finding |
|---|---|
| `spaces.controller.ts` — Malls CRUD | `updateMall`/`deleteMall`/`getMall(:id)` — whole-Mall-entity-level gap, more severe than the Unit-level P0-002 |
| `spaces.controller.ts` — Floors/Zones | `:id`-keyed mutate/delete routes unresolved by the guard |
| `sap.controller.ts` | `syncCustomer` missing the validation its sibling `syncInvoice` already has |
| `service-catalog.controller.ts` | `updateItem`/`deactivateItem` (`:id`-keyed) and both `proposal/:proposalId/*` routes |
| `deal-scoring.controller.ts` | `scoreProposal` |
| `announcements.controller.ts` | Entire staff-admin CRUD path (`findAllAdmin`/`create`/`update`/`remove`) — the tenant-viewer path was previously confirmed correct, but the admin path was not previously checked |

All of the above are recorded as `EnforcementStatus.GAP` in their `@Scope(...)` declarations — **none were fixed**, per Phase 1/2's explicit "descriptive only" mandate.

## Route inventory results

```text
Route Scope Inventory -- 523 routes across 41 controller files
  DECLARED:   473
  EXEMPT:     50
  UNDECLARED: 0
  UNKNOWN:    0
```

100% metadata coverage achieved. This does **not** mean 100% enforcement — the vast majority of DECLARED routes carry `status: GAP` or `status: PENDING_BUSINESS_CONFIRMATION` honestly, per `EnforcementStatus`'s design intent. It means every route now has a recorded, reviewable claim about what its scope *should* be, replacing silent absence with an explicit (and honest) statement.

## Authorization behavior changed?

**NO.** Confirmed by: full backend regression (72 suites / 393 tests passing, identical pass count plus the 8 new metadata-infrastructure tests, zero regressions, zero failures), full frontend regression (28/29 files, 216/225 tests — byte-identical to the pre-existing baseline, including the same 9 pre-existing unrelated `BookingsPage.test.tsx` failures), `tsc --noEmit` clean on both sides, `nest build` clean, `vite build` clean, `eslint` clean across the entire backend `src` tree, and `git diff --check` clean. `@Scope(...)` metadata is read by nothing in the current request pipeline — `MallAccessGuard` is byte-for-byte unchanged.

## Service-layer follow-up (bounded, for Phase 3 readiness — not exhaustive)

| Service | Classification | Evidence |
|---|---|---|
| `UnitStatusService.transition()` | **INTERNAL_CALLABLE** | 7 cross-module callers (Booking, ContractTermination, Contracts, Fitout, Proposals, Slots, Spaces), confirmed via direct grep. No independent scoping — trusts the caller. Recommendation carried from the architecture-review phase: needs a service-layer assertion before Phase 6, since it's reachable today via the confirmed Spaces gap with zero prior validation. |
| `BillingService.findAllInvoices()` / `.calculateRevenueShare()` | HTTP_ONLY_SAFE | Confirmed during CR-102: only called from `billing.controller.ts` and internally; no job/event caller. |
| `ContractsService` (incl. `updateStatus`) | HTTP_ONLY_SAFE + JOB_CALLABLE | Only its own controller, itself, and `contract-expiry-status.scheduler.ts` (`@Cron`). Corrected finding: an earlier grep suggested `service-contracts.controller.ts` imports `ContractsService` — verified this was a substring false-positive (`ServiceContractsService` self-import); no real cross-module usage found. |
| `ProposalsService`, `TenantsService`, `TicketsService` | HTTP_ONLY_SAFE | No cross-module `import ... Service` found for any of the three (checked via direct import-statement grep, not just call-pattern grep, to avoid the same false-positive class caught above). |

**Not completed this session** (flagged, not assumed safe): a full method-by-method sweep of every method on these 4 services beyond the specific ones named above — this check covered whole-service import/call reachability, which is sufficient to answer "can this service be reached without going through a guarded HTTP route" but not "does every individual method already assume correct scoping internally."

## Background-job follow-up (bounded, for Phase 3 readiness — not exhaustive)

Classification against `INV-AUTH-005` (jobs get zero implicit protection from HTTP guards), reusing the existing System Truth job catalog (`docs/system-truth/09-EVENT-CATALOG.md`) plus this session's targeted review:

| Job class | Classification | Rationale |
|---|---|---|
| Monthly billing generation, AR dunning, Parking statement generation, Patrol (2 jobs), Work-Orders (2 jobs), Booking expiry, Contract-expiry-status transition, Analytics (occupancy-snapshot, renewal-risk, compliance ×2), Fitout (3 jobs), Service-Contract reminders, Ticket SLA/maintenance | **GLOBAL_BY_DESIGN** | Each iterates or bulk-queries across all Malls by design (the job's whole purpose is platform-wide), with individual output rows correctly attributed to their own Mall via the source record's own relations — not a leak in the sense of returning wrong-Mall data to a wrong-Mall actor, since these are system processes with no per-request actor to leak *to*. |
| Notifications' 5 jobs (`contract-expiry.scheduler.ts`: expiry-check, renewal-proposals, follow-up-reminder, ai-insights, invoice-overdue-mark) | **PARTIAL** | Same GLOBAL_BY_DESIGN shape, but these specifically *send notifications to human recipients* — a bug in recipient-resolution could leak Mall-B information to a Mall-A stakeholder in a way the read-only/batch jobs above cannot. Not independently re-verified this session whether recipient resolution is provably correct; flagged rather than assumed safe. |
| Outbox processor, Email-delivery processor | **SYSTEM_INTERNAL** | Generic queue processors with no Mall concept of their own — they deliver whatever payload was enqueued by the (correctly or incorrectly scoped) code that enqueued it. |

**Not completed this session**: line-by-line re-verification of every one of the ~22 jobs' actual query construction — this classification is a considered judgment call built on the existing System Truth catalog plus this session's targeted checks, not a fresh full audit of each job file.

## AI follow-up

Traced directly this session: **`AiController.chat()`, `.chatStream()`, and `.getSuggestions()` do not inject `@CurrentUser()` at all** — confirmed by reading the full method signatures (`ai.controller.ts:33-64`). User identity is available at the guard/request level (JwtAuthGuard populates `req.user` globally) but is **not threaded through** to `AiService.chat()`/`.chatStream()`/`buildContext()` — those methods only receive `(message, history)`.

**AI_SCOPE: MISSING** (not PARTIAL — this is a structural absence, not an available-but-unused value). Fixing this requires plumbing changes (add `@CurrentUser()` to 3 controller methods, thread `user`/resolved `mallIds` through to `buildContext()`, add Mall filters to its Prisma queries) — bigger than a one-line fix, smaller than a redesign. Not attempted this session (Phase 3 territory).

## File resolver chain follow-up

Directly re-verified 2 of 8 chains against the actual running code (not just the design table):

- **`ContractFile` → Contract → Mall**: `files.controller.ts:downloadContractFile` currently queries `contractFile.findUnique({ include: { contract: { select: { tenantId: true } } } })` — **it does not even select the Mall-relevant fields today** (only `tenantId`, for the existing tenant-ownership check). Confirms the registry's `fileOwnerEntity` chain is structurally correct (Contract does have the needed `unit`/`floor` relations) but also confirms concretely that closing this gap requires a **query change** (adding the relation to the `include`), not just a resolver-wiring change — a more precise statement than the original design table's more abstract note.
- **`UnifiedDocument` (Invoice/Ticket/Fitout types)**: `downloadUnifiedDocument` correctly branches by `entityType`, correctly enforces tenant-ownership for Invoice/Ticket, and correctly restricts Fitout sub-types to non-tenant roles — but confirmed **zero Mall check anywhere in this method** for any branch. A `MALL_DIRECTOR` for Mall A can download a Mall B invoice/ticket/fitout document as long as their role passes the (role-only) checks.

**Not completed this session**: the remaining 6 chains (FitoutDocument, ParkingContractDocument, ServiceContractDocument, WorkOrderEvidence, PatrolCheck, MaintenanceExecution) — carried forward from the architecture-review phase's design table, not independently re-read this session.

## Business confirmations

No new BC items were resolved by guessing. `BC-CEO-SCOPE`, `BC-009`, `BC-013`, `BC-017`, `BC-020`, `BC-008`, `BC-016` all remain exactly as triaged in the architecture-review phase — Phase 1/2 did not touch CEO policy, cross-Mall permission grants, or any live authorization decision, per explicit instruction.

## Known enforcement gaps (unchanged in practice, now explicitly recorded)

Every gap identified in `docs/architecture-review/15-CR-101-ROUTE-COVERAGE.md` plus the additional ones found this session (see table above) remain exactly as exploitable as before — Phase 1/2 added no protection. The only change is that these gaps are now individually, honestly annotated in code (`status: GAP`) rather than silently absent, which is precisely Phase 1/2's stated goal.

## Files changed

39 controllers + `apps/backend/src/files/files.controller.ts` (annotation only — `@Scope(...)` decorators and their imports added; no other line changed in any of these files). 5 new files: `scope.types.ts`, `scope.decorator.ts`, `scope.decorator.spec.ts`, `mall-resolver-registry.ts`, `mall-resolver-registry.spec.ts`, plus `scripts/route-scope-inventory.ts`.

## Database / Schema / Migration

UNCHANGED / UNCHANGED / NONE.

## Commit

NOT CREATED — per instruction, left in the working tree for review. Pre-existing unrelated WIP (the in-flight multi-currency work, governance docs) was not touched, added, or staged.

## Release

RC3 remains the designated release candidate. This work does not create a new RC.

## Phase 3 readiness

**NOT READY** — pending human authorization for the phase itself, plus these concrete prerequisites surfaced this session:
1. `BC-CEO-SCOPE` and the other carried-forward BC items should resolve before Phase 3's rollout order/scope is finalized (does not block the phase 3 *mechanism*, only its *sequencing*).
2. `UnitStatusService` needs a service-layer assertion, not just a controller-level fix, given its 7-caller reach.
3. AI's fix is plumbing-level (thread user identity through 3 methods), not a one-liner — should be scoped as its own sub-task within Phase 3.
4. The two newly-verified file chains show Phase 3's file-resolver work will require Prisma query changes (adding relations to `include`), not just resolver registration — the remaining 6 chains likely need the same kind of check before their fixes can be estimated accurately.
5. The full per-job and per-service-method sweeps flagged as "not completed this session" above should be finished before Phase 3 implementation begins, so its scope estimate isn't built on partially-verified ground.
