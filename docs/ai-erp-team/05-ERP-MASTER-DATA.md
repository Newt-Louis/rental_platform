# 05 — ERP Master Data

## Initial master data candidates

```text
Company
Mall
Floor
Zone
Unit
Tenant
Customer
Category
Currency
User
Role
```

These are the entities hypothesized to be true master data: referenced
broadly across domains, with a lifecycle independent of any single
transaction, and requiring a single owning source of truth.

## Required profile per entity (to be completed via System Truth)

For each entity above, `docs/system-truth-templates/03-DATA-OWNERSHIP.md`
must establish:

```text
OWNER       — which module's code path is the canonical writer
ID          — identifier scheme (PK type, uniqueness scope)
SCOPE       — global, Company-scoped, or Mall-scoped
LIFECYCLE   — creation, update, archival/deactivation rules
CONSUMERS   — every module that reads this entity
HISTORY     — whether changes are versioned/audited, and how
```

## Known scoping hypotheses (unverified)

- `Company` — top-level, global scope.
- `Mall` — scoped to a `Company`.
- `Floor`, `Zone`, `Unit` — scoped to a `Mall`, in that containment order.
- `Tenant` — the leasing customer entity, scoped to a `Mall`/`Company`
  relationship via Contract; distinct from `Customer` (CRM-level identity
  that may exist before any Tenant relationship).
- `Category` — likely global or Company-scoped; used across CRM, Spaces,
  Inventory — verify per-module usage before assuming a single shared
  meaning.
- `Currency` — VND/USD/MMK; see
  `docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md` — not itself
  "owned" by a domain but its handling rules are owned by the
  Multi-Currency Architect.
- `User` / `Role` — owned by Auth/Security; scope may be global (a user
  can plausibly operate across Malls depending on role) — verify.

## Do not assume completeness

This list is a hypothesis. System Truth reconstruction may find
additional true master data (e.g. a `Vendor`/`Supplier` concept in
Service Contracts or SAP integration) or find that an item above is
actually transactional, not master, data. Treat every entry as
provisional until `03-DATA-OWNERSHIP.md` confirms it.
