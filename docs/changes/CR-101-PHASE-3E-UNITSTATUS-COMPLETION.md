# CR-101 Phase 3E — UnitStatusService Defense-in-Depth Completion

See `CR-101-PHASE-3E-BASELINE.md` for the re-verified 12-call-site inventory this phase started from.

## 1. Objective — result

`UnitStatusService.transition()` now accepts an optional `expectedMallId` and enforces `INV-AUTH-006` (entity-integrity, not user-role policy) before any mutation, for the one call site that needed it. The other 11 call sites are structurally safe already and were left untouched.

## 2. Call graph — re-verified

12 call sites, 7 modules, unchanged count. Full classification table in the baseline doc. **1 NEEDS_PROPAGATION → FIXED, 11 SAFE ALREADY → untouched.**

## 3. Trust model

`UnitTransitionOptions` gained:

```typescript
/**
 * CR-101 Phase 3E / INV-AUTH-006 — the Mall the caller's own already-validated
 * business entity belongs to (e.g. a Booking's current unit.mallId before a
 * unit reassignment). When provided, must match the target Unit's actual
 * mallId or the transition is denied before any mutation. Never populate this
 * from unvalidated client input — only from a value the caller itself derived
 * from a trusted, already-persisted record. Omit when the caller has no prior
 * entity to compare against (e.g. creating a brand-new Booking/Contract
 * against `unitId` directly — there is nothing to be inconsistent with yet).
 */
expectedMallId?: string;
```

This is the exact minimal-trusted-input concept the authorization anticipated (`transition({ unitId, ..., expectedMallId })`), verified against the actual method signature rather than forced onto it — `expectedMallId` is optional so all 11 unaffected call sites compile and behave identically with it omitted.

## 4. INV-AUTH-006 — enforcement

```typescript
const unit = await client.unit.findUnique({ where: { id: unitId } });
if (!unit) throw new NotFoundException('Unit not found');

if (options.expectedMallId && options.expectedMallId !== unit.mallId) {
  throw new ForbiddenException(
    'Unit does not belong to the expected mall for this operation',
  );
}
```

Placed immediately after the `unit` lookup and before every other check (live-contract check, active-booking check, transition-table check, history write, `unit.update`) — a mismatch throws before any read past the initial lookup and before any write of any kind. `ForbiddenException` was chosen to match `MallAccessService`'s existing convention for Mall-authorization denials (`mall-access.service.ts:27,171,194,212`), not `BadRequestException` (reserved for user-input-shape validation elsewhere in this same method).

## 5. Not turned into user-RBAC

No `user`, role, or `CurrentUser` was added to `UnitStatusService`. The check is a pure entity-to-entity Mall-consistency assertion, independent of who the caller is or what role they hold — exactly as Section 5 required. HTTP-layer RBAC (`MallAccessGuard`, `@Roles`) is untouched and remains the sole place user-facing permission policy lives.

## 6. Caller propagation — the one site that needed it

`booking.service.ts`'s `update()` method, unit-reassignment branch (`dto.unitId !== booking.unitId`):

- **Before**: fetched the new unit, checked it exists/is active/isn't locked, then unconditionally reassigned the booking to it and called `unitStatus.transition(newUnitId, BOOKING, {...})` — no comparison against the booking's original Mall anywhere.
- **After**: additionally fetches the *original* unit's `mallId` (one extra indexed `findUnique`, `select: { mallId: true }` only) and, if the new unit's `mallId` differs, throws `ForbiddenException` **before entering the transaction at all** — this is a stronger guarantee than relying on `transition()`'s internal check, since it means the booking's `unitId` field itself is never written to point at the wrong-Mall unit, not even transiently inside a transaction that would later roll back. The resolved `originalUnitMallId` is *also* threaded into the `unitStatus.transition(newUnitId, BOOKING, { ..., expectedMallId: originalUnitMallId })` call as defense-in-depth, so the chokepoint check still holds even if a future refactor removed the early pre-transaction check.

No other caller was modified — all 11 SAFE-ALREADY sites pass no `expectedMallId`, which is fully backward compatible (the field is optional and the check is skipped entirely when absent).

## 7. Same-Mall validation — behavior

