# Master Correctness Backlog

Status: ACTIVE

| Item | Severity/authority | Program handling |
|---|---|---|
| Revenue-share currency semantics | Tier 0; business confirmation required | Quarantine; no UI inference |
| Penalty/dunning currency | Separate approved correctness CR required | Out of Golden Billing UI |
| Payment remaining formula mismatch | Backend balance authoritative | Track; do not alter formula in UI |
| Proposal calculation/rent-free/scenario semantics | Business-rule evidence required | Preserve existing behavior |
| Contract termination/amendment/direct-create atomicity | Cross-domain/Tier 0 review | No opportunistic change |
| Slot allocation concurrency | Transaction/concurrency review | No UI workaround |
| Duplicated financial formulas | Platform-level refactor | Audit before consolidation |
| Remaining cross-Mall scope gaps in adjacent modules | Security verification | Fix only with endpoint evidence and reviewed impact map |
| Fitout change-order creation currency | Persisted currency/display is authoritative and fixed; creation still defaults VND | Confirm whether new change orders must inherit Contract currency |
| Whether Fitout checklist/issues are gates | Current backend says not generally authoritative | UI must not imply blocking unless service says so |
| CRM unified-deals Mall scope | RESOLVED in Wave 16 | Controller validates Mall access and service applies existing Lead scope before pagination; focused controller/service coverage added |
| Customer ownership scope | Tier 1; BC-016 business confirmation required | Do not invent `mallId` or imply Mall isolation in UI |
| Lead estimate currency provenance | Tier 0; BC-001 business confirmation required | Display current documented VND semantics exactly; no schema or FX inference |
| Unit merge transition semantics | Tier 1; BC-010 business confirmation required | `MERGED` bypasses the shared transition matrix; preserve behavior until intent is approved |
| Slot pricing currency provenance | Tier 0; no persisted currency | Do not infer VND or combine with Unit/Contract money; requires explicit design |
| Ticket escalation/rating/SLA-policy HTTP authorization | RESOLVED in Wave 15 | Per-ticket routes reuse core Mall/Tenant ownership checks; SLA policy is ADMIN-only; SLA/CSAT aggregates are Mall-scoped and staff-only |
| Ticket scheduled escalation recipient Mall policy | Tier 1; `BC-020-R` | Confirm whether recipient discovery must be Mall-scoped before changing scheduler semantics |
| Work Order status/event atomicity | Tier 1 reliability | Status write and audit-event insert are currently separate; preserve until a reviewed transaction change |
| Patrol abnormal-check → Work Order transaction boundary | Tier 1 cross-module; XMOD-007 | Existing one-way/idempotent automation is preserved; verify atomicity before any correctness change |
| Analytics Compliance export Mall ownership | Tier 1; BC required | Core Analytics reads were fixed in CR-101 Phase 3G, but export list/request/generate/manual-monthly paths still require authoritative ownership, scoped entity lookups and negative cross-Mall tests |
| CEO operational capability contradiction | Tier 0 authorization; business confirmation required | Current Parking, Work Order and Proposal write access conflicts with the documented aggregate/read persona; do not normalize roles from the UI |

This backlog records risks; it is not authorization to change Tier 0/Tier 1 behavior.
