# 12 — Architecture Decisions Required

Per `docs/ai-erp-team/11-DECISION-REGISTER.md`, these Tier 0 decisions must be formalized as ADRs (`docs/change-templates/ADR-TEMPLATE.md`) before or during the implementation waves that depend on them. None have been written yet — this document only identifies that they're needed and what each must decide.

## ADR-101 — Mall-Scoping Enforcement Model (blocks CR-101)

**Decision needed**: Replace the current fail-open, heuristic-based `MallAccessGuard` resolution with a fail-closed, explicitly-declared-per-route model. Options to weigh: (a) a decorator (e.g. `@MallScoped('paramName')` / `@MallExempt()`) that every route must carry, enforced by a CI lint rule that fails the build if a route has neither; (b) a stricter default where the guard denies access unless a recognized resource identifier is found, with an explicit opt-out decorator for genuinely global routes; (c) some hybrid. Must also decide the rollout mechanism (feature-flag per-route vs. big-bang) given the risk of breaking undetected legitimate cross-mall usage.
**Owner**: Multi-Company/Multi-Mall Architect + Security Architect + Chief ERP Architect (Tier 0).
**Gates**: CR-101 implementation.

## ADR-102 — Canonical Revenue/Occupancy Service Ownership (blocks CR-104)

**Decision needed**: Formally designate `BillingService` (new method) as the owner of "collected revenue" and `OccupancyAnalyticsService.getOccupancyV2()` as the owner of "occupancy rate," per the recommendation in `05-CANONICAL-FINANCIAL-SEMANTICS.md`. Must also decide the exact definition to standardize on (this review recommends "actual payments received minus reversed" for revenue, as the most financially correct, but this is a decision for the Financial Data Architect + Reporting Architect roles to formally ratify, not something this review can unilaterally declare).
**Owner**: Financial Data Architect + Reporting Architect.
**Gates**: CR-104 implementation.

## ADR-103 — Currency-Bucketing Principle Enforcement Mechanism (blocks CR-102/103/104 fully landing)

**Decision needed**: How to structurally prevent a future cross-currency SUM defect from being reintroduced — options include a lint rule flagging raw `.reduce()`/`aggregate()` calls on money fields without an accompanying currency filter, a shared utility function that all aggregation must go through, or reliance on code review discipline alone (not recommended, given this defect already slipped through once). Also must decide the default behavior for cross-currency aggregation requests going forward: exclude non-matching currencies (current de facto pattern in the correctly-implemented cases) vs. always return per-currency subtotals (arguably more correct, but a bigger UX change).
**Owner**: Multi-Currency Architect + Financial Data Architect.
**Gates**: Full resolution of `CUR-01` cluster.

## ADR-104 — Approval-Rejection Event Durability (blocks CR-105's Approvals half)

**Decision needed**: Confirm routing `approval.workflow.rejected` through the existing `OutboxService` (this review's recommendation) versus an alternative reliability mechanism, and confirm the recovery/reconciliation behavior for any already-affected stuck Proposals from before the fix (a one-time data audit may be needed to find any that already exist).
**Owner**: Reliability Architect + Workflow Architect.
**Gates**: CR-105 (Approvals half).

## ADR-105 — ServiceContracts↔Billing "Transfer to Billing" Consolidation (blocks CR-103's ServiceContracts sub-scope)

**Decision needed**: Formally deprecate `ServiceContractsService.transferPaymentToBilling()` in favor of routing through `BillingService.createInvoiceFromPending()`'s SERVICE_CONTRACT branch, including the invoice-numbering scheme migration (wall-clock-based → deterministic-by-payment-id) and confirming no external system depends on the old numbering format.
**Owner**: Service Contract Consultant + Financial Data Architect.
**Gates**: CR-103 (ServiceContracts sub-scope).

## ADR-106 — Remove "Company" from Governance Vocabulary (blocks nothing, low urgency, TECH-01)

**Decision needed**: Formal acknowledgment that no `Company` entity exists and the governance framework's platform vocabulary should describe the actual ADMIN/CEO-bypass-role mechanism instead. Low-stakes, but should be a recorded decision (not a silent doc edit) since it changes how future CRs are expected to reason about multi-tenancy scope.
**Owner**: Documentation Lead + Chief ERP Architect.
**Gates**: `docs/ai-governance/00-START-HERE.md` / `docs/ai-erp-team/05-ERP-MASTER-DATA.md` corrections (TECH-01).

## Summary

| ADR | Blocks | Urgency |
|---|---|---|
| ADR-101 | CR-101 (Wave 1) | Highest — critical path |
| ADR-102 | CR-104 (Wave 3) | Medium — not needed until Wave 3 |
| ADR-103 | Full CUR-01 resolution | High — should be decided alongside Wave 0/1 |
| ADR-104 | CR-105 (Wave 2) | Medium |
| ADR-105 | CR-103 (Wave 2) | Medium |
| ADR-106 | TECH-01 (Wave 4) | Low |

None of these ADRs have been written as of this review. **This review's implementation authorization does not extend to writing them** — they require the named Architect roles' actual judgment, not a documentation pass.
