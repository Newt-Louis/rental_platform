# System Truth — System Money Map

> **TEMPLATE — NOT YET POPULATED.** Every place money enters, is stored,
> is transformed, and is displayed across the platform — the visual/
> structural companion to `12-FINANCIAL-SEMANTICS.md` and
> `07-DATA-LINEAGE.md`.

## Money entry points (where an amount is first captured)

| Entry point | Module | Currency captured how | Feeds into |
|---|---|---|---|

(e.g. Contract creation form → Contracts module → currency selector per
recent `fdb6796`/`38cadba` work → Billing schedule generation)

## Money storage points

| Entity.field | Module | Currency stored alongside amount? (verify — critical) |
|---|---|---|

## Money transformation points (calculations)

(Cross-reference `12-FINANCIAL-SEMANTICS.md` — this map is the visual
overview; that document has the formula detail.)

## Money display points

| Surface | Module | Shows currency explicitly? |
|---|---|---|

## Money export points

| Export | Module | Includes currency? |
|---|---|---|

## Diagram

(Insert a flow diagram once the above tables are populated — money
should visibly flow from a small number of entry points through a
traceable path to every display/export; any display/export that can't be
traced back to a verified entry point is a finding.)
