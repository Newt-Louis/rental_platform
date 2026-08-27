# CR-113 — Dashboard V3 Enterprise Intelligence

## Change request

**Change ID:** CR-113  
**Primary domain:** Reporting / Dashboard  
**Severity:** P2, Tier 2 — presentation-only reporting change  
**Business reason:** The accepted Dashboard information architecture still reads as a collection of generic admin cards. Leadership needs a denser, more deliberate enterprise intelligence surface without changing any business result or workflow.

### Current behavior and problems

- The five headline metrics are correct but still have near-equal visual weight and insufficient executive hierarchy.
- Action items contain useful context, but the queue does not yet feel like a first-class ERP worklist.
- Revenue, AR, and occupancy charts use the same container treatment even when their decision value differs.
- The internal `healthScore` composite is correctly demoted in wording, but its formula and disclaimer permanently consume scarce vertical space.
- Repeated borders, rounded panels, and headings create container noise and make the page feel like a generic card dashboard.
- Chart primitives are functional but lack a clear primary/secondary analytical hierarchy.

### Expected behavior

The Dashboard becomes a four-layer enterprise intelligence workspace:

1. compact command header;
2. integrated financial intelligence strip;
3. priority worklist plus portfolio state;
4. primary financial analysis plus secondary AR and occupancy signals.

All existing queries, formulae, role focus logic, Mall scope, routes, refresh behavior, and empty states remain unchanged.

## Impact map

### Affected journeys

- Dashboard executive monitoring and drill-through.
- GS-09 Cross-Mall denial — regression only; current Mall-scoped queries and guards remain unchanged.
- GS-11 VND lifecycle — regression only; exact VND display remains reconciled with source values.
- GS-14 Mixed-currency reporting — regression only; existing VND filtering remains unchanged and no cross-currency sum is introduced.

### Upstream dependencies

| Surface | Existing source | Preserved semantics |
|---|---|---|
| Financial strip and worklist counts | `GET /dashboard` | Role-shaped, Mall-scoped Dashboard V3 payload |
| Revenue trend | `GET /reports/revenue` | Existing 12-month VND invoice totals and paid series |
| AR trend | `GET /billing/collection-kpi` | Existing six-month current/overdue VND balances |
| Occupancy trend | `GET /analytics/occupancy/trend` | Existing six-month occupancy snapshots |
| Navigation actions | Existing frontend routes | Permission-filtered via `canAccessPath` |

### Downstream impact

- Dashboard JSX, Dashboard localization, and Dashboard component tests only.
- No report, export, SAP integration, notification, background job, or downstream business consumer changes.
- No rollout to Billing, Booking, Contracts, Reports, Analytics, or other modules.

### Data ownership, state, transactions, events, documents

- **Data ownership:** read-only; no writes.
- **State machine:** no status or transition changes.
- **Transaction/concurrency:** N/A; no mutation introduced.
- **Event/job:** no event, scheduler, cache contract, or retry behavior changed.
- **Document/export:** no impact.

### Financial and currency impact

- No financial fields, calculations, rounding, aggregation, or currency filters change.
- Exact financial values use the existing canonical currency utility and the explicit `VND` code.
- Chart axes use an explicit shared scale label (`Tỷ VND`, `Triệu VND`, `Nghìn VND`, or `VND`); ticks contain scaled numbers only.
- Chart tooltips show the exact unscaled amount with currency code and never combine a shortened number with a currency unit.
- Dashboard revenue, collection, outstanding, and overdue values will be reconciled against the unchanged API fixtures in tests.

### Mall/company, tenant, authorization

- Existing `selectedMallId` query keys and query parameters are preserved.
- Existing backend `MallAccessService` assertions and accessible-Mall resolution are untouched.
- Existing role focus areas, query enablement, and `canAccessModule` / `canAccessPath` filtering are preserved.
- Tenant experience is unchanged; no new visibility or route is introduced.

### Reporting and API impact

- Presentation and analytical hierarchy change only.
- No API request, response, schema, cache-key, or contract change.
- No business metric is renamed at the API level.

### Backward compatibility and migration

- Fully backward compatible with the current Dashboard V3 payload.
- No schema or data migration.
- Rollback is a frontend-only revert of CR-113 Dashboard files.

### Reconciliation

- Five financial-strip values must equal their current Dashboard payload inputs.
- Action Center counts and overdue amount must equal the same Dashboard payload used before CR-113.
- Revenue, AR, and occupancy chart points must map directly to their existing API arrays.
- Exact VND fixture `3.165.855.000 VND` must remain available in chart tooltip output.

### Open business questions

None. The `healthScore` provenance is confirmed in executable backend code as a role-dependent internal composite (`occupancy × 0.55 + collection × 0.45` for overview roles, or a single source rate for selected roles). It is not documented as an approved business KPI. CR-113 therefore retains it only as a secondary **reference composite indicator**, with methodology available on demand.

## Golden E2E scenarios and gates

- **GS-09:** Existing out-of-Mall denial and role/Mall filtering remain unchanged.
- **GS-11:** VND values remain exact on KPI and tooltip surfaces.
- **GS-14:** No unsupported mixed-currency aggregation is added; VND-only source conventions remain explicit.
- Gate 1: Dashboard Vitest, TypeScript, frontend production build.
- Gate 4/7/8/9: focused UI regression tests for authorized drill-through, exact money output, health-indicator demotion, and source-value reconciliation.
- Gates 2/3/5/6: N/A — no service, integration contract, mutation, failure boundary, or concurrent write is changed.

## Visual direction

### Character

- cool neutral canvas with a controlled graphite command surface;
- one restrained blue intelligence accent, with semantic red/amber/green reserved for meaning;
- tabular numerals, compact labels, crisp separators, and low-radius surfaces;
- no decorative gradients, glass effects, neon, oversized icons, or marketing copy.

