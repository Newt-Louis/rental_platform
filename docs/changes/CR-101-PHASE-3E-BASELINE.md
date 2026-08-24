# CR-101 Phase 3E — UnitStatusService Defense-in-Depth Baseline (captured 2026-08-22)

## Git state
- HEAD: `915c96e4b90c8002c238f731a90bd86cc90f4114` (unchanged from every prior CR-101 phase — no commit made anywhere in this program yet)
- `git diff --cached`: empty, 0 files staged
- `git status --short`: 121 pre-existing modified/untracked working-tree entries, carried forward from all prior phases through Phase 3D.

## Baseline test results
- Backend: 81 suites / 522 tests — Phase 3D's final confirmed count, carried forward (not independently re-run before this phase's edits; the post-edit full run in the completion doc, 82 suites / 531 tests with exactly 1 new suite / 9 new tests, is consistent with this starting point).
- Frontend baseline (unchanged across every prior phase): 28/29 files, 216/225 tests. Pre-existing, unrelated failure: `BookingsPage.test.tsx`, 9 tests.
- Route inventory (`scripts/route-scope-inventory.ts`): 523 routes across 41 controller files, unchanged from Phase 3D's final count.

## Re-verified call graph (against executable code, not the earlier "12 call sites" count alone)

Re-grepped `.transition(` across `apps/backend/src` fresh this phase. **Count confirmed unchanged: 12 call sites across 7 modules.** No drift from the count carried in `docs/architecture-review/20-CR-101-SERVICE-ENFORCEMENT-MATRIX.md`. One additional file (`slots.service.ts`) imports `UnitStatusService` but was confirmed to call only `isCommittedToTenant()` (a read-only predicate) — never `.transition()` — so it is not a call site for this invariant.

| # | File:line | Source entity for `unitId` | Classification |
|---|---|---|---|
| 1 | `booking.service.ts:183` (`create`) | `dto.unitId` — the Booking does not yet exist; there is no separate prior entity to be inconsistent with | SAFE ALREADY |
| 2 | `booking.service.ts:459`\* (`update`, unit reassignment) | `dto.unitId` — a **client-supplied new unit**, compared against an **already-existing Booking's original unit** | **NEEDS EXPECTED MALL PROPAGATION** |
| 3 | `booking.service.ts:734`\* (`restore`) | `booking.unitId` — DB-sourced from the record itself | SAFE ALREADY |
| 4 | `booking.service.ts:1096`\* (`promoteNextInQueue` → BOOKING) | `unitId` param — always called with `booking.unitId`/`existing.unitId` from an already-persisted record, never client input | SAFE ALREADY |
| 5 | `booking.service.ts:1109`\* (`promoteNextInQueue` → VACANT) | Same as #4 | SAFE ALREADY |
| 6 | `contract-termination.service.ts:137` | `contract.unitId` — DB-sourced from the Contract fetched by the route's own `contractId` | SAFE ALREADY |
| 7 | `contracts.service.ts:290` (`create`) | `dto.unitId` — new Contract, no prior entity to compare against (same reasoning as #1) | SAFE ALREADY |
| 8 | `fitout.service.ts:255` | `project.unitId` — DB-sourced from the FitoutProject fetched by the route's own `id` | SAFE ALREADY |
| 9 | `proposals.service.ts:736` | `proposal.unitId` — DB-sourced | SAFE ALREADY |
| 10 | `proposals.service.ts:874` | `proposal.unitId` — DB-sourced | SAFE ALREADY |
| 11 | `spaces.service.ts:521` (`updateUnitStatus`) | `id` — the route's own `:id` param, i.e. the target Unit itself; no separate source entity exists | SAFE ALREADY |
| 12 | `spaces.service.ts:722` (`updateUnitWithHistory`) | `id` — same as #11 | SAFE ALREADY |

\* Line numbers are post-Phase-3E-fix (the `update()` edit shifted lines 459→478, 734→753/755, 1096/1109→1115/1128 by a few lines within the same file; pre-fix line numbers matched the program's carried-forward count exactly, confirming no structural drift before this phase's edit).

**Only 1 of 12 call sites needed propagation.** All 11 SAFE-ALREADY sites share one of two patterns: (a) a **create** flow where the target `unitId` *is* the new entity's own Mall-defining field, so there is no second entity to be inconsistent with; or (b) a **trusted-entity-relationship** read where `unitId` is pulled from an already-persisted DB record (Contract/Proposal/FitoutProject/Booking/Unit-by-its-own-`:id`), never from unvalidated client input at the point `transition()` is called.

**HTTP-layer note on call site #2** (`booking.service.ts` `update()`): `MallAccessGuard` already validates `body.unitId` against the *authenticated user's* Mall access (`mall-access.guard.ts:32`), but that only proves the caller can access the *new* unit's Mall — a staff member with `UserMallAccess` grants to multiple Malls can legitimately pass that check while still silently reassigning a Mall-A booking to a Mall-B unit. This is exactly the entity-integrity gap Section 3 of the authorization describes ("must not accept 'caller says this is Mall A' as sufficient proof") — a distinct risk class from user-role HTTP authorization, not redundant with it.

**No `@Cron`/`@OnEvent` caller found** — re-confirmed via grep; `UnitStatusService.transition()` remains exclusively reachable via synchronous service calls from the 7 modules above, all ultimately triggered by an HTTP request.

## Trust model / current method signature (before this phase)

```typescript
async transition(
  unitId: string,
  toStatus: UnitStatus,
  options: UnitTransitionOptions = {},
  client: PrismaClientOrTx = this.prisma,
)
```

`UnitTransitionOptions` had no Mall-related field at all — `transition()` had zero way to express or check "this caller's own entity belongs to Mall X."

## Scope authorized this phase
**Phase 3E only**: `UnitStatusService.transition()` defense-in-depth (`INV-AUTH-006`) for internal/service-layer calls. Explicitly **not authorized**: Phase 3G (CEO/Cross-Mall policy), global fail-closed, strict startup gate, CI blocking, heuristic removal, CR-103 currency work, FIN-01, schema migration, unrelated refactor, state-machine redesign.
