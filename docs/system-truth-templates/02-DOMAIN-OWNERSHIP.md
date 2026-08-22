# System Truth — 02 — Domain Ownership

> **TEMPLATE — NOT YET POPULATED.** Verify against
> `docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`'s hypothesis mapping — that
> file assigns review *roles*; this document verifies actual *code*
> ownership boundaries.

## Per-module record (repeat for each module)

### Module: [name]
- **Business capability owned:**
- **Primary entities it creates/owns (cross-ref to 03-DATA-OWNERSHIP.md):**
- **Entities it reads but does not own:**
- **Public API surface (controllers/resolvers) consumed by other modules:**
- **Direct cross-module imports (bypassing API — flag as a finding if found):**
- **Functional Consultant hypothesis match:** MATCHES / DIFFERS

## Domain boundary violations found

(Any place one module writes directly to another's data/tables instead of
going through its owning API — list with file:line, and log as an
`ARCHITECTURE_CONTRADICTIONS.md` or `ANTI_PATTERNS.md` entry as
appropriate.)

## Summary table

| Module | Owns (entities) | Reads (not owned) | Boundary violations found |
|---|---|---|---|
