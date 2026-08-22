# System Truth — 03 — Data Ownership

> **TEMPLATE — NOT YET POPULATED.** This is the authoritative source for
> "who owns this data" — supersedes any hypothesis in
> `docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md` or `05-ERP-MASTER-DATA.md`
> where they conflict with verified code.

## Per-entity record (repeat for each entity/table)

### Entity: [name]
- **Owner (module whose code path performs canonical writes):**
- **ID scheme:** (PK type, uniqueness scope — global/Company/Mall)
- **Scope:** (global / Company-scoped / Mall-scoped / Tenant-scoped)
- **Lifecycle:** (creation trigger, update rules, archival/deletion rules)
- **Consumers (every module that reads this entity, with purpose):**
- **History/audit:** (is it versioned? soft-deleted? audit-logged?)
- **Other writers found (if any — flag as finding):**
- **Confidence:** HIGH / MEDIUM / LOW

## Master data verification

For each candidate in `docs/ai-erp-team/05-ERP-MASTER-DATA.md`
(Company, Mall, Floor, Zone, Unit, Tenant, Customer, Category, Currency,
User, Role): confirm it IS true master data (single canonical owner,
broadly referenced, independent lifecycle) or reclassify.

| Entity | Confirmed Owner | Scope | Multiple-writer finding? |
|---|---|---|---|
