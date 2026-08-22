# System Truth — System Scope Map

## Scope levels (as actually implemented — corrected from the template's assumed hierarchy)

```text
GLOBAL   — not tied to any Mall (User identity, Role enum, base Category taxonomy)
MALL     — scoped to one Mall (flat; NOT a child of any "Company" — no such entity exists)
TENANT   — scoped to one Tenant (leasing customer) within a Mall
```

There is **no COMPANY level**. This corrects the four-level model assumed in `docs/ai-governance/00-START-HERE.md` and `docs/ai-erp-team/05-ERP-MASTER-DATA.md`. The platform has exactly two real scope levels below Global (Mall, Tenant); a "portfolio-wide" view exists only as a *role capability* (ADMIN/CEO bypass all Mall checks) — not as a data-scope entity of its own. See `00-SYSTEM-OVERVIEW.md` and `15-MULTI-MALL-MULTI-COMPANY.md`.

## Entity scope table

| Entity | Scope level | Enforced by | Verified? |
|---|---|---|---|
| Mall | GLOBAL (the scoping unit itself) | N/A | Confirmed |
| Floor, Zone, Unit | MALL | `UnitStatusService` (status writes); **read/list/detail routes in `spaces.controller.ts` are NOT enforced** | Confirmed GAP |
| Lead | MALL (field exists) | Not consistently enforced (`crm.controller.ts` `GET /crm/deals` has no enforcement) | Confirmed GAP |
| Customer | **NONE** (no mallId field) | N/A — `CustomersController` has zero mall filtering | Confirmed — see `BUSINESS_CONFIRMATION_REQUIRED.md` |
| UnitBooking, Proposal, Contract, ApprovalWorkflow/Step | MALL (via Unit/Contract) | Per-endpoint `mallAccess.assertMallAccess`/`extractAndValidateMallAccess` calls — consistently applied in these 4 controllers | Confirmed OK |
| Invoice, Payment, ServiceContract, ParkingCustomerContract, SlotBooking, InventoryItem, WorkOrder, PatrolShift/Check, Ticket, Tenant | MALL (or Tenant via Mall) | Per-endpoint enforcement, consistently applied | Confirmed OK |
| Sales/SalesTurnover | MALL (nominally, via Unit) | **NOT enforced for internal (non-TENANT) roles** — no `mallId` filter param on any endpoint | Confirmed GAP |
| Fitout risks/change-orders (`fitout-controls`), Gantt tasks (mutate/delete), daily-report photos (`:entryId`) | MALL (via FitoutProject) | **NOT enforced** — global `MallAccessGuard`'s path/param heuristics never match these routes | Confirmed GAP |
| Analytics/Reports read endpoints | MALL (optional filter only) | **NOT enforced as a boundary** — omitting `mallId` returns all-mall data; no fallback to the caller's accessible-mall-set (unlike Dashboard, which does this correctly) | Confirmed GAP |
| Parking-Dashboard (external MSSQL parking-gate data) | Keyed by `parkingCode`, not `mallId` | **NOT enforced** — no mall-to-parkingCode mapping check | Confirmed GAP |
| AI chat context (`AiService.buildContext()`) | Implicitly portfolio-wide | **NOT enforced** — unlike Dashboard, no `mallAccess.getAccessibleMallIds()` call | Confirmed GAP |
| Audit Log | GLOBAL read (ADMIN/CEO only, who bypass anyway) | Appropriate — no gap | Confirmed OK |

## Scope escalation risks (consolidated — full detail in `15-MULTI-MALL-MULTI-COMPANY.md`)

Every row marked "Confirmed GAP" above is a place a Mall-scoped, non-bypass role (`MALL_DIRECTOR`, `LEASING_MANAGER`, `LEASING_EXECUTIVE`, `FINANCE`, `LEGAL`, `OPERATION`) can read or, in some cases, write data belonging to a Mall they are not assigned to. Ranked by severity in `ARCHITECTURE_CONTRADICTIONS.md`.

## Root cause common to most gaps

`MallAccessGuard` (global `APP_GUARD`, runs on every request) resolves the resource's Mall only via specific param/query/body field names (`mallId`, `unitId`, `floorId`) or narrow path-substring heuristics (`contract`, `fitout`, `invoices`), and always keys any ID-based resolution off `params.id` specifically. **Any route whose identifying param is named something else (`:projectId`, `:riskId`, `:entryId`, `:changeId`) is invisible to the guard.** `MallAccessService.extractAndValidateMallAccess()` also **fails open**: if no Mall ID can be resolved from any source, the check is silently skipped rather than denied (`mall-access.service.ts:262-264`). Controllers that don't compensate with their own explicit `assertMallAccess` call are therefore unscoped by default, not scoped-by-default. This is a structural, not incidental, gap pattern — see `ANTI_PATTERNS.md`.
