# System Truth — Executive Summary

## Platform state at a glance
- Reconstruction date: 2026-08-21
- Coverage: All 31 backend modules touched; 5 modules deep-audited per research stream group (Core Leasing, Financial Core, Space/Mall Ops, Tenant & Security, Reporting/Integration); Auth/Users/Categories/Audit-Log/Notifications/Telemetry/Branding/Announcements covered at moderate depth via the Security and Reporting streams' broader sweeps.
- Overall confidence: 19 of 23 core System Truth documents HIGH confidence; Data Ownership, Data Lineage, File/Document Ownership, and Dependency-Graph completeness are MEDIUM/LOW — see `CODEBASE_CONFIDENCE_MAP.md`.

## Top findings

1. **Cross-Mall data exposure is real and widespread (CONTRA-008, P0).** The global `MallAccessGuard` closed the historical "guard forgotten on a controller" failure mode, but its heuristic, param-name-dependent resource resolution creates a structurally identical gap today: confirmed live cross-Mall exposure in Spaces (Units — full CRUD), Analytics, Reports, Sales, Parking-Dashboard, three Fitout sub-controllers, AI chat, and CRM. This is the platform's single most important finding.
2. **Confirmed currency-correctness bugs in the financial core (CONTRA-005, 010, 011, P0/P1).** An unfiltered cross-currency SUM in Billing's invoice-summary; a missing `currencyCode` in one of two "transfer to billing" implementations for Service Contracts; a revenue-share formula that mixes a VND-implicit figure with a possibly-non-VND figure.
3. **The platform's named risk — duplicated financial formulas — is confirmed and more widespread than expected (CONTRA-012, P1).** "Collected revenue" and "occupancy rate" are each independently reimplemented 5-10 times across Dashboard/Reports/Analytics/AI, with confirmed variance in exact formula results. Only one confirmed instance (AR-aging) of correct delegation to the owning module exists platform-wide.

## Multi-currency readiness snapshot

- **Ready (VND+USD+MMK, verified end-to-end)**: Booking→Proposal→Contract→BillingSchedule→Invoice (LEASE_CONTRACT source) currency propagation chain.
- **Partial**: Billing aggregation/display/export/notification layers (correct in most places, confirmed bugs in specific ones).
- **Gap (VND-only, undocumented at the model level)**: Sales (SalesTurnover — no currency field, not even mentioned in prior audit docs), Slots (UnitSlot/SlotBooking — no currency field), Parking (statement/line/payment level — no currency field, deeper than the documented contract-level gap).
- **VND-only by design (appropriately documented)**: Parking-Dashboard (external legacy system).

## Security/authorization snapshot

- **JWT/Auth model**: sound — re-fetches user from DB each request, no stale-privilege window, production-hardened JWT secret validation.
- **RolesGuard**: global, default-open if a route is undecorated (not default-closed) — acceptable given the module-role allow-list convention, but worth noting as a convention-dependent, not structurally-enforced, safety property.
- **MallAccessGuard**: global, but heuristic — see Top Finding #1. **This is the platform's primary near-term security remediation priority.**
- **Tenant isolation**: strong on core paths (Tickets/Billing/Sales all correctly server-force `tenantId`), with a confirmed 3-endpoint gap in Tickets (escalations/rate/rating/SLA-policy).
- **Unverified carried-forward risk**: `/uploads` static-file-serving possibly bypassing all auth guards (`SECURITY_READINESS.md`, BC-018) — not re-confirmed this pass; if still true, undermines every Mall/Tenant scoping conclusion for file-based resources. **Recommend this be the very first follow-up investigation**, ahead of even the P1 program work below, since it could change the severity assessment of several other findings.

## Recommended next steps (informs Program Board sequencing — see updated `docs/ai-erp-team/13-PROGRAM-BOARD.md`)

1. **Immediate, out-of-band** (per `docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`'s P0 escalation rule, ahead of normal Program Board sequencing): verify the `/uploads` guard-bypass claim (BC-018) — a single focused investigation, not a full remediation project.
2. **P2 (Business Confirmation) — do this before P1 remediation work, not after**: resolve BC-004, BC-009, BC-013 first — these four determine whether several P0 findings require emergency remediation or standard-priority scheduling. Resolving them early prevents both under- and over-reacting.
3. **P1 (Architecture Contradictions)**: fix CONTRA-008 (Mall-scoping) structurally — not as 9 individual patches, but via a fail-closed convention (ADR required, per `docs/ai-erp-team/11-DECISION-REGISTER.md`). Fix CONTRA-005/010/011 (currency bugs) as straightforward, well-scoped corrections once BC-004 is answered.
4. **P4/P5 (Cross-Module Contracts / Multi-Currency)**: establish canonical formula ownership for revenue/occupancy (CONTRA-012) and complete the currency-field gaps in Sales/Slots/Parking once BC-005 is answered.
5. Update `docs/ai-governance/01-PLATFORM-SCOPE.md` (module count 30→31) and `docs/ai-governance/00-START-HERE.md`/`docs/ai-erp-team/05-ERP-MASTER-DATA.md` (remove the nonexistent "Company" concept) — low-effort documentation corrections, do opportunistically alongside the above.

## SYSTEM TRUTH CONFIDENCE

**HIGH** for the platform's structure, state machines, transaction boundaries, financial-formula ownership, and authorization posture (19/23 core documents). **MEDIUM-LOW** for full data lineage, exhaustive cross-module contract cataloging, and file/document access control — these are explicitly flagged, not silently assumed, and should be the target of the next reconstruction pass rather than treated as "unknown unknowns."

---

READY FOR ARCHITECTURE REVIEW