### Hierarchy and anatomy

1. **Command header:** page identity, Mall context, role/data cadence, last refresh, explicit refresh control.
2. **Financial intelligence strip:** one continuous surface with five metrics; monthly revenue receives the strongest number hierarchy, while overdue and collection states retain semantic emphasis.
3. **Decision layer:** Action Center occupies roughly two thirds and Portfolio Intelligence one third at desktop widths.
4. **Analysis layer:** revenue/collection is the dominant chart; AR and occupancy are compact secondary signals. An empty primary series collapses to a reduced empty state rather than consuming chart height.

### Component map

- Continue using shared `Button`, `ERPStatusBadge`, semantic ERP tones, design-token colors, React Query, and Recharts.
- Dashboard-local presentational components: financial metric cell, worklist row, portfolio fact row, chart header, exact-value tooltip, compact empty state.
- No new parallel UI component library and no changes to other modules.

### Chart style

- Revenue/collection: primary area plus comparison line, 12-month horizon, explicit financial scale, exact-value tooltip.
- AR: compact current/overdue comparison, six-month horizon, explicit financial scale, exact-value tooltip.
- Occupancy: compact line/area signal, percentage axis and exact percentage tooltip.
- Sparse or empty data receives a quieter footprint; no fake point, extrapolation, or decorative variation is added.

### Token usage

- Use current semantic tokens (`background`, `card`, `foreground`, `muted`, `border`, `primary`, `destructive`) and ERP tone maps.
- Use existing typography and spacing scale; `font-mono`/tabular numerals only where scanning values benefits.
- Dashboard-specific class names may compose existing tokens but do not redefine the platform system.

## Responsive strategy

- **1920×1080:** full four-layer hierarchy; 2/3 + 1/3 decision and analytical layouts.
- **1440×900:** same hierarchy with reduced chart height and compact section headers.
- **1366×768:** command, financial strip, full decision layer, and start of analytics should be visible with ordinary shell chrome; avoid extra explanatory copy.
- **1024×768:** five metrics wrap into a compact 3+2 grid; decision and analytics sections stack without horizontal overflow; all money can wrap without clipping.

## Accessibility

- Maintain semantic headings and buttons, visible keyboard focus, and text labels alongside color.
- Worklist priority includes readable text/badge semantics.
- Reference indicator methodology is keyboard-accessible through a focusable info popover.
- Charts retain text titles, units, legends, and accessible surrounding descriptions; empty states are textual.
- Exact amounts use tabular numerals and may wrap instead of truncating.

## Risks and mitigations

- **Dense money strings:** responsive grid and wrapping prevent clipping; verify at all required widths.
- **Chart readability:** explicit unit line, reduced tick count, and exact tooltip separate overview scanning from transaction precision.
- **Misleading score authority:** keep reference indicator out of prime placement and expose provenance on demand.
- **Route regression:** retain existing route strings and permission filtering; cover overdue action navigation in Vitest.
- **Sparse data:** dynamically reduce empty chart prominence without fabricating information.

## Sign-off

Implementation is constrained to the Dashboard. Human visual sign-off remains the final approval gate.

## Implementation verification — 2026-08-23

- Dashboard and canonical exact-currency tests: **5/5 PASS**.
- TypeScript `tsc --noEmit`: **PASS**.
- Frontend production build: **PASS** (existing bundle-size warning only).
- Docker images `frontend` and `backend`: **PASS**.
- Docker localhost: frontend, backend, PostgreSQL, and Redis all **healthy**; `/dashboard`, backend readiness, and nginx-proxied readiness return HTTP 200.
- `git diff --check`: **PASS**.
- Broader permissions regression test: **1 pre-existing failure** because one module occurs twice in `NAV_GROUPS`; CR-113 does not modify navigation or permissions and did not expand scope to repair it.
- Adversarial source review: no compact money formatter, fake chart data, new route, API call, business formula, backend file, or schema change introduced. Empty revenue data is reduced to a compact state; long exact values are wrap-safe.
- **VISUAL VERIFICATION NOT COMPLETED** — the required in-app Browser runtime reported no available browser, so 1920×1080, 1440×900, 1366×768, and 1024×768 cannot be honestly marked PASS. Human visual sign-off remains required.

## Final visual-polish root-cause note

Human review reported a page-wide horizontal scrollbar. Source tracing found a structural width-containment problem in the Dashboard rather than an intentional scroll surface:

- the Dashboard root expanded beyond its normal content box using responsive negative horizontal margins to counter the global `main > div` padding;
- the five-column financial grid used custom `fr` tracks without explicit `minmax(0, …)` containment;
- several ERP section and Recharts grid wrappers remained auto-min-sized instead of `min-w-0`.

Exact financial strings and responsive SVG content could therefore contribute their min-content width to the `main` element (`overflow-auto`) and create a horizontal scrollbar. The final polish removes the negative-margin expansion and constrains every relevant grid/section/chart track structurally. It does not hide overflow with `overflow-x: hidden`.

### Final polish verification

- Dashboard/currency focused tests: **5/5 PASS**.
- TypeScript: **PASS**.
- Vite production build: **PASS**.
- `git diff --check`: **PASS**.
- Docker frontend rebuild and localhost replacement: **PASS**; Dashboard and proxied readiness return HTTP 200; all four services are healthy.
- Backend/API/schema/migration diff: **none**.
- Known baseline: `permissions.test.ts` remains **5 passed / 1 failed** because of the pre-existing duplicate `NAV_GROUPS` module; intentionally unchanged per scope boundary.
- **VISUAL VERIFICATION NOT COMPLETED** — no Browser runtime was available for rendered viewport inspection.
