# System Truth — 09 — Event Catalog

> **TEMPLATE — NOT YET POPULATED.** Every outbox event, queued job, cron
> job, and webhook in the platform, verified from actual code
> (`@Cron`, queue processors, outbox publishers/consumers).

## Per-event record

### Event: [name]
- **Type:** outbox event / cron job / queue job / webhook
- **Publisher (module, file:line):**
- **Consumer(s) (module, file:line):**
- **Delivery guarantee (verified, not assumed):** at-most-once /
  at-least-once / exactly-once / unknown
- **Idempotency handling in consumer:** present/absent, evidence
- **Failure behavior:** retried / dead-lettered / silently dropped
  (silent drop is always a finding, log to `ANTI_PATTERNS.md`)
- **Schedule (if cron):**
- **Observability:** logged/metriced/alerted — where

## Event inventory

| Event/Job | Type | Publisher | Consumer(s) | Idempotent? | Failure handling |
|---|---|---|---|---|---|

## Events with no verified failure handling

(Explicit list — feed into `docs/ai-erp-team/12-RISK-REGISTER.md`.)
