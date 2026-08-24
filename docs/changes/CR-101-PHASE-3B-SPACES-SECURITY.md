# CR-101 Phase 3B — Spaces Hierarchy Security: Completion Report

Status: **Implementation complete, unstaged, awaiting human review.** No commit made. RC3 remains designated; no RC4.

## 1. Data Gate

**CLEAN**, for the single-Mall dataset present in the dev database — see the explicit caveat in `docs/changes/CR-101-PHASE-3B-BASELINE.md` (a 1-Mall dataset cannot exercise a cross-Mall invariant). 0 violations across 15 read-only checks, both before and after this phase's changes (re-run in §8 below).

## 2. Authoritative ownership model

| Entity | Source of truth for its Mall | Mutable via generic update? | Enforced how |
|---|---|---|---|
| Mall | itself (`Mall.id`) | N/A | — |
| Floor | `Floor.mallId` (direct, required FK) | **No, as of this phase** | `sanitizeHierarchyDto` throws on `mallId` in the update body (new) |
| Zone | `Zone.mallId` (direct, required FK) | **No, as of this phase** | same (new) |
| Unit | `Unit.mallId` (direct, required FK) | No — **was already immutable before this phase** | `sanitizeUnitDto`'s `UNIT_LIFECYCLE_FIELDS` + `UpdateUnitDto`'s `OmitType(['mallId'])` |

Derived/validated (not authoritative, but checked against the authoritative field on every write):
- `Zone.floorId` (optional) — now validated against `Zone.mallId` at creation and at reassignment (new, `validateZoneLocation`).
- `Floor.buildingId` / `Zone.buildingId` (optional) — now validated against the Floor/Zone's own `mallId` at creation (new, `validateFloorLocation`/`validateZoneLocation`).
- `Unit.floorId` / `Unit.zoneId` (optional) — already validated against `Unit.mallId` on every write path (`createUnit`, `updateUnit`, `updateUnitWithHistory` via `validateUnitLocation`) **before this phase** — confirmed working, not modified.

## 3. Correction to the Phase 2.5 finding (Section 10 of the authorization)

