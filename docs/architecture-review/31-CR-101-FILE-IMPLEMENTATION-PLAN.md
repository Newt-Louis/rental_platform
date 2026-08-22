# 31 — CR-101 Phase 3C: File Authorization Implementation Plan (design only, not implemented)

No code in this document is authorized to ship yet — this is the proposed shape for a future, separately-authorized implementation phase.

## Canonical architecture

The codebase already has the right shape — `MallAccessService`'s named-resolver pattern, proven correct and in production use for 20+ entity types across Phases 1–3B. **This plan does not propose a new framework.** It proposes finishing the same pattern for the 3 families that don't yet have a registered resolver, and — critically — actually *calling* the resolvers that already exist, in `files.controller.ts`, which today calls none of them.

```
fileId (files.controller.ts route param)
  ↓
File record (ContractFile / UnifiedDocument+entityType / FitoutDocument / ParkingContractDocument /
             ServiceContractDocument / WorkOrderEvidence / PatrolCheck / MaintenanceExecution)
  ↓
Owner entity + id (already extracted today, for the existing tenant/role check)
  ↓
Named MallAccessService resolver (mostly already registered; 3 new + Patrol's 5 folded in)
  ↓
assertMallAccess() / extractAndValidateMallAccess()  — same call used by every other Mall-scoped route
  ↓
ALLOW (stream) / DENY (403)
```

This deliberately does **not** force every family through one identical code path inside `FilesController` — `UnifiedDocument`'s `entityType` switch already exists and is the natural place to add a parallel Mall-resolution branch next to the existing tenant/role branch; the 6 dedicated-model families each get one resolver call added to their existing route. Ownership models genuinely differ (dedicated model vs. polymorphic vs. array-field) — forcing a single mega-abstraction across all of them would cost more than it saves, per the instruction not to force abstraction where models genuinely differ.

## Resolver reuse (Section 20)

**8 of 12 families need zero new resolver logic** — `contract`, `invoice`, `ticket`, `fitoutProject`, `fitoutSubmittal`, `fitoutIssue`, `fitoutDailyReportEntry`, `maintenanceSchedule` are all already registered, tested, and in production use. `files.controller.ts` just needs to inject `MallAccessService` and call the right one per route/branch.

