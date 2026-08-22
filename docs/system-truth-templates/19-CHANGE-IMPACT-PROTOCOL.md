# System Truth — 19 — Change Impact Protocol (Verified Reference Data)

> **TEMPLATE — NOT YET POPULATED.** This document does not restate the
> protocol itself (that is
> `docs/ai-governance/03-CHANGE-IMPACT-PROTOCOL.md`, which is
> normative and already complete). This document supplies the
> **verified reference data** an agent needs to actually fill out a
> CR's Impact Map correctly for a given area, once System Truth exists.

## Purpose

Once populated, this should let an agent answer "what's downstream of
Contracts?" by looking here instead of re-deriving it from scratch every
time — pointing to the authoritative documents rather than duplicating
them:

- Upstream/downstream lookup → `PLATFORM_DEPENDENCY_MATRIX.md`
- Data ownership lookup → `03-DATA-OWNERSHIP.md`
- State machine lookup → `04-STATE-MACHINES.md`
- Financial formula lookup → `12-FINANCIAL-SEMANTICS.md`
- Currency-readiness lookup → `16-MULTI-CURRENCY-SEMANTICS.md`
- Authorization lookup → `11-ROLE-PERMISSION-MATRIX.md`
- Event/job lookup → `09-EVENT-CATALOG.md`

## Per-domain quick-reference (repeat for each module)

### Module: [name]
- **Upstream dependencies (one-line):**
- **Downstream consumers (one-line):**
- **Financial surface? (yes/no, which metrics):**
- **Currency-readiness (yes/no/partial, cross-ref `16-`):**
- **Auth-sensitive endpoints (count, cross-ref `11-`):**
- **Typical Tier for changes here (cross-ref
  `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`):**

This quick-reference table is the thing an implementation agent should
actually consult while filling out a CR's Impact Map sections.
