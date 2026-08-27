# Secret Incident Remediation

**Status:** IN PROGRESS (P0 credentials — blocked on user rotation/revocation;
git history rewrite prepared, paused for confirmation) · Opened 2026-08-19 ·
Sprint: Production Hardening A

**Related:** P1 (public `/uploads`) is a separate finding from the same Gate
Review — see `docs/security/PUBLIC_UPLOADS_REMEDIATION.md` (RESOLVED,
live-verified).
**Severity:** P0 (credentials/DB dump), informational (deploy script — never
exposed)

This document tracks a repository-wide secret exposure discovered during the
Post-Option-B Gate Review and expanded during this sprint's full inventory
(section 4 of the sprint brief: `.env*`, `artifacts/`, scripts, configs).
**No secret values are recorded here — masked identifiers only.**

## Exposure summary

| # | Item | Type | Commit | Date | Author | On `origin/HUNG`? |
|---|---|---|---|---|---|---|
| 1 | `.env.uat-server` | Credentials file | `07a045c` "translate" | 2026-07-27 | PhieuLe | **Yes — confirmed live on GitHub** |
| 2 | `artifacts/uat-preflight.env` | Credentials file | `4ad127c` "Kiêm tra bảo mặt và diều chỉnh" | 2026-07-17 | hungnguyen9xx | **Yes — confirmed live on GitHub** |
| 3 | `artifacts/backups/leasing-leasing_platform_uat-20260717T011838Z.dump` (+ `.json`, `.sha256` sidecars) | Full PostgreSQL custom-format DB dump, 294,180 bytes, database `leasing_platform_uat` | `4ad127c` (same commit as #2) | 2026-07-17 | hungnguyen9xx | **Yes — confirmed live on GitHub** |

Remote confirmed: `origin` = `https://github.com/hungnguyen9xx/Leasing.git`,
branch `HUNG`. `git merge-base --is-ancestor` confirmed both credential-commit
SHAs are reachable from `origin/HUNG` — **these are not "about to be
pushed," they are already on GitHub.** Repository visibility (public/private)
was not determinable from this environment (no `gh` CLI available) — treat as
public until confirmed otherwise, since that changes urgency materially.

**#3 was not in the original Gate Review finding** — discovered during this
sprint's mandated full-repository inventory (grep across `.env*`, `*.yaml`,
`*.json`, `scripts/`, `artifacts/`, `docs/`). Escalated to the same severity
as #1/#2 since a database dump can contain password hashes and business
records, not just config values.

### Adjacent finding — not part of this incident

`deploy-uat.sh` (repo root) contains a plaintext root SSH password for a real
host (`125.234.136.72`). **Confirmed via `git log --all` that this file has
never been committed to any branch** and is explicitly listed in
`.gitignore` (line 2) — it has not been exposed via git/GitHub. Flagged here
as a hygiene item (plaintext credential on disk, not defensible long-term)
but excluded from git-history remediation since there is no history to clean.
Recommend moving this credential to a local secrets store or prompting for
it interactively instead of leaving it in a checked-in-looking script.

## Secret inventory (masked)

| Secret | File(s) | Format observed | Service/Provider | Status |
|---|---|---|---|---|
| `POSTGRES_PASSWORD` (variant A) | `.env.uat-server` | 10 chars | Postgres — UAT database | **ROTATION PENDING** |
| `POSTGRES_PASSWORD` (variant B) | `artifacts/uat-preflight.env` | 41 chars, random | Postgres — UAT database | **ROTATION PENDING** |
| `JWT_SECRET` (variant A) | `.env.uat-server` | 64 hex chars | Backend auth token signing | **ROTATION PENDING** |
| `JWT_SECRET` (variant B) | `artifacts/uat-preflight.env` | 58 chars | Backend auth token signing | **ROTATION PENDING** |
| `ANTHROPIC_API_KEY` | `.env.uat-server` | 108 chars, `sk-ant-api03-...` format | Anthropic Console | **ROTATION PENDING — requires console access, cannot be rotated from this environment** |
| `SMTP_USER` / `SMTP_PASS` | `.env.uat-server` | empty at both keys | SMTP relay | Not a live secret — no value present |
| DB contents (users, contracts, invoices, password hashes, etc.) | `artifacts/backups/*.dump` | Postgres custom dump | UAT database `leasing_platform_uat` | **File removal + history cleanup pending; underlying UAT DB should be treated as needing a full credential/session reset, not just a file deletion** |

Two *different* `POSTGRES_PASSWORD`/`JWT_SECRET` value pairs exist across
the two files — meaning either the UAT environment's credentials were
rotated once already between 2026-07-17 and 2026-07-27 (in which case only
the *newer* pair, in `.env.uat-server`, is possibly still live), or both
were in use at different times. Either way, **both pairs must be treated as
compromised** — assume any credential that was ever committed is
compromised, per the sprint's own rule (section 5).

## Exposure scope

- **Local repo**: both files present, tracked, readable in working tree.
- **Git history**: reachable from `HUNG` at commits `07a045c`, `4ad127c`.
- **Remote (GitHub)**: confirmed present on `origin/HUNG` — i.e., already
  fetched by GitHub's servers and by anyone who has cloned or fetched this
  branch since those commits landed (2026-07-17 / 2026-07-27).
- **Live UAT server** (`125.234.136.72`, per `deploy-uat.sh`, itself never
  git-exposed): `deploy-uat.sh` does not copy `.env.uat-server` to the
  server — the server keeps its own `/home/leasing-platform/.env` — but
  `.env.uat-server`'s filename and content strongly suggest it is a
  reference copy of that server's real configuration. **Must be verified
  against the live server before assuming the committed values are stale.**

