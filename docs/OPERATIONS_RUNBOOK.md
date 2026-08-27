# THISO Leasing Platform — Operations Runbook

## 1. Production prerequisites

- Docker Engine 24+ and Docker Compose v2.
- PostgreSQL data and uploaded-file volumes are backed up outside the host.
- DNS/TLS reverse proxy is configured before exposing the application publicly.
- `.env` is created from `.env.example`; never deploy the example values unchanged.
- `POSTGRES_PASSWORD`, `JWT_SECRET`, and `CORS_ORIGIN` are mandatory.
- `JWT_SECRET` must be unique and at least 32 characters.
- `CORS_ORIGIN` accepts a comma-separated allowlist, for example:
  `https://leasing.thiso.com.vn,https://leasing-admin.thiso.com.vn`.

## 2. Pre-deployment gate

```bash
node scripts/ops-preflight.mjs .env

cd apps/backend
npm ci
npx prisma validate
npx prisma generate
npm run lint -- --max-warnings=0
npm test -- --runInBand
npm run build

cd ../frontend
npm ci
npm test -- --run
npm run build

cd ../..
docker compose config --quiet
```

Deployment must stop if any command fails.

The operations automation itself has a local HTTP fixture test:

```bash
node --test scripts/ops-automation.test.mjs
node scripts/ops-static-check.mjs
```

The static operations guard follows imports reachable from `AppModule`, checks
that active cron names are unique, reports unnamed/timezone-less jobs, and
prevents migrations from being moved back into normal backend startup. It also
checks the Compose migration profile, seed guard and readiness healthchecks.

## 3. First deployment

```bash
cp .env.example .env
# Replace every secret and set the public CORS origin.

docker compose build
docker compose --profile migrate run --rm migrate
docker compose up -d
docker compose ps
```

The backend container never runs schema migrations during startup. Run the
dedicated migration job exactly once before bringing up a new application
version. This also prevents multiple backend replicas from racing on migration.

Do not enable `SEED_DATABASE` in production. Seed accounts and demo passwords are
for isolated UAT environments only.

## 4. Smoke test

```bash
curl --fail http://localhost:3000/api/health/live
curl --fail http://localhost:3000/api/health/ready
curl --fail http://localhost:8080/health
curl --fail http://localhost:8080/api/health
```

Then verify these role-based journeys:

1. Admin: login, user management, mall access and audit log.
2. Leasing: lead → booking → proposal → approval.
3. Legal: approved proposal → contract → amendment.
4. Operation: contract → fit-out → opening → ticket/SLA.
5. Finance: billing schedule → invoice → payment → AR aging.
6. Tenant: login → contracts/invoices → sales submission → ticket.
7. Management: dashboard, occupancy, renewal risk and reports.

The automated non-destructive smoke test can be run with:

```bash
BASE_URL=https://leasing.thiso.com.vn/api \
SMOKE_EMAIL=uat-admin@thiso.com.vn \
SMOKE_PASSWORD='use-a-secret-store' \
node scripts/smoke-test.mjs
```

To verify several roles in one execution, provide a secret-store-backed JSON
array. The script only performs login and read-only `GET` journeys:

```bash
SMOKE_ACCOUNTS_JSON='[
  {"label":"admin","email":"uat-admin@thiso.com.vn","password":"...","role":"ADMIN"},
  {"label":"operation","email":"uat-operation@thiso.com.vn","password":"...","role":"OPERATION"},
  {"label":"finance","email":"uat-finance@thiso.com.vn","password":"...","role":"FINANCE"}
]' BASE_URL=https://leasing.thiso.com.vn/api node scripts/smoke-test.mjs
```

Run the deployment-level readiness probe after containers become healthy:

```bash
BASE_URL=https://leasing.thiso.com.vn/api \
FRONTEND_URL=https://leasing.thiso.com.vn \
node scripts/ops-readiness.mjs
```

It verifies API liveness/readiness, database readiness, the frontend health
endpoint, the Nginx API proxy, the SPA shell and a required security header.

Every API response includes `X-Request-Id`. Clients may submit a safe
`X-Request-Id` value to correlate support cases; otherwise the API generates a
UUID. Admin and CEO users can inspect process-level counters at
`GET /api/operations/metrics`. Readiness treats configured Redis as required
because it protects distributed scheduler locks and token revocation.

