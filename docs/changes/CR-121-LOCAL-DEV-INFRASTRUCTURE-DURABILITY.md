# CR-121 — Local development infrastructure durability

## CHANGE ID
CR-121

## BUSINESS REASON
Developers must be able to start the rental platform after a workstation or
Docker Desktop restart without attaching the backend and Navicat to a newly
initialised, empty PostgreSQL cluster. Local development data must have one
stable, documented storage location.

## CURRENT BEHAVIOR
`leasing-db` was created from an older merge of `docker-compose.yml` and
`docker-compose.dev.yml` and uses the WSL-backed bind mount
`./docker/postgres-data`. The current compose merge no longer defines the
`postgres` or `redis` services, although its backend still resolves
`postgres` and `redis` by service name. After Docker Desktop restarts, the
existing container's stale WSL bind mount can appear empty; PostgreSQL then
initialises a new cluster that accepts connections but has no application
tables. The prior application database remains in named volume
`leasing-postgres-data`, so the observed symptom is a storage-source switch,
not a PostgreSQL permission loss.

## EXPECTED BEHAVIOR
The standard local-dev compose merge defines `postgres`, `redis`, `backend`,
and `frontend`. PostgreSQL always mounts the existing named volume
`leasing-postgres-data`; Redis uses `leasing-redis-data`; the backend starts
only after both infrastructure services are healthy. The documented restart
command recreates development bind mounts without rebuilding when source has
not changed. No reset, reseed, truncate, or overwrite of either database
cluster occurs.

## PRIMARY DOMAIN
Tier 0 Platform Foundation — local runtime infrastructure, PostgreSQL data
durability, Redis-backed scheduler locking.

## AFFECTED JOURNEYS
Developer/local operational journey: workstation restart -> local stack
startup -> authenticated ERP access. Golden business journeys GS-01 through
GS-15 consume the same database but their business rules are unchanged.

## UPSTREAM IMPACT
Docker Desktop/WSL bind-mount lifecycle, `.env` values (`POSTGRES_*`,
`DB_PORT`, `REDIS_PORT`), and the existing named volumes
`leasing-postgres-data` and `leasing-redis-data`.

## DOWNSTREAM IMPACT
NestJS/Prisma backend, React dev frontend, Navicat via host port 5435,
Prisma migration tooling, Redis-backed scheduler locks/jobs, and every local
ERP module that reads the PostgreSQL database.

## DATA OWNERSHIP IMPACT
The compose declaration changes only which persistent mount is attached to
PostgreSQL. It does not write application entities. The existing named volume
is the recovered local data source and is backed up before it is attached.

## STATE MACHINE IMPACT
N/A — no application status or transition changes.

## FINANCIAL IMPACT
No money values or formulas change. The highest failure mode is exposing an
empty local database; recovery verifies that existing Contract/Proposal data
is preserved.

## CURRENCY IMPACT
N/A — no currency data, formatting, conversion, or calculation changes.

## MALL/COMPANY IMPACT
No scoping logic changes. Existing Mall data must remain visible only through
the same application authorization paths once the original database is
reattached.

## TENANT IMPACT
No Tenant Portal behavior or data model changes.

## AUTHORIZATION IMPACT
No endpoint, guard, role, or SQL grant changes. Diagnosis verifies that the
`leasing` database role retains `CONNECT` and `USAGE`; the failure is not an
authorization denial.

## REPORTING IMPACT
No reporting formula or display changes. Existing reports resume reading the
same recovered local database.

## TRANSACTION IMPACT
Compose creation/recreation is not an application transaction. The switch is
preceded by a logical backup and clone-only migration rehearsal; the old empty
bind-mounted cluster is retained untouched for rollback.

## EVENT/JOB IMPACT
Redis becomes explicitly defined in the local-dev stack and healthy before
backend start. No queue semantics or event handler code changes.

## DOCUMENT IMPACT
Update the developer Docker runbook/README so the canonical command and
Navicat host port are unambiguous.

## API IMPACT
N/A — API request/response contracts do not change.

## MIGRATION
Do not run migrations automatically during backend startup. First rehearse
`prisma migrate deploy` against a clone of `leasing-postgres-data`; only run
it against the recovered local volume after the rehearsal succeeds. Never use
`prisma migrate reset`, reseeding, `docker compose down -v`, or deletion of
the old bind-mounted directory for this recovery.

## BACKWARD COMPATIBILITY
The compose service names remain `postgres` and `redis`; backend connection
URLs and Navicat continue to use database `leasing_platform` and host port
`${DB_PORT}` (currently 5435). Existing containers are recreated so their
stale WSL bind mounts are not reused.

## GOLDEN E2E SCENARIOS
Infrastructure smoke: PostgreSQL healthy, Redis PONG, backend readiness,
and non-destructive counts for User/Mall/Proposal/Contract. Business Golden
E2E scenarios are not changed and browser E2E is out of scope for an
infrastructure-only repair.

## RECONCILIATION
Compare database identity, public-table count, migration history, and
User/Mall/Proposal/Contract counts before and after recovery. Confirm Navicat
and backend target the same host/database/port.

## ROLLBACK
Stop and remove only the recreated `leasing-db` container, restore the prior
compose declaration, and reattach `./docker/postgres-data`. The named volume,
logical backup, and the old bind-mounted directory remain untouched. Do not
remove volumes.

## OPEN BUSINESS QUESTIONS
None for the local topology. The migration status of the recovered database
is a technical release gate and must be reported before applying migrations.

---

## Severity classification
Priority: P0 — Tier: 0. The current symptom makes local operational data
appear lost, even though it is recoverable in a separate named volume.

## Gate results
Gate 1 — PASS: `docker compose ... config --quiet`, backend/frontend image
builds, and the generated Prisma client include the current proposal-document
schema.

Gate 2 — N/A: no module integration behavior changed.

Gate 3 — N/A: no API or cross-module contract changed.

Gate 4 — PASS (infrastructure smoke): all four services are healthy; backend
readiness reports PostgreSQL and Redis `up`; frontend serves HTTP 200; the
recovered database has 135 public tables and 79 applied migrations.

Gate 5–9 — N/A for this local infrastructure repair. No application
transaction, authorization, financial calculation, report, or business state
transition changed.

Recovery/reconciliation evidence: the old named volume was cloned first;
clone-only `migrate deploy` passed; a custom-format logical backup is retained
in named volume `leasing-postgres-backups`; after live migration, User/Mall/
Proposal/Contract counts remain 9/1/8/15. The empty former bind-mounted
`docker/postgres-data` directory was preserved untouched.

## Sign-off
| Role | Name/Agent | Date | Decision |
|---|---|---|---|
| Requester | User | 2026-09-17 | Requested scoped local-dev recovery |
| Implementation agent | Codex | 2026-09-17 | Impact map prepared; no data mutation before clone rehearsal |
