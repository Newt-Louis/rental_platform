# Authorization Audit

Status: ACTIVE CONTINUOUS AUDIT

Authorization is accepted only when Mall/Tenant scope is applied to the data query or mutation. A frontend role check, hidden button, controller decorator, or sibling endpoint is not sufficient evidence.

## Audit dimensions

| Dimension | Required evidence |
|---|---|
| List/read | scoped query plus cross-Mall denial test |
| Mutation | scoped lookup before mutation plus denial test |
| Files/export | record ownership scope before stream/generation |
| Jobs/events | explicit tenant/Mall context and idempotent handling |
| UI | action visibility consistent with backend authority; never treated as security |

Known historical gaps were remediated in CR101 phases, but adjacent domains must be verified against current code before being marked closed. Wave 1 Fitout is presentation-only and does not modify authorization.

## Wave 2 evidence — CRM / Customer / Tenant

| Surface | Current evidence | Decision |
|---|---|---|
| CRM Lead list/detail/mutations | Controller resolves accessible Mall IDs and service applies `leadScope`; entity mutations call `assertLeadAccess` | VERIFIED for current paths; unchanged |
| CRM unified deals (`GET /crm/deals`) | Controller does not pass `CurrentUser`/accessible Mall IDs; service only applies an optional caller-supplied `mallId` post-filter | CONFIRMED GAP (`CONTRA-008` / `AUTH-01`); quarantined from presentation Wave 2 |
| CRM Customer | `Customer` has no `mallId`; controller and service are global within CRM roles | `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` (`BC-016`); no UI fiction or schema guess |
| Tenant master | List derives accessible Mall IDs; detail and every mutation validate Tenant ownership through `MallAccessService` | VERIFIED for current controller paths; unchanged |
| Tenant Portal core data | Billing/Contract/Ticket/Fitout APIs remain responsible for server-forced Tenant scope; frontend filtering is not treated as authorization | Checked-but-not-changed; GS-10 remains a platform gate |

Wave 2 makes no backend or authorization changes. The two open CRM boundaries require reviewed Tier 1 decisions and negative cross-Mall tests before remediation.

## Wave 3 evidence — Unit / Space Inventory

| Surface | Current evidence | Decision |
|---|---|---|
| Unit list/detail/create/update/delete | Controller resolves explicit Mall access and service mutations use the scoped Unit lookup introduced by CR-101 | VERIFIED by focused authorization/controller suites; unchanged |
| Floor/Zone and map data | Mall ownership is checked before current map/floor mutations and reads | VERIFIED for current Space controller paths; unchanged |
| Merge/split | Current authorization and hierarchy/integrity suites pass; merge still writes `MERGED` outside the shared transition matrix | Authorization verified; lifecycle semantics remain BC-010 and were not changed |
| UI roles | Action visibility remains aligned with existing roles | Presentation aid only; backend remains authoritative |

Wave 3 makes no backend, authorization or data-scope changes. Focused Space authorization/integrity verification passed 8 suites / 77 tests.

## Wave 4 evidence — Ticket / Maintenance / Work Order / Patrol

| Surface | Current evidence | Decision |
|---|---|---|
| Ticket core list/detail/mutations | Current staff paths apply Mall access and Tenant paths derive Tenant identity server-side | VERIFIED for core paths; unchanged |
| Ticket escalation, rating and SLA-policy secondary paths | Current endpoint ownership is incomplete/inconsistent with the core Tenant boundary | CONFIRMED GAP (`CONTRA-003` / `INV-006` / `BC-020`); quarantined from presentation Wave 4 |
| Work Order | Controller role-scope suite verifies current allowed roles; service scopes operational records by Mall | VERIFIED for current focused paths; unchanged |
| Patrol | Current Shift/Route/Schedule paths validate Mall access; abnormal Check automation remains backend-owned | CHECKED-BUT-NOT-CHANGED; no UI role check is treated as security |

Wave 4 makes no backend, authorization or data-scope changes. Focused Ticket/Maintenance/Work Order verification passed 2 suites / 18 tests; the full backend gate passed 91 suites / 598 tests.

## Wave 5 evidence — Reports / Analytics

| Surface | Current evidence | Decision |
|---|---|---|
| Reports core and CSV export | CR-101 Phase 3G controller resolves explicit or accessible Mall sets through `MallAccessService`; service tests prove scopes reach Prisma/Billing queries | VERIFIED for focused paths; earlier System Truth characterization is stale |
| Analytics occupancy/vacancy/renewal/multi-Mall | Controller resolves accessible Mall scope; multi-Mall comparison receives that scope rather than returning global data to ordinary Mall roles | VERIFIED by focused controller/service suites; unchanged |
| Analytics Compliance exports | List/request/generate/manual-monthly endpoints do not validate requested/entity Mall ownership and inherit the broad Analytics role set | CONFIRMED REMAINING GAP; Tier 1 quarantine pending ownership decision and negative tests |
| Analytics retention policy | Per-Mall reads/writes validate Mall access; config writes exclude CEO | VERIFIED for current controller path; unchanged |

Wave 5 changes presentation only. Focused Report/Analytics verification passed 6 suites / 29 tests; this evidence corrects the stale broad-gap wording without claiming the Compliance sub-surface is secure.
