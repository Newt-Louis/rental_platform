# 04 — Coding Guardrails

## The prohibited pattern

```text
Search VND
→ replace all
```

This pattern — and its equivalents ("rename all `status` fields," "change
every date format," "swap this formula everywhere it appears") — is
explicitly prohibited. A textual match is not a business-meaning match.
The same string can mean different things in different modules, and the
same concept can be spelled differently across modules.

## Required method for any non-trivial change

```text
SEARCH
↓
CLASSIFY
↓
BUSINESS MEANING
↓
SOURCE OF TRUTH
↓
BLAST RADIUS
↓
COMPATIBILITY
↓
IMPLEMENT
↓
E2E
```

- **SEARCH** — find every occurrence (grep/AST search), not just the ones
  in the file you started in.
- **CLASSIFY** — group occurrences by what they actually represent (e.g.
  "display formatting" vs. "stored value" vs. "calculation input" vs.
  "comparison/validation logic").
- **BUSINESS MEANING** — for each group, state in one sentence what
  business fact it represents and who owns that fact
  (`docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`).
- **SOURCE OF TRUTH** — identify which occurrence is the canonical
  computation/storage and which are (or should be) derived/read-only
  consumers. If two occurrences both look canonical, that is itself a
  finding — log it, don't silently pick one.
- **BLAST RADIUS** — everything from the CR Impact Map's downstream
  section that touches this concept.
- **COMPATIBILITY** — existing data/records created under the prior
  behavior; do they need migration or are they read correctly either way?
- **IMPLEMENT** — change only what CLASSIFY determined should change,
  routed through the single source of truth where one exists.
- **E2E** — run the Golden Scenarios that exercise this concept.

## Transaction safety

- Wrap multi-step writes that must succeed or fail together in a single
  database transaction; never assume "it usually completes."
- Never leave a monetary or state-machine write half-applied — if step 2
  can fail, step 1 must be revertible or the whole operation transactional.
- Be explicit about isolation needs when two operations can race on the
  same row (e.g. two bookings for the same slot).

## Async event safety

- Treat every event/job as **at-least-once delivery**: handlers must be
  idempotent (safe to run twice with the same payload).
- Never assume an event fires exactly once or in order relative to other
  events unless the underlying mechanism guarantees it — verify, don't
  assume.
- A dropped/failed event must be observable (logged, retried, or
  dead-lettered) — never silently swallowed.

## Financial safety

- Money is always `(amount, currency)`. A bare numeric amount crossing a
  module boundary without its currency is a defect.
- Never sum, average, or compare amounts across different currencies
  without an explicit, documented conversion step.
- Rounding/precision behavior must match the existing convention for that
  field (see `docs/ai-erp-team/07-ERP-FINANCIAL-MODEL.md`); don't
  introduce a new rounding rule ad hoc.
- Any new or changed formula must have exactly one implementation that
  other layers call — do not reimplement a formula in a report/dashboard.

## Authorization rules

- Every new endpoint, resolver, or query must enforce Mall/Company/Tenant
  scoping at the data-access layer (guard/interceptor/query filter), not
  only via UI conditionals.
- Never trust a Mall/Tenant ID passed from the client without validating
  it against the authenticated user's actual scope.
- New background jobs that touch multiple Malls must explicitly iterate
  per-Mall with proper scoping, not query globally "because it's a job."

## Data ownership rules

- Only the owning domain (`docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`)
  writes to its own entities. Cross-domain writes go through that
  domain's service/API, not direct repository access from another
  domain's code.
- If a change requires writing to another domain's data directly, that is
  itself a signal the Impact Map and domain ownership need review before
  implementing.

## Scope discipline

- Implement exactly what the approved Change Request describes.
- If you discover the fix actually requires touching an unplanned domain,
  stop, update the Impact Map, and get it re-reviewed — do not expand
  scope silently mid-implementation.
- Don't bundle unrelated cleanup, refactors, or "while I'm here" changes
  into a change with a financial, authorization, or state-machine surface.
