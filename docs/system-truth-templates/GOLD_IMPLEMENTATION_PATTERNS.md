# System Truth — Gold Implementation Patterns

> **TEMPLATE — NOT YET POPULATED.** Name actual, specific good examples
> found in this codebase — not generic best-practice advice. The point
> is to give future agents a concrete "do it like this" pointer into
> this specific repo.

## Per-pattern record

### Pattern: [name]
- **What it solves:**
- **Example location (file:line):**
- **Why this is the model to follow (specific, not generic):**
- **Where else this pattern should be applied but currently isn't
  (cross-reference `ANTI_PATTERNS.md` if applicable):**

## Categories to look for

- A domain with clean transaction boundaries around a multi-step
  financial write.
- A well-scoped Mall/Tenant authorization guard applied consistently.
- A state machine with centralized, validated transitions.
- An idempotent event handler with clear failure/retry behavior.
- A financial formula implemented once and correctly consumed elsewhere
  rather than reimplemented.
- Good test coverage that actually exercises a cross-module scenario,
  not just a unit in isolation.

## Status

Empty until System Truth reconstruction identifies real examples. Do not
populate with hypothetical or generic patterns — every entry must cite
an actual file:line in this repository.
