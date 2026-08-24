# System Truth — 10 — Retry / Idempotency Model

> **TEMPLATE — NOT YET POPULATED.** Cross-cutting analysis built from
> `09-EVENT-CATALOG.md` — how retries and duplicate delivery are (or
> aren't) handled platform-wide.

## Retry Queue capability

- Does a dedicated Retry Queue mechanism exist? (verify against
  `01-PLATFORM-SCOPE.md`'s cross-cutting list) — evidence:
- If yes: backoff policy, max attempts, dead-letter destination.
- If no: which modules implement ad hoc retry logic themselves, and how
  consistent is it across them?

## Job Ledger capability

- Does a Job Ledger (record of job execution for idempotency/audit)
  exist? Evidence:
- Which jobs use it vs. which rely on other idempotency mechanisms
  (unique constraints, natural keys) vs. which have none.

## Distributed Lock capability

- Does a distributed lock mechanism exist for cross-process critical
  sections (e.g. concurrent booking allocation, concurrent billing
  generation)? Evidence:
- Which known-concurrent operations use it vs. which don't (cross-ref
  `08-TRANSACTION-BOUNDARIES.md`).

## Idempotency key patterns found

(Document each distinct pattern in use — e.g. natural-key uniqueness
constraint, explicit idempotency-key header/field, none.)

## Platform-wide risk summary

(Every event/job from `09-EVENT-CATALOG.md` with no idempotency handling,
consolidated here as a single risk view.)
