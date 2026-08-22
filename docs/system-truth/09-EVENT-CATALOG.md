# System Truth — 09 — Event Catalog

## Scheduled jobs (all `@Cron(` sites found platform-wide)

| Job | Schedule | Module | Locked (`SchedulerLockService`)? | Per-item failure isolation |
|---|---|---|---|---|
| `transactional-outbox` | */10s | common/services/outbox.service.ts | Yes | Yes — per-event try/catch, exponential backoff, `FAILED` status |
| `email-delivery` | */15s | notifications/email-delivery.service.ts | Yes | Yes — per-delivery try/catch, backoff cap 1800s |
| `occupancy-snapshot` | 0 1 1 * * (monthly) | analytics/occupancy-analytics.service.ts | Yes | **No** — one mall's failure aborts the run |
| `renewal-risk-calc` | 0 2 * * * | analytics/renewal-risk.service.ts | Yes | **No** — one contract's failure aborts the batch |
| `compliance-monthly-reports` | 0 6 2 * * | analytics/compliance-scheduler.service.ts | Yes | Yes — per-export try/catch (best-practice example) |
| `compliance-retention-purge` | 0 3 1 * * | analytics/compliance-scheduler.service.ts | Yes | N/A (bulk delete) |
| `contract-expiry-check` (analytics) | 0 8 * * * | analytics/contract-expiry.scheduler.ts | **No** | **DEAD CODE — never registered as a provider, never runs** |
| `contract-expiry-check` (canonical) | 0 8 * * * | notifications/contract-expiry.scheduler.ts | Yes | No inner try/catch |
| `contract-renewal-proposals` | 30 8 * * * | notifications/contract-expiry.scheduler.ts | Yes | No inner try/catch |
| `crm-followup-reminder` | 30 7 * * * | notifications/contract-expiry.scheduler.ts | Yes | No inner try/catch |
| `ai-proactive-insights` | 5 8 * * 1-5 | notifications/contract-expiry.scheduler.ts | Yes | Yes — explicit try/catch around the AI call |
| `invoice-overdue-mark` | 0 9 * * * | notifications/contract-expiry.scheduler.ts | Yes | N/A (bulk update) |
| `ar-dunning-check` | 0 10 * * * | billing/ar-dunning.service.ts | Yes | Not read in depth |
| `monthly-billing-generate` | 0 6 1 * * | billing/billing-scheduler.ts | Yes | Yes — per-contract try/catch |
| booking-expiry | hourly | booking/booking.scheduler.ts | Yes | Per-booking, continues batch on item failure |
| `contract-expiry-status-transition` | 10 8 * * * | contracts/contract-expiry-status.scheduler.ts | Yes | Not read in depth |
| `fitout-gantt-late-check` | 0 1 * * * | fitout/fitout-gantt.service.ts | Yes | Not read in depth |
| `fitout-issue-overdue-check` | 0 8 * * * | fitout/fitout-issue.service.ts | Yes | Not read in depth |
| `fitout-sla-check` | 0 8 * * * | fitout/fitout-sla.service.ts | Yes | Not read in depth |
| `service-contract-reminders` | 0 8 * * * | service-contracts/service-contract-reminder.scheduler.ts | Yes | Not read in depth |
| `ticket-sla-check` | 0 */2 * * * | tickets/ticket-sla.service.ts | Yes | Not read in depth |
| `maintenance-due-reminders` | 0 7 * * * | tickets/tickets.service.ts | Yes | Not read in depth |
| `parking-contract-billing` | 0 2 * * * | parking/parking.service.ts | Yes (4h TTL) | **No** — one contract's failure aborts the run |
| patrol-overdue-monitor / patrol-schedule-generator | various | patrol/patrol.service.ts | Yes | Not read in depth |
| work-order-overdue-reminders / work-order-template-generator | various | work-orders/work-orders.service.ts | Yes | Not read in depth |
| `penalty-interest` calculation | **none found** | billing/penalty-interest.service.ts | **No `@Cron` found at all** | Manual/external trigger only (unconfirmed) |
| SAP retry/reconciliation | **none found** | sap/sap.service.ts, sap-reconciliation.service.ts | N/A — manual POST only | Manual trigger only |

## Critical finding — dead duplicate cron-job-name landmine

`analytics/contract-expiry.scheduler.ts` and `notifications/contract-expiry.scheduler.ts` both declare `@Cron('0 8 * * *', {name:'contract-expiry-check'})`. `@nestjs/schedule`'s registry throws `DUPLICATE_SCHEDULER` if the same job name is registered twice. The analytics version is **not currently registered as a provider** (confirmed via `analytics.module.ts` providers list), so no crash occurs today — but the file still exists, with its own independent 4-tier bucket logic that **differs** from the live version's exact-day thresholds. `docs/OPERATIONS_RUNBOOK.md:155-157` already explicitly warns against exactly this ("Do not register a second contract-expiry scheduler in another module") — the team is aware of the hazard but left the orphaned file in place. Any future refactor that adds it back to `analytics.module.ts` providers will crash app bootstrap. See `ANTI_PATTERNS.md` and `ARCHITECTURE_CONTRADICTIONS.md` `CONTRA-007`.

## Outbox-published events

Only **two** call sites use `OutboxService.enqueue()` platform-wide: `approvals.service.ts:252,313` (`approval.workflow.completed`/`.rejected`... **actually only `.completed` is outbox-durable; `.rejected` uses plain EventEmitter, see `05-CROSS-MODULE-CONTRACTS.md` XMOD-006**) and `contracts.service.ts:421` (`contract.activated`).

## Event consumers (`@OnEvent`)

Three `@OnEvent` listeners found platform-wide: `fitout-submittal.service.ts`, `fitout.service.ts` (`contract.activated` → Fitout auto-create), `proposals.service.ts` (`approval.workflow.completed`/`.rejected` → Proposal status update / Contract auto-creation).

## Observability of job/event failure

Centralized via `SchedulerLockService.runAndRecord()` → `JobExecution` table, surfaced at `GET /operations/jobs` (ADMIN/CEO only) — tracks `lastStatus`/`lastErrorSummary`/`consecutiveFailures` for every job using `runExclusive` (all except the dead analytics contract-expiry job and the un-scheduled penalty-interest/SAP-retry operations, which have no job-ledger visibility at all since they're never invoked as jobs). This is the platform's strongest cross-cutting reliability mechanism.

## Events with no verified failure handling / silently-swallowed risk

None found to be silently swallowed outright — outbox and email-delivery both persist `FAILED` status and log. The closest to "silent" is XMOD-006 (approval-rejected event, in-memory EventEmitter with no durability, no logged failure path if the listener never fires) and the un-scheduled penalty-interest/SAP-retry operations (not a failure-handling gap per se, but an **automation gap** — nothing fails, because nothing runs automatically at all).
