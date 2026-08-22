# System Truth — Blast Radius Matrix

## Per-module blast radius (top modules by verified impact)

### Billing
- **Direct consumers**: Contracts (schedule), Parking (write-back), Service-Contracts (write-back), Sales (revenue-share read), Slots (read), Dashboard, Reports, Analytics (all reimplement its formulas rather than call it), SAP (push source).
- **Financial formulas affected**: Outstanding balance (6+ implementations), AR aging, collection KPIs, revenue share.
- **Golden Scenarios affected**: GS-04, GS-06, GS-14, GS-15.
- **Worst plausible failure**: Invoice/payment corruption or currency-mixing propagates silently into every downstream report and the SAP integration, with no reconciliation check to catch it (see `18-SYSTEM-INTEGRITY-CHECKS.md`).
- **Severity tier if broken**: P0/Tier 0.

### Contracts
- **Direct consumers**: Billing (schedule trigger), Fitout (activation event), Analytics/Dashboard (renewal-risk, expiry), Sales, Tenants, Spaces (Unit status).
- **Golden Scenarios affected**: GS-01, GS-04, GS-05, GS-07.
- **Worst plausible failure**: A broken activation transaction leaves a Contract ACTIVE with no billing schedule (the exact historical gap the current Serializable-transaction pattern was built to close) or a broken termination leaves a Unit permanently unavailable (stale status, confirmed live gap).
- **Severity tier if broken**: P0/Tier 0.

### MallAccessGuard / MallAccessService (common/)
- **Direct consumers**: every module (global `APP_GUARD`).
- **Golden Scenarios affected**: GS-09 (currently would show multiple failures).
- **Worst plausible failure**: Any change to the guard's resource-resolution heuristics (adding/removing a recognized param name or path pattern) silently changes authorization behavior for every controller that relies on the automatic extraction, without those controllers' code changing at all — the widest-reaching change surface in the platform for security-relevant behavior.
- **Severity tier if broken**: P0/Tier 0.

### UnitStatusService (common/)
- **Direct consumers**: Booking, Proposals, Contracts, Fitout, Spaces (except the merge/split bypass).
- **Golden Scenarios affected**: GS-01, GS-05, GS-08.
- **Worst plausible failure**: A change to `ALLOWED_TRANSITIONS` that doesn't account for the merge/split bypass creates a second point of divergence beyond the one already found.
- **Severity tier if broken**: P0/Tier 0.

### CRM (Lead/Customer)
- **Direct consumers**: Booking, Proposals, Dashboard, Reports, Slots, Spaces (all reach in directly, not via CrmService).
- **Golden Scenarios affected**: GS-01.
- **Worst plausible failure**: A schema/behavior change to Lead/Customer made only through `CrmService` would not be respected by the 6 other modules that bypass it — this module cannot be safely refactored without a full cross-module grep first, every time.
- **Severity tier if broken**: P1/Tier 1 (elevated due to boundary weakness, not raw business criticality).

### Reports / Analytics (as a pair)
- **Direct consumers**: end users directly (these are terminal/leaf modules) — but the *data exposure* blast radius spans every Mall in the system for any user with these module roles, due to the confirmed scoping gap.
- **Golden Scenarios affected**: GS-09, GS-14.
- **Worst plausible failure**: Already realized, not hypothetical — a Mall-scoped user can currently see portfolio-wide financial/occupancy data through these two modules.
- **Severity tier**: P0/Tier 0 (elevated from its "Tier 3 consumer" business-function classification due to the confirmed live authorization gap).

### Spaces (Units)
- **Direct consumers**: Booking, Proposals, Contracts, Fitout, Tickets, Work-Orders (location reference).
- **Worst plausible failure**: Already realized — full CRUD exposure across Malls for non-bypass staff roles.
- **Severity tier**: P0/Tier 0 (elevated from Tier 2 for the same reason as Reports/Analytics).

## Summary table

| Module | Direct consumers (count) | Financial surface? | GS affected | Worst-case severity |
|---|---|---|---|---|
| Billing | 9 | Yes | GS-04,06,14,15 | P0 |
| Contracts | 6 | Yes | GS-01,04,05,07 | P0 |
| MallAccessGuard/Service | 31 (all modules) | Indirect | GS-09 | P0 |
| UnitStatusService | 5 | No | GS-01,05,08 | P0 |
| CRM | 6 | Partial | GS-01 | P1 |
| Reports/Analytics | end users, all malls | Yes | GS-09,14 | P0 (elevated) |
| Spaces (Units) | 6 | No | GS-09 | P0 (elevated) |
| Proposals | 4 | Yes | GS-01,03 | P1 |
| Approvals | 1 (event-only) | No | GS-01 | P1 (cleanest boundary, but gates the whole approval chain) |
| Sales, Parking, Service-Contracts, Slots | 1 each (Billing) | Yes | GS-05,06,07,08 | P1/P2 each |

## How to use this when writing a CR

Before finalizing DOWNSTREAM IMPACT, check the changed module's row here. If the CR's stated impact is narrower than this table shows, either the CR under-scopes the change or this table needs correction — verify which before proceeding, per `docs/ai-governance/03-CHANGE-IMPACT-PROTOCOL.md`.