## Rotation status

| Item | Rotation status | Revocation status | Verified new value works | Notes |
|---|---|---|---|---|
| `POSTGRES_PASSWORD` (local dev `.env`, untracked) | ROTATED | N/A (local only, not previously exposed) | Pending | Generated fresh during this sprint; local `.env` was never git-tracked |
| `JWT_SECRET` (local dev `.env`, untracked) | ROTATED | N/A | Pending | Generated fresh during this sprint |
| `POSTGRES_PASSWORD` (UAT server) | **NOT ROTATED** | **NOT REVOKED** | — | Requires SSH access to `125.234.136.72` — flagged for explicit user action/confirmation, not performed autonomously |
| `JWT_SECRET` (UAT server) | **NOT ROTATED** | **NOT REVOKED** | — | Same as above — rotating invalidates all existing UAT sessions, should be a deliberate, announced action |
| `ANTHROPIC_API_KEY` | **NOT ROTATED** | **NOT REVOKED** | — | Requires Anthropic Console access — outside this environment's capability entirely; **user action required** |
| Tracked files removed from git tracking | Pending (this sprint, section 6) | — | — | |
| Git history cleaned (`git filter-repo`) | **NOT STARTED — requires explicit confirmation before force-push** | — | — | Prepared, not executed; see "History cleanup" below |
| Secret scanning gate | Pending (section 9) | — | — | |

## Verification checklist (to close this incident)

- [ ] `POSTGRES_PASSWORD`/`JWT_SECRET` rotated on the live UAT server —
      **blocked on user action**: requires SSH access to `125.234.136.72`
      and a deliberate decision about UAT downtime/session invalidation
- [ ] `ANTHROPIC_API_KEY` revoked in Anthropic Console and a new key issued
      — **blocked on user action**: outside this environment's capability
- [ ] UAT server's backend/frontend restarted with new credentials, health
      check passes — blocked on the two items above
- [x] `.env.uat-server`, `artifacts/uat-preflight.env`,
      `artifacts/backups/leasing-leasing_platform_uat-*` untracked from git
      (`git rm --cached`, working-tree copies kept locally for now),
      `.gitignore` updated, `.example` templates added
      (`.env.uat-server.example`, `artifacts/uat-preflight.env.example`) —
      **staged, not yet committed** (see section 48 of the sprint brief:
      hardening changes get their own commit, separate from Option B)
- [ ] Git history cleaned of all three blobs (`git filter-repo`) — **prepared
      only, execution paused for explicit confirmation** (see "History
      cleanup" above) and should happen *after* rotation per "rotate before
      cleanup"
- [ ] Collaborators (`PhieuLe`, and anyone else with a clone) notified to
      re-clone or hard-reset after the history rewrite, **before** it happens
- [ ] Force-push to `origin/HUNG` completed
- [x] Secret scanning gate added: `scripts/secret-scan.mjs` +
      `scripts/secret-scan.test.mjs` (6 tests, all passing), wired into
      `.github/workflows/ci.yml` as a new `secret-scan` job that `backend`,
      `frontend`, and `operations` all depend on (`needs:`) — a regression of
      this exact incident (re-adding either forbidden filename, or a new
      high-entropy secret assignment) now fails CI before merge/deploy.
      Verified against a disposable fixture repo that it actually catches a
      reintroduced `.env.uat-server` and a reintroduced real-shaped secret.
- [ ] This document's status updated to RESOLVED with final verification
      timestamps — pending the blocked items above

## History cleanup — prepared, not yet executed

Commits to purge: `07a045c`, `4ad127c` (and any other commit touching these
3 paths — to be confirmed with a full `git log --all --follow` pass
immediately before running the rewrite).

Planned command (git filter-repo, run against a fresh mirror clone, never
directly on the working copy):

```bash
git clone --mirror https://github.com/hungnguyen9xx/Leasing.git leasing-mirror-cleanup
cd leasing-mirror-cleanup
git filter-repo \
  --path .env.uat-server \
  --path artifacts/uat-preflight.env \
  --path artifacts/backups/leasing-leasing_platform_uat-20260717T011838Z.dump \
  --path artifacts/backups/leasing-leasing_platform_uat-20260717T011838Z.dump.json \
  --path artifacts/backups/leasing-leasing_platform_uat-20260717T011838Z.dump.sha256 \
  --invert-paths
# review the rewritten history before pushing
git push --force origin HUNG
```

**Not executed.** Per this sprint's own guidance (section 7: "Không chạy
destructive history rewrite một cách mù quáng... Tạo procedure rõ ràng nếu
repository đang được nhiều người sử dụng") this step pauses for explicit
user confirmation immediately before the force-push, since:
- It rewrites published history on a shared remote with at least 2 known
  contributors (`hungnguyen9xx`, `PhieuLe`).
- Anyone with an existing clone must re-clone or hard-reset — this needs to
  be communicated *before* the rewrite, not discovered after.
- Once secrets are rotated (the higher-priority action — see "Rotate before
  cleanup" below), the history rewrite becomes lower-urgency cleanup rather
  than an active incident, so there is no reason to rush it ahead of
  explicit sign-off.

## Why rotation must come before history cleanup

Per the sprint's stated rule: *a secret that was ever committed must be
treated as compromised, regardless of whether it's later removed from
history.* Cleaning history without rotating first would leave the real,
still-valid credentials usable by anyone who already has a copy (GitHub
caches, forks, local clones, crawler archives) — history cleanup only stops
*future* access via the canonical repo, it does not undo past exposure.
Rotation is the only action that actually closes the hole.