The authorization's premise — `updateUnit()` does not strip scalar `mallId`/`floorId`/`zoneId` from incoming updates — was **half right**. Independently re-verifying against the running code (not the earlier note) found:
- **`mallId`: already immutable.** `sanitizeUnitDto` throws `BadRequestException` if the update body contains `mallId` (it's in `UNIT_LIFECYCLE_FIELDS`, not the silently-stripped `UNIT_RELATION_FIELDS` set the Phase 2.5 doc referenced), and `UpdateUnitDto extends PartialType(OmitType(CreateUnitDto, ['mallId', 'status']))` blocks it at the DTO layer too. No fix was needed or made here.
- **`floorId`/`zoneId`: correctly mutable**, and **already validated** on every write path via `validateUnitLocation(current.mallId, nextFloorId, nextZoneId)` — using the unit's own pre-existing, immutable `mallId` as the check basis. This is exactly the right design; no gap.
- **The real, equivalent gap was one level up**: `Floor.mallId` and `Zone.mallId` had **no** protection at all — `updateFloor`/`updateZone` type their request bodies as plain TypeScript object literals rather than class-validator DTO classes, so the global `ValidationPipe`'s `whitelist: true` never engages (NestJS only strips fields for a real decorated class; a plain object type erases to `Object` at runtime and is skipped by the pipe entirely). A client-supplied `mallId` would have passed straight through to Prisma. **Fixed this phase.**

`docs/architecture-review/24-CR-101-SPACES-HIERARCHY-SECURITY.md` has been updated with this correction inline, preserving the original (partially incorrect) Phase 2.5 text rather than silently rewriting it, per the standing instruction to independently re-verify and disclose discrepancies rather than assume prior claims.

## 4. Data-integrity fixes implemented

- `spaces.service.ts`: added `sanitizeHierarchyDto` (Floor/Zone equivalent of `sanitizeUnitDto`'s `mallId` block) — wired into `updateFloor`/`updateZone`.
- Added `validateFloorLocation(mallId, buildingId)` — wired into `createFloor`.
- Added `validateZoneLocation(mallId, floorId, buildingId)` — wired into `createZone`, and into `updateZone` when `floorId` is being reassigned (loads the zone's current `mallId` first, validates the new `floorId` against it, then persists).
- **Zero blast radius confirmed**: grepped the frontend for every caller of `updateFloor`/`updateZone` (`CreateEditFloorDialog.tsx`, `AdminPage.tsx`) — neither sends `mallId`, and the Zone edit form doesn't send `floorId` either. No legitimate existing flow is affected; this closes a latent gap nothing was exercising, not a behavior change.

## 5. Authorization — P0-002 and the Mall/Floor/Zone route gaps closed structurally

**Not patched as one method** — every route in `spaces.controller.ts` was reviewed. Resolver-wise, this needed far less new code than expected once verified: Mall's own `:id` IS the mallId (`{ mallId: id }`, no lookup); Floor's and Unit's own `:id` reuse the pre-existing `floor`/`unit` resolvers in `MallAccessService` unchanged (those resolvers already did "given an id, look up X.mallId" regardless of whether the id came from a route's own `:id` or a foreign-key field elsewhere). Only **Zone's own-id lookup was genuinely new** (`zoneId` source, direct `Zone.mallId` field, added to `extractAndValidateMallAccess`).

Route-inventory re-run, filtered to `spaces.controller.ts`:

| Before | After |
|---|---|
| ~12 routes GAP-status (Mall get/update/delete, Floor update/delete, Zone update/delete, Unit get/update/status/delete + list routes with no accessible-set fallback) | **43 ENFORCED, 0 GAP, 2 EXEMPT** (`createMall`/`setupMall` — no parent Mall exists yet to scope against, unchanged from Phase 1/2's original correct judgment) |
| ~20+ routes with **no `@Scope` annotation at all** (floor map/floor-plan sub-routes, all unit media/history/map-position/import sub-routes, merge/split/compare/bulk-update, analytics dashboards) | now declared and enforced |

Full before/after per route, and the resolver each uses, is in the git diff of `spaces.controller.ts` (every changed method carries a `trackedAs: 'CR-101 Phase 3B'` `@Scope` annotation for traceability) — not reproduced in full here to avoid duplicating the diff.

**List/search endpoints** (Section 17): `getUnits`, `getFloors`, `getZones`, `searchUnits` (advanced search), `getOccupancy`, `getStaleVacantUnits`, `getExpiringLeases` now do real query-level scoping — an explicit `mallId` is checked via `assertMallAccess`; an omitted `mallId` falls back to `getAccessibleMallIds()` and filters at the DB query (`where.mallId = { in: accessibleMallIds }`), not post-filtering in the response layer. **Deliberately left partial** (checked only when `mallId` is explicit, no accessible-set fallback when omitted): the three `analytics/*` dashboard endpoints (`getRentAnalytics`, `getOccupancyTrend`, `getAvailabilityCalendar`) — matching the same conservative-canary treatment Phase 3A applied to the equivalent Analytics-module dashboards. Documented, not silently left as a platform-wide-GAP claim.

**Bulk / multi-entity routes** (`mergeUnits`, `bulkUpdateUnits`, `compareUnits`): these can't be authorized at the controller layer without a duplicate DB query (the Mall to check is only knowable after reading the referenced units), so `MallAccessService` was injected into `SpacesService` for these three methods specifically — the only place in this phase where the check happens in the service rather than the controller. `mergeUnits` checks once against the one shared Mall the service's own pre-existing `mallIds.size > 1` invariant already guarantees; `bulkUpdateUnits`/`compareUnits` (no such same-Mall constraint exists between the selected units) check every distinct Mall among the selected units against the caller's accessible set.

**Newly found, documented, deferred** (not fixed this phase): `saveMapPositions` (`PATCH floors/:id/map-positions`) checks the floor itself but does not verify that each `body.positions[].unitId` actually belongs to that floor — a caller with legitimate access to Floor A could silently move Floor B's unit coordinates if they guessed/enumerated a unitId. This is a data-correctness question (should mismatched entries be rejected or silently skipped?) more than a Mall-authorization question, and wasn't in the authorized scope of this phase's Mall/Floor/Zone/Unit hierarchy work — flagged for a future batch, not silently ignored.

## 6. Cross-Mall relocation (Section 11)

**No new "changeUnitLocation" command was designed or built.** Investigation found this wasn't needed: `Unit.mallId` was already fully immutable before this phase (confirmed in §3), and no code path anywhere allows changing it. `INV-AUTH-010` ("client input may not move a resource across Mall boundaries without an authorized business operation") is therefore **already trivially satisfied for Unit** — there is no operation to guard, only a would-be-input to reject if it appeared. The same is now true for Floor and Zone (fixed §4). If the business later wants to support relocating a Unit/Floor/Zone to a different Mall, that is a new, explicit, authorized operation requiring its own design and a Business Confirmation — not something this phase invented speculatively, and not something the current codebase does or implies is needed.

## 7. Blast radius trace (Section 12)

Unit is consumed, directly or indirectly, by: Bookings, Proposals, Contracts, Billing, Fitout, Work Orders, Tickets, Patrol (via routes/points, not Unit directly — NONE), Inventory (category/pricing references Unit — INDIRECT), Sales, Parking (NONE — Parking's domain model is independent, `ParkingZone`/`ParkingCustomerContract` reference `Mall` directly, not `Unit`), Reports/Analytics (DIRECT — many read `Unit.mallId` for scoping), AI (INDIRECT — reads Unit data via other services' outputs, not directly), SAP (NONE — SAP integration keys off Tenant/Invoice, not Unit). None of these consumers were touched this phase, and none needed to be: this phase did not change `Unit.mallId`'s mutability (already immutable) or `Unit`'s shape — only added authorization checks in front of existing, unchanged service logic, and closed a Floor/Zone gap those other modules don't reference (no other module writes to `Floor.mallId`/`Zone.mallId`).

## 8. Post-change reconciliation (Section 22)

Re-ran the identical read-only query set from the baseline. **0 violations — unchanged from baseline.** Data Gate remains CLEAN (with the same single-Mall-dataset caveat).

## 9. Testing

- **New resolver (`zoneId`)**: extended `mall-access.service.spec.ts` with the same DENY/ALLOW/bypass-role pattern used for every other resolver in this codebase — 3 new tests.
- **Data-integrity fixes**: new file `spaces.hierarchy-integrity.spec.ts` — 12 tests covering: `updateFloor`/`updateZone` reject a `mallId` in the body; `updateZone` rejects a cross-Mall `floorId` reassignment and allows a same-Mall one; `createFloor`/`createZone` reject a cross-Mall `buildingId`/`floorId` and allow a same-Mall one; `updateZone` on a nonexistent zone throws `NotFoundException`.
- **Authorization wiring**: new file `spaces.controller.authorization.spec.ts` — 18 tests covering: every direct-mallId route (Mall get/update/delete) calls `assertMallAccess` with the route's own id and blocks the service on denial; every entity-resolver route (Floor/Zone/Unit get/update/delete/split, 9 routes) calls `extractAndValidateMallAccess` with the correct resolver source and blocks the service on denial; `getUnits` checks explicit `mallId` and does not fall back, falls back to the accessible set when `mallId` is omitted, and blocks the service when the explicit `mallId` is denied; `bulkUpdateUnits`/`mergeUnits`/`compareUnits` correctly forward the caller through to the service for the per-entity check.
- **Compatibility fix caught by this testing pass**: `mergeUnits`/`bulkUpdateUnits`'s existing spec files (`spaces.merge-split.spec.ts`, `spaces.crud.spec.ts`) call these methods with `userId` as a positional string argument — an initial edit inserted the new `user` object parameter *before* `userId`, which would have silently broken those tests' `userId`-dependent history-log assertions. Caught by `tsc`/re-running the suite before considering the change done; fixed by appending `user` *after* `userId` instead of inserting before it, preserving the original positional contract. Also updated `spaces.merge-split.spec.ts`'s and `spaces.crud.spec.ts`'s `SpacesService` instantiation to supply the newly-required `MallAccessService` constructor dependency.
- **Full regression**:
  - Backend (`npx jest`): **74/74 suites, 437/437 tests passing** (405 Phase-3A baseline + 32 new this phase).
  - Frontend (`npx vitest run`): **28/29 files, 216/225 tests** — identical to baseline, same 9 pre-existing `BookingsPage.test.tsx` failures.
  - `tsc --noEmit`: clean.
  - `eslint` on every file touched: clean.
  - `nest build`: clean.
  - `git diff --check`: clean.

## 10. Adversarial review (Section 23)

- **body.mallId injection**: tested directly — Unit (pre-existing), Floor/Zone (new fix) all reject it.
- **floorId/zoneId substitution**: Unit's reassignment already validated against its own immutable mallId (pre-existing, confirmed, tested). Zone's floorId reassignment now validated against the zone's own mallId (new, tested).
- **unitId substitution / nested DTO bypass**: checked `unit-media.service.ts`'s `updateMedia`/`deleteMedia` — both scope their lookup as `findFirst({ where: { id: mediaId, unitId } })`, so a `mediaId` that doesn't actually belong to the `:id` in the URL returns `NotFoundException` rather than acting on the wrong unit's media. No bypass found.
- **cross-Mall PATCH**: covered by the Floor/Zone/Unit mallId-immutability findings above.
- **list without mallId / query mallId spoof**: covered by the accessible-set fallback (§5) and the explicit-mallId `assertMallAccess` check on every list route.
- **alternate endpoint**: grepped the entire backend for any other controller directly querying `prisma.unit`/`prisma.floor`/`prisma.zone`/`prisma.mall` — none found; `spaces.controller.ts` is the sole HTTP surface for these four models.
- **direct service caller**: internal (non-HTTP) callers of `SpacesService` are out of scope for HTTP-layer authorization, consistent with the platform's existing `BYPASS_ROLES` design intent for internal/system operations — not a new exception introduced this phase.
- **bulk operation / import/export**: `mergeUnits`, `bulkUpdateUnits`, `units/import`, `units/import/logs` all reviewed and now checked (§5).

**Result: 0 confirmed or plausible bypasses found**, one newly-found-and-documented (not fixed) gap: `saveMapPositions`'s per-position unitId ownership (§5).

## 11. Documentation updated
- `apps/backend/src/common/services/mall-resolver-registry.ts` — added `zone` to `EXISTING_MALL_RESOLVERS`; removed `unitById`/`mallById`/`floorById`/`zoneById` from `PLANNED_MALL_RESOLVERS` (superseded — see registry file's inline note on why no new resolver code was needed for three of the four).
- `docs/architecture-review/24-CR-101-SPACES-HIERARCHY-SECURITY.md` — appended a Phase 3B section correcting the Phase 2.5 finding (§3) and recording what was implemented.
- `docs/changes/CR-101-PHASE-3B-BASELINE.md`, this document.

## 12. Git discipline
No `git add -A`. All 97 working-tree entries (Phase 3B edits plus everything carried forward) confirmed **unstaged** (`git diff --cached` empty) before this report was written. No commit created. No RC4. RC3 (`c61fdb9`) unchanged.

## 13. Stop conditions / scope boundaries respected
- Live hierarchy data was not ambiguously inconsistent (CLEAN, with the single-Mall caveat stated plainly rather than overclaimed).
- No schema migration became necessary or was made — every fix is application-layer (DTO/service validation), consistent with Section 24's "no schema migration by default" instruction. Section 24 doc note: a DB-level `CHECK` constraint tying `Unit.mallId` to `Floor.mallId` is not proposed — Postgres/Prisma's limited native support for cross-table check constraints makes this a poor near-term investment relative to the application-layer fix already in place and tested.
- Cross-Mall Unit relocation's business legality was not decided because it didn't need to be — no code path allows it, and none was requested (§6).
- No Contract/Billing financial semantics were touched.
- No CEO policy changed.
- Scope did not expand into AI/Files/CR-103.

## 14. Final Report

CR-101 PHASE 3B IMPLEMENTATION COMPLETED

**Baseline hierarchy reconciliation** (dev DB, single Mall — see caveat):
- Floor violations: 0
- Zone violations: 0
- Unit violations: 0
- Orphans / dangling FKs: 0

**Authoritative hierarchy**: Mall (root) → Floor.mallId / Zone.mallId / Unit.mallId (each a direct, required FK to Mall — not derived, not schema-tied to each other) → Zone.floorId (optional) / Unit.floorId+zoneId (optional), all now validated against the owning record's own mallId on every write path.

**Routes remediated**: 43 of 45 routes in `spaces.controller.ts` (2 correctly EXEMPT — Mall creation has no parent to scope against).

**P0-002**: RESOLVED (structurally — every Unit route, including all previously-unannotated sub-routes: media, history, map-position, import, merge/split/compare/bulk-update).

**updateUnit**: no code change needed — `mallId` was already immutable; `floorId`/`zoneId` were already correctly validated. Phase 2.5's premise partially corrected (§3).

**Cross-Mall relocation**: not designed/built — not needed, no code path permits it for any of Mall/Floor/Zone/Unit (§6). BC not required because there's no ambiguity to resolve.

**Authorization tests**: 18 new (spaces.controller.authorization.spec.ts) + 3 new (mall-access.service.spec.ts, zoneId resolver).

**Data-integrity tests**: 12 new (spaces.hierarchy-integrity.spec.ts).

**Downstream regression**: full backend (74/74 suites, 437/437 tests) and frontend (28/29 files, 216/225 tests, baseline-identical) suites actually executed, not claimed without running.

**Post-change reconciliation**: 0 violations, unchanged from baseline.

**Adversarial review**: 0 confirmed/plausible bypasses; 1 newly-found-and-documented (not fixed) gap — `saveMapPositions` per-position unitId ownership.

**Schema**: UNCHANGED.

**Database data**: UNCHANGED.

**Application files changed**: `mall-access.service.ts`, `mall-resolver-registry.ts`, `spaces.controller.ts`, `spaces.service.ts`, plus 2 new spec files and fixes to 2 existing spec files' `SpacesService` instantiation (dependency injection) and positional-argument calls.

**Tests**: 74/74 backend suites, 437/437 backend tests; 28/29 frontend files, 216/225 frontend tests (baseline-identical).

**Git diff --check**: clean.

**Commit**: NOT CREATED.

**Release**: RC3 UNCHANGED.

**PHASE 3C READINESS**: NOT READY (Phase 3C — Files — was explicitly not authorized this phase; its scope is unrelated to Spaces hierarchy and has not been investigated further since the read-only File-owner verification completed in Phase 3A).

**NEXT**: CR-101 PHASE 3B HUMAN REVIEW

**IMPLEMENTATION AUTHORIZATION**: CONSUMED

---

## Addendum — CR-101 Phase 3B.1 (Spaces residual gap closure)

Phase 3B's own §5/§10 flagged, but explicitly did not fix, one finding: `saveMapPositions` authorized the target Floor but never verified that each `body.positions[].unitId` actually belonged to that Floor (or Mall). Re-verified against the executable code this sub-phase (not assumed from the prior report) — **confirmed**, not a false positive.

**Root cause**: `saveMapPositions` fetched the Floor only to confirm it exists, then ran `positions.map(p => prisma.unit.update({ where: { id: p.unitId }, ... }))` inside a `$transaction` with no ownership check on any `p.unitId`.

**Fix** (`spaces.service.ts`): before the existing (already-atomic) transaction runs, the method now: rejects duplicate `unitId` entries in the payload (ambiguous intent); batch-fetches all referenced units in one `findMany`; rejects the entire request if any referenced unit doesn't exist, or if any unit's `floorId` doesn't match the target Floor, or its `mallId` doesn't match the target Floor's `mallId`. All validation happens before any write, so a rejected request never produces a partial mutation — the pre-existing array-form `$transaction` was already all-or-nothing, so no atomicity fix was needed (confirmed, not assumed).

**Tests**: new file `spaces.map-position-integrity.spec.ts`, 9 tests, using a mocked two-Mall fixture (Mall A/Floor A/Unit A vs Mall B/Floor B/Unit B — the live dev DB has only one Mall, so this is a unit-test fixture, not a DB mutation): same-Floor single and multi-unit ALLOW; cross-Floor-same-Mall DENY; cross-Mall DENY; one-invalid-id-among-valid DENY with no partial write; duplicate-id DENY; empty-payload no-op preserved; missing-Floor `NotFoundException` preserved; and an explicit note/assertion that the check is unconditional on caller role (ADMIN/CEO's Mall-access bypass lives one layer up, in the controller — this integrity check has no role parameter to bypass).

**Regression**: backend 75/75 suites, 446/446 tests (446 = 437 Phase-3B total + 9 new). Frontend unchanged (28/29, 216/225, same pre-existing `BookingsPage` failures). `tsc`, `eslint`, `nest build`, `git diff --check` all clean. Route inventory re-run: Spaces unchanged at 43 ENFORCED / 2 EXEMPT / 0 GAP (this fix tightened data integrity behind an already-ENFORCED route, not the route count).

**Spaces consolidation review** (bounded, per Phase 3B.1 §7 — not a general platform audit):
- **P0**: none remaining known in Spaces.
- **P1**: none remaining known in Spaces (the map-position gap was the P1 finding; now fixed).
- **P2/P3**: (a) the three `analytics/*` dashboard list endpoints (`getRentAnalytics`/`getOccupancyTrend`/`getAvailabilityCalendar`) still check an explicit `mallId` but don't fall back to the accessible-Mall set when omitted — P2, already documented as a deliberate deferral in the main Phase 3B report, not new; (b) `mergeUnits`/`splitUnit`'s reliance on `mergedFromIds` (an immutable historical array set at merge time, when same-Mall was already enforced) rather than re-deriving Mall membership fresh at split time — P3, theoretical only, no path to exploit given `mallId` is immutable everywhere in this domain.
- **FALSE POSITIVE checked and closed**: whether `units/import`'s CSV/JSON rows could carry a `mallId` that overrides the authorized query-param `mallId` — verified against `unit-media.service.ts`'s `importUnits`: the upsert's compound key (`mallId_code`) and both the `create` and `update` payloads always use the single authorized `mallId`; rows have no `mallId` field read at all. No gap.
- **LATER PROGRAM**: Phase 3C (Files), Phase 3D (AI), Phase 3E (UnitStatusService), Phase 3G (cross-Mall/CEO) — unrelated to Spaces, not investigated further here, consistent with staying in scope.

**SPACES DOMAIN**: CLOSED (no known P0/P1 remaining).

**NEXT**: CR-101 PHASE 3B.1 HUMAN REVIEW

**IMPLEMENTATION AUTHORIZATION**: CONSUMED
