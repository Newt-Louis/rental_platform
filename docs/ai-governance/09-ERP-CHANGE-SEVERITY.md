# 09 — ERP Change Severity

Two orthogonal classifications apply to every change: **Priority**
(how bad if wrong) and **Tier** (where in the platform it sits). Both
determine required review depth per `02-AGENT-OPERATING-MODEL.md`.

## Priority

```text
P0  Security / financial corruption / severe data loss
P1  Major E2E business failure
P2  Significant operational problem
P3  UX / maintainability
```

- **P0** — could leak cross-Mall/cross-Tenant data, corrupt or lose
  financial records, bypass authorization, or cause irreversible data
  loss. Requires Chief ERP Architect + affected Functional Consultant
  sign-off before release, verified rollback, and full Gate 1–9 evidence.
- **P1** — breaks a Golden E2E journey end-to-end even if no data is
  corrupted (e.g. Contract creation blocked, Billing generation fails).
  Requires Solution Architect + Functional Consultant sign-off.
- **P2** — degrades a workflow without blocking it, or affects a
  non-golden-path journey. Requires Functional Consultant review.
- **P3** — cosmetic, UX, or internal maintainability; implementation
  agent may proceed within standard guardrails without additional
  sign-off, provided it stays P3 in scope.

Priority is assigned to the *worst plausible outcome* of the change being
wrong, not the intended outcome.

## Tier

```text
Tier 0  Platform Foundation
Tier 1  Business Core
Tier 2  Operations
Tier 3  Consumers
```

- **Tier 0 — Platform Foundation**: Auth, authorization/guards, Mall/
  Company/Tenant scoping, currency/money handling, cross-cutting
  capabilities (`01-PLATFORM-SCOPE.md` list), core state-machine
  infrastructure.
- **Tier 1 — Business Core**: CRM, Bookings, Proposals, Contracts,
  Billing — the primary revenue-generating lifecycle.
- **Tier 2 — Operations**: Spaces, Slots, Fitout, Work Orders, Tickets,
  Patrol, Inventory, Service Contracts, Parking, Sales, SAP integration,
  Tenants/Tenant Portal.
- **Tier 3 — Consumers**: Dashboard, Reports, Analytics, Pipeline Stats,
  Announcements, Notifications, Categories, Branding — surfaces that
  primarily read/display data owned elsewhere.

A change's Tier is the **highest** tier of any domain it touches (Tier 0
counts as "highest"). A change that touches both Tier 1 (Contracts) and
Tier 3 (Reports) is evaluated at Tier 1 rigor, plus the Tier 3 consumer
must be checked for consistency (reconciliation).

## Combined review requirement

| Priority \ Tier | Tier 0/1 | Tier 2 | Tier 3 |
|---|---|---|---|
| P0 | Steering Board + Chief Architect | Chief Architect + Functional | Chief Architect |
| P1 | Chief Architect + Functional | Solution Architect + Functional | Functional Consultant |
| P2 | Solution Architect + Functional | Functional Consultant | Functional Consultant |
| P3 | Functional Consultant | Implementation agent (guardrails only) | Implementation agent (guardrails only) |

## Status of this mapping

The Tier assignment of each concrete module above is a **starting
hypothesis** based on business function, matching the grouping in
`01-PLATFORM-SCOPE.md`. It must be verified/refined once
`docs/system-truth-templates/PLATFORM_DEPENDENCY_MATRIX.md` and
`BLAST_RADIUS_MATRIX.md` are populated — a module that looks like Tier 2
by business function but is a heavy upstream dependency for Tier 1
domains should be re-tiered accordingly.
