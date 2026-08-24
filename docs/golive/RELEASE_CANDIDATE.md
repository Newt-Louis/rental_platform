# Release Candidate — RC1 → RC2 → RC3

**Date:** 2026-08-20

## RC3 (current)

Per this program's change-control rule: RC2 was frozen for the Go-Live
Operations backup/CI tooling pass. This program then added the
Multi-Currency Foundation (VND/USD/MMK) on top of it — real application
code across the Prisma schema, a hand-written migration, backend services/
DTOs, frontend forms, and the reconciliation script — so per the same rule
that produced RC2 ("do not silently keep calling modified code RC1/RC2"),
that commit is now **RC3**.

| | |
|---|---|
| Git commit SHA | `c61fdb9` |
| Parent | RC2 (`acf6a26e929f7f1ee6f98f2b5e007781e4fb9a44`) |
| Issue | Multinational rollout requires USD and MMK alongside VND; audit found the core leasing lifecycle (Booking/Contract/BillingScheduleEntry/Invoice/Payment) had essentially no currency tracking, and a live bug where Proposal→Contract conversion silently dropped the Proposal's currency |
| Severity | Real financial-domain feature — not a defect fix, a new capability required for the multinational business requirement |
| Reason | Full detail: `docs/program/MULTI_CURRENCY_{AUDIT,ARCHITECTURE,MIGRATION,TEST_MATRIX,COMPLETION}.md` |
| Test evidence | 3 new/extended spec files; **69/69 suites, 368/368 tests** (RC2 baseline: 67/67, 359/359 — nothing regressed); `npx tsc --noEmit` clean both sides; `vite build` clean; `scripts/backbone-reconciliation.mjs`: **17/17 clean** (13 pre-existing + 4 new currency checks) run against the live dev DB reseeded with real USD/MMK data |
| Backward compatibility | No breaking API changes — every new field defaults to VND, matching today's implicit behavior for every existing caller |

**RC3 is what should be used for anything downstream of this point** — UAT,
pilot, or any further evaluation. Per `docs/program/MULTI_CURRENCY_COMPLETION.md`,
human UAT should re-test Booking/Proposal/Contract/Billing/Invoice/Payment/
Reports with VND, USD, and MMK before go-live. RC3 does not change the
overall production-readiness verdict (`docs/golive/FINAL_PRODUCTION_READINESS.md`
remains NO-GO) — the blockers are pre-existing, unrelated, human/DevOps-owned
operational items (credential rotation, off-site backup, git-history
remediation), none of which this pass touches.

## RC2 (superseded)

Per this program's change-control rule (no silent modification of a
frozen RC — any post-freeze code change gets a new RC with issue/
severity/reason/test-evidence recorded): the Go-Live Operations workstream
added real code (not just docs) after RC1 froze — the uploaded-file
backup/restore scripts and a `.gitignore`/CI change. That change is now
**RC2**.

| | |
|---|---|
| Git commit SHA | `acf6a26e929f7f1ee6f98f2b5e007781e4fb9a44` |
| Parent | RC1 (`2701bd1a8f61e5434ccc44615029c9954d89f108`) |
| Issue | GL-03 (upload/document backup) had no mechanism at all |
| Severity | Go-live blocker (per `docs/golive/GO_LIVE_BLOCKERS.md`) — not a P0/P1 application defect, but a required operational capability this gate's own workstream C explicitly assigned as in-scope tooling work, not "new feature development" |
| Reason | Build and drill-verify an uploaded-file backup/restore mechanism mirroring the existing database one; fix a live data-leak risk found while doing so (the new backup archive wasn't gitignored) | 
| Test evidence | 2 new automated tests (`backup-restore.test.mjs`), a live drill (`docs/golive/RESTORE_DRILL.md` — 13/13 files restored, checksum-matched), full backend suite re-confirmed green (67/67 suites, 359/359 tests, unaffected since no application code changed) |

**RC2 is what should be used for anything downstream of this point** —
UAT, pilot, or any further evaluation. RC1 remains a valid historical
reference for the engineering/reliability gate specifically, but RC2 is
the current candidate.

## RC1 (superseded, kept for history)

| | |
|---|---|
| Branch | `HUNG` |
| Git commit SHA | `2701bd1a8f61e5434ccc44615029c9954d89f108` |
| Parent baseline | `c317ad0` ("Post-Hardening Gate Review - CONDITIONAL GO") |
| Commits in this RC | 7 (see below) |
| Migration version | `20260702100000_fitout_config_driven`-era schema, 47 migrations total, `prisma migrate status` reports "Database schema is up to date!" against the local dev database — no pending migrations |
| Build | `npx tsc --noEmit` clean; `npm test` 67/67 suites, 359/359 tests passing |
| Docker image tag | **Not built this pass** — see "What this RC is not" below |
| Build timestamp | Not applicable — no image built |

## What's in RC1

Seven commits on top of the existing `CONDITIONAL GO` baseline, covering
this program's full reliability pass (Phases 0-6 + the Backbone
Consolidation Gate):

```text
0693746  fix(security): close credential-leak gitignore gap found during Phase 0 freeze
fe14750  fix(reliability): make Proposal submit and Contract activation atomic and concurrency-safe
3dfd443  fix(reliability): enforce notifyTenantOnIssue, guard billing-schedule rebuild, scope invoice-document access
3344c2c  fix(reliability): make Fitout auto-create and stage-advance atomic; fix notification/access gaps
8c89522  fix(reliability): make Booking create/update/cancel/reinstate/expiry atomic and concurrency-safe
c287f4d  fix(seed): generate billing schedules for seeded ACTIVE/EXPIRING contracts
2701bd1  docs(program): baseline freeze through Backbone Consolidation Gate and Phase 6
```

No breaking API changes, no destructive migrations, no removed routes.
Full per-commit rationale in each commit message; full technical detail in
`docs/program/`.

## What this RC is NOT

- **Not built into a Docker image.** `docker-compose.yml`'s `backend`/
  `frontend` services build from source on `docker compose build`; no
  image was built or tagged as part of this gate. The currently-running
  local containers (`leasing-backend`, `leasing-frontend`) were started
  from an **older** image, built before this program's work — they do
  **not** reflect RC1's code. Building and deploying RC1's image is an
  operational step for whoever runs the actual deployment, not something
  performed in this environment.
- **Not deployed anywhere.** RC1 exists as a git commit, verified by its
  own test suite and by live-data reconciliation run against the current
  database schema — it has not been deployed to UAT or production.

## Source control cleanliness — documented exceptions

Working tree is otherwise clean except:

| File | Status | Reason not included in RC1 |
|---|---|---|
| `apps/backend/package.json`, `package-lock.json` | Modified (bcrypt `^5.1.1` → `6.0.0`) | Pre-existing, unrelated WIP found during Phase 0's baseline freeze — not verified, not part of this program's work, explicitly excluded by user decision when this RC was assembled |
| `apps/frontend/src/pages/bookings/BookingsPage.test.tsx` | Modified | Same — pre-existing WIP for a "cancel reason" feature with no matching component change (tests would fail if run), explicitly excluded |
| `scripts/secret-scan.test.mjs` | Modified | Pre-existing WIP from before this program started, unrelated to this program's scope, left untouched |
| `.env.build` | Modified (image tag bump) | Local build-tag artifact, not meaningful to commit |
| `artifacts/release-readiness.json` | Modified | Generated CI output, regenerates on every run, not meaningful to commit as source |

None of these five files were touched by this program's work. They are
pre-existing, independent of RC1, and should be resolved (finished,
reverted, or committed) by whoever owns that unrelated work, on its own
schedule.
