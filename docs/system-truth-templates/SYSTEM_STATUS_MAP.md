# System Truth — System Status Map

> **TEMPLATE — NOT YET POPULATED.** Cross-entity view of every status/
> state field in the platform and how they relate — the visual
> companion to `04-STATE-MACHINES.md`.

## Status fields inventory

| Entity | Status field | Values | Module owner |
|---|---|---|---|

## Cross-entity status coupling

(Where one entity's status should logically constrain or trigger another
— e.g. Contract status affects whether new Invoices can be generated;
Fitout phase affects whether Handover can proceed.)

| Upstream entity.status | Downstream entity.status | Coupling enforced? | Evidence |
|---|---|---|---|

## Status values with unclear/undocumented meaning

(Any enum value found in code with no clear business definition —
raise as `BC-xxx`.)

## Diagram

(Insert a status-relationship diagram once populated — group by business
process (BP-xxx) for readability rather than one flat diagram of every
entity.)
