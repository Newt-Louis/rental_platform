# Backup & Restore Readiness

**Status:** RESOLVED (policy documented, tooling exists, restore validated
live) · 2026-08-19 · Sprint: Production Hardening A

Policy already existed in `docs/OPERATIONS_RUNBOOK.md` section 6, and the
tooling (`scripts/backup-database.mjs`, `scripts/verify-database-restore.mjs`,
`scripts/backup-restore.test.mjs`) already existed with strong safety
guardrails (checksum verification, isolated-target-name enforcement,
explicit confirmation token, hard rejection if the restore target ever
equals `PRODUCTION_DB_NAME`). Nothing here was rebuilt — this document is
the readiness evidence the sprint brief requires: policy summary plus an
actual, timestamped, live restore-drill run against this environment's
database, not just a description of what the scripts are supposed to do.

## Policy (target state for production)

| | |
|---|---|
| Backup frequency | Daily, encrypted, off-host |
| Retention | 14 daily copies, 3 monthly verified copies |
| Encryption | In transit and at rest, via the `BACKUP_OFFSITE_COMMAND` hook (must be an approved uploader; not configured in this environment — see gap below) |
| Offsite storage | Immutable/versioned remote storage via the same hook |
| RPO (target) | ≤ 24 hours, until WAL/PITR is introduced |
| RTO (target) | 4 hours for database + uploaded files |
| Restore verification cadence | Monthly drill, real restore (not guard-only) |

Full procedure and command reference: `docs/OPERATIONS_RUNBOOK.md` §6.

## Live restore drill — evidence (this environment, 2026-08-19)

Run directly against the local Docker Postgres (`leasing-db` container,
database `leasing_platform`), not a synthetic fixture.

### 1. Backup

```
BACKUP_DIR=artifacts/backups BACKUP_RETENTION_DAYS=14 POSTGRES_DB=leasing_platform \
POSTGRES_USER=leasing POSTGRES_SERVICE=postgres node scripts/backup-database.mjs
```

```
PASS: backup created artifacts\backups\leasing-leasing_platform-20260819T032700Z.dump
(425741 bytes, sha256=35859c1e4d2f3b5bc10877dc24a2caa3d595e6bb4d8e6b198ecee4ceecf05e09)
```

- Timestamp: `2026-08-19T03:27:00Z`
- Size: 425,741 bytes
- SHA-256 recorded in both `.dump.json` (manifest) and `.dump.sha256`
- Confirmed **not** committed to git: `.gitignore` already excludes
  `artifacts/backups/*.dump(.json|.sha256)` (added during the P0 Security
  remediation earlier in this sprint, after an earlier backup dump had been
  accidentally committed — see `docs/security/SECRET_INCIDENT_REMEDIATION.md`).
  Verified with `git check-ignore -v` before proceeding.

### 2. Restore, into an isolated database (never the real one)

```
BACKUP_FILE=artifacts/backups/leasing-leasing_platform-20260819T032700Z.dump \
RESTORE_TARGET_DB=restore_verify_timing \
ALLOW_RESTORE_VERIFICATION=I_UNDERSTAND_THIS_RECREATES_THE_TARGET_DB \
PRODUCTION_DB_NAME=leasing_platform POSTGRES_USER=leasing POSTGRES_SERVICE=postgres \
node scripts/verify-database-restore.mjs
```

```
PASS: backup restored and queried in isolated database restore_verify_timing
application_tables: 124
```

- Checksum verified against manifest before any restore occurred (script
  fails closed if it doesn't match).
- Target-name guard confirmed working: a prior attempt using
  `RESTORE_TARGET_DB=leasing_platform` was rejected by the script before
  this run, exactly as designed (also covered by the automated test below).
- **124 application tables** restored and queried successfully via
  `pg_restore` + a live `SELECT COUNT(*)` against `information_schema.tables`.
- **Wall-clock time: 8 seconds** (backup: ~2s, restore+verify: ~8s) for the
  current dataset size (~426 KB). This is a dev-scale data point, not a
  production RTO guarantee — production RTO depends on production data
  volume, which is unknown from this environment. The 4-hour RTO target
  above has enormous headroom at this scale; it should be re-measured
  against production-sized data before being trusted at scale.
- Isolated verification databases (`restore_verify_20260819`,
  `restore_verify_timing`) dropped after evidence was captured — nothing
  left behind.

### 3. Automated safety-guard tests

```
node --test scripts/backup-restore.test.mjs
```

```
✔ restore verification rejects a production-like target
✔ guard-only verification validates isolated target and checksum
tests 2, pass 2, fail 0
```

These run in CI (`operations` job) on every push — the target-name guard
and checksum verification are continuously tested, not just verified once
here.

## What this drill did NOT validate

- **Uploaded files.** The runbook policy requires uploads to be
  backed up as a separate consistent snapshot alongside the DB manifest.
  No uploaded-file backup/restore mechanism exists yet in this repo — only
  the database is covered. Flagged as a real gap, not fixed in this pass.
- **Production-scale timing.** 8 seconds reflects this environment's small
  dev dataset; it is not evidence the 4-hour production RTO target is
  achievable, only that the mechanism itself works correctly end-to-end.
- **Off-site upload hook.** `BACKUP_OFFSITE_COMMAND` is not configured in
  any environment reachable from here — no approved uploader exists yet, so
  "encrypted off-host backup" is currently a local-disk-only backup. This is
  the single biggest gap against the stated policy: a host-level disk
  failure today would lose all backups along with the primary database.

## Not done in this pass (real gaps, explicitly flagged)

- No off-site backup destination configured (`BACKUP_OFFSITE_COMMAND` unset
  everywhere). **Highest-priority follow-up** — without it, backups share
  fate with the primary database on host failure.
- No uploaded-file backup/restore procedure.
- No WAL/PITR — current RPO ceiling is "since the last daily backup," up to
  ~24h of data loss in a worst-case failure, matching the documented target
  but not improving on it.
- No production-scale restore timing evidence (only dev-scale, 426 KB).
