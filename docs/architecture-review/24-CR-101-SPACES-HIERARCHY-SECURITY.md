# 24 — CR-101 Spaces Hierarchy Security

Audit only. No schema changed. Traces the Mall → Floor → Zone → Unit hierarchy directly against `apps/backend/prisma/schema.prisma` (read fresh this session, not assumed from the resolver registry's earlier design-level notes).

## Schema hierarchy, verified

```text
Mall (top-level, no parent)
  ├─ Floor.mallId    String   (REQUIRED, direct FK to Mall)
  ├─ Zone.mallId     String   (REQUIRED, direct FK to Mall)      Zone.floorId  String?  (OPTIONAL FK to Floor)
  └─ Unit.mallId     String   (REQUIRED, direct FK to Mall)      Unit.floorId  String?  (OPTIONAL FK to Floor)
```

## Critical finding — the hierarchy is NOT schema-enforced

**Floor, Zone, and Unit each carry their own independent, directly-settable `mallId` field.** None of them derive `mallId` from a parent relation at the database level — there is no computed column, no `CHECK` constraint, no trigger found in the schema tying `Unit.mallId` to `Unit.floor.mallId`, or `Zone.mallId` to `Zone.floor.mallId`. **Consistency across the hierarchy is a pure application convention, not a database guarantee.** This directly explains why `MallAccessService`'s resolvers use a `??` fallback pattern (`unit.mallId ?? unit.floor.mallId`) — but since `Unit.mallId` is non-nullable, that fallback is dead code in practice; it would only ever matter if the two fields had already diverged, which nothing currently prevents.

## Where consistency IS currently enforced (application-level, verified)

`SpacesService.validateUnitLocation(mallId, floorId, zoneId)` (`spaces.service.ts:84-98`), called from both `createUnit` and `updateUnit`, does check: the target Mall exists and is active; if a `floorId` is given, that Floor's own `mallId` matches; if a `zoneId` is given, that Zone's own `mallId` matches, and (if both floor and zone are given) the Zone's `floorId` matches the given Floor. **This is real, working consistency enforcement — but only for Unit, and only through this one code path.**

## Where consistency is NOT enforced (newly found this session)

`SpacesService.updateUnit()` (`spaces.service.ts:424-447`) calls `validateUnitLocation(current.mallId, nextFloorId, nextZoneId)` — using the Unit's **existing** `mallId`, before any change — but then persists `sanitizeUnitDto(dto)` to the database, and `sanitizeUnitDto`'s exclusion set (`UNIT_RELATION_FIELDS`) strips the relation-object keys (`'mall'`, `'floor'`, `'zone'`) but **not the scalar `mallId`/`floorId`/`zoneId` foreign-key fields themselves**. **A client-supplied `mallId` in an `updateUnit` request body is not stripped and is not re-validated against the new value** — only the *old* value was checked. Combined with `updateUnit`'s already-confirmed P0-002 authorization gap, this is a compounding risk: a request that shouldn't be authorized at all could, if it slipped through, also silently move a Unit to a different Mall with no consistency check against its (also-unchecked) new Floor/Zone.

No equivalent `validateXLocation` check exists for `Floor` or `Zone` updates at all (`updateFloor`/`updateZone` — confirmed no such call in either method, consistent with `15-CR-101-ROUTE-COVERAGE.md`'s finding that these routes are themselves `:id`-keyed authorization gaps with no deeper investigation attempted at the time).

## Invariants (formal)

```text
INV-AUTH-007  Floor.mallId is the authoritative source of a Floor's Mall — schema-guaranteed (required, direct FK).
INV-AUTH-008  Zone must be Mall-consistent with its Floor when a Floor is assigned — NOT schema-guaranteed;
              enforced only for Unit creation/update via validateUnitLocation, and only checked against the
              Unit's own target Mall, never independently for a Zone create/update itself.
INV-AUTH-009  Unit.mallId must be derivable from, and consistent with, its Floor/Zone assignment — NOT
              schema-guaranteed; enforced at Unit CREATE time (validateUnitLocation against the new mallId)
              but NOT fully at Unit UPDATE time (validateUnitLocation runs against the OLD mallId, and the
              scalar mallId field itself is not protected from being overwritten by client input).
```

## Does the current schema guarantee these relationships?

**No.** All three invariants above are enforced (where enforced at all) by application code convention, not by the database schema. A direct SQL `UPDATE "Unit" SET "mallId" = ... WHERE id = ...` (or an application bug bypassing `SpacesService`) could produce an inconsistent hierarchy today with nothing in the schema to prevent or even flag it.

## Recommendation (design only, not implemented)

For Phase 3 scoping purposes: closing `INV-AUTH-009` at the *application* layer means (a) fixing the P0-002 authorization gap on `updateUnit`/`updateUnitStatus`/`getMall`/`updateMall`/`deleteMall` (already tracked), (b) stripping `mallId`/`floorId`/`zoneId` from `sanitizeUnitDto`'s pass-through so a Unit's Mall/Floor/Zone can only change through a dedicated, re-validated "move unit" operation, and (c) adding the equivalent `validateXLocation` checks to `updateFloor`/`updateZone`. None of this requires a schema migration — it's application-code discipline, consistent with "do not migrate schema" for this phase. A schema-level guarantee (e.g., a generated/computed column or a `CHECK` constraint referencing the parent) is a separate, larger option not recommended for the near term given Postgres/Prisma's limited native support for cross-table check constraints — application-level enforcement is the pragmatic path.

## Status

Design/audit only. No schema or application code changed this phase.

---

## CR-101 Phase 3B update — implemented, with one correction to the Phase 2.5 finding above

**Correction**: line 24 above states that `sanitizeUnitDto`'s exclusion set "strips the relation-object keys... but not the scalar `mallId`/`floorId`/`zoneId`" and that "a client-supplied `mallId` in an `updateUnit` request body is not stripped." On re-reading `spaces.service.ts` directly this phase (not re-deriving from the earlier note), this was **incorrect**: `sanitizeUnitDto` checks two separate sets — `UNIT_RELATION_FIELDS` (stripped silently) and a second set, `UNIT_LIFECYCLE_FIELDS`, which **includes `mallId`** and **throws `BadRequestException`** if present in the update body, rather than silently passing it through. `UpdateUnitDto` additionally `OmitType`s `mallId` at the class-validator layer. **`Unit.mallId` was already immutable via all update paths before this phase** — the Phase 2.5 audit conflated the two exclusion sets. `floorId`/`zoneId` were correctly identified as unprotected by a *strip*, but they were never meant to be stripped — they're legitimate, client-settable fields, and **are** re-validated against the unit's own (immutable) `mallId` via `validateUnitLocation(current.mallId, nextFloorId, nextZoneId)` on every write path (`createUnit`, `updateUnit`, `updateUnitWithHistory`). This part of the finding was correct: `updateUnit` does call `validateUnitLocation` using `current.mallId` (the pre-existing, unchangeable value) — which is exactly the correct authoritative value to validate against, not a gap.

**What WAS a real, confirmed gap** (Phase 2.5's "No equivalent validateXLocation check exists for Floor or Zone" finding, line 26, was correct): `updateFloor`/`updateZone` used plain TypeScript object-literal body types rather than class-validator DTO classes, so the global `ValidationPipe`'s `whitelist: true` never engaged (it only strips fields for a real decorated class) — a client-supplied `mallId` in a Floor/Zone update body would have passed straight through to Prisma. **Fixed this phase**: added `sanitizeHierarchyDto` (mirrors `sanitizeUnitDto`'s `mallId` block) to `updateFloor`/`updateZone`, and added `validateFloorLocation`/`validateZoneLocation` (mirror `validateUnitLocation`'s shape) to `createFloor`/`createZone`/`updateZone`, checking `buildingId`/`floorId` cross-Mall consistency at creation and at Zone's `floorId` reassignment.

**Authorization** (P0-002 and the Mall/Floor/Zone route gaps documented in `15-CR-101-ROUTE-COVERAGE.md`): closed structurally this phase — all 43 non-EXEMPT routes in `spaces.controller.ts` now call `MallAccessService` before delegating to the service layer (route-inventory re-run: 43 ENFORCED, 0 GAP, 2 correctly EXEMPT — `createMall`/`setupMall`, no parent Mall to scope against). See `docs/changes/CR-101-PHASE-3B-SPACES-SECURITY.md` for the full route list, resolver mapping, and test evidence.

**Data reconciliation**: a read-only reconciliation query set (Floor/Zone/Unit vs. Building/Floor/Zone mallId cross-checks, dangling FK checks) ran against the dev database both before and after this phase's changes — 0 violations both times. The dev database currently contains only 1 Mall, which structurally limits what this reconciliation can detect (a single-Mall dataset cannot exercise a cross-Mall invariant) — this is flagged, not glossed over, in the Phase 3B completion doc.

Invariant status updated: `INV-AUTH-007` (Floor) and `INV-AUTH-010`/`INV-DATA-002` (no cross-Mall move via generic update) are now enforced at the application layer for Floor and Zone, matching what was already true for Unit. `INV-AUTH-008` (Zone/Floor consistency) is now enforced at Zone creation and at Zone's `floorId` reassignment, in addition to the pre-existing Unit-side check. `INV-AUTH-009` (Unit/Floor/Zone consistency) is confirmed to have been already fully enforced before this phase, not merely at create time as Phase 2.5's note suggested.
