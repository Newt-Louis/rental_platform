# Production Infrastructure Inventory

**Date:** 2026-08-19. Extracted from `docker-compose.yml` and
`docs/OPERATIONS_RUNBOOK.md` — not invented. Reverse proxy/TLS termination
is **not** defined in this repo's compose file (the runbook's prerequisite
list names it as a precondition to configure separately, per environment)
— not documented further here since no config for it exists in this
codebase to inventory.

| Component | Image/Tech | Owner (this repo) | Dependency | Single point of failure? |
|---|---|---|---|---|
| Reverse Proxy / TLS | Not defined in this repo — external to the compose stack | Infra/DevOps (outside this codebase) | Sits in front of `frontend` | Yes — not backed up or documented here |
| Frontend | React + Nginx (`apps/frontend/Dockerfile`) | This repo | `backend` (healthy) | No — stateless, rebuildable from source |
| Backend | NestJS (`apps/backend/Dockerfile`) | This repo | `postgres`, `redis` (both healthy) | No — stateless, rebuildable; but see "single scheduler replica" note below |
| Database | PostgreSQL 16-alpine, container `leasing-db` | This repo (schema/migrations) + DBA (data) | — | **Yes** — sole copy of all business data; local-disk-only backup (see `docs/readiness/BACKUP_RESTORE_READINESS.md`) |
| Redis | `redis:7-alpine`, container `leasing-redis` | This repo | — | Partial — `SchedulerLockService` falls back to single-instance mode with a warning if Redis is unavailable (not a hard failure); the JWT token-blacklist check fails open if Redis is down (documented in `OPERATIONS_RUNBOOK.md`'s auth incident playbook) |
| Migration job | One-shot `migrate` service, `--profile migrate` | This repo | `postgres` (healthy) | N/A — runs once per deploy, not a standing service |
| Storage (uploads) | Docker named volume `leasing-uploads`, mounted into `backend` | This repo (`StorageService`) | Same host as `backend` | **Yes** — no separate backup mechanism exists yet (confirmed gap, `BACKUP_RESTORE_READINESS.md`) |
| Email delivery | External SMTP (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` env vars) | External provider | Backend's `EmailService`/`EmailDeliveryService` | No — retryable queue already absorbs transient provider outages |
| Scheduled jobs | In-process `@nestjs/schedule` crons inside the `backend` container | This repo | `SchedulerLockService` (Redis-backed) | Partial — `OPERATIONS_RUNBOOK.md` explicitly recommends a single backend scheduler replica until every job's lock coverage is fully verified at scale |
| Monitoring/Alerting | **Not present** — no monitoring platform wired up in any reachable environment | Not yet owned | — | N/A — this is itself the gap (see Observability section of the final matrix) |
| Backup | `scripts/backup-database.mjs`, local-disk output only | This repo (tooling) + Infra (destination) | `postgres` | **Yes** — no off-site destination configured (`BACKUP_OFFSITE_COMMAND` unset everywhere) |

## Known single points of failure — status against section 26's requirement (KNOWN / BACKED UP / RECOVERABLE / OWNED)

| SPOF | Known | Backed up | Recoverable | Owned |
|---|---|---|---|---|
| Database | Yes | Local-disk only (not off-site) | Yes — restore drill demonstrated (`BACKUP_RESTORE_READINESS.md`), dev-scale only | DBA/DevOps (human, not yet named in this repo) |
| Uploaded files | Yes | **No backup mechanism exists** | No | Not yet owned |
| Reverse proxy/TLS | Yes (by omission — not in this repo) | Unknown | Unknown | Infra/DevOps (outside this codebase's visibility) |

No HA is required for an initial internal pilot per this gate's own rule
(section 26) — but every SPOF above must be named, which this table now
does; the uploaded-files backup gap is the one still fully unaddressed.
