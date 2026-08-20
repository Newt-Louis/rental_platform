# Go-Live Operations Board

**Date:** 2026-08-20 · RC3 (`c61fdb9`, supersedes RC2 per
`docs/golive/RELEASE_CANDIDATE.md`'s change-control entry — Multi-Currency
Foundation, VND/USD/MMK; see `docs/program/MULTI_CURRENCY_COMPLETION.md`.
Every other row below is unaffected by RC3 — none of this program's
operational blockers are currency-related)

| Area | Status | Owner | Evidence | Blocker |
|---|---|---|---|---|
| RC | **DONE** | This program | `docs/golive/RELEASE_CANDIDATE.md` — RC3, 368/368 tests, build clean | None |
| Credentials | **NOT STARTED** | Security/DevOps (human) | `docs/golive/CREDENTIAL_ROTATION_TRACKER.md` | No system access from this environment |
| Git History | **BLOCKED** | Security/DevOps (human) | `docs/security/SECRET_INCIDENT_REMEDIATION.md` | Blocked on Credentials completing first (by design) |
| DB Backup | **BLOCKED** | DBA/DevOps (human) | `docs/readiness/BACKUP_RESTORE_READINESS.md` — mechanism proven, local-disk only | No off-site destination configured |
| Upload Backup | **IN PROGRESS** | DBA/DevOps (human) | `docs/golive/RESTORE_DRILL.md` — mechanism built + drill-verified this workstream | Off-site destination still not configured (same as DB Backup) |
| Restore | **IN PROGRESS** | DBA/DevOps | `docs/golive/RESTORE_DRILL.md` — both DB and uploads restore mechanisms drill-verified, dev-scale only | Production-scale timing unverified; both still local-disk-only |
| Security (code) | **DONE** | This program | `scripts/secret-scan.mjs` 0 issues; `npm audit` 0 critical | None |
| Security (operational) | **NOT STARTED** | Security/DevOps (human) | See Credentials, Git History rows | Same |
| Cross-Mall | **NOT STARTED** | Product Owner (human) | `docs/readiness/UAT_RESULTS.md` — cannot test, single-Mall seed | Needs a second seeded Mall + real testers |
| UAT | **NOT STARTED** (partial automation-adjacent evidence only) | Product Owner (human) | `docs/readiness/UAT_RESULTS.md` | Needs a real UAT team and scheduled sessions |
| Monitoring | **NOT STARTED** | SRE/Platform (human) | Health/job/metrics endpoints live-verified; no alerting platform | Needs a monitoring-platform decision |
| Training | **IN PROGRESS** | Product Enablement | `docs/golive/training/` — 7 role guides drafted this workstream | No screenshots (no live-UI capture tooling in this environment); not reviewed by the actual roles yet |
| Support | **IN PROGRESS** | Support/Ops leadership (human) | `docs/golive/SUPPORT_MODEL.md` — structure + severity model defined | 0 named individuals staffed |
| Pilot | **NOT STARTED** | Business/Ops leadership | `docs/golive/PILOT_PLAN.md` — plan drafted, not executed | Depends on every row above |

## What changed this workstream (concrete, verifiable progress)

- Built and drill-verified a previously-nonexistent upload/document backup
  mechanism (`scripts/backup-uploads.mjs`, `scripts/verify-uploads-restore.mjs`)
  — 13/13 files restored, checksum-matched, isolated-target guard tested.
  Added to CI syntax checks and the automated test suite (2 new tests).
- Closed a live data-leak risk found while building the above: the new
  uploads backup archive (real tenant documents, ~19MB) was not
  gitignored — fixed before any risk of accidental commit.
- Drafted every tracking/planning document this workstream calls for
  (`CREDENTIAL_ROTATION_TRACKER.md`, `RESTORE_DRILL.md`, `PILOT_PLAN.md`,
  this board, `GO_LIVE_BLOCKERS.md`), all honestly reflecting current
  state — no item marked done without evidence.
- Drafted 7 role-based training quick guides (`docs/golive/training/`).
- Confirmed CI already gates every build on secret-scan passing first
  (`secret-scan` job, `needs:` by every other job) — satisfies this
  workstream's CI-gating requirement; added the two new backup scripts to
  CI's syntax-check step.

## What did NOT change (honestly, not silently)

Every item requiring live infrastructure access, human coordination, or
organizational staffing decisions remains exactly where it was at the
start of this workstream: not started. This is not a process failure —
it is the correct outcome for a workstream run from an environment with
no access to the real UAT/production infrastructure, no Anthropic Console
access, no recruitable human testers, and no authority to staff a support
team.
