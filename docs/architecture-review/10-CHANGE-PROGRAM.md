# 10 — Change Program (Proposed CRs — NOT IMPLEMENTED)

Every CR below is a proposal only, per `docs/change-templates/CR-TEMPLATE.md`. None have been implemented. Numbered CR-101..108 to avoid collision with any future CR numbering elsewhere.

---

## CR-101 — Mall-Scoping Architectural Fix (AUTH-01)

**Business reason**: Confirmed cross-Mall data exposure (P0-002 and 8+ related instances) allows legitimately-authenticated, non-privileged staff to read/write data belonging to Malls they have no assignment to.
**Root cause**: `MallAccessGuard`'s fixed, hardcoded resource-resolution with a fail-open fallback (`AUTH-01`).
**Affected domains**: Spaces, Analytics, Reports, Sales, Parking-Dashboard, Fitout (controls/gantt/daily-report), AI, CRM, Files.
**Affected journeys**: BP-013 primarily; indirectly all journeys touching Units.
**Cross-module contracts**: None directly (this is an authorization-layer fix, not a data-flow change).
**Business invariants**: INV-007.
**Data ownership**: No change — this doesn't alter which module owns which data, only who may access it.
**State impact**: None.
**Financial impact**: None directly, though it protects financial-adjacent data (Reports/Analytics revenue figures) from cross-Mall exposure.
**Currency impact**: None.
**Authorization impact**: Core of this CR — recommend a fail-closed convention (every non-bypass-role route either declares itself Mall-exempt via an explicit decorator, or the guard denies by default) rather than the current fail-open heuristic. Requires ADR — see `12-ARCHITECTURE-DECISIONS-REQUIRED.md` ADR-101.
**Reporting impact**: Fixes Reports/Analytics/AI's confirmed leaks as part of the same architectural change.
**Integration impact**: None.
**Migration requirements**: None (no schema change) unless the fail-closed design requires a new decorator/metadata annotation — likely, but additive, not breaking.
**Backward compatibility**: Existing correctly-scoped routes unaffected; routes newly brought under enforcement may reject requests that previously silently succeeded — this is the intended fix, but requires a rollout plan (see Wave design) to avoid breaking legitimate cross-mall-role usage that may exist undetected.
**Golden E2E scenarios**: GS-09 (must be extended to explicitly test every confirmed-gap route, not just a sample).
**Reconciliation**: N/A.
**Rollback**: Feature-flaggable per-route if the fail-closed default proves too aggressive during rollout.
**Dependencies**: BC-009, BC-013, BC-017, BC-020 inform rollout scope but do not block starting the architectural design.
**Risk**: Medium — risk of breaking currently-working-by-accident cross-mall usage if any exists; mitigated by phased rollout.
**Recommended implementation wave**: Wave 1 (Security).

---

## CR-102 — Fix Confirmed Live Currency-Mixing Bugs (CUR-01a)

