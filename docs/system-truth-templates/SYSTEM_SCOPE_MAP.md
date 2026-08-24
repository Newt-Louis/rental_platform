# System Truth — System Scope Map

> **TEMPLATE — NOT YET POPULATED.** Which entities are scoped at which
> level (global / Company / Mall / Tenant) — the visual companion to
> `03-DATA-OWNERSHIP.md` and `15-MULTI-MALL-MULTI-COMPANY.md`.

## Scope levels

```text
GLOBAL       — not tied to any Company/Mall (e.g. platform Users, if verified global)
COMPANY      — scoped to one Company, may span multiple Malls
MALL         — scoped to one Mall
TENANT       — scoped to one Tenant (leasing customer) within a Mall
```

## Entity scope table

| Entity | Scope level | Enforced by (guard/query filter) | Verified? |
|---|---|---|---|

## Scope escalation risks

(Any place data appears to leak from a narrower scope to a broader one
without explicit authorization — e.g. a Mall-scoped query missing its
Mall filter. Cross-reference `11-ROLE-PERMISSION-MATRIX.md` findings.)

## Diagram

(Insert a containment diagram: Company → Mall → Unit/Zone/Floor, and
Tenant/Customer relationship to that containment, once verified.)
