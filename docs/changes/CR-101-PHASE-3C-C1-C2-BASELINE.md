# CR-101 Phase 3C — C1+C2 Baseline (captured 2026-08-22, before any implementation)

## Git state
- HEAD: `915c96e4b90c8002c238f731a90bd86cc90f4114` (unchanged from every prior CR-101 phase — no commit made anywhere in this program yet)
- `git diff --cached`: empty, 0 files staged
- `git status --short`: 100 pre-existing modified/untracked working-tree entries, carried forward from all prior phases (multi-currency WIP, governance docs, CR-101 Phases 1–3B/3B.1/3C-readiness). None will be touched by C1/C2 except the specific files this batch edits.

## Baseline test results
- Backend (`npx jest`): 75 suites / 446 tests passing as of Phase 3B.1's completion (re-run as part of this baseline capture; result recorded in the completion doc once available).
- Frontend baseline (established across every prior phase, unchanged): 28/29 files, 216/225 tests. Pre-existing, unrelated failure: `BookingsPage.test.tsx`, 9 tests, "Xóa booking" timeout — not caused by, or related to, any CR-101 work.

## Scope authorized this phase
**C1 + C2 only**, per `docs/architecture-review/31-CR-101-FILE-IMPLEMENTATION-PLAN.md`:
- **C1**: canonical File → Owner → Mall resolver infrastructure (reuse `MallAccessService`'s existing named-resolver registry; add only the resolvers the verified ownership matrix requires for C2's families).
- **C2**: File-authorization remediation for `files.controller.ts`'s download routes covering Contract, Invoice, Ticket, and the approved Fitout `UnifiedDocument` branches (Submittal, Issue, Daily Report) — i.e. the 7 families in `29-CR-101-FILE-OWNERSHIP-MATRIX.md`'s Table A that are `READY_WITH_EXISTING_QUERY` using already-registered resolvers (`contract`, `invoice`, `ticket`, `fitoutSubmittal`, `fitoutIssue`, `fitoutDailyReportEntry`) plus `FitoutDocument` (`fitoutProject` resolver).

Explicitly **not authorized**: C3 (Parking/ServiceContract/WorkOrder/Patrol), C4 (Fitout `reviewDocument` ID-substitution fix, Fitout-Issue explicit wiring), C5 (consolidation), Phase 3D (AI), Phase 3E (UnitStatusService), Phase 3G (CEO/Cross-Mall), any schema change, migration, storage redesign, or global fail-closed switch.

## Security model mandated for C2 (recorded here for traceability, not re-derived at implementation time)
`fileId → File/UnifiedDocument → authoritative owner → Mall → MallAccess → operation permission`. A client-supplied `parentId` must never be trusted as authorization for an arbitrarily-referenced `fileId` — the file's own resolved ownership is authoritative, not the path parameter alone. Existing Tenant-ownership checks (already verified correct in the Phase 3C readiness review) must be preserved unchanged, additive with the new Mall check, not replaced by it.
