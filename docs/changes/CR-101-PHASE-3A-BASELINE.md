# CR-101 Phase 3A — Baseline (captured 2026-08-22, before any Phase 3A change)

## Git state
- HEAD: `915c96e4b90c8002c238f731a90bd86cc90f4114`
- RC3 designated SHA (per `docs/golive/RELEASE_CANDIDATE.md`): `c61fdb9` (unchanged position relative to HEAD from prior phases)
- Nothing staged (`git diff --cached` empty, confirmed)
- 88 pre-existing modified/untracked working-tree entries — all carried forward from prior phases (in-flight multi-currency work, governance docs, CR-101 Phase 1/2 controller annotations). None will be touched except the specific Batch A files this phase edits.

## Baseline test results
- Backend (`apps/backend`, `npx jest`): **72 suites / 393 tests passing**, 0 failures.
- Frontend (`apps/frontend`, `npx vitest run`): **28/29 files, 216/225 tests passing**. Pre-existing, unrelated failure: `src/pages/bookings/BookingsPage.test.tsx` — 9 tests, "Xóa booking" delete-button interaction timeout. Not caused by, or related to, any CR-101 work.

## Scope authorized this phase
Phase 3A only — low-risk HTTP route enforcement for the Batch A route list (see `docs/changes/CR-101-PHASE-3A-COMPLETION.md` for the exact list). Plus read-only bounded verification of 3 File owner→Mall reachability chains (Parking/ServiceContract/WorkOrder documents) — no File authorization code changes.

Explicitly not authorized: Phase 3B/3C-implementation/3D/3E/3G, global fail-closed switch, strict startup blocking, CI merge blocking, heuristic-code removal, CEO permission change, any schema migration.
