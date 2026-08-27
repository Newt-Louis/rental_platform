# Reliability Gap Review

Review date: 2026-08-18  
Source compared: `docs/FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md` Sprint A and live code.

## Executive result

The old audit is materially stale in a positive direction: atomic scheduled billing, distributed locks for many jobs, transactional outbox, durable email delivery, payment idempotency, readiness checks, request IDs, backup tooling and rollback documentation now exist. Sprint A is nevertheless incomplete. Six scheduled jobs remain unlocked, the application image runs migrations at startup, the outbox has no claim/lease for concurrent workers, and Proposal-to-Contract still performs a critical fan-out as separate writes.

## Recommendation-by-recommendation review

| Audit recommendation | Current status | Live evidence | Remaining gap / action |
| --- | --- | --- | --- |
| Atomic billing generation | **ALREADY FIXED** for scheduled lease invoices | `BillingScheduleService.generateDueInvoices` uses a serializable transaction; schedule rows have `@@unique([contractId, period])`; invoice number/source keys are unique; duplicate `P2002` is reconciled. | Add a concurrency integration test against PostgreSQL and include non-lease billing producers in the same invariant review. |
| Distributed scheduler lock | **PARTIALLY VALID** | `SchedulerLockService` uses Redis owner tokens. Billing, booking, analytics, Fitout, ticket SLA, expiry, outbox and email jobs use `runExclusive`. | Static gate identifies six unlocked jobs: parking billing, Patrol overdue/generation, Work Order generation/reminders, maintenance reminders. Service-contract reminder also lacks a stable cron name. |
| Job ledger / heartbeat | **STILL VALID** | Logs exist and in-memory metrics count HTTP traffic, but there is no durable job-run model/heartbeat surfaced to operators. | Add start/end/status/count/error/owner records per job, missed-run alerting and an operator view. |
| Transactional outbox foundation | **ALREADY FIXED** as a foundation | `OutboxEvent` migration/model, idempotent `eventKey`, retry/backoff, and `contract.activated` enqueue in the same transaction as contract status/event. | Worker selects pending rows without a DB claim/lease. Multiple process replicas can emit the same event before either marks it processed. Add `PROCESSING` claim with lease/`SKIP LOCKED`, or enforce a single dedicated worker. |
| Durable email delivery | **ALREADY FIXED** for flows that enqueue it | `EmailDelivery` ledger, retry/backoff, provider ID and distributed lock are implemented. | Some paths still send inline/best-effort (for example Tenant invitation in Proposal conversion). Inventory and migrate all critical sends. Add failure/dead-letter alerting. |
| Resource-level tenant/Mall authorization | **PARTIALLY VALID** | Global JWT, role and Mall-access guards exist; many controllers also resolve resource-to-Mall before mutations. Option B removed Tenant access to the internal Fitout route. | Global Mall guard relies on path/parameter heuristics and cannot cover every nested resource. Public static `/uploads` bypasses resource authorization entirely. Require explicit resource policies/tests for tenant-visible documents and all mutation IDs. |
| Booking -> Proposal transaction/outbox | **STILL VALID** | Proposal creation entry is now discoverable, but reliability was not changed by Option B. | Verify conversion state writes in one transaction and add replay/concurrency tests. |
| Approval concurrency and atomic transitions | **ALREADY FIXED** for core decision paths | `approve`/`reject` execute in transactions, use conditional updates, and enqueue outbox events; dedicated transaction tests pass. | Add PostgreSQL concurrent approve-vs-reject integration coverage and observable conflict responses. |
| Contract activation durable orchestration | **PARTIALLY VALID** | Status + contract event + activation outbox are atomic and idempotent; Fitout provisioning is event-driven. Billing schedule build is idempotent. | Billing schedule runs after the status transaction; a failure returns an error after Contract is already ACTIVE. The UI now exposes missing handoffs, but retry ownership/SLA must be explicit. |
| Proposal -> Contract fan-out | **STILL VALID** | `proposalId` is unique and repeat conversion returns the existing Contract. | Contract create, Unit transition, booking cancellation, Proposal conversion, Lead WON and Customer creation are separate writes. A mid-flight failure can leave UI/API/DB states mismatched. Move the database portion into one transaction/outbox and test compensation/replay. |
| Duplicate invoice prevention | **ALREADY FIXED** for scheduled generation and idempotent payment path | Unique schedule period, unique invoice number and payment idempotency migration/service logic. | Prove all manual/import/revenue-share paths have deterministic keys. |
| Backup/restore automation | **PARTIALLY VALID** | Backup and isolated restore scripts, checksum guard, documented RPO 24h/RTO 4h and automated fixture tests exist. | Current gate has no fresh `backup-manifest.json` or current restore drill evidence. A July UAT artifact is historical evidence only. Upload backup synchronization must be proven. |
| Expand/contract migration compatibility | **STILL VALID** | Migration status is current in the running container (46/46). | Production image still invokes migrations in its `CMD`. Establish a single pre-deploy migration job and compatibility/rollback sign-off. |
| Redis degradation alert for token revocation/locks | **STILL VALID** | Services warn and fall back; readiness checks Redis. | No alert routing/SLO is configured. Single-instance lock fallback is unsafe if more than one app replica runs. Logout blacklist also becomes ineffective during Redis degradation. |

## Data safety review of Option B journeys

| Journey | UI/API/DB finding | Risk |
| --- | --- | --- |
| Proposal create from Booking | UI uses the existing conversion dialog and API; no new persistence path was introduced. Eligible Booking selection is a client snapshot, so the API must remain the authority when state changes concurrently. | **AMBER** pending transaction/concurrency UAT. |
| Submit and Approval | Core decisions are transactional and outbox-backed. UI displays policy reason derived from active rule name; the derived display can become null/ambiguous if rules share step name and role. It does not alter decision authorization. | **GREEN/AMBER**: data path improved; display correlation is best-effort. |
| Tasks / Notifications | Option B only classifies the existing 50-item client list; DB notifications are unchanged. Counts inside the panel are not authoritative for older items outside the cap. | **GREEN for data**, **AMBER for completeness semantics**. |
| Contract handoff | UI reads `fitoutProject` and a one-row `billingSchedule` existence signal. Contract activation/outbox is durable, but Billing scheduling is after-transaction. | **AMBER**: mismatch is visible, not automatically owned/retried. |
| RBAC | Server roles remain authoritative; frontend Tenant route drift was removed. | **AMBER** until public file exposure and explicit nested-resource tests are closed. |

## Reliability gate

Status: **RED for multi-replica production; AMBER for a tightly controlled single-instance internal pilot.**

Required before production:

1. Lock/idempotency coverage for every production cron and a durable job ledger.
2. Separate one-shot migration from application startup.
3. Make Proposal-to-Contract database fan-out atomic/replay-safe.
4. Add outbox claim/lease semantics or run exactly one proven worker.
5. Produce current backup plus restore-drill evidence and alert routing.
