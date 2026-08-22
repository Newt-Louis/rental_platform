# 09 — Remediation Dependency Graph

Derived from the actual clusters and findings in this review, not the illustrative example in the review prompt.

```text
File security (DOC) ── already resolved; residual gap folded into AUTH-01
                                    │
                                    ▼
AUTH-01 (Mall/Tenant Scope Architecture)
    │   requires: BC-009, BC-013, BC-017, BC-020 confirmed (severity/scope sign-off;
    │             does NOT block starting the architectural fix design, only its rollout scope)
    ▼
Cross-Mall authorization closed for: Spaces(Units), Fitout-controls/Gantt/Daily-report,
FilesController retrieval, Tickets tenant-isolation (narrow sub-fix)
    │
    ▼
Reporting/Analytics/AI Mall-scoping (part of AUTH-01, but sequenced after the
core guard-architecture fix exists, so Reports/Analytics/AI adopt the new
pattern rather than getting a one-off patch)
    │
    ▼
CUR-01 (Currency Ownership & Aggregation) ── independent start; requires
    │   BC-004, BC-005 confirmed before the SalesTurnover/Parking/Slots
    │   schema-level fixes are scoped (does not block fixing the two
    │   already-confirmed live bugs — findAllInvoices summary, revenue-share
    │   formula's missing currency gate — which can proceed on evidence alone)
    ▼
FIN-01 (Canonical Financial Semantics) ── depends on CUR-01's currency-bucketing
    │   principle being fixed first, otherwise the "canonical" formula would
    │   just be a canonical version of the same currency-mixing bug
    ▼
Dashboard / Reports / Analytics / AI consumers migrated to canonical formulas
    │
    ▼
SAP reporting consistency (depends on FIN-01's canonical revenue definition
existing before SAP's own reconciliation logic can be trusted to compare
against a stable number)

EVT-01 (Durable Cross-Module Events) ── independent, no dependency on the
    above; can proceed in parallel with AUTH-01/CUR-01

CRM-01 (Weak Write-Boundary Discipline) ── independent, no dependency on the
    above; the duplicate pricing-calc fix (CONTRA-001) should land before or
    alongside any CUR-01 work that touches Proposal/Contract currency
    calculations, since both touch the same calculation surface

OPS-01 (Transaction Boundary & Batch-Job Resilience) ── independent; the
    Slots double-booking fix (part of OPS-01) has no dependency on anything
    else and can be scheduled purely by severity
```

## Key dependency insights

1. **AUTH-01 is the critical-path item.** It has the most findings clustered under it (9+ instances plus 5 BC items), the highest confirmed severity (2 of 3 P0s), and other clusters' Mall-scoping-adjacent sub-items (Reports/Analytics currency reporting, SAP reporting) implicitly assume Mall-scoping is correct before their own numbers can be trusted as "for the right audience."
2. **CUR-01's two already-confirmed bugs (P0-001, P0-003) do not need to wait for BC-004/BC-005.** They are provably wrong regardless of the business answer — only the *urgency* of fixing them depends on the BC answers, not the *correctness* of the fix itself. This means Wave 0/1 work can begin immediately on these two items without being blocked by business confirmation meetings.
3. **FIN-01 should not start until CUR-01's bucketing principle is at least architecturally agreed**, even if not every currency gap is fixed yet — otherwise the "canonical" revenue formula would need to be redone once currency-bucketing is retrofitted.
4. **EVT-01, CRM-01, and OPS-01 are fully independent of AUTH-01/CUR-01/FIN-01** and of each other — they can be resourced in parallel without sequencing conflicts, purely on severity/effort tradeoffs.
5. **File security (DOC) is not on the critical path** — it is already resolved; only its residual `AUTH-01` sub-item (FilesController Mall-scoping) remains, and that's already captured in AUTH-01's scope, not a separate program.
