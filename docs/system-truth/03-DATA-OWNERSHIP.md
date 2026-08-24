# System Truth — 03 — Data Ownership

Authoritative source for "who owns this data" — supersedes `docs/ai-erp-team/05-ERP-MASTER-DATA.md`'s hypothesis where they conflict.

## Master data verification (against the `05-ERP-MASTER-DATA.md` candidate list)

| Candidate | Confirmed as true master data? | Scope | Notes |
|---|---|---|---|
| Company | **DOES NOT EXIST** | — | No `Company` Prisma model. This candidate is invalid — remove or mark historical in `05-ERP-MASTER-DATA.md`. See `00-SYSTEM-OVERVIEW.md`'s "Major structural correction." |
| Mall | Confirmed | Global (flat, ungrouped) | Top-level entity; no parent. |
| Floor, Zone | Confirmed | Mall-scoped | Owned by Spaces. |
| Unit | Confirmed | Mall-scoped (via Floor/Zone) | Status owned by shared `UnitStatusService`, with the merge/split bypass noted in `02-DOMAIN-OWNERSHIP.md`. |
| Tenant | Confirmed | Scoped via Contract to a Mall | Distinct from Customer — see below. |
| Customer | Confirmed, but **scope is a genuine open question** | **No `mallId` field on the model at all** | `CustomersController` has zero mall filtering; `Lead` (a related but distinct entity) does carry `mallId`. Logged as `BC-xxx` — see `BUSINESS_CONFIRMATION_REQUIRED.md`. |
| Category | Confirmed | Mixed — base taxonomy is global; `CategoryMallPricing` sub-resource is mall-scoped and correctly access-checked | Two-purpose module (taxonomy + pricing rules). |
| Currency | Not an entity — an enum (`CurrencyCode`) plus free-text `String` fields in several legacy models | N/A | See `16-MULTI-CURRENCY-SEMANTICS.md` for the full per-model breakdown; this is the platform's largest data-modeling inconsistency. |
| User | Confirmed | Global identity; access scoped via `UserMallAccess` join table (not a field on User itself) | `User.tenantId` confirmed to exist and be used for Tenant Portal identity linkage (`schema.prisma:431-433`). |
| Role | Not an entity — a fixed enum (9 values: ADMIN, LEASING_EXECUTIVE, LEASING_MANAGER, MALL_DIRECTOR, FINANCE, LEGAL, OPERATION, TENANT, CEO) | N/A | See `11-ROLE-PERMISSION-MATRIX.md`. |

## Additional true master/reference data found (not in the original candidate list)

- `UserMallAccess` — join table, the actual mechanism of Mall-scoping for staff roles; not itself business master data but structurally central to `15-MULTI-MALL-MULTI-COMPANY.md`.
- `CategoryMallPricing` — per-mall/category/floor/zone rent-pricing rule table, referenced by Booking/Proposals price-deviation approval checks (VND-only by design, since it has no currency field).
- `FitoutStageConfig` — DB-driven, seeded pipeline definition (not a hardcoded enum) that defines the entire Fitout state machine; effectively master data for the Fitout domain.

## Per-entity ownership highlights (full detail deferred to `02-DOMAIN-OWNERSHIP.md` and `04-STATE-MACHINES.md`)

| Entity | Confirmed Owner | Scope | Multiple-writer finding? |
|---|---|---|---|
| Lead | CRM (nominally) | Mall-scoped (`mallId` field exists) | Yes — written directly by booking, proposals |
| Customer | CRM (nominally) | **No mall field** | Yes — see above; also no mall-check on its controller |
| UnitBooking (Booking) | BookingService | Mall-scoped via Unit | Reads by many modules, writes are clean (BookingService only) |
| Proposal | ProposalsService (nominally) | Mall-scoped via Unit/Contract | Yes — written directly by booking, contracts, crm, billing, ai, spaces |
| Contract | ContractsService (nominally) | Mall-scoped | Yes — written directly by billing, billing-schedule, analytics, dashboard, sales, tenants, spaces, ai |
| Invoice / Payment | BillingService | Mall-scoped via Contract/Tenant; currency-per-record via `currencyCode` field (with confirmed gaps — see `16-MULTI-CURRENCY-SEMANTICS.md`) | Billing is sole owner, but currency-field-population is inconsistent across the 4 invoice-source branches |
| Unit.status | `UnitStatusService` (shared, `common/services/`) | Mall-scoped via Unit | Yes — bypassed by Spaces' merge/split |
| ParkingMonthlyStatement/.paidAmount/.status | ParkingService, **written into by BillingService** | Mall-scoped via ParkingCustomerContract | Confirmed bidirectional (Billing writes back sync fields) |
| ServiceContractPayment.transferredToBillingAt/.billingError | ServiceContractsService, **written into by BillingService** | Mall-scoped via ServiceContract | Same bidirectional pattern as Parking |
| SalesTurnover | SalesService | Mall-scoped via Unit/Tenant | Clean; read-only by Billing's revenue-share calc |

## Verification note

This document reflects the depth achieved in a single research pass per domain group; it is not an exhaustive field-by-field schema audit. Fields not mentioned above should be treated as **NOT YET VERIFIED** rather than assumed clean.