- Source Mall A + Unit Mall A → proceed (existing behavior, unchanged).
- Source Mall A + Unit Mall B → reject, `ForbiddenException`, before any write.
- Verified in both directions by test (`unit-status.service.spec.ts`) and at the caller level (`booking.mall-consistency.spec.ts`).

## 8. Atomicity / TOCTOU

`booking.service.ts`'s `update()` unit-reassignment path already runs inside a Serializable interactive transaction (`runSerializable` → `this.prisma.$transaction(fn, { isolationLevel: Serializable })`, confirmed by direct code read). The pre-transaction Mall-consistency check reads both units' `mallId` *before* the transaction opens; since `Unit.mallId` is not a field any code path in this codebase currently mutates after creation (confirmed: no `mallId` reassignment found anywhere outside unit creation/import), there is no realistic window for a Unit's Mall to change between the pre-check read and the later `transition()` call inside the transaction. The redundant in-transaction `expectedMallId` check in `transition()` itself is therefore genuine defense-in-depth (catches a hypothetical future caller that skips the pre-check), not a requirement to close an active TOCTOU — documented here rather than adding transaction-re-read machinery that isn't needed, per the "no broad transaction redesign unless necessary" instruction.

For the 11 SAFE-ALREADY sites, `unitId` is always sourced from a value already read inside the same request (a DB record's own FK, or the newly-created entity's own target), so there is no separate "expected" value to go stale between read and use.

## 9. State machine

Untouched. `ALLOWED_TRANSITIONS`, `canTransition`, `isLockedForBooking`, `isCommittedToTenant`, history semantics, and every existing status-specific guard clause (live-contract check, active-booking check, etc.) are byte-for-byte unchanged — the new check is a pure prepend, not a modification of existing logic.

## 10. ADMIN / CEO

