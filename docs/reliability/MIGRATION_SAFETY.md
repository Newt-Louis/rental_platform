# Migration Safety — Decoupled from Application Startup

**Status:** RESOLVED (code + live-verified, confirmed against existing
tooling) · 2026-08-19 · Sprint: Production Hardening A

## Problem

`apps/backend/Dockerfile`'s production CMD was
`sh -c "npx prisma migrate deploy && exec node dist/main.js"` — the
application container ran schema migrations on every startup, before
serving traffic.

**This is precisely what `scripts/ops-static-check.mjs` already checks
for and was already failing on** — confirmed directly: reverting only the
Dockerfile change and re-running the script reproduces
`FAIL: Backend production CMD must not run database migrations`. This is
almost certainly the root cause of "Operations static gate: FAIL" in the
Post-Option-B Gate Review. The guard script and `OPERATIONS_RUNBOOK.md`
(§3, "The backend container never runs schema migrations during startup")
already documented the *intended* behavior — the Dockerfile had drifted out
of sync with both.

## Fix

1. **`apps/backend/Dockerfile`**: CMD is now `["node", "dist/main.js"]` —
   no migration step. The already-existing dedicated `migrate`/`migrate-uat`
   Compose services (`docker-compose.yml`, `docker-compose.uat.yml`) are the
   sole path for applying migrations — this infrastructure already existed,
   it just wasn't the *only* path.

2. **Second bug found while wiring this up**: `docker-compose.uat.yml`'s
   `migrate-uat` service hardcoded `SEED_DATABASE: "true"` unconditionally.
   `prisma/seed.ts` starts with `deleteMany()` calls across most tables
   before reseeding demo fixtures — so any invocation of `migrate-uat`,
   including an accidental re-run, would silently wipe real UAT data. Fixed
   to default to `false` and require explicit opt-in
   (`SEED_DATABASE=true`), matching the pattern the local `migrate` service
   already used correctly. **Flagged to the user directly before fixing**,
   since it's a real data-loss risk independent of this task, surfaced only
   because decoupling migration from startup was about to route deploys
   through this service.

3. **`deploy-uat.sh`** (the real deploy script — SSHes into
   `125.234.136.72`) previously relied entirely on the backend container's
   own auto-migrate; it never called any migration step itself. Removing
   auto-migrate without fixing this would have made new migrations silently
   stop applying on real UAT deploys. Added an explicit step between
   `pull` and `up -d`:
   `docker compose -f docker-compose.uat.yml run --rm --no-deps backend-uat
   npx prisma migrate deploy` — reuses the already-correctly-configured
   `backend-uat` service definition (env vars, network) rather than
   depending on `migrate-uat` being present/in sync on the remote server,
   which `deploy-uat.sh` doesn't push there. The remote script already has
   `set -e`, so a failed migration aborts the deploy before `up -d` runs —
   satisfying "fail deployment if migration fails" (section 29) without
   restarting the app on a stale/broken schema.

4. **README.md**: step 3 ("Chạy migration và seed data") was labeled
   "(lần đầu tiên)" — first time only, which was true when the backend
   self-healed on every restart. Now false: relabeled as required on every
   deploy that includes a schema change.

## Assumption flagged for verification

The `deploy-uat.sh` fix assumes the remote server's
`${SERVER_PATH}/docker-compose.uat.yml` defines a `backend-uat` service
matching this repo's (same name, same DB env). `deploy-uat.sh` only ever
pushed Docker *images* to the registry — it does not sync compose/config
files to the server — so the remote file's exact content could not be
verified from this environment. If the remote file has drifted (different
service name, different env var wiring), the new migration step in
`deploy-uat.sh` would fail loudly on the next deploy (which is a safe
failure mode — `set -e` stops before `up -d` — but worth a manual check
before the next real UAT deploy).

## Files

- `apps/backend/Dockerfile`
- `docker-compose.uat.yml` (`migrate-uat` seed fix)
- `deploy-uat.sh` (explicit migration step)
- `README.md` (step relabeled)

## Verification

- `node scripts/ops-static-check.mjs` — **PASS** (was confirmed to `FAIL`
  against the pre-fix Dockerfile via `git stash`, reproducing the likely
  cause of the Gate Review's "Operations static gate: FAIL").
- `node scripts/ux-static-check.mjs` — PASS (unaffected, checked for
  regressions).
- `git diff --check` — clean.
- **Live-verified**: rebuilt the Docker backend image; container starts
  healthy in ~6s (previously included a migration check on every boot),
  `docker inspect`-visible command is now `dumb-init -- node dist/main.js`
  with no `prisma migrate deploy`. Separately ran
  `docker compose --profile migrate up migrate` — still works, reports
  "No pending migrations to apply" (schema was already current from earlier
  in this session).
- Dev workflow (`docker-compose.dev.yml`) uses a different Dockerfile
  (`Dockerfile.dev`) with `command: npm run start:dev` and was never
  affected by this change — confirmed by inspection, not just assumption.

## Not done in this pass

- Did not attempt to verify or fix the actual remote UAT server's compose
  file contents — no SSH access exercised, per the same caution applied
  throughout this sprint to live-server-affecting changes.
- No automated CI step yet runs `deploy-uat.sh` in a dry-run mode to catch
  a service-name mismatch before a real deploy — would be a reasonable
  follow-up but wasn't asked for.