**Business reason**: Two confirmed, reproducible financial-correctness defects (P0-001, P0-003) produce wrong numbers today, independent of any business-policy question.
**Root cause**: `CUR-01` — missing currency dimension in two specific aggregation/formula code paths.
**Affected domains**: Billing, Sales (read-only dependency).
**Affected journeys**: BP-002, BP-007, BP-011.
**Cross-module contracts**: XMOD-014.
**Business invariants**: INV-002.
**Data ownership**: No change.
**State impact**: None.
**Financial impact**: Core of this CR — corrects `findAllInvoices()` summary to bucket/filter by currency; adds a currency-consistency gate to `calculateRevenueShare` (block or explicitly flag mixed-currency revenue-share calculation until CR-103's schema fix lands).
**Currency impact**: Core of this CR.
**Authorization impact**: None.
**Reporting impact**: Corrects the Billing invoice-list summary display.
**Integration impact**: None.
**Migration requirements**: None.
**Backward compatibility**: No data migration; existing invoices unaffected, only the aggregation logic changes.
**Golden E2E scenarios**: GS-14 (must be added to the active regression suite, not left aspirational, per `docs/system-truth/17-E2E-GOLDEN-SCENARIOS.md`); new GS-16 (cross-currency revenue-share) proposed in that same document.
**Reconciliation**: Verify `findAllInvoices` summary totals match `getArAging`'s per-currency totals after the fix.
**Rollback**: Trivial — logic-only change, revertible via standard deploy rollback.
**Dependencies**: None — can proceed immediately on evidence alone (does not require BC-004/BC-005).
**Risk**: Low.
**Recommended implementation wave**: Wave 1 (Data/Financial Integrity) — highest priority within that wave given confirmed, not hypothetical, defects.

---

## CR-103 — Add Currency Fields to SalesTurnover / Parking / Slots Models (CUR-01b)

**Business reason**: Structural inability to represent currency on these models is the root enabler of P0-003 and several documented gaps.
**Root cause**: `CUR-01`.
**Affected domains**: Sales, Parking, Slots, Billing (consumer).
**Affected journeys**: BP-005, BP-007, BP-008.
**Cross-module contracts**: XMOD-010, XMOD-012, XMOD-013, XMOD-014.
**Business invariants**: INV-001, INV-002.
**Data ownership**: No change.
**State impact**: None.
**Financial impact**: Enables correct currency tracking for these three domains for the first time.
**Currency impact**: Core of this CR.
**Authorization impact**: None.
**Reporting impact**: Enables Sales/Parking/Slots figures to be correctly excluded/bucketed in cross-currency-safe reporting once CR-104 lands.
**Integration impact**: ServiceContracts' `transferPaymentToBilling` should be consolidated to call Billing's existing correct implementation as part of this CR (closing XMOD-010's inconsistency) rather than independently patched.
**Migration requirements**: Schema migration adding nullable currency fields (default VND for existing rows, matching current implicit behavior) — additive, non-breaking.
**Backward compatibility**: Existing VND-only records remain valid with an explicit VND value post-migration.
**Golden E2E scenarios**: GS-12, GS-13 extended to cover these three domains explicitly.
**Reconciliation**: N/A (new capability, not a correction of existing data).
**Rollback**: Schema rollback plan required (additive column removal) if issues found.
**Dependencies**: **BC-004 and BC-005 must be confirmed first** — the correct default/business-rule for existing records depends on the answer (e.g., should historical Sales turnover be backfilled as VND, or does the business want to now start tracking a different currency going forward).
**Risk**: Medium (schema migration, cross-team coordination with CUR-01a).
**Recommended implementation wave**: Wave 2 (Data/Financial Integrity, after BC-004/005 resolve).

---

## CR-104 — Canonical Financial Semantics Consolidation (FIN-01)

**Business reason**: 7-10 independently reimplemented "collected revenue"/"occupancy rate" formulas produce inconsistent figures across Dashboard/Reports/Analytics/AI.
**Root cause**: `FIN-01`.
**Affected domains**: Billing (new canonical owner), Dashboard, Reports, Analytics, AI.
**Affected journeys**: BP-011.
**Cross-module contracts**: New XMOD entries to be formalized for each consumer's call into the canonical service.
**Business invariants**: None directly, but establishes the mechanism to prevent future INV-002-class violations in reporting.
**Data ownership**: No change.
**State impact**: None.
**Financial impact**: Corrects displayed figures to be consistent platform-wide.
**Currency impact**: Depends on CUR-01's bucketing principle being in place first (see `09-REMEDIATION-DEPENDENCY-GRAPH.md`).
**Authorization impact**: None directly, though the consolidated service should apply Mall-scoping consistently as part of AUTH-01's fix.
**Reporting impact**: Core of this CR.
**Integration impact**: SAP reconciliation should compare against the new canonical figures once stable.
**Migration requirements**: None (no schema change).
**Backward compatibility**: Displayed figures may change (become correct) — requires business communication that historical dashboard screenshots may not match new figures, this is expected and desired.
**Golden E2E scenarios**: New scenario recommended — "same revenue/occupancy figure, queried via Dashboard/Reports/Analytics/AI for an identical period/mall, matches across all four."
**Reconciliation**: Core deliverable of this CR — add a permanent reconciliation check per `docs/system-truth/18-SYSTEM-INTEGRITY-CHECKS.md`.
**Rollback**: Revertible per-consumer (migrate one consumer at a time, not a big-bang cutover).
**Dependencies**: CUR-01 (at least the bucketing principle) should land first.
**Risk**: Medium — requires careful verification that the canonical formula doesn't itself have an undiscovered bug before 4+ consumers depend on it.
**Recommended implementation wave**: Wave 3 (Reporting), after Wave 1/2 security and financial-integrity work.

---

## CR-105 — Durable Approval-Rejection Event + SAP Retry Automation (EVT-01)

**Business reason**: Reliability asymmetry between approval outcomes; no automated remediation for stuck SAP syncs.
**Root cause**: `EVT-01`.
**Affected domains**: Approvals, Proposals, SAP.
**Affected journeys**: BP-001, BP-010.
**Cross-module contracts**: XMOD-006, XMOD-016.
**Business invariants**: None directly.
**Financial impact**: None directly (SAP sync delay has indirect financial-reporting-timeliness impact).
**Currency impact**: None.
**Authorization impact**: None.
**Reporting impact**: None directly.
**Integration impact**: Core of the SAP half of this CR — adds scheduled retry/reconciliation jobs using the existing `SchedulerLockService` pattern.
**Migration requirements**: None.
**Backward compatibility**: Fully additive.
**Golden E2E scenarios**: GS-15 extended to cover approval-rejection event loss and SAP retry.
**Reconciliation**: SAP reconciliation becomes scheduled rather than manual-only.
**Rollback**: Trivial.
**Dependencies**: None — independent of AUTH-01/CUR-01/FIN-01.
**Risk**: Low.
**Recommended implementation wave**: Wave 2 (Reliability) — can start in parallel with Wave 1.

---

## CR-106 — Consolidate Duplicate Pricing-Calc Logic & Strengthen Core-Chain Write Boundaries (CRM-01)

**Business reason**: Proposal's `calcFinancials()` and Booking's inline conversion calc produce different `totalContractValue` for identical inputs depending on entry point.
**Root cause**: `CRM-01`.
**Affected domains**: CRM, Booking, Proposals, Contracts, Spaces.
**Affected journeys**: BP-001, BP-003.
**Cross-module contracts**: XMOD-001.
**Business invariants**: None new, but reduces risk to unlisted ones.
**Financial impact**: Corrects a real terms-calculation inconsistency.
**Currency impact**: None directly.
**Authorization impact**: None.
**Reporting impact**: None directly.
**Integration impact**: None.
**Migration requirements**: None.
**Backward compatibility**: Existing Proposals/Contracts unaffected; only new conversions use the unified calculation.
**Golden E2E scenarios**: GS-01 extended to assert both entry points produce identical financial terms for identical inputs.
**Reconciliation**: N/A.
**Rollback**: Trivial.
**Dependencies**: None.
**Risk**: Low-medium (touches the highest-value business chain, needs careful testing).
**Recommended implementation wave**: Wave 2 (E2E Process Correctness).

---

## CR-107 — Transaction Boundary Hardening (OPS-01)

**Business reason**: Contract termination can leave a stale Unit status; Slot bookings can be double-booked under concurrency.
**Root cause**: `OPS-01`.
**Affected domains**: Contracts, Slots, Parking, Analytics (batch jobs).
**Affected journeys**: BP-002, BP-008.
**Cross-module contracts**: None new.
**Business invariants**: INV-005, INV-010.
**Financial impact**: None directly (operational correctness).
**Currency impact**: None.
**Authorization impact**: None.
**Reporting impact**: None.
**Integration impact**: None.
**Migration requirements**: Slots fix requires a DB constraint/index addition (`(slotId, timeRange)` exclusion or equivalent) — additive.
**Backward compatibility**: Existing bookings unaffected unless already-overlapping (would need a one-time data check before adding a hard constraint).
**Golden E2E scenarios**: GS-07 (failure-injection variant), new GS-17 (Slot concurrency, per `docs/system-truth/17-E2E-GOLDEN-SCENARIOS.md`).
**Reconciliation**: One-time check for existing overlapping Slot bookings before constraint rollout.
**Rollback**: Standard.
**Dependencies**: None.
**Risk**: Low for Contract-termination fix; medium for Slots (requires pre-migration data check).
**Recommended implementation wave**: Wave 2 (Reliability).

---

## CR-108 — Technical Cleanup (TECH-01)

**Business reason**: Dead code and documentation drift create maintenance risk without user-facing impact.
**Root cause**: Various, low-severity.
**Scope**: Delete `analytics/contract-expiry.scheduler.ts` (dead, duplicate-named landmine); remove `ProposalStatus.UNDER_REVIEW`/`ApprovalStep.StepStatus.SKIPPED` dead enum values (pending final confirmation neither is used by any external integration); correct `docs/ai-governance/01-PLATFORM-SCOPE.md` module count (30→31); remove the nonexistent "Company" concept from `docs/ai-governance/00-START-HERE.md`/`docs/ai-erp-team/05-ERP-MASTER-DATA.md`.
**Dependencies**: None.
**Risk**: Very low.
**Recommended implementation wave**: Wave 4 (Technical Cleanup) — explicitly last per this review's priority ordering, though individual items may be done opportunistically alongside other waves since they carry no risk.
