# 00 — Baseline Freeze

**Date:** 2026-08-19
**Purpose:** Freeze and record the exact state of the repository before the
Master Autonomous Program (`docs/program/`) begins. This document is a
snapshot — it does not re-run work already evidenced in `docs/readiness/`
and `docs/security/`; it points to that evidence and records what changed
since.

## Commit

- **Branch:** `HUNG`
- **HEAD:** `c317ad0` — "docs(readiness): Post-Hardening Gate Review - CONDITIONAL GO"
- **Last 5 commits:**
  - `c317ad0` docs(readiness): Post-Hardening Gate Review - CONDITIONAL GO
  - `167cd8b` docs(ops): backup/restore evidence, UAT results, runbook, dependency audit
  - `1dd7f37` ops(observability): job execution ledger, frontend error telemetry
  - `b7e697c` test: fix pre-existing backend and frontend test failures
  - `29e53dd` ops(migrations): stop auto-migrating on backend startup

## Working tree at freeze time — NOT committed, left as found

Six changes existed in the working tree before this program started. None
are this program's work; they are recorded here so later phases don't
silently absorb or lose them.

| File | State | Assessment |
|---|---|---|
| `.env.build` | Modified | `IMAGE_TAG` bumped `uat-17082026` → `uat-19082026`. Benign, artifact of a local build run. |
| `artifacts/release-readiness.json` | Modified | Regenerated output of `scripts/release-readiness` run today (2026-08-19T04:43 UTC). Reflects current static-gate PASS state (see below). Safe to leave — it's a generated artifact. |
| `scripts/secret-scan.test.mjs` | Modified | Test fixtures re-assembled at runtime (string concatenation) so the repo-wide secret scanner doesn't flag its own test fixtures as leaked secrets. Self-consistent, looks finished. |
| `apps/backend/package.json` + `package-lock.json` | Modified | `bcrypt` bumped `^5.1.1` → `6.0.0` (major) and `@types/bcrypt` to match. **Actually installed** (`node_modules/bcrypt` reports `6.0.0`), so `npm install` was run — but there is no commit, changelog note, or entry in `docs/security/DEPENDENCY_AUDIT.md` explaining the bump or that it was tested. Not verified safe. |
| `apps/frontend/src/pages/bookings/BookingsPage.test.tsx` | Modified | Test expectations updated for a "cancel reason" field (`Lý do hủy`) and a renamed delete-button title (`Xóa booking` → `Xóa`) that **do not exist yet** in `BookingsPage.tsx` — grep for both strings in the component returned nothing. This is a half-finished feature: the test was updated ahead of the implementation. Running this suite now would fail. |
| `deploy-uat.sh.bk` (untracked) | New, not gitignored | **Live risk, fixed as part of this freeze** — see Security Note below. |

**Recommendation for Phase 1+:** do not commit the bcrypt bump or the
BookingsPage test changes as-is. The bcrypt bump needs a compatibility check
(native module, ABI) and a `DEPENDENCY_AUDIT.md` entry; the BookingsPage
test needs its matching component change (cancel-reason UI) or should be
reverted until that lands.

### Security note — fixed during this freeze

`deploy-uat.sh.bk` is an untracked backup copy of `deploy-uat.sh` containing
a **live plaintext SSH password and server IP** for the UAT host
(`SERVER_HOST`, `SERVER_PASS`). `.gitignore` excluded `deploy-uat.sh` by
exact name only — the `.bk` copy was not covered, so a routine `git add -A`
would have committed a live credential to history, repeating the exact
class of incident already recorded in
`docs/security/SECRET_INCIDENT_REMEDIATION.md`.

**Fixed now (safe, non-destructive):** `.gitignore` updated to
`deploy-uat.sh.*` / `deploy-prod.sh.*` so this and any future backup copies
are excluded. The `.bk` file itself was left in place (may be an
intentional local backup) but is no longer stageable by accident.

**HUMAN ACTION REQUIRED:** this is a second live sighting of the same UAT
credentials called out in `docs/security/SECRET_INCIDENT_REMEDIATION.md`
("Live credential rotation not done"). It reinforces, not replaces, that
open item — see `docs/program/PRODUCTION_CLOSURE.md`.

## Build

Not re-run in full for this freeze (last full build/test evidence is
today's `artifacts/release-readiness.json`, see below). No build tooling
changes since `c317ad0`.

## Tests

Per `docs/readiness/POST_HARDENING_GATE_REVIEW.md` (this branch, same
HEAD lineage):
- Backend: 319/319 passing.
- Frontend: 9 failing — pre-existing `BookingsPage` gap, already flagged
  for Option C (see `docs/reliability/TEST_BASELINE_REMEDIATION.md`). The
  uncommitted `BookingsPage.test.tsx` edit in the working tree above is
  unrelated new work-in-progress on top of that pre-existing gap, not a fix
  for it.

## Migration

`prisma migrate deploy` is a required explicit step before app startup —
auto-migration-on-boot was removed (`29e53dd`). No new migrations pending
in this freeze. See `docs/reliability/MIGRATION_SAFETY.md`.

## Release-readiness artifact (today, 2026-08-19T04:43 UTC)

`artifacts/release-readiness.json` — verdict **READY** (static/fixture
scope only, not a full production sign-off):
- Operations static gates: PASS (210 reachable backend files, 26 cron jobs, no warnings)
- Operations fixture tests: PASS (6/6)
- Performance evidence artifact: PASS (present)
- Full build/test evidence, backup-manifest evidence, deployment preflight: SKIPPED (require `RELEASE_RUN_FULL_BUILD=true`, a backup manifest artifact, and `ENV_FILE` respectively — none provided in this environment)

## Known risks (carried forward, not new)

Per `docs/readiness/POST_HARDENING_GATE_REVIEW.md`, code-level P0s across
Security, Data Integrity, and Job Reliability are all at **0**. What
remains open is operational, tracked in `docs/program/PRODUCTION_CLOSURE.md`.

## Operational blockers

See `docs/program/PRODUCTION_CLOSURE.md` for the tracked list (credential
rotation, git history remediation, off-site backup, `deploy-uat.sh`
source-control resolution, remaining UAT evidence).

## Gate

**Baseline confirmed. Proceeding to Phase 1 (Enterprise UX Foundation).**
Nothing found in this freeze blocks starting Phase 1 — the uncommitted
working-tree items above are flagged for resolution but do not touch UX
foundation work, and the credential-exposure gap has been closed at the
`.gitignore` level (rotation itself remains a human action).
