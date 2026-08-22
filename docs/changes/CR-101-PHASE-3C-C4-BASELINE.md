# CR-101 Phase 3C — C4 Baseline (captured 2026-08-22, before C4 implementation)

## Git state
- HEAD: `915c96e4b90c8002c238f731a90bd86cc90f4114` (unchanged from every prior CR-101 phase)
- `git diff --cached`: empty, 0 files staged
- `git status --short`: 105 pre-existing modified/untracked working-tree entries, carried forward from all prior phases including C1/C2/C3.

## Baseline test results (re-confirmed before C4 work began)
- Backend (`npx jest`): 75 suites / 475 tests passing (Phase 3C C3's final count).
- Frontend baseline (unchanged across every prior phase): 28/29 files, 216/225 tests. Pre-existing, unrelated failure: `BookingsPage.test.tsx`, 9 tests.

## Pre-implementation verification against executable code (per Section 2's "code wins over docs")

**C4-01**: re-read `fitout-documents.service.ts`'s `reviewDocument()` directly — confirmed the exact bug: `prisma.fitoutDocument.findUnique({ where: { id: documentId } })`, no `projectId` filter, no `projectId` parameter in the method signature at all. `FitoutDocument.projectId` confirmed as the correct, direct scalar field name (`schema.prisma:2638`) to filter on — the readiness review's shorthand `findFirst({id, parentId})` maps exactly to `findFirst({ where: { id: documentId, projectId } })` with no discrepancy from actual field names. No `PLAN CORRECTION` needed.

**C4-02**: re-read `fitout-issue.controller.ts` and `mall-access.guard.ts` in full. Confirmed the readiness review's finding and went further: the controller's protection is not uniformly "path-substring coincidence" as the file's own header comment stated — `list`/`create` are actually incidentally protected via a *different* mechanism (the guard reads `query.projectId`/`body.projectId` directly into its `fitoutProjectId` field, independent of path). All 9 routes share the identical root cause (zero explicit `MallAccessService` calls) even though 2 of the 9 route through a different incidental-match path than the other 7. This is recorded as a minor **CORRECTION** to the readiness review's characterization, not a contradiction of its conclusion (which was "protection is incidental, not explicit" — still true for all 9).

## Scope authorized this phase
**C4 only**: `fitout.controller.ts`'s `reviewDocument` (P1, ID-substitution) and `fitout-issue.controller.ts` (P2, incidental-only protection — all 9 routes in the controller, since all 9 share the confirmed root cause). Explicitly **not authorized**: C5, Phase 3D/3E/3G, BC-CEO-SCOPE, CR-103, financial semantics, global fail-closed, heuristic removal, schema/storage redesign.