Before activating a contract, UAT automation and operational checks should call
`GET /api/contracts/:id/activation-readiness`. CI statically verifies that this
read-only endpoint exists and that transition to `ACTIVE` cannot bypass it.

## 5. Routine operation

```bash
docker compose ps
docker compose logs --since 30m backend frontend
docker stats --no-stream
```

Operational alerts:

- backend/frontend health is unhealthy for two consecutive checks;
- database health is `down` or API health is `degraded`;
- audit-log write failures;
- repeated HTTP 401/403/429/500 responses;
- failed billing, dunning, SLA, renewal-risk or SAP scheduled jobs;
- disk usage above 80% for database, uploads or logs.

Scheduled jobs currently run inside every backend process. Until a distributed
lock has been adopted by every scheduled flow, production should keep a single
backend scheduler replica. `SchedulerLockService` provides Redis `SET NX PX`
ownership locks with token-safe release. New or modified jobs must use it.
Booking expiry and compliance generation/retention are already protected; the
remaining scheduled jobs are also protected by the same lock service. The CI
static guard fails any newly reachable named cron that does not call
`SchedulerLockService.runExclusive` with the same stable job name.

The canonical contract-expiry notification job is owned by
`NotificationsModule`. Do not register a second contract-expiry scheduler in
another module because it can create duplicate notifications and email.

Shutdown:

```bash
docker compose down          # stops containers, keeps named volumes (DB/uploads data)
docker compose down -v       # DESTRUCTIVE — also deletes named volumes; never run in production
```

Job health: `GET /api/operations/jobs` (ADMIN/CEO) returns, per job, the
last run's status/timestamp/duration and `consecutiveFailures` computed
from its last 5 attempts — this is the authoritative way to check "did
scheduled job X actually run and succeed," replacing log-grepping. See
`docs/reliability/OBSERVABILITY.md`.

## 6. Backup and restore

Production targets:

- **RPO:** at most 24 hours until WAL/PITR is introduced.
- **RTO:** four hours for database plus uploaded-file restoration.
- Run an encrypted off-host backup daily and a restore verification monthly.
- Keep at least 14 daily copies and three monthly verified copies.

Create a custom-format database backup with SHA-256 checksum, manifest and
local retention:

```bash
POSTGRES_USER=leasing POSTGRES_DB=leasing_platform \
BACKUP_DIR=/secure/backups BACKUP_RETENTION_DAYS=14 \
node scripts/backup-database.mjs
```

`BACKUP_OFFSITE_COMMAND` may point to an approved uploader. It receives the dump,
manifest and checksum paths as arguments. The hook must encrypt in transit and
at rest, fail on partial upload and use immutable/versioned remote storage.

Uploaded files require a separate consistent snapshot of `leasing-uploads`.
Record its snapshot identifier beside the database manifest. Restore DB and
uploads from the same backup window.

Restore verification always recreates its target and therefore requires:

- an isolated target name beginning with `restore_verify_`;
- the exact confirmation token;
- a checksum matching the backup manifest;
- a target different from `PRODUCTION_DB_NAME`.

```bash
BACKUP_FILE=/secure/backups/leasing-leasing_platform-....dump \
POSTGRES_USER=leasing \
RESTORE_TARGET_DB=restore_verify_202607 \
PRODUCTION_DB_NAME=leasing_platform \
ALLOW_RESTORE_VERIFICATION=I_UNDERSTAND_THIS_RECREATES_THE_TARGET_DB \
node scripts/verify-database-restore.mjs
```

CI uses `RESTORE_GUARD_ONLY=true`, so it tests safeguards and checksums without
connecting to or modifying any database. A monthly UAT drill must run the real
restore, capture elapsed time, table count, application smoke results and
upload-file sampling, then delete the isolated verification database after
evidence has been approved.

## 7. Capacity and performance verification

The native Node performance gate performs only health requests and optional
authenticated `GET` list journeys. It never creates, updates or deletes data.

```bash
PERF_BASE_URL=http://127.0.0.1:3000/api \
PERF_CONCURRENCY=10 \
PERF_DURATION_SECONDS=30 \
PERF_P95_MS=750 \
PERF_MAX_ERROR_RATE=0.01 \
node scripts/performance-smoke.mjs
```

Set `PERF_EMAIL` and `PERF_PASSWORD` to include dashboard, spaces, contracts and
tickets read journeys. Store these credentials in the CI/UAT secret store.

