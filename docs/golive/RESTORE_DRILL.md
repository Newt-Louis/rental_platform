# Restore Drill Evidence

**Date:** 2026-08-19. Two drills below — database (re-confirms
`docs/readiness/BACKUP_RESTORE_READINESS.md`'s existing evidence, unchanged)
and uploads (**new this workstream** — the mechanism didn't exist before
today). Both run against this environment's local Docker stack, **not**
against a genuine off-site destination — see "What these drills do NOT
prove" below.

## Database restore drill (re-confirmed, mechanism unchanged since 2026-08-19T03:27Z)

See `docs/readiness/BACKUP_RESTORE_READINESS.md` for the full original
evidence. Summary: 124 tables, 8-second wall-clock restore+verify,
checksum-verified, isolated target (`restore_verify_*` prefix enforced),
production-target rejection tested. Not re-run today — no code change
touched `scripts/backup-database.mjs`/`verify-database-restore.mjs` this
session, so the existing evidence stands.

## Uploaded-file (document) restore drill — new, 2026-08-19

New tooling this workstream: `scripts/backup-uploads.mjs` and
`scripts/verify-uploads-restore.mjs`, mirroring the database scripts'
safety design (checksummed archive + manifest, isolated-target-prefix
enforcement, explicit confirmation token, hard rejection if the target
ever equals the production volume name).

### 1. Backup

```
BACKUP_DIR=artifacts/backups BACKUP_RETENTION_DAYS=14 UPLOADS_VOLUME=leasing-uploads \
node scripts/backup-uploads.mjs
```

```
PASS: uploads backup created artifacts/backups/uploads-leasing-uploads-20260819T084956Z.tar.gz
(20227701 bytes, sha256=51a0fd403ce8f65c7e2c2de2e4456044a8fb9554878db5bbe774752d2f41850a)
```

- Timestamp: `2026-08-19T08:49:56Z`
- Size: 20,227,701 bytes (~19.3 MB)
- Source: `leasing-uploads` Docker named volume (mounted into the backend
  container at `/app/uploads`), archived via a throwaway `alpine`
  container with the volume mounted read-only — no dependency on the
  backend image's own contents.
- Confirmed **not committed to git**: `.gitignore` updated this workstream
  to exclude `artifacts/backups/*.tar.gz(.json|.sha256)`, matching the
  existing DB-dump pattern — verified with `git check-ignore -v` before
  and after the fix (the archive was briefly ungitignored before this fix
  landed; confirmed it was never staged or committed).

### 2. Restore, into an isolated volume (never the real one)

```
BACKUP_FILE=artifacts/backups/uploads-leasing-uploads-20260819T084956Z.tar.gz \
RESTORE_TARGET_VOLUME=restore_verify_uploads_20260819 \
ALLOW_RESTORE_VERIFICATION=I_UNDERSTAND_THIS_RECREATES_THE_TARGET_VOLUME \
node scripts/verify-uploads-restore.mjs
```

```
PASS: uploads archive restored into isolated volume restore_verify_uploads_20260819 — 13 files present
```

- Checksum verified against manifest before any restore occurred.
- Target-name guard confirmed working: a follow-up attempt with
  `RESTORE_TARGET_VOLUME=leasing-uploads` was rejected
  (`FAIL: RESTORE_TARGET_VOLUME must be an isolated volume starting with
  restore_verify_uploads_`), exit code 1 — also covered by the new
  automated tests below.
- **13 files** restored — cross-checked directly against the source
  volume's own file count (`docker run --rm -v leasing-uploads:/data:ro
  alpine sh -c "find /data -type f | wc -l"` → `13`). Exact match.
- Isolated verification volume (`restore_verify_uploads_20260819`)
  removed after evidence was captured (`docker volume rm -f`) — nothing
  left behind.

### 3. Automated safety-guard tests (new)

```
node --test scripts/backup-restore.test.mjs
```

```
✔ uploads restore verification rejects the production uploads volume
✔ uploads guard-only verification validates isolated target and checksum
tests 4, pass 4, fail 0   (2 pre-existing DB tests + 2 new uploads tests)
```

Added to CI's `operations` job (`node --check scripts/backup-uploads.mjs
scripts/verify-uploads-restore.mjs`) so both scripts are syntax-validated
on every push, same as the database backup scripts.

## What these drills do NOT prove

- **Off-site storage.** Both drills ran entirely on this environment's
  local Docker host — the "backup" and the "primary" share the same
  physical machine and failure domain. This satisfies "the backup/restore
  *mechanism* works correctly end-to-end" — it does **not** satisfy the
  off-site requirement (`GL-02`, `GL-03`), which needs a genuine remote
  destination (object storage, a separate host, etc.) this environment
  has no access to configure or credentials for.
- **Production-scale timing/volume.** 19.3 MB / 13 files reflects this
  dev/seed environment. Production upload volume is unknown from here.
- **Application-level file integrity beyond byte-for-byte restore.**
  The drill confirms the archive restores with the same file count and a
  verified checksum — it does not open/validate each restored file's
  content (e.g., confirming a PDF still opens correctly). Reasonable given
  the checksum covers the whole archive, not called out as a gap requiring
  further action.

## Bottom line for `GL-03` (upload backup)

**Mechanism: now exists and is drill-verified.** **Off-site destination:
still not configured** — the same `BACKUP_OFFSITE_COMMAND` hook pattern
already supported by `backup-database.mjs` is also wired into
`backup-uploads.mjs`, ready to use the moment an approved off-site
uploader exists; none does yet. This moves `GL-03` from "no mechanism at
all" to "mechanism ready, destination pending" — still blocking, but a
narrower blocker than before this workstream.
