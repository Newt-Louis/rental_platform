# 12 — Risk Register

## Format

| Risk | Severity | Domain | Journey | Impact | Owner | Mitigation | Status |
|---|---|---|---|---|---|---|---|

- **Severity** — P0/P1/P2/P3 per
  `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`.
- **Domain** — from `03-DOMAIN-OWNERSHIP.md`.
- **Journey** — affected `BP-xxx` from `04-BUSINESS-PROCESS-CATALOG.md`
  and/or `GS-xxx` from the Golden Scenario baseline.
- **Impact** — concrete description of what goes wrong, not a category
  label.
- **Owner** — the role from `01-ERP-ORGANIZATION.md` accountable for
  tracking this risk to resolution.
- **Mitigation** — planned or in-progress action.
- **Status** — OPEN / MITIGATING / ACCEPTED / CLOSED.

## Known risks at framework creation (2026-08-20) — updated post-reconstruction (2026-08-21)

| Risk | Severity | Domain | Journey | Impact | Owner | Mitigation | Status |
|---|---|---|---|---|---|---|---|
| Multi-currency foundation is mid-rollout — CONFIRMED via System Truth: core leasing chain (Booking→Proposal→Contract→Billing) propagates currency correctly end-to-end; Sales, Slots, and Parking statements/lines/payments have **no currency field at all**; Billing invoice-summary and ServiceContracts' transfer-to-billing path have confirmed currency bugs | P0/P1 (see `docs/system-truth/ARCHITECTURE_CONTRADICTIONS.md` CONTRA-005/009/010/011) | Cross-domain (Tier 0) | GS-11..GS-14 | Confirmed silent currency-mixing in Billing invoice summaries and revenue-share calc; confirmed missing currency on Service-Contract-transferred invoices | Multi-Currency Architect | Full nine-surface findings now in `docs/system-truth/16-MULTI-CURRENCY-SEMANTICS.md`; fixes pending BC-004/BC-005 confirmation | **SPLIT 2026-08-21**: **CR-102A (Billing invoice-summary, CONTRA-005) — DONE**, commit `915c96e`, `docs/changes/CR-102-CURRENCY-MIXING-CORRECTNESS.md`. **CR-102B (Revenue-share, CONTRA-011) — BLOCKED, BUSINESS CONFIRMATION REQUIRED** (BC-004/BC-005 remain OPEN, correctly not guessed). ServiceContracts transfer-path bug (CONTRA-010) remains OPEN, tracked for CR-103. |
| Prior ERP audit found live cross-tenant/cross-Mall data leaks root-caused to `MallAccessGuard` gaps — CONFIRMED via System Truth: guard is now global (`APP_GUARD`, closing the "forgotten on a controller" mode) but its heuristic, param-name-dependent resolution leaves 9+ confirmed live gaps (Spaces units, Analytics, Reports, Sales, Parking-Dashboard, 3 Fitout sub-controllers, AI, CRM) | **P0** (see `docs/system-truth/ARCHITECTURE_CONTRADICTIONS.md` CONTRA-008) | Security / Tier 0 | GS-09, GS-10 | Confirmed exploitable cross-Mall read (and, for Spaces, write/delete) access for non-bypass staff roles | Security Architect | Requires a structural/ADR-level fix (fail-closed convention), not per-instance patches — see `docs/system-truth/AGENT_BOOTSTRAP.md` | OPEN — this is now the platform's #1 confirmed risk |
| Financial formulas historically duplicated between Billing, Dashboard, and Reports — CONFIRMED via System Truth and found **more widespread** than originally scoped: "collected revenue"/"occupancy rate" independently reimplemented 5-10 times across Dashboard/Reports/Analytics/AI, only 1 of 10 confirmed instances (AR-aging) correctly delegates | P1 (see `docs/system-truth/ARCHITECTURE_CONTRADICTIONS.md` CONTRA-012) | Finance / Reporting | BP-002, BP-011 | Confirmed formula-shape variance (face-value vs. payments-received, clamped vs. unclamped) across reporting surfaces | Financial Data Architect + Reporting Architect | Establish `OccupancyAnalyticsService.getOccupancyV2()` and a to-be-extracted revenue service as canonical; full detail in `docs/system-truth/13-REPORTING-DEFINITIONS.md` | OPEN — confirmed, not just suspected |
| No System Truth documentation existed | P1 | Platform-wide | All | — | Documentation Lead | **CLOSED** — System Truth reconstruction completed 2026-08-21, 35 documents under `docs/system-truth/` | **CLOSED** |
| New — Tenant/Ticket isolation gap on 3 endpoints (`escalations`/`rate`/`rating`/SLA-policy) | P1 (`CONTRA-003`) | Tenant Experience / Tickets | BP-004 | Cross-tenant read of escalation/rating data; any tenant can rewrite platform-wide SLA policy | Tenant Experience Consultant + Security Architect | Add ownership checks matching the pattern already used elsewhere in the same service | OPEN |
| New — Contract termination is not fully atomic | P1 (`CONTRA-014`) | Leasing / Contracts | BP-002, GS-07 | A failed Unit-status release after a committed termination leaves the Unit stale while the Contract shows TERMINATED | Leasing Functional Consultant | Wrap the Unit-status release into the same transaction as the Contract/Termination commit | OPEN |
| New — Slot booking has no concurrency protection | P1 (`CONTRA-015`) | Mall Operations / Slots | BP-008 | Two simultaneous requests can double-book the same slot/window | Mall Operations Consultant | Add a Serializable transaction + DB constraint, mirroring `UnitBooking`'s pattern | OPEN |
| New — unverified carried-forward claim that `/uploads` may bypass auth guards | **P0 if confirmed true** | Security / Platform-wide (Files capability) | All | Would undermine every Mall/Tenant scoping conclusion for file-based resources | Security Architect | Dedicated follow-up investigation recommended ahead of standard P1 sequencing — see `docs/system-truth/BUSINESS_CONFIRMATION_REQUIRED.md` BC-018 | OPEN — **not yet re-verified**, treat as live risk until confirmed either way |

Additional risks should continue to be added as `docs/system-truth/ARCHITECTURE_CONTRADICTIONS.md` evolves in future reconstruction passes — do not let this register go stale relative to that document.