Not referenced anywhere in `UnitStatusService` before or after this phase. `INV-AUTH-006` has no role exception — confirmed by the code itself (the check has no role branch) and by test (`transition()`'s new tests pass no `userId`/role at all in some cases and the check still fires identically).

## 11. Background jobs / events

Not applicable — re-confirmed this phase (see baseline doc): zero `@Cron`/`@OnEvent` callers of `UnitStatusService.transition()` exist.

## 12. Side-effect safety

Both the pre-transaction booking-service check and the in-`transition()` check happen strictly before any write. For the pre-transaction check specifically: `prisma.$transaction`/`unitBooking.update`/`unitStatus.transition`/`promoteNextInQueue`/`logActivity` are never reached when the check throws (proven by test — see §14). For the in-`transition()` check: `prisma.unit.update` and `prisma.unitHistory.create` are never called when it throws (proven by test).

## 13. Negative test matrix (`unit-status.service.spec.ts`, new `INV-AUTH-006 expectedMallId` describe block, 5 tests)

| Case | Result |
|---|---|
| `expectedMallId` matches Unit's actual mall | proceeds, `unit.update` called |
| `expectedMallId` mismatches | `ForbiddenException`, zero writes, zero downstream reads (`contract.findFirst`/`unitBooking.findFirst` never called) |
| `expectedMallId` omitted | unaffected — identical to pre-Phase-3E behavior |
| Unknown unit + `expectedMallId` set | `NotFoundException` (existing safe failure, unchanged — the Mall check never runs because it can't, `unit` is null) |
| Retry after a Mall-mismatch denial (called twice) | still zero side effects on both attempts |

## 14. Caller-specific tests

New file `booking.mall-consistency.spec.ts`, 4 tests, representative of the one caller pattern that changed:

- Denies reassignment to a different-Mall unit, before `$transaction`/`unitBooking.update`/`unitStatus.transition` are ever called.
- Allows reassignment to a different unit within the *same* Mall, and asserts `unitStatus.transition` was called with `expectedMallId` set to the original Mall.
- No-unit-change updates never touch `unitStatus.transition` at all (unaffected path).
- Retry after a cross-Mall denial produces no side effects on either attempt.

The other 11 call sites are covered by their **existing, unmodified** suites (`booking.unit-lock.spec.ts`, `booking-reliability.spec.ts`, `contract-activation.spec.ts`, `fitout-lifecycle.spec.ts`, `proposals.service.spec.ts`, `proposal-contract-conversion.spec.ts`, spaces module's 7 spec files) — all re-run this phase and all pass unchanged, which is itself the proof those callers are unaffected by the new optional field. No new tests were written for unchanged code at those sites.

## 15. Regression

- Backend: **81 → 82 suites** (1 new file), **522 → 531 tests** (5 new in `unit-status.service.spec.ts` + 4 new in `booking.mall-consistency.spec.ts` = 9 new). All passing (confirmed by a full `npx jest` run post-edit: 82/82 suites, 531/531 tests).
- Frontend: 28/29 files, 216/225 tests — **unchanged**, same 9 pre-existing `BookingsPage.test.tsx` "Xóa booking" timeout failures. Zero frontend files touched this phase.
- Backend `tsc --noEmit`: clean.
- Frontend `tsc --noEmit`: clean.
- `eslint` on the 4 changed/new files: clean.
- `nest build`: clean.
- `vite build`: clean (pre-existing >500kB chunk-size warning only, unrelated to this phase).
- `git diff --check`: clean (pre-existing CRLF-on-touch warning on an unrelated Phase-3C file, not this phase's files).
- Route inventory: 523 routes / 41 controllers, unchanged (Phase 3E touched zero controllers).

## 16. Adversarial review

| Attempt | Result |
|---|---|
| Direct service invocation with mismatched `expectedMallId` | Denied, `ForbiddenException`, before any write |
| Wrong `expectedMallId` (mall that doesn't own the unit) | Denied |
| `unitId` substitution (target a unit in another Mall) | Denied — this is the exact scenario the fix targets |
| Source-entity ID substitution (Booking pointed at a cross-Mall unit via `dto.unitId`) | Denied at the caller's own pre-transaction check, before `transition()` is even reached |
| Background-job bypass | N/A — no job caller exists |
| Event-consumer bypass | N/A — no event caller exists |
| Retry after denial | No side effects on either attempt (tested) |
| Concurrency (two requests racing on the same booking) | Unaffected — pre-existing `runSerializable`/P2034-retry machinery is untouched; the Mall check is a pure read-then-compare ahead of that machinery, adds no new race window |
| Caller forgetting Mall context (omits `expectedMallId`) | By design, falls back to pre-Phase-3E behavior (no check) — this is intentional backward compatibility for the 11 SAFE-ALREADY sites, not a bypass, since those sites have no separate entity to compare against in the first place |
| ADMIN/CEO attempting a cross-Mall transition | Denied identically to any other role — no bypass exists in this service, by design (Section 11) |

No P0/P1/P2 findings. Zero unknowns.

## Known P0: 0
## Known P1: 0
## Known P2: 0
## Unknown: 0

## UNIT LIFECYCLE SERVICE DEFENSE: CLOSED

## Application files changed
- `apps/backend/src/common/services/unit-status.service.ts` (new `expectedMallId` field + enforcement)
- `apps/backend/src/common/services/unit-status.service.spec.ts` (5 new tests)
- `apps/backend/src/modules/booking/booking.service.ts` (pre-transaction Mall-consistency check + `expectedMallId` propagation in `update()`)
- `apps/backend/src/modules/booking/booking.mall-consistency.spec.ts` (new, 4 tests)

## Database: UNCHANGED
## Schema: UNCHANGED
## Migration: NONE
## HEAD: UNCHANGED (`915c96e4b90c8002c238f731a90bd86cc90f4114`)
## Staged: 0
## Commit: NOT CREATED
## Release: RC3 UNCHANGED

## PHASE 3G READINESS: NOT READY
Phase 3G (`BC-CEO-SCOPE`, CEO/Cross-Mall policy) requires a business decision this program has explicitly kept open at every prior phase (Phase 3D's authorization: "`BC-CEO-SCOPE` stays open"; this phase's authorization: "Phase 3G CEO/Cross-Mall" explicitly NOT authorized). No investigation of that policy question was performed this phase — a dedicated readiness/design review (mirroring how Phase 3D required `21-CR-101-AI-SCOPE-DESIGN.md` before implementation) is the recommended next step before any 3G implementation authorization, not a direct jump to implementation.

## Status update — `docs/architecture-review/20-CR-101-SERVICE-ENFORCEMENT-MATRIX.md`
See addendum appended to that document.

**NEXT: CR-101 PHASE 3E HUMAN REVIEW**

**IMPLEMENTATION AUTHORIZATION: CONSUMED**