Non-local targets are rejected unless
`ALLOW_NONLOCAL_PERF_TEST=I_ACCEPT_READ_ONLY_LOAD` is explicitly provided.
Never set this flag against production during business hours. Capacity tests
belong in isolated UAT with production-like data volume and approved traffic
windows.

Baseline release gate:

- error rate no more than 1%;
- p95 no more than 750 ms for the smoke workload;
- no database saturation, container restart or scheduler delay;
- compare throughput and p95 to the previous accepted release.

## 8. Release and UAT readiness report

CI generates a non-live JSON evidence report:

```bash
RELEASE_MODE=ci \
RELEASE_REPORT=artifacts/release-readiness.json \
node scripts/release-readiness.mjs
```

CI mode validates static gates and fixture automation. It explicitly leaves live
environment, migration, backup and performance evidence unchecked or skipped;
it never claims UAT has passed.

Final UAT requires real endpoints, role credentials, environment preflight and
evidence artifacts:

```bash
RELEASE_MODE=uat \
BASE_URL=https://uat-leasing.example.com/api \
FRONTEND_URL=https://uat-leasing.example.com \
SMOKE_ACCOUNTS_JSON='[...]' \
ENV_FILE=.env.uat \
BACKUP_MANIFEST=/evidence/backup-manifest.json \
PERFORMANCE_REPORT=/evidence/performance-report.json \
RELEASE_REPORT=/evidence/release-readiness.json \
node scripts/release-readiness.mjs
```

Missing live credentials or evidence produces `NOT_READY` and a non-zero exit
code. Migration deployment remains explicit operator evidence: record
`prisma migrate deploy` output and the applied migration version.

## 9. Upgrade and rollback

Before upgrading:

1. Record the current image tags and migration name (`SELECT * FROM
   "_prisma_migrations" ORDER BY finished_at DESC LIMIT 1;`).
2. Back up PostgreSQL and uploads (§6). Confirm the backup's manifest
   checksum before proceeding — do not upgrade on an unverified backup.
3. Run the pre-deployment gate and migration against UAT.
4. Deploy immutable image tags, never `latest`.
5. Run the migration job exactly once, as its own step, **before**
   bringing up the new application containers — never let a container's
   startup command run migrations implicitly (§3; this is also a static
   CI check, `ops-static-check.mjs`). This mirrors the fix made in
   `deploy-uat.sh` during the Production Hardening A sprint, where the UAT
   deploy previously relied on the backend image auto-migrating on boot —
   see `docs/reliability/MIGRATION_SAFETY.md` for why that was unsafe
   (silent migration skips, multi-replica races) and apply the same
   explicit-migration-step discipline to every environment, not only UAT.

### "A release just broke 10 minutes after deploy" — decision procedure

1. **Check `GET /api/health/ready` first.** If it's `degraded`, the
   problem is a dependency (DB/Redis/MSSQL), not the new release itself —
   go to the DB/dependency incident playbook below instead of rolling back
   application code.
2. **Check `GET /api/operations/metrics`.** A spike in `serverErrors` or
   `byStatus["5xx"]` confirms an application-level regression, not a
   dependency issue.
3. **Did this release include a migration?**
   - **No migration in this release** → roll back the application
     container to the previous known-good image tag. This is always safe:
     `docker compose up -d --no-deps <service>` pointed at the prior tag.
     No database action needed.
   - **Migration included** → this is the dangerous case. Prisma
     migrations in this codebase are expected to be forward-compatible
     (additive: new columns nullable or defaulted, new tables, no
     same-deploy column drops/renames — see `docs/reliability/
     MIGRATION_SAFETY.md`). If the migration followed that discipline,
     rolling back the **application** container to the previous image
     while leaving the **schema** at the new migration is safe — the old
     code should not reference the new columns/tables. **Never run a
     manual "down" migration or restore the database to roll back schema
     changes** unless a data-loss incident specifically requires it, and
     only with an approved data-recovery plan (§6 restore procedure) — a
     schema rollback risks losing every write made after the migration
     ran, not just the buggy release's changes.
4. **If application rollback doesn't resolve it**, treat as a full
   incident (§10) — the cause may be data-level, not code-level.
5. Document what happened, even if resolved quickly: which tag was rolled
   back to, whether a migration was involved, and total time to recovery.

## 10. Incident response

### General procedure

