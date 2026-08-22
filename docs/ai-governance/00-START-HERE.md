# 00 — START HERE

This is the entry point for any AI agent (or human) operating on the THISO
Leasing Platform under AI governance. Read `AGENTS.md` at the repo root
first; this file explains the operating sequence and the core platform
vocabulary every other document assumes.

## Operating sequence

```text
SYSTEM TRUTH
↓
CHANGE REQUEST
↓
IMPACT MAP
↓
ARCHITECTURE / FUNCTIONAL REVIEW
↓
IMPLEMENTATION
↓
ADVERSARIAL REVIEW
↓
GOLDEN E2E
↓
RECONCILIATION
↓
RELEASE
```

- **SYSTEM TRUTH** — the authoritative, verified description of what the
  platform actually does (`docs/system-truth/`, once reconstructed via
  `10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md`). Nothing downstream is valid
  without this existing and being current for the area being changed.
- **CHANGE REQUEST** — a `CR-xxx` (`docs/change-templates/CR-TEMPLATE.md`)
  stating business reason, current vs. expected behavior, and scope.
- **IMPACT MAP** — the mandatory cross-module analysis inside the CR (see
  `03-CHANGE-IMPACT-PROTOCOL.md`). No implementation without it.
- **ARCHITECTURE / FUNCTIONAL REVIEW** — checked against domain ownership
  (`docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`) and severity tier
  (`09-ERP-CHANGE-SEVERITY.md`).
- **IMPLEMENTATION** — follows `04-CODING-GUARDRAILS.md`.
- **ADVERSARIAL REVIEW** — an independent pass looking for exactly the
  failure classes in `AGENTS.md` §1.
- **GOLDEN E2E** — the fixed baseline scenarios in
  `05-E2E-QUALITY-GATES.md` must still pass.
- **RECONCILIATION** — every duplicated financial/status value is checked
  for consistency across all surfaces that show it.
- **RELEASE** — governed by `07-RELEASE-GOVERNANCE.md`; engineering PASS
  is not automatically production GO.

## Platform-level concepts (shared vocabulary)

These terms mean the same thing everywhere in this platform. If a change
touches one of them, treat it as cross-cutting by default, not local.

| Concept | Definition (as used across this platform) |
|---|---|
| **Currency** | The unit of account for a monetary value (VND, USD, MMK). A property of *the transaction that created the value*, not of the mall's current configuration. |
| **Money** | A (amount, currency) pair. Never a bare number once it crosses a module boundary. |
| **Mall** | The top-level operating site/property. Primary tenant-isolation and authorization boundary alongside Company. |
| **Company** | The legal entity that may own/operate one or more Malls. |
| **Tenant** | The lessee business occupying a Unit under a Contract; also the identity behind Tenant Portal login. Distinct from the multi-tenancy sense of "tenant" (i.e., Mall/Company isolation) — this platform uses "Tenant" only in the leasing-customer sense; Mall/Company scoping is the isolation boundary. |
| **Customer identity** | The CRM-level lead/customer/contact identity, which may predate and outlive any single Tenant/Contract relationship. |
| **Unit / Space** | A leasable physical location (owned by Spaces module), which may be further divided into Slots for short-term/visual booking. |
| **Contract** | The binding lease agreement; source of truth for contract value, currency, term, and the driver of Billing generation. |
| **Authorization** | Enforced per-request at the API/data-access layer (guards/interceptors), scoped by Mall and, where applicable, Tenant. UI-level hiding is never sufficient. |
| **Financial formula** | Any derived monetary or percentage value (outstanding balance, revenue share, occupancy revenue, overdue aging). Must have exactly one owning implementation; other surfaces must call it, not re-derive it. |
| **Status / state machine** | Any entity lifecycle (Booking, Proposal, Contract, Invoice, Ticket, Fitout phase, Work Order). Transitions must be centrally defined and validated, not scattered as ad hoc field writes. |
| **Events** | Anything that decouples a state change from its downstream effects (outbox rows, queued jobs, webhooks). Must be assumed at-least-once and idempotently handled. |
| **Financial jobs** | Scheduled/async processes that compute or move money (billing generation, overdue recalculation, reconciliation jobs). Treated as Tier 0 for correctness review. |

## What to read next

- Building/reviewing a change → `03-CHANGE-IMPACT-PROTOCOL.md` then
  `04-CODING-GUARDRAILS.md`.
- Understanding the platform's shape → `01-PLATFORM-SCOPE.md`.
- Understanding who decides what → `02-AGENT-OPERATING-MODEL.md`.
- Currency-touching work → `08-MULTI-CURRENCY-GUARDRAILS.md` (mandatory).
- Preparing a release → `07-RELEASE-GOVERNANCE.md`.
- No System Truth exists yet for your area → run
  `10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md` (audit only) before changing
  code there.
