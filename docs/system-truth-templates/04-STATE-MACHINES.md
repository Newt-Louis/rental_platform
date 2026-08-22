# System Truth — 04 — State Machines

> **TEMPLATE — NOT YET POPULATED.** Reconstruct every entity lifecycle
> as actually enforced in code — not as implied by an enum's member
> names.

## Per-entity record (repeat for each stateful entity: Booking, Proposal,
Contract, Invoice, Ticket, Fitout phase, Work Order, etc.)

### Entity: [name]
- **All states (as defined in code):**
- **Transition table:**

  | From | To | Trigger | Guard/validation | File:line |
  |---|---|---|---|---|

- **Enforcement point:** centrally validated (service/state-machine
  helper) or scattered ad hoc field writes (flag as `ANTI_PATTERNS.md`
  finding if scattered)
- **Illegal transitions actually preventable today:** yes/no, evidence
- **External readers of this status (other modules/reports that branch
  on this entity's status):**
- **Terminal states:**
- **Confidence:** HIGH / MEDIUM / LOW

## Cross-entity state coupling

(Where one entity's transition should trigger or constrain another's —
e.g. Contract termination and outstanding Invoice status. Note whether
this coupling is actually enforced or merely assumed.)
