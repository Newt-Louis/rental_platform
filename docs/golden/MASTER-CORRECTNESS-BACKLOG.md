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
| CRM unified-deals Mall scope | Tier 1; confirmed `AUTH-01` / `CONTRA-008` | Quarantine from UI wave; require reviewed endpoint fix plus cross-Mall denial tests |
| Customer ownership scope | Tier 1; BC-016 business confirmation required | Do not invent `mallId` or imply Mall isolation in UI |
| Lead estimate currency provenance | Tier 0; BC-001 business confirmation required | Display current documented VND semantics exactly; no schema or FX inference |

This backlog records risks; it is not authorization to change Tier 0/Tier 1 behavior.
