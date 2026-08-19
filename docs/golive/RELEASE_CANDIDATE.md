# Release Candidate — RC1

**Date:** 2026-08-19

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