**3 families need one new small resolver each** (direct-field lookups, mirroring the exact shape of Phase 3A's `servicePriceCatalog`/`announcementMall` additions): `workOrder` (`WorkOrder.mallId`), `parkingCustomerContract` (`ParkingCustomerContract.mallId`), `serviceContract` (`ServiceContract.mallId`). No schema change, no relation traversal beyond one hop, all three fields confirmed non-nullable this phase.

**1 family (Patrol) has its resolver already written, just not in the shared registry**: `PatrolService.checkMallId()` — the standing recommendation from `16-CR-101-RESOLVER-REGISTRY.md` to fold Patrol's parallel helper functions (`routeMallId`/`pointMallId`/`shiftMallId`/`checkMallId`/`scheduleMallId`) into `MallAccessService`'s registry as named resolvers, re-confirmed still valid and still unaddressed, is adopted here. This is a zero-behavior-change refactor (the logic is already correct) that leaves exactly one resolver registry platform-wide instead of two parallel-but-compatible ones — consistent with Section 20's instruction not to create a parallel framework.

## Performance (Section 21)

One additional DB query per previously-unscoped download route — same negligible-cost characterization already established for the rest of CR-101 (`19-CR-101-ADR.md`'s Performance section). One specific optimization identified: `downloadUnifiedDocument`'s per-`entityType` branches already fetch the owner entity (e.g. `invoice.findUnique({ select: { tenantId: true } })`) for the existing tenant check — the Mall-relevant fields (`mallId`, or `unit.mallId`/`unit.floor.mallId`) should be added to that **same** `select`, not fetched via a second round-trip. This avoids the N+1/duplicate-lookup pattern Section 21 asks to watch for, and is a small deviation from blindly calling `extractAndValidateMallAccess()` (which would re-fetch) — implementation should combine the existing fetch's `select` with what the resolver needs and call `assertMallAccess(userId, role, resolvedMallId)` directly once the mallId is in hand, rather than calling the full `extractAndValidateMallAccess()` wrapper a second time.

## Proposed implementation batches

**C1 — Canonical resolver infrastructure** (zero behavior change, purely additive — mirrors Phase 1/2's own precedent): add the 3 new small resolvers (`workOrder`, `parkingCustomerContract`, `serviceContract`) to `MallAccessService` + the registry doc. Fold Patrol's 5 existing helper functions into the registry as named resolvers (the underlying `patrol.service.ts` methods are unchanged — this is a registry/documentation-and-naming step, plus optionally re-exporting them through `MallAccessService` for consistency, TBD at implementation time based on whether Patrol's existing call sites should be migrated too or left as-is with just the registry entry added).

**C2 — Contract/Invoice/Ticket/Fitout** (the 7 families using already-registered, already-production-proven resolvers: `ContractFile`, `UnifiedDocument`×5 branches, `FitoutDocument`). Lowest risk in the whole plan — no new resolver logic, just wiring `files.controller.ts` to call what already exists.

**C3 — Parking/ServiceContract/WorkOrder/Patrol** (the 4 families needing C1's new/folded resolvers). Includes the specific, narrow `patrol-checks/:fileId` fix (call `checkMallId()`, the confirmed one-line fix from `28-...-READINESS.md` §4).

**C4 — Fitout document-review parentId fix + Fitout-Issue explicit wiring**: (a) `fitout-documents.service.ts`'s `reviewDocument()` — change `findUnique({ id: documentId })` to `findFirst({ where: { id: documentId, projectId } })`, mirroring the pattern already proven correct in `contracts.service.ts`/`service-contracts.service.ts`; (b) `fitout-issue.controller.ts` — add the same explicit `MallAccessService` call its sibling controllers (`fitout-submittal`, `fitout-daily-report`) already have, promoting it from incidental global-guard coverage to an explicit, build-visible check.

**C5 — Consolidation / adversarial gate**: run the full parameterized cross-Mall/cross-tenant test matrix (below) across every family touched in C2–C4, plus an adversarial review pass (same discipline as Phase 3A/3B/3B.1: attempt every threat-model category from `30-...-THREAT-MODEL.md` against the post-fix code), plus a route-inventory re-run, before the File domain can be considered closed. "Tenant Portal" in this codebase is the shared staff/tenant routes filtered by `Role.TENANT` (no separate portal controller exists, confirmed this phase) — so C5's Tenant-Portal testing is the same parameterized matrix, run with a `TENANT`-role actor as one more row, not a separate implementation track.

Batches are independently revertible and shippable in any order after C1 (C2/C3/C4 don't depend on each other, only on C1's new resolvers existing where relevant).

## Test plan (parameterized, per Section 22)

For each of the 10 resolvers touched (7 reused, unchanged — regression-only; 3 new; Patrol's folded-in ones): extend `mall-access.service.spec.ts` with the same `it.each` DENY/ALLOW/bypass-role pattern used in every prior CR-101 phase (Phase 3A's 4 new resolvers, Phase 3B's `zone` resolver) — same-Mall ALLOW, cross-Mall DENY, ADMIN/CEO/TENANT bypass-with-no-lookup.

Per-route wiring tests (mirroring `spaces.controller.authorization.spec.ts`'s pattern): for every `files.controller.ts` route touched, confirm it calls the right resolver with the right source key and that a DENY from `MallAccessService` blocks the stream (service/storage layer never reached).

Dedicated test for the `fitout.controller.ts` fix (mirroring Phase 3B.1's `saveMapPositions` test shape): same-project ALLOW, cross-project-same-Mall DENY, cross-Mall DENY, unknown-`docId` safe 404 (not a crash), forged `docId` from a different project DENY.

Required scenario coverage, mapped to families:
- Same-Mall staff → ALLOW: all 12 families.
- Cross-Mall staff → DENY: all 12 families.
- Correct Tenant → ALLOW where applicable: Contract/Invoice/Ticket/Fitout-project (4 families with a tenant dimension).
- Wrong Tenant → DENY: same 4.
- Correct role but wrong Mall → DENY: all 12 (this is the core fix being tested).
- Correct Mall but wrong role → DENY: all 12 (regression — must not weaken the existing role gates while adding the Mall check).
- Unknown file → safe domain response (404, not 500/leak): all 12 (regression against existing `NotFoundException` behavior).
- Forged parent ID → DENY: the `fitout.controller.ts` review fix specifically (the only confirmed instance of this class).
- Direct storage path → DENY where protected: regression test confirming the static-mount allowlist is unchanged (3 subpaths only) — no new work, just a standing assertion.
- Delete without write authority → DENY: the 2 families with delete routes (Contract files, Service Contract documents) — regression only, already correct.
- ADMIN → preserve current policy: every new test's bypass-role case.
- CEO → preserve current policy until `BC-CEO-SCOPE` (pre-existing, unrelated to this batch) is separately decided — every new test's bypass-role case, unchanged from today's blanket bypass.

## Business confirmations required

**None new.** Every gap found this phase is closeable via existing, non-schema-dependent, already-proven mechanisms (§"Resolver reuse" above) — no business-policy question blocks any of C1–C5. The pre-existing `BC-CEO-SCOPE` (tracked in `19-CR-101-ADR.md`, unrelated to file authorization specifically — it governs CEO's blanket Mall bypass platform-wide) is the only open business item that touches this domain at all, and it is explicitly out of scope for this readiness review per the authorizing instruction (Section 9: "do not make a new policy decision... BC-CEO-SCOPE remains outside Phase 3C readiness").

## Recommended first batch

**C1**, followed immediately by **C2** — C1 is pure infrastructure (new resolvers + registry entries, zero behavior change, lowest possible risk, matches the exact shape of every prior successful CR-101 phase's opening step), and C2 closes the 7 highest-count, lowest-risk families using resolvers already proven correct in production elsewhere in the codebase. C3's Patrol-specific fix (`patrol-checks`) could be pulled forward and shipped alone even before C1/C2 if the human reviewer wants the single most precisely-confirmed, one-line fix landed fastest — flagged as an option, not a recommendation, since bundling it with C3 keeps the Patrol-resolver-folding work (C1) and its consumer (C3) in the same reviewable unit.

## Status update — C4 COMPLETED (`docs/changes/CR-101-PHASE-3C-C4-COMPLETION.md`)

**C4-01** (`fitout.controller.ts` `reviewDocument`): fixed with the exact pattern proposed — `FitoutDocumentsService.reviewDocument()` now takes `projectId` and uses `findFirst({ where: { id: documentId, projectId } })` instead of `findUnique({ where: { id: documentId } })`. **C4-02** (`fitout-issue.controller.ts`): all 9 routes (not just the originally-cited photo routes) now call `MallAccessService` explicitly, reusing the registered `fitoutProject`/`fitoutIssue` resolvers — a minor scope correction from the original single-route framing (all 9 routes shared the identical root cause, confirmed by reading the full controller, not a scope expansion). C5 (consolidation) remains the only step before the File Authorization domain can be declared closed.

## Status update — C3 COMPLETED (`docs/changes/CR-101-PHASE-3C-C3-COMPLETION.md`)

All 4 remaining resolvers added: `workOrder`, `parkingCustomerContract`, `serviceContract` (all direct-field, no schema dependency, confirmed against the current schema before implementation) and `patrolCheck` (folds `PatrolService.checkMallId()`'s logic into the canonical registry — `patrol.service.ts` itself untouched). All 5 remaining `files.controller.ts` families (Parking, Service Contract, Work Order, Patrol, Maintenance) RESOLVED. Table A of `29-...-OWNERSHIP-MATRIX.md` is now fully closed (12/12). C4 (`fitout.controller.ts` `reviewDocument`, `fitout-issue.controller.ts`) remains exactly as proposed, unchanged, not authorized.

## Status update — C1+C2 COMPLETED (`docs/changes/CR-101-PHASE-3C-C1-C2-COMPLETION.md`)

C1 required no new resolver code — all 7 C2 families reuse already-registered resolvers (confirmed in `29-...-OWNERSHIP-MATRIX.md`'s status update). Its actual deliverable was injecting `MallAccessService` into `FilesController` (which had neither it nor a Mall-check-driving `@CurrentUser` usage before) and passing the registry-integrity gate — both done. C2's 4 routes / 7 families are RESOLVED. Patrol's resolver-folding (originally scoped as part of C1's broader description) was **not** done this batch — it's only needed by C3, which is not authorized here; doing it now would have been speculative work ahead of its actual consumer, and C1's narrower "what C2 needs" scope, confirmed at readiness-review time, didn't require it. C3, C4, C5 remain exactly as proposed above, unchanged, still not authorized.
