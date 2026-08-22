# CR-101 Phase 3B — Baseline (captured 2026-08-22, before any Phase 3B change)

## Git state
- HEAD: `915c96e4b90c8002c238f731a90bd86cc90f4114` (unchanged from Phase 3A completion — no commit was made in Phase 3A or this phase)
- RC3 designated SHA: `c61fdb9` (unchanged)
- Nothing staged (`git diff --cached` empty, confirmed)
- 92 pre-existing modified/untracked working-tree entries carried forward from all prior phases.

## Baseline test results
- Backend (`npx jest`): **72 suites / 405 tests passing**, 0 failures (393 original + 12 added in Phase 3A).
- Frontend (`npx vitest run`): **28/29 files, 216/225 tests passing**. Pre-existing, unrelated failure: `BookingsPage.test.tsx`, 9 tests, "Xóa booking" timeout — unchanged baseline.

## Read-only hierarchy reconciliation (Section 2-3 of the authorization)
Docker Desktop was not running at the start of this phase; started it and confirmed the `leasing-db` container (auto-restart policy) came up healthy. Ran a read-only SQL query set directly against the dev Postgres database (`leasing_platform`) covering:
Floor/Zone/Unit vs. parent Building mallId mismatches, Zone vs. Floor mallId mismatches, Unit vs. Floor/Zone/Building mallId mismatches, dangling floorId/zoneId FKs, orphan location fields.

**Result: 0 violations across all 15 checks.**

**Caveat, stated plainly**: the dev database contains exactly **1 Mall** (`THISO Mall Sala`). A single-Mall dataset structurally cannot exercise a cross-Mall invariant — there is nothing for a record to be inconsistent *with*. This reconciliation confirms the current dataset has no dangling FKs or Building-mismatch, but it is **not** strong evidence that a multi-Mall production dataset would be clean; it only proves this specific single-Mall fixture is. Recommend re-running the same query set (reproduced in the completion doc) against UAT/staging/production once multi-Mall data exists there, before treating hierarchy consistency as fully verified end-to-end.

## Data Gate classification
**CLEAN** (for the single-Mall dataset present; see caveat above — not a substitute for a multi-Mall re-run).

## Scope authorized this phase
Phase 3B only — Spaces hierarchy authorization + data integrity (Mall/Floor/Zone/Unit CRUD routes in `spaces.controller.ts`, plus the Floor/Zone `mallId` mutation-immutability and `buildingId`/`floorId` cross-Mall consistency fixes in `spaces.service.ts`).

Explicitly not authorized: Phase 3C (Files), Phase 3D (AI), Phase 3E (UnitStatusService), Phase 3G (cross-Mall/CEO), global fail-closed, strict startup gate, CI blocking, heuristic removal, schema migration, automatic production data repair.
