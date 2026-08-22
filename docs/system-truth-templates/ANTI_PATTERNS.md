# System Truth — Anti-Patterns

> **TEMPLATE — NOT YET POPULATED.** Name actual, specific problem
> examples found in this codebase, with file references — not generic
> warnings. This is where findings from other System Truth documents
> that represent a *recurring* problem pattern (not a one-off) get
> consolidated for visibility.

## Per-anti-pattern record

### Anti-pattern: [name]
- **What goes wrong:**
- **Example location(s) (file:line — list every instance found, not
  just one):**
- **Root cause (why this keeps happening, if determinable):**
- **Correct approach instead (cross-reference `GOLD_IMPLEMENTATION_PATTERNS.md`
  if a good counter-example exists elsewhere in this repo):**
- **Severity:** P0/P1/P2/P3
- **Tracked in risk register?** (link to
  `docs/ai-erp-team/12-RISK-REGISTER.md` entry)

## Categories to look for (seeded from AGENTS.md §1 failure classes)

- Formula reimplemented in multiple places instead of called from one
  owner.
- Authorization guard present on some endpoints for a resource but
  missing on others.
- Event/job with no idempotency handling under at-least-once delivery.
- Broad find-and-replace evidence in git history that changed unrelated
  semantics.
- Currency/locale conflation (assuming `vi` locale implies VND).
- Multi-step financial write with no transaction wrapping.
- State transition performed via direct field write instead of a
  validated transition function.

## Status

Empty until System Truth reconstruction identifies real, recurring
examples. A single isolated bug is not necessarily an "anti-pattern" —
this document is for patterns likely to recur elsewhere if not named and
watched for.
