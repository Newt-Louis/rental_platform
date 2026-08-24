# Observability Readiness

Review date: 2026-08-18

## Answer to the operating question

If a user reports “the system is broken,” the team can correlate many API failures using `X-Request-Id`, HTTP logs and audit records, and can inspect live dependency health. It cannot yet reliably answer whether a scheduled business job was missed/duplicated, whether a notification/outbox item is stuck above an agreed threshold, or what frontend exception a remote user saw. Observability is therefore **AMBER/RED**, not production-ready.

## Current controls

| Area | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Application/API logs | **AMBER** | Winston console plus JSON files; every HTTP request gets/preserves a validated request ID, response header, duration, status and user ID. Unhandled errors include the request ID and stack. | No demonstrated centralized collection, retention, redaction review, searchable deployment/release fields, or alert routing. File logs are container-local unless mounted/collected. |
| API error response | **GREEN/AMBER** | Stable JSON error shape includes status, path, timestamp and request ID; validation errors are separated. | `HttpException` messages may expose more internal detail than intended; production sanitization policy is not tested. |
| Frontend error handling | **AMBER** | Root error boundary offers reload; React Query retries reads once; `AsyncState` and retry patterns exist on several critical screens. | Boundary only logs to browser console. No remote frontend error capture, release tag, user/session correlation or source-map pipeline. Adoption of query error states is incomplete. |
| Audit logs | **AMBER** | Global interceptor records write successes/errors, actor, endpoint, payload with sensitive-key redaction, IP/user-agent and duration. | Writes are fire-and-forget; failure only logs a warning. No tamper evidence, guaranteed delivery, before/after diff for all writes, retention proof, or alert on audit loss. Auth/notification/chat paths are skipped. |
| Authentication failures | **RED** | Generic request log records 401 status and request ID. | No durable auth-event log, abuse dashboard or alert. |
| Business workflow logs | **AMBER** | Contract events, outbox events, email delivery and several domain histories exist. | No unified Lead->Booking->Proposal->Approval->Contract correlation/process ID or SLA dashboard. |
| Background jobs | **RED** | Named cron jobs log execution; many use Redis distributed locks. | Six jobs are unlocked; no durable job-run ledger/heartbeat, missed-run detection or current owner visibility. |
| Notification/email delivery | **AMBER** | Email delivery ledger and outbox retry with error/backoff exist. | No dead-letter threshold, operator resolution UI or alert. Some critical email remains inline/best-effort. In-app notification delivery has no end-to-end outcome metric. |
| Metrics | **AMBER** | Admin/CEO `/api/operations/metrics` exposes process uptime, request/error counts, average duration, status distribution and memory. | In-memory/process-local only; resets on restart; no histograms/p95, labels, Prometheus/OpenTelemetry export or SLO alerting. |
| Health checks | **GREEN/AMBER** | Live container returned 200 for liveness/readiness; readiness checks PostgreSQL, Redis and optional MSSQL. | Does not check storage writability/free space, schema version, outbox/job backlog or notification delivery. |
| Backup/restore | **AMBER** | Scripts, checksum guard, isolated restore test and RPO/RTO documentation exist. | No fresh gate artifact proving a real off-host backup and restore drill for this release. |

## Minimum production monitoring

### P0 before any production rollout

1. Centralize structured backend/container/edge logs with request ID, environment, service version and deployment ID; define retention and access control.
2. Add a durable `JobRun` ledger and alerts for missed, failed, long-running and overlapping jobs. Close all static scheduler-lock failures.
3. Alert on PostgreSQL/Redis readiness, HTTP 5xx/error-rate, restart loops, disk/storage capacity, outbox/email backlog age and failed audit writes.
4. Add frontend error capture with release/source maps and request-ID propagation; scrub PII.
5. Produce current backup/restore evidence and alert on backup freshness.

### Initial SLOs and thresholds

- Availability: critical transactional API success >= 99.5% during business hours.
- API: p95 < 500 ms for agreed transactional endpoints; 5xx < 1% over 5 minutes.
- Critical journey: >= 99.5% successful Submit, Approve/Reject, Activate Contract and Record Payment commands.
- Jobs: no missed critical schedule; failure or last-success age beyond 1.5x cadence pages the owner.
- Outbox/email: oldest pending < 5 minutes normally; any item failing repeatedly or older than 30 minutes alerts.
- Backup: last successful encrypted off-host backup < 24 hours; monthly restore meets RPO 24h/RTO 4h until stronger targets are approved.

## Ownership and runbooks

Assign one operational owner per signal, with severity, contact channel, dashboard, first diagnostic query and safe recovery action. Link alerts to `docs/OPERATIONS_RUNBOOK.md`; add runbooks for outbox replay, stuck email, duplicate-job prevention, Redis degradation, protected-file incident and credential leakage.
