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
