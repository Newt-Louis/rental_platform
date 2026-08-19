# 07 — CRM & Booking: Domain Map

**Date:** 2026-08-19. Extracted from `apps/backend/prisma/schema.prisma`
and the services that own each write path.

## Stage map

| Stage | Entity | Trigger | Owner | Critical State |
|---|---|---|---|---|
| Lead | `Lead` | `POST /crm/leads` (manual entry) or import | `CrmService` | `status`: NEW/CONTACTED/QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST |
| Booking | `UnitBooking` | `POST /bookings` (optionally from a Lead) | `BookingService` | `status`: PENDING/ACTIVE/EXPIRED/CANCELLED/CONVERTED; `priority` (queue position) |
| Proposal | `Proposal` | `POST /bookings/:id/convert-to-proposal` or direct `POST /proposals` | `ProposalsService`/`BookingService` | `status`: DRAFT/SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED/CONVERTED (Phase 3 hardened) |
| Approval | `ApprovalWorkflow`/`ApprovalStep` | Proposal submit | `ApprovalsService` | Shared engine (Phase 3 gold standard) |
| Contract | `Contract` | Approval completion | `ProposalsService.createContractFromProposal` | Phase 3 hardened |

## CRM's actual scope, verified from the schema — not assumed

CRM owns: `Lead` (the sales-pipeline record), `LeadFollowUp` (referenced in
seed data), and reads/writes `Customer` (a **separate**, more
formal record created from a Lead on `WON`, via
`CustomersService.createFromLead` — idempotent, called from both the
direct Lead-update `WON` shortcut and `createContractFromProposal`'s
best-effort side call). CRM does **not** own `Tenant` — `Tenant` is the
Contract/Billing/Fitout-side record; `Lead.tenantId` and `Customer.tenantId`
are both optional forward-references a Lead/Customer *can* carry once
linked to a Tenant (e.g., an existing tenant expanding into a new unit
starts a fresh Lead already tied to their Tenant record), not something
CRM creates itself.

## Source of truth per business object, at each lifecycle point

| Data | Booking | Proposal | Contract |
|---|---|---|---|
| Unit | `UnitBooking.unitId` — REFERENCE (live FK, always current) | `Proposal.unitId` — REFERENCE, copied at creation, not re-synced if Booking's unit later changes (Booking and Proposal are separate rows after conversion) | `Contract.unitId` — REFERENCE, copied at contract creation |
| Rent/area/term | `requestedArea`/`requestedTerm`/`expectedRent`/`proposedRentPerSqm` — these are **sales-side proposed figures**, not commercial commitments | `Proposal.area`/`term`/`rentPerSqm`/`monthlyRent` etc. — **SNAPSHOT**, computed server-side at conversion time from the Booking's proposed figures plus the `ConvertToProposalDto`'s own (larger) field set — the true commercial terms start here | `Contract.rent`/`cam`/etc. — **SNAPSHOT**, copied from the Proposal at contract creation (`createContractFromProposal`) |
| Customer/Tenant | `leadId`/`customerId` — REFERENCE | `tenantId` — resolved once at conversion (from the Lead's or Customer's `tenantId`), then **SNAPSHOT** (not re-read from Lead/Customer again) | `tenantId` — REFERENCE, copied from Proposal |

**Verified: Booking edits after Proposal creation do NOT mutate the
Proposal.** `BookingService.update()` only ever writes to the `UnitBooking`
row; nothing in `ProposalsService` re-reads from `UnitBooking` after
`convertToProposal()` runs. This matches the "Proposal is an agreed
commercial snapshot" semantics the phase brief asks to verify — confirmed
true, not assumed.

## CRM → Booking handoff — answered from code

1. **Is Booking linked to CRM?** Optionally — `UnitBooking.leadId` is
   nullable; a Booking can be created directly against a `customerId`
   instead, or with neither and just a walk-in.
2. **Can Booking exist without CRM?** Yes — `dto.leadId`/`dto.customerId`
   are both optional in `CreateBookingDto` (though a booking without either
   would have no linked party at all, which is likely a UI-enforced
   requirement, not a backend one — not independently verified this phase,
   flagged not asserted).
3. **Is customer/tenant data copied or referenced?** Referenced at
   Booking creation (`leadId`/`customerId` FK); resolved to a `tenantId`
   snapshot only at Proposal conversion (see table above).
4. **Can CRM data change after Booking creation?** Yes, freely —
   `Lead`/`Customer` rows are independently editable; `UnitBooking` only
   holds the FK, not a copy, so Lead edits are reflected live until the
   Proposal snapshot point.
5. **Which data becomes authoritative when?** Lead/Customer through
   Booking; Proposal's own fields from conversion onward; Contract's own
   fields from contract creation onward. Each stage transition is where
   "reference" becomes "snapshot" for that stage's commercial fields.

## Booking → Proposal — duplicate protection, verified

`Proposal.bookingId String? @unique` — **DB-enforced**: at most one
Proposal per Booking. A Booking can also produce a Proposal via the
**direct** `POST /proposals` path bypassing Booking entirely (Phase 2
finding, re-confirmed) — meaning a Lead could in principle have proposals
from both paths; the one-Proposal-per-Booking constraint only applies to
the booking→proposal conversion path specifically, not a
one-Proposal-per-Lead invariant (no such constraint exists, and none is
implied by the domain — a Lead legitimately could have multiple Proposals
over time, e.g., after a rejection).
