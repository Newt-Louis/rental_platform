# System Truth — Gold Implementation Patterns

Real, specific examples found in this codebase, cited by file:line, to be pointed to when implementing similar operations elsewhere.

## Pattern: Serializable transaction + bounded retry for concurrent-write races
- **Example**: `BookingService`'s `runSerializable` helper (`booking.service.ts:1034-1051`) — Serializable isolation + retry-on-P2034 up to 3 attempts, wrapping booking write + unit-status transition + lead update + activity log in one atomic unit.
- **Why this is the model**: Explicitly solves the exact concurrency problem Slots (`CONTRA-015`) currently lacks any protection against. Any new booking-like feature should copy this pattern directly rather than reinvent it.
- **Also applied well in**: `proposals.service.ts` submit()/createContractFromProposal() (Serializable + P2002 idempotent-race resolution), `contracts.service.ts` updateStatus() (Serializable, closes a documented prior gap), `fitout.service.ts` advanceStatus() (Serializable, stale-read rejected).

## Pattern: Single centralized status-recompute function, called after every mutating operation
- **Example**: `billing.service.ts:recomputeInvoiceStatusFromPayments()` (1103-1130) — called after every payment/reversal/adjustment/issue. This is the platform's cleanest status-machine implementation: one function owns the derivation, nothing else independently recomputes `Invoice.status`.
- **Contrast**: this discipline was **not** applied to the "outstanding balance" *amount* calculation in the same module (6+ independent implementations) — worth noting as proof the pattern is known and achievable, just inconsistently applied.

## Pattern: Explicit adjacency-table state-machine enforcement
- **Example**: `contracts.service.ts:CONTRACT_STATUS_TRANSITIONS` (21-32) — a literal data structure checked in `updateStatus()`, rather than ad hoc per-method status checks scattered through the service.
- **Also applied well in**: `service-contracts.service.ts:ALLOWED_TRANSITIONS`, `parking.service.ts:STATUS_TRANSITIONS`.
- **Why this is the model**: `04-STATE-MACHINES.md` shows every module using this pattern has zero confirmed enforcement gaps; the modules with ad hoc per-method checks (Proposal, Ticket, WorkOrder, SlotBooking) are exactly where dead/unused enum values and enforcement inconsistencies were found.

## Pattern: Idempotency-key + payload-hash dedupe for externally-retriable writes
- **Example**: `billing.service.ts:recordPayment()` (1028-1099) — explicit `idempotencyKey`/hash fields, safe against client-side retry-after-timeout duplicate submission.
- **Also applied well in**: SAP integration (`sap.service.ts:158-160`) — `entityType:entityId:endpoint` as both an HTTP header and a DB-unique constraint, plus a circuit breaker on top.

## Pattern: Config-driven (DB-seeded) state machine instead of a hardcoded enum
- **Example**: `FitoutStageConfig` (Fitout module) — the entire 9-stage pipeline, including which stages trigger Unit-status changes and which require gate documents, is data, not code. This is the most sophisticated and most correctly-executed state machine in the platform (`04-STATE-MACHINES.md`, `01-END-TO-END-BUSINESS-PROCESS.md` BP-003 — zero contradictions found against existing design docs).

## Pattern: Per-item failure isolation inside a locked batch job
- **Example**: `billing-schedule.service.ts` monthly billing generation (165-178) and `compliance-scheduler.service.ts` monthly exports (56-80) — both catch and log per-item errors and continue the batch, rather than letting one bad record abort the whole run.
- **Contrast**: Parking's statement generation and Analytics' occupancy-snapshot/renewal-risk jobs do **not** do this (see `ANTI_PATTERNS.md`) — direct evidence this is a known-achievable pattern being inconsistently applied.

## Pattern: Correct tenant-boundary enforcement via server-forced identity, never client-supplied
- **Example**: Tickets' `findAll`/`findOne`/`create`/`transition`/`addComment` (tickets.service.ts, multiple locations) — every method forces `currentUser.tenantId` server-side with an explicit comment ("Không tin tưởng tenantId client gửi lên" — "don't trust client-supplied tenantId"). Same pattern correctly applied in Billing/Invoices and Sales tenant-facing endpoints.
- **Why this matters**: this is the *positive* counterpart to the `CONTRA-003` gap — proof the team knows and applies the correct pattern almost everywhere; the 3 gap endpoints are an omission, not a knowledge gap.

## Pattern: Mall-scoped tenant-visibility done right
- **Example**: `announcements.service.ts:18-26,80-89` — restricts Tenant-role viewers to only malls where they have an active Unit, computed server-side.

## Pattern: Reused (not reimplemented) cross-module formula
- **Example**: `reports.service.ts:246-248` (`arAgingReport()`) calling `billingService.getArAging()` directly, with an explicit code comment acknowledging the reuse ("dùng lại đúng logic đối soát của Billing, không viết lại" — "reuse Billing's own reconciliation logic, don't rewrite it"). The **only** confirmed instance of a reporting consumer correctly delegating to the owning module's formula rather than reimplementing it (see `CONTRA-012`) — proof the team is capable of this discipline and applied it at least once.