1. Disable public traffic at the reverse proxy if data integrity is at risk.
2. Preserve backend, proxy, database and audit logs.
3. Capture affected user, endpoint, request ID/time range and entity IDs.
   Every request is tagged with an `X-Request-Id` (`RequestObservabilityInterceptor`)
   present in both the response header and the structured backend log line —
   use it to correlate a user-reported issue with the exact log entry.
4. Restore service from known-good images; restore data only after validating the backup.
5. Rotate JWT, SMTP, SAP and AI credentials if exposure is suspected.
6. Document root cause, impact, remediation and regression tests.

### Playbook: a scheduled job failed or didn't run

1. `GET /api/operations/jobs` — find the job by name. `lastStatus: FAILED`
   with `lastErrorSummary` gives the immediate cause; `consecutiveFailures
   >= 2` means it's not a one-off. `lastStatus: null` (job never appears)
   means it hasn't executed even once since the ledger table existed —
   check the container is actually running that replica's scheduler and
   that Redis is reachable (`SchedulerLockService` logs a warning on
   startup if Redis is unavailable and falls back to single-instance mode).
2. Cross-reference `docker compose logs backend` around `lastStartedAt` for
   the full stack trace — the ledger's `errorSummary` is deliberately
   truncated to a message only (§ Observability, no stack traces stored).
3. Most scheduled jobs are idempotent (upsert/skip-if-exists patterns) or
   safe to simply wait for the next tick. Do not manually re-trigger a job
   by calling its service method directly in a shell unless you have
   confirmed it's safe to run twice.

### Playbook: file/storage issue (uploads, documents)

1. Confirm which route: business documents (contracts, invoices, tickets,
   fitout, patrol, work orders) are served exclusively through the
   authenticated `FilesController` (`/api/files/...`) since the P1 fix in
   `docs/security/PUBLIC_UPLOADS_REMEDIATION.md` — a 403/404 there is
   usually a real permission/tenant-scope check, not a storage fault.
   Only `floor-plans`, `branding`, and `unit-media` remain on the public
   static `/uploads/...` mount.
2. Check the backend container's `/app/uploads` volume is mounted and
   writable (`StorageService.saveFile`); an `ENOSPC` or permission error
   surfaces in backend logs at the write call site.
3. Disk usage: not currently instrumented in `OperationalMetricsService`
   (documented gap, `docs/reliability/OBSERVABILITY.md` §4) — check host
   disk directly (`df -h`) against the Docker volume mount until that gap
   is closed.

### Playbook: authentication issue (users can't log in / getting logged out)

1. Check `JWT_SECRET` hasn't changed since the affected tokens were issued
   — rotating it invalidates every existing session immediately (this is
   expected during a credential-rotation incident, see
   `docs/security/SECRET_INCIDENT_REMEDIATION.md`, not a bug).
2. Check Redis is reachable — the token-blacklist check in `JwtAuthGuard`
   depends on it; if Redis is down, revoked tokens may briefly be treated
   as valid (fail-open on the blacklist check only, not on JWT signature
   verification itself).
3. A wave of 401s in `GET /api/operations/metrics`'s `byStatus` breakdown
   pinpoints when it started; correlate with any recent secret rotation or
   deploy.

### Playbook: database issue

1. `GET /api/health/ready` — `components.database: "down"` confirms it's
   DB-level, not application-level.
2. Check `docker compose ps postgres` / `docker compose logs postgres`.
3. If the database is up but slow: check for a long-running migration or
   an unindexed query introduced by the latest release; `GET /api/operations/metrics`'s
   `averageDurationMs` trend indicates whether this is systemic.
4. If data was corrupted or lost: stop writes (disable public traffic),
   do **not** attempt an in-place fix, follow the restore procedure in §6
   against a freshly verified backup, restoring to an isolated database
   first to confirm integrity before touching production.

## 11. Go-live acceptance

- CI is green and production images build using lockfiles.
- No default credentials or example secrets are deployed.
- Migration succeeds on a production-like database.
- Backup and restore drill succeeds.
- All seven smoke-test journeys pass with correct RBAC.
- Monitoring, alert ownership and escalation contacts are assigned — the
  minimum target alert set is defined in `docs/reliability/OBSERVABILITY.md`
  §4; no monitoring platform is wired up yet, so this remains a target
  spec until one is configured, not a live alert today.
- UAT sign-off is recorded for Leasing, Legal, Operation, Finance and Tenant users.
