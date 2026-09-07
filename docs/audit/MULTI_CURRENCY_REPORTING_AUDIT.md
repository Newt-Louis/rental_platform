# MULTI-CURRENCY REPORTING AUDIT

**Read-only audit. No code, schema, migration, seed or production data changed.**

Scope: Dashboard, Reports, Analytics, CRM/Deal Pipeline, Cross-Mall, AI
assistant, and the backend services feeding them. Date: 2026-09-06.

---

## 1. Executive Summary

The transactional chain (Unit → Booking → Proposal → Contract → Schedule →
Invoice → Payment → SAP) is currency-correct after the earlier remediations.
**Management reporting is not, but it fails in a more subtle way than expected.**

The team clearly anticipated the problem: roughly a dozen reporting queries carry
an explicit `currencyCode: 'VND'` filter with a comment saying "never sum
different currencies". That convention is arithmetically **safe** — those numbers
are not corrupted. But it produces a second, quieter defect: **USD and MMK
revenue is silently excluded from management reporting entirely.** A director
reading "monthly revenue" is reading *VND-only* revenue presented as *the*
revenue, with nothing on screen saying so.

Alongside that, three classes of genuine defect remain:

1. **One confirmed cross-currency SUM** — the AI assistant's revenue answer adds
   VND + USD + MMK turnover into one number and labels it "VNĐ". Reproducible on
   today's data.
2. **Three management APIs return monetary values with no currency dimension at
   all** — runtime-verified: `/api/dashboard/cross-mall`,
   `/api/crm/pipeline/stats`, `/api/analytics/occupancy`.
3. **One unsafe AVERAGE** — `avgRentPerSqm` averages `Unit.baseRentPerSqm`
   across units without grouping by currency. Latent on today's data (all 30
   units are VND) but reachable through the ordinary Spaces UI.

**Nothing found here regresses any previously closed issue.**

Bottom line: consolidated monetary KPIs are trustworthy **only** in the sense
that they are VND-only. They are not complete, they do not say they are
VND-only, and three of them are structurally incapable of expressing anything
else.

---

## 2. Screens Audited

| Surface | Route | Component | Backend |
|---|---|---|---|
| Dashboard | `/dashboard` | `DashboardPage.tsx` | `dashboard.service.ts` |
| Cross-Mall CEO | `/cross-mall` | `pages/cross-mall/` | `dashboard.service.ts#crossMall` |
| Reports | `/reports` | `ReportsPage.tsx` | `reports.service.ts` |
| Analytics | `/analytics` | `AnalyticsDashboard.tsx` | `occupancy-analytics.service.ts`, `compliance.service.ts` |
| CRM overview | `/crm` | `CrmOverviewPage.tsx`, `CrmPage.tsx` | `crm.service.ts` |
| Deal pipeline stats | `/pipeline-stats` | `SalesPipelineStatsPage.tsx` | `crm.service.ts#pipelineStats` |
| Deals | `/deals` | `pages/deals/` | `crm.service.ts` |
| Billing / AR | `/billing` | `BillingPage.tsx` | `billing.service.ts` |
| Sales / turnover | `/sales` | `SalesPage.tsx` | `sales.service.ts` |
| Service contracts | `/service-contracts` | — | `service-contracts.service.ts` |
| AI assistant | `/ai` | `AiPage.tsx` | `ai.service.ts#buildContext` |

Out of scope per brief: parking internals, inventory, SAP-002/003 remediation.
Parking and slot data enter scope **only** where they feed a core dashboard KPI —
which they do, via `SlotBooking` (see §7).

---

## 3. Monetary KPI Inventory

| Screen | KPI | API | Source field | Currency source | Aggregation | Response ccy | UI formatter | Class |
|---|---|---|---|---|---|---|---|---|
| Dashboard | monthlyRevenue | `/dashboard` | `Invoice.totalAmount` | query filters `currencyCode='VND'` | SUM | ✗ | `formatMoneyWithCode(..,'VND')` | SINGLE_CURRENCY_SAFE + **incomplete** |
| Dashboard | collectedRevenue | `/dashboard` | `Payment.amount` via invoice | VND-scoped | SUM | ✗ | hardcoded VND | SINGLE_CURRENCY_SAFE + **incomplete** |
| Dashboard | overdueAmount | `/dashboard` | `Invoice.totalAmount − payments` | VND-scoped | SUM | ✗ | hardcoded VND | SINGLE_CURRENCY_SAFE + **incomplete** |
| Dashboard | SHORT.monthlyRevenue | `/dashboard` | `SlotBooking.totalAmount` | **none — model has no currency** | SUM | ✗ | hardcoded VND | **MODEL_WITHOUT_CURRENCY** |
| Cross-Mall | monthlyRevenue / collectedRevenue / revenue | `/dashboard/cross-mall` | `Invoice.totalAmount` | VND-scoped | SUM per mall | **✗ (runtime-verified)** | hardcoded VND | **API_CURRENCY_LOSS** + incomplete |
| Reports | proposal value by status | `/reports/*` | `Proposal.totalContractValue` | `groupBy(status, rentCurrency)` | SUM per currency | **✓ `valueByCurrency`** | `formatMoneyAmount(n, r.currencyCode)` | **MULTI_CURRENCY_SAFE** |
| Reports | revenue by period | `/reports/revenue` | `Invoice.totalAmount` | VND-scoped | SUM | ✗ | `formatMoneyAmount(n,'VND')` | SINGLE_CURRENCY_SAFE + **incomplete** |
| Reports | totalBilled / totalCollected / byType | `/reports/revenue-receivables` | `Invoice.totalAmount`, `Payment.amount` | VND-scoped | SUM | ✗ | — | SINGLE_CURRENCY_SAFE + **incomplete** |
| Analytics | totalMonthlyBillingRevenue | `/analytics/occupancy` | `Invoice.subtotal` | VND-scoped | SUM | **✗** | `formatMoneyAmount(..,'VND')` | **API_CURRENCY_LOSS** + incomplete |
| Analytics | **avgRentPerSqm** | `/analytics/occupancy` | `Unit.baseRentPerSqm` | **none applied — `Unit.currencyCode` exists but is ignored** | **AVG** | **✗** | hardcoded VND | **UNSAFE_CROSS_CURRENCY_AGGREGATION** |
| Analytics | revenuePerSqm | `/analytics/occupancy` | derived from VND-scoped revenue | VND-scoped | ratio | ✗ | hardcoded VND | SINGLE_CURRENCY_SAFE + incomplete |
| Analytics | estimatedLoss / totalEstimatedLoss | `/analytics/*` | `areaNLA × 500000 × days/30` | **hardcoded magic constant** | SUM | ✗ | — | **HARDCODED_VND (rate constant)** |
| CRM | totalPipelineValue | `/crm/stats`, `/crm/pipeline/stats` | `Lead.estimatedValue` ∥ `expectedRent × expectedArea` | **none — model has no currency** | SUM | **✗** | `formatMoney(..,'VND')` | **MODEL_WITHOUT_CURRENCY** + API_CURRENCY_LOSS |
| CRM | proposalValueByStatus | `/crm/stats` | `Proposal.totalContractValue` | VND-scoped groupBy | SUM | ✗ | hardcoded VND | SINGLE_CURRENCY_SAFE + incomplete |
| CRM | lead expectedRent (detail) | `/crm/leads/:id` | `Lead.expectedRent` | none | none | ✗ | `formatMoney(..,'VND')` | MODEL_WITHOUT_CURRENCY |
| Deals | proposal value | `/proposals` | `Proposal.totalContractValue` | `rentCurrency` on the row | none | ✓ | `formatMoney(.., p.rentCurrency)` | **MULTI_CURRENCY_SAFE** |
| Billing AR | receivables by currency | `/billing/receivables` | `Invoice.totalAmount` | `byCurrency[...]` buckets | SUM per currency | ✓ | per-currency | **MULTI_CURRENCY_SAFE** |
| Service contracts | value by currency | `/service-contracts/*` | `ServiceContract.totalValue` | `groupBy(['currency'])` | SUM per currency | ✓ | per-currency | **MULTI_CURRENCY_SAFE** |
| Sales | turnover figures | `/sales` | `SalesTurnover.grossSales` | `currencyCode` per row (CUR-001) | per row | ✓ | `fmt(n, t.currencyCode)` | **MULTI_CURRENCY_SAFE** |
| AI assistant | monthly revenue answer | `/ai/chat` | `SalesTurnover.grossSales` | **none applied** | **SUM across VND+USD+MMK** | n/a (prose) | prose `"… VNĐ"` | **UNSAFE_CROSS_CURRENCY_AGGREGATION + HARDCODED_VND** |
| AI assistant | overdue / issued AR | `/ai/chat` | `Invoice.totalAmount` | VND-scoped | SUM | n/a | prose VNĐ | SINGLE_CURRENCY_SAFE + incomplete |
| All | occupancy %, unit/tenant/contract/ticket counts, area m², SLA % | various | — | n/a | SUM/AVG | n/a | — | **NON_MONETARY (safe)** |

---

## 4. Hardcoded Currency Findings

14 reporting call sites pass a literal `'VND'` to a formatter:

| Location | Call | Backing data |
|---|---|---|
| `DashboardPage.tsx:314` | `formatMoneyWithCode(d?.overdueAmount, 'VND')` | VND-scoped → **label correct** |
| `DashboardPage.tsx:393` | `monthlyRevenue` | VND-scoped → label correct |
| `DashboardPage.tsx:394` | `collectedRevenue` | VND-scoped → label correct |
| `DashboardPage.tsx:395` | `uncollected` | VND-scoped → label correct |
| `DashboardPage.tsx:398` | `overdueAmount` | VND-scoped → label correct |
| `DashboardPage.tsx:488` | chart `value` | VND-scoped → label correct |
| `DashboardPage.tsx:512` | chart `value` | VND-scoped → label correct |
| `ReportsPage.tsx:250` | `formatMoneyAmount(n, 'VND')` | VND-scoped → label correct |
| `AnalyticsDashboard.tsx:349` | `m.monthlyRevenue` | VND-scoped → label correct |
| `AnalyticsDashboard.tsx:350` | `m.revenuePerSqm` | VND-scoped → label correct |
| `CrmOverviewPage.tsx:28` | `formatMoney(value, 'VND')` | **`Lead` has no currency** → label asserts a fact the data cannot support |
| `CrmPage.tsx:720` | `displayLead.expectedRent` | same |
| `CrmPage.tsx:1607` | `totalValue` (pipeline) | same |
| `SalesPipelineStatsPage.tsx:29` | `formatMoney(n, 'VND')` | same |

**Classification matters here.** The first ten are `SAFE_FORMATTING` in the
narrow sense — the number really is VND because the query said so. They become a
problem only when the underlying query is widened. The last four are
`HARDCODED_CURRENCY` over a source that has no currency at all.

`vi-VN` as a *locale* is used correctly throughout — `formatMoney` passes
`style:'currency', currency: meta.code`, so the locale only controls digit
grouping. **No defect is claimed for locale usage.**

### FMT-CUR — the shared formatter silently defaults

`apps/frontend/src/lib/currency.ts:26,43,56` — all three exported formatters:

```ts
export function formatMoney(amount, currencyCode: CurrencyCode = 'VND', locale = 'vi-VN') {
  const meta = CURRENCIES[currencyCode] ?? CURRENCIES.VND;
```

Two layers of silent VND: a default parameter **and** a `?? CURRENCIES.VND`
fallback. A caller that passes `undefined` — which is exactly what happens when
an API drops the currency — renders VND with no warning. This is the mechanism
that turns every API_CURRENCY_LOSS into a confident wrong label.

---

## 5. Backend Aggregation Findings

### CONFIRMED unsafe

**AGG-1 · `ai.service.ts:229-234`**
```ts
this.prisma.salesTurnover.aggregate({ where: { period, ...turnoverMallFilter },
  _sum: { grossSales: true, netSales: true } })
...
parts.push(`Doanh thu tháng ${period}: ${currTotal.toLocaleString('vi-VN')} VNĐ`)
```
No currency filter, no grouping. `SalesTurnover.currencyCode` exists since
CUR-001 and today's data is genuinely mixed. Also computes a **growth
percentage** from two such totals, compounding the error.

**AGG-2 · `occupancy-analytics.service.ts:243,257`**
```ts
g.rentSum += unit.baseRentPerSqm ?? 0;        // no currency grouping
avgRentPerSqm: Math.round(data.rentSum / data.occupiedCount)
```
`Unit.currencyCode` exists and is settable from the Spaces UI. Averaging
`25 USD/m²` with `600,000 VND/m²` yields a meaningless number.

**AGG-3 · `crm.service.ts:621-623` and `:669-671`**
```ts
.reduce((sum, l) => sum + (l.estimatedValue ?? ((l.expectedRent ?? 0) * (l.expectedArea ?? 0))), 0)
```
`Lead` has no currency column, so this is a sum of unit-less numbers.

**AGG-4 · `dashboard.service.ts:283,348-349,472`**
`summarizeShortBookingPipeline(slotBookings).revenue` from
`SlotBooking.totalAmount` — no currency column — surfaced as
`SHORT.monthlyRevenue` and `SHORT.collectedRevenue`.

**AGG-5 · `occupancy-analytics.service.ts:447`**
```ts
estimatedLoss: (u.areaNLA ?? 0) * 500000 * (daysVacant / 30)
```
`500000` is an undeclared VND rate baked into an analytics figure. Summed at
`:452` into `totalEstimatedLoss`.

### SAFE by VND-scoping (arithmetically correct, reporting incomplete)

`dashboard.service.ts:203,217,383` · `reports.service.ts:152,230` ·
`occupancy-analytics.service.ts:368` · `compliance.service.ts:233` ·
`ai.service.ts:209,214,215` · `billing.service.ts:385` (`vndOnly`).

Each carries an explanatory comment. The arithmetic is sound; the omission is
undisclosed to the reader of the screen.

### SAFE and complete — positive findings

- `reports.service.ts:101-116` — `groupBy(['status','rentCurrency'])` with a
  `valueByCurrency` map, counts re-aggregated separately because counts are
  currency-agnostic. **This is the pattern the rest of reporting should follow.**
- `service-contracts.service.ts:277` — `groupBy(['currency'])`.
- `billing.service.ts:850-869` — per-currency AR buckets, covered by tests
  asserting currencies are never summed together.
- Per-invoice payment sums (`billing.service.ts:86,1303,1331`,
  `collection-kpi.service.ts:36,92`, `ar-dunning.service.ts:71`,
  `penalty-interest.service.ts:40`) are single-currency by construction —
  `Payment.currencyCode` must equal `Invoice.currencyCode`, enforced server-side.

### Unverified

`renewal-risk.service.ts:72` — averages `netSales` over three periods. Appears
scoped to one tenant/contract (therefore one currency) but the scoping was not
traced end to end. **UNVERIFIED**, not counted as a defect.

---

## 6. API Currency-Loss Findings (runtime-verified)

Every monetary key was enumerated from live responses and compared against any
currency key:

| Endpoint | Monetary keys returned | Currency keys |
|---|---|---|
| `GET /api/dashboard/cross-mall` | `monthlyRevenue`, `collectedRevenue`, `revenue` | **none** |
| `GET /api/crm/pipeline/stats` | `totalPipelineValue`, `valueByStatus`, `proposalValueByStatus` | **none** |
| `GET /api/analytics/occupancy` | `totalMonthlyBillingRevenue`, `avgRentPerSqm` | **none** |

The frontend cannot render these correctly even in principle; combined with the
formatter's silent VND default (§4), the result is a confident VND label on a
value whose currency the API never stated.

---

## 7. Currency-less Model Reachability

Per §7 of the brief, each CUR-002 candidate was traced to a real screen before
being scored.

| Model.field | Write path | Read path | Reachable screen | Multi-currency impact | Verdict |
|---|---|---|---|---|---|
| `Lead.expectedRent`, `Lead.estimatedValue` | CRM lead create/edit | `crm.service.ts:621,669` | **CRM overview, Deal Pipeline stats** | All leads share one implicit unit today, so the sum is internally consistent — but the model cannot express a USD lead at all | **REACHABLE** |
| `Customer.budgetMin/Max` | CRM customer form | not aggregated on any dashboard | detail view only | none | reachable, no aggregation → low |
| `SlotBooking.totalAmount`, `UnitSlot.price*` | slot booking flow | `dashboard.service.ts:283` | **Dashboard SHORT lease-term card** | short-term revenue presented beside VND long-term revenue | **REACHABLE** |
| `OccupancySnapshot.revenuePerSqm` | snapshot job | `occupancy-analytics.service.ts:327` | Analytics | passthrough of an already VND-scoped figure | reachable, low |
| `SapReconciliationRecord.ourAmount/sapAmount` | SAP reconciliation | SAP page only | not a management KPI | out of reporting scope | tracked as SAP-004 |

---

## 8. Average / Ranking Findings

**Averages**
- `avgRentPerSqm` (`occupancy-analytics.service.ts:257`) — **UNSAFE**, see AGG-2.
- `avgDaysVacant` (`:453`) — non-monetary, safe.
- `renewal-risk.service.ts:72` — UNVERIFIED.
- No `average invoice`, `average deal value` or `average tenant revenue` KPI
  exists. Nothing to audit.

**Rankings**
- `occupancy-analytics.service.ts:307` — `.sort((a,b) => b.total - a.total)`
  where `total` is a **count**, not money. Safe.
- `:464` — sorted by `daysVacant`. Safe.
- `SalesPage` tenant ranking — sorts by `grossSales`, and turnover now carries
  its own currency. Cross-currency ranking is **possible** here (VND vs USD rows
  in one list), but the page renders each row with its own currency so the
  numbers are at least labelled correctly. Classified **COMPARE-CUR, low** —
  the ordering is meaningless across currencies but nothing is mislabelled.
- No "top tenants by revenue" / "top malls by revenue" ranking exists as a
  monetary sort. Cross-Mall lists malls in fixed order.

---

## 9. Cross-Mall Findings

`GET /api/dashboard/cross-mall` is the highest-risk *executive* surface.

- Revenue per mall is VND-scoped in the query, so no cross-currency sum occurs.
- But the response carries **no currency dimension at all**, and the UI labels
  everything VND.
- Consequence: if any mall's contracts are USD or MMK, that mall's revenue shows
  as **0 or understated** with no indication. On today's data every mall total
  is `0` because no VND invoice exists for the current period — which is itself
  indistinguishable from "no revenue".

No consolidated VND total is fabricated anywhere — the code does not attempt FX.
That restraint is correct and should be preserved.

---

## 10. Chart Findings

| Chart | Y source | Currency dimension | Verdict |
|---|---|---|---|
| Dashboard revenue chart (`DashboardPage.tsx:488,512`) | VND-scoped invoice totals | none in data | single implicit currency — safe series, incomplete data |
| Reports revenue-by-period | VND-scoped | none | same |
| Analytics mall comparison | VND-scoped revenue + **avgRentPerSqm** | none | the `avgRentPerSqm` series inherits AGG-2 |
| CRM pipeline funnel | `totalPipelineValue` | none | inherits AGG-3 |
| Occupancy / SLA charts | percentages, counts, m² | n/a | **non-monetary, safe** |

No chart mixes two *different* currencies inside one numeric series today,
because every monetary series is VND-scoped upstream. The risk is inherited from
the aggregates, not introduced by the charts.

---

## 11. Concrete Runtime Examples

**Source data, live DB (period 2026-03):**
```
SalesTurnover   VND  8 rows  2,287,113,472.00
                USD  1 row           5,488.01
                MMK  1 row      24,995,784.55
Unit.baseRentPerSqm  VND 30 rows  avg 763,000.00   (no non-VND unit today)
Lead.expectedRent    NO CURRENCY COLUMN  20 rows  15,800,000.00
```

**Example A — AGG-1, confirmed financial-semantic defect**
```
DB:   VND 2,287,113,472 + USD 5,488.01 + MMK 24,995,784.55
AI:   _sum.grossSales  →  2,312,114,744.56
UI:   "Doanh thu tháng 2026-03: 2.312.114.744 VNĐ"
```
25 million VND of the total is actually 24,995,784 **MMK**, and 5,488 of it is
**USD**. → **AGG-CUR CONFIRMED.**

**Example B — API_CURRENCY_LOSS, runtime-verified**
```
GET /api/dashboard/cross-mall
  monetary keys: ["monthlyRevenue","collectedRevenue","revenue"]
  currency keys: []
UI: formatMoneyWithCode(value, 'VND')
```
→ **API-CUR CONFIRMED** (three endpoints).

**Example C — MODEL-CUR**
```
Lead.expectedRent = 15,800,000 total across 20 leads
Schema: no currency column on Lead
UI: formatMoney(totalValue, 'VND')
```
→ **MODEL-CUR CONFIRMED**, reachable on the CRM overview.

**Example D — latent UNSAFE_AVG**
```
avgRentPerSqm = Σ(Unit.baseRentPerSqm) / count(OCCUPIED)
Unit.currencyCode exists and is editable from Spaces.
Today: all 30 units are VND, so the current number is correct.
```
→ **UNSAFE_AVG, reachable but not currently exhibited.**

---

## 12. Reporting Invariants (proposed — not yet enforced)

| ID | Invariant | Current state |
|---|---|---|
| RPT-CUR-01 | Every monetary KPI exposed by Dashboard/Reports/Analytics carries explicit currency context | **VIOLATED** — 3 APIs, 14 UI sites |
| RPT-CUR-02 | Amounts in different currencies are never SUM/AVG together without an approved FX policy | **VIOLATED** — AGG-1, AGG-2 |
| RPT-CUR-03 | Management APIs preserve the currency dimension through grouping and aggregation | **VIOLATED** — §6 |
| RPT-CUR-04 | Frontend presentation uses the currency supplied by the data source; never hardcodes VND for multi-currency data | **VIOLATED** — 4 of 14 sites; 10 are currently benign |
| RPT-CUR-05 | Monetary ranking across currencies requires explicit FX; without it results stay separated | **PARTIAL** — SalesPage ranking |
| RPT-CUR-06 | A missing currency is never silently interpreted as VND | **VIOLATED** — `currency.ts:26,43,56` |
| RPT-CUR-07 | A monetary chart series never mixes incompatible currencies | **HOLDS today** (by VND-scoping), inherited risk |
| **RPT-CUR-08** *(proposed addition)* | A VND-scoped KPI must disclose that it is VND-scoped | **VIOLATED everywhere** — the systemic issue this audit found |

---

## 13. Confirmed Issues

| ID | Title | Class | Severity | Evidence |
|---|---|---|---|---|
| **RPT-CUR-001** | AI assistant sums VND+USD+MMK turnover and labels it VNĐ | AGG-CUR + UI-HC | **P1** | `ai.service.ts:229-234`; Example A |
| **RPT-CUR-002** | `avgRentPerSqm` averages `Unit.baseRentPerSqm` across currencies | AGG-CUR (AVG) | **P1** | `occupancy-analytics.service.ts:243,257`; reachable via Spaces |
| **RPT-CUR-003** | Three management APIs return money with no currency dimension | API-CUR | **P1** | runtime §6 |
| **RPT-CUR-004** | VND-scoped KPIs are presented as total revenue with no disclosure | reporting completeness | **P1** | §5, §9 — USD/MMK revenue invisible to management |
| **RPT-CUR-005** | `Lead.expectedRent` / `estimatedValue` have no currency; summed into pipeline value | MODEL-CUR | **P2** | `crm.service.ts:621,669`; Example C |
| **RPT-CUR-006** | `SlotBooking.totalAmount` has no currency; feeds Dashboard SHORT revenue | MODEL-CUR | **P2** | `dashboard.service.ts:283,348` |
| **RPT-CUR-007** | Shared formatters silently default a missing currency to VND | FMT-CUR | **P2** | `currency.ts:26,43,56` |
| **RPT-CUR-008** | `estimatedLoss` uses a hardcoded `500000` VND/m²/month rate | HARDCODED_VND | **P3** | `occupancy-analytics.service.ts:447` |
| **RPT-CUR-009** | Sales turnover ranking orders rows across currencies | COMPARE-CUR | **P3** | `SalesPage.tsx` — labels correct, ordering meaningless |

RPT-CUR-004 is rated P1 deliberately. It involves no arithmetic error, but it is
the finding most likely to mislead a decision-maker: every revenue KPI on every
executive screen silently excludes non-VND business while presenting itself as
complete.

---

## 14. Unverified Risks

- `renewal-risk.service.ts:72` — three-period `netSales` average; scoping to a
  single contract not traced end to end.
- `compliance.service.ts:235` — `_sum: { subtotal: true }`; the VND filter at
  `:233` was confirmed, but the full consumer chain was not traced to a screen.
- `/api/reports/revenue` returned no monetary keys for 2026 in this dataset, so
  its response shape could not be verified at runtime; the static reading
  (VND-scoped, no currency in response) is unconfirmed.
- Whether any production mall actually operates in USD/MMK. The whole severity
  profile of RPT-CUR-004 depends on this and **cannot be answered from the dev
  dataset**.

---

## 15. Recommended Remediation Order

Ordered by financial-meaning risk, not by effort.

1. **RPT-CUR-001** — stop the one confirmed cross-currency SUM. Smallest change,
   largest correctness gain: group the turnover aggregate by `currencyCode` and
   render one line per currency.
2. **RPT-CUR-003** — add the currency dimension to the three management API
   responses. This is the prerequisite for fixing the UI honestly; without it
   the frontend has nothing to render.
3. **RPT-CUR-002** — group `avgRentPerSqm` by `Unit.currencyCode`, or suppress a
   combined average. Do this before anyone sets a unit to USD in production.
4. **RPT-CUR-004** — decide the product answer first: either (a) label the KPIs
   "VND only", or (b) return per-currency buckets everywhere, following the
   `reports.service.ts` `valueByCurrency` pattern that already exists. **This is
   a business decision, not a code decision** — do not implement either until
   it is made.
5. **RPT-CUR-007** — remove the silent VND default from the formatters. Do this
   *after* 2 and 3, otherwise every currently-benign call site starts rendering
   "—" or throwing.
6. **RPT-CUR-005 / 006** — add currency to `Lead` and `SlotBooking`. Schema
   change; needs the same nullable-no-default treatment used for
   `SalesTurnover` in CUR-001, plus a reconciliation script.
7. **RPT-CUR-008 / 009** — presentation-level cleanups.

**Do not implement FX at any step.** Every recommendation above preserves the
currency dimension rather than collapsing it.

Two things must be decided by the business before step 4:
- Do any real malls operate in USD or MMK today?
- For an executive "total revenue" across currencies, is the answer per-currency
  lines, a single reporting currency with an approved FX source, or a filter
  that forces one currency at a time?

---

## 16. Remediation Wave 1 — status (2026-09-06)

Scope of the wave: the **Cross-Mall CEO screen and the management API currency
contract**. Everything else in this audit was explicitly out of scope and is
unchanged.

Explicit fences honoured: no FX implemented anywhere, the AI mixed-currency
aggregate was not touched, `Lead` and `SlotBooking` schemas were not modified,
and the shared frontend formatters were not globally changed.

### Fixed

| ID | What changed | Proof |
|---|---|---|
| **RPT-CUR-003** | `/api/dashboard/cross-mall` now carries `revenueByCurrency` on every level a consumer reads money from (per-mall, `totals`, `byLeaseTerm.LONG`), plus `revenueScalarCurrency` declaring the legacy scalars' scope. `/api/analytics/occupancy` gains `billingRevenueByCurrency` + `billingRevenueScalarCurrency`. `/api/crm/pipeline/stats` gains `proposalValueCurrency` and `pipelineValueCurrencyUnknown`. | `dashboard.cross-mall-currency.spec.ts` T7/T8; `occupancy-analytics.currency.spec.ts`; runtime §16.1 |
| **RPT-CUR-004** *(cross-mall only)* | The `currencyCode: 'VND'` filter is gone from the cross-mall invoice query, so USD/MMK revenue is no longer invisible. The CEO screen no longer shows a single "Doanh thu tháng tổng" figure; it renders one labelled line per currency and states that no FX conversion is applied. | `CrossMallDashboard.currency.test.tsx`; runtime §16.1 |
| **RPT-CUR-002** *(the SUM half)* | `totalMonthlyBillingRevenue` in `/api/analytics/occupancy` was a genuine cross-currency SUM of `(baseRentPerSqm + camPerSqm) × areaNLA`. It is now grouped by `Unit.currencyCode`, which is NOT NULL — no schema change was needed. | `occupancy-analytics.currency.spec.ts` |

### Deliberately deferred, now disclosed rather than silent

| ID | Why not fixed in this wave | What was added instead |
|---|---|---|
| **RPT-CUR-002** *(the AVG half)* | Splitting `avgRentPerSqm` per currency changes what the field **means** — one figure becomes a set. That is a reporting-policy decision the business has not made, and the wave brief fenced it off. | `avgRentCurrencies` and `avgRentCurrencyMixed` per group. The value is unchanged; a consumer can now tell a trustworthy average from an untrustworthy one. Runtime-confirmed: a floor holding VND+USD+MMK units reports `avgRentCurrencyMixed: true`. |
| **RPT-CUR-005** | Requires `Lead.currencyCode` — a schema change plus a rule for existing rows. Fenced off by the brief. | `pipelineValueCurrencyUnknown: true` at the top level and on each `byLeaseTerm` segment. |
| **RPT-CUR-006** | Requires `SlotBooking.currencyCode`. Fenced off by the brief. | `byLeaseTerm.SHORT` returns `revenueCurrencyUnknown: true` and an empty `revenueByCurrency`; the UI prints **"Chưa xác định đơn vị tiền tệ"** instead of implying VND. |
| **RPT-CUR-001, 007, 008, 009** | Out of this wave's scope. | Unchanged. |

### 16.1 Runtime verification

Verified against the live local stack (`leasing-backend` on :3000, real Postgres),
not against mocks.

`/api/dashboard/cross-mall` — the seeded dataset holds VND, USD and MMK invoices
but only for periods `2026-03..2026-05`, while the endpoint reads the current
month. Ten invoices were therefore copied into period `2026-09` under the
reversible marker `WAVE1-VERIFY-*`, the endpoint was called, and the copies were
deleted afterwards (`DELETE 10`, `remaining 0`). This is the local dev database;
no production data was touched.

```
revenueByCurrency: VND 1,559,855,000 (thu 495,220,000 — 31.7%)
                   USD         6,187.50 (thu 6,187.50 — 100%)
                   MMK    17,550,000 (thu 17,550,000 — 100%)
legacy scalar    : 1,559,855,000  (revenueScalarCurrency: VND)
byLeaseTerm.SHORT: revenueByCurrency [] , revenueCurrencyUnknown true
```

The USD and MMK lines were previously **absent from the response entirely**. The
VND bucket equals the old VND-filtered scalar exactly, so no existing KPI moved.

`/api/analytics/occupancy` — all 30 seeded units are VND, so the defect is latent
in this dataset. `GF-A01` was temporarily set to USD and `GF-A02` to MMK, the
endpoint was called, and both were restored to VND (verified: 30 units, all VND).

```
billingRevenueByCurrency: VND 1,418,050,000 (8 units)
                          USD   135,000,000 (1 unit)
                          MMK   175,500,000 (1 unit)
Ground Floor: avgRentPerSqm 1,008,333  currencies [VND,USD,MMK]  mixed=true
Level 1     : avgRentPerSqm   900,000  currencies [VND]          mixed=false
```

Before the fix these three amounts were added into a single `60,103,000`-style
figure with no unit of account. The `mixed=true` flag on Ground Floor is the
deferred-defect disclosure doing its job.

`/api/crm/pipeline/stats`

```
pipelineValueCurrencyUnknown: true   totalPipelineValue: 4,133,500,000
proposalValueCurrency       : VND
byLeaseTerm.LONG.pipelineValueCurrencyUnknown: true
```

### 16.2 What is still true after Wave 1

- **No FX exists and none was added.** Every fix preserves the currency
  dimension rather than collapsing it.
- There is still **no consolidated cross-currency total anywhere**, by design.
  The business question in §15 ("what should an executive total mean?") is still
  unanswered and still blocks the remaining RPT-CUR-004 work outside cross-mall.
- The single-mall dashboard (`buildDashboard`), the AI assistant, and the
  reports/compliance surfaces are **unchanged** and still carry their original
  VND-scoping. Those are later waves.

---

## 17. Remediation Wave 2 — AI assistant financial context (2026-09-06)

Scope: **RPT-CUR-001 only.** No FX was implemented; the AI mixed-currency
aggregate was the target, and nothing outside `ai.service.ts#buildContext` was
changed.

### 17.1 Every monetary source in the AI context, traced and classified

`buildContext()` is the only place the AI assistant receives business figures.
`getSuggestions()` returns counts only; `mcp-server.service.ts` exposes code and
schema metadata with no business data; `contract-expiry.scheduler.ts` (the "AI
proactive insights" job) emits no monetary values. All were checked.

| Block | Monetary fields | Classification (before) | After Wave 2 |
|---|---|---|---|
| Occupancy | none (counts, m²) | n/a | unchanged |
| Contracts | none (counts, dates) | n/a | unchanged |
| Invoice / AR | overdue sum, issued sum, top-5 debt | **VND_SCOPED_UNDECLARED** | **VND_SCOPED_AND_DECLARED** — queries still `currencyCode: 'VND'` (not widened in this wave), scope now stated in the context |
| Sales turnover | `SUM(grossSales)`, `SUM(netSales)`, growth % | **CROSS_CURRENCY_UNSAFE** | **MULTI_CURRENCY_SAFE** |
| Tickets | none | n/a | unchanged |
| Tenants | none | n/a | unchanged |
| Proposals | none (counts only) | n/a | unchanged |

Contract value, rent and pipeline value are **not present** in the AI context at
all, so RPT-CUR-005's currency-less Lead figures never reach the model.

Only one arithmetic cross-currency defect existed in this path, so remediation
was not broadened.

### 17.2 The fix

`aggregate({ _sum: { grossSales } })` → `groupBy({ by: ['currencyCode'] })` for
both the current and the previous period. Prisma returns a NULL `currencyCode`
as its own group, which is what carries CUR-001's "reported before currency was
captured" rows into the prompt **without calling them VND**.

Growth is computed inside `turnoverGrowthByCurrency`, per currency, with
semantic states instead of fabricated percentages:

| State | When |
|---|---|
| `PERCENT` | the currency reported in both periods and the prior total was > 0 |
| `NEW_CURRENCY` | reported this period only |
| `NO_CURRENT_VALUE` | reported last period only |
| `NO_PRIOR_VALUE` | reported in both, prior total was 0 |
| `CURRENCY_UNKNOWN_NOT_COMPARABLE` | the UNKNOWN bucket — see below |

`CURRENCY_UNKNOWN_NOT_COMPARABLE` was added during implementation. Two
unknown-currency sums from different periods are not guaranteed to be the same
unit of account, so comparing them would commit precisely the error this wave
exists to fix. The UNKNOWN bucket therefore never yields a percentage.

The context also carries `NO_FX_INSTRUCTION`, appended whenever any monetary
block ran, and one matching line was added to `SYSTEM_PROMPT` as a durable
backstop. No fake consolidated number is produced and the model is never asked
to perform FX.

### 17.3 Runtime verification

Run against real Postgres via the real Prisma `groupBy`. The seeded turnover
data covers `2026-03..2026-05` while the AI block reads the current month, so
rows were copied into `2026-09` / `2026-08` under a fully reversible edit that
also produced one NULL-currency row and removed MMK from the current period, to
exercise every branch. All 19 rows were deleted afterwards and the table was
verified back at its original 30 rows across 3 periods with zero UNKNOWN. Local
dev database only.

```
CURRENT  (2026-09): VND gross 2,761,270,223 net 2,485,143,200.7  (7 tenants)
                    USD gross        13,114.87 net    11,803.38  (1 tenant)
                    UNKNOWN gross 167,978,542 net 151,180,687.8  (1 tenant)
PREVIOUS (2026-08): VND gross 3,062,540,018 | USD gross 12,796.87 | MMK gross 26,618,974.73

OLD cross-currency SUM: 2,929,261,879.87  ← regression evidence only, NOT a KPI
```

Generated context:

```
Doanh thu tháng 2026-09 — tách theo đơn vị tiền tệ, KHÔNG quy đổi tỷ giá, không có số tổng gộp:
  - VND: gross 2.761.270.223 VND | net 2.485.143.201 VND | 7 khách thuê báo cáo | tăng trưởng so với 2026-08: -9.8%
  - USD: gross 13.114,87 USD | net 11.803,38 USD | 1 khách thuê báo cáo | tăng trưởng so với 2026-08: +2.5%
  - KHÔNG XÁC ĐỊNH: gross 167.978.542 (đơn vị tiền tệ KHÔNG XÁC ĐỊNH) | ... | tăng trưởng: CURRENCY_UNKNOWN_NOT_COMPARABLE
Đơn vị tiền tệ chỉ xuất hiện ở kỳ trước (2026-08):
  - MMK: NO_CURRENT_VALUE (có báo cáo 2026-08 nhưng không có kỳ này)
CẢNH BÁO: 1 dòng doanh thu được báo cáo trước khi đơn vị tiền tệ được ghi nhận (CUR-001)...
```

The old prose was a single line: `Doanh thu tháng 2026-09: 2.929.261.880 VNĐ`.

### 17.4 RPT-CUR-001 — CLOSED

All five closing conditions hold: turnover is grouped by currency, growth is per
currency, no mixed total remains anywhere in the path, a NULL currency never
becomes VND, and the context states the currency boundary explicitly.

**This does not make all AI financial context multi-currency-complete.** The AR
block is still VND-filtered by design; it is now declared rather than silent,
which is a local RPT-CUR-004 mitigation, not a global fix.

---

## 18. Remediation Wave 3 — Lead monetary currency model (2026-09-06)

Scope: **RPT-CUR-005 and the reachable Lead subset of CUR-002.** SlotBooking,
the shared frontend formatter defaults, `avgRentPerSqm`, the single-mall
dashboard, reports, compliance, AI aggregation and SAP were all left untouched.
No FX was implemented.

### 18.1 Write paths, reconstructed before any schema change

| Path | Controller | DTO | Service | Money written | Currency before | UI input | Bulk | Seed | Job |
|---|---|---|---|---|---|---|---|---|---|
| `POST /crm/leads` | `crm.controller.ts:100` | `CreateLeadDto` | `CrmService.create` | `expectedRent`, `expectedArea`, `estimatedValue` — spread straight from the DTO (`data: dto`) | none; DTO only *documented* "in VND" | `LeadEditDialog` | no | no | no |
| `PUT /crm/leads/:id` | `crm.controller.ts:108` | `UpdateLeadDto` | `CrmService.update` | `expectedRent`, `expectedArea` only — `estimatedValue` is **not** updatable (pre-existing) | none | `LeadEditDialog` | no | no | no |
| `POST /crm/leads/bulk` | `crm.controller.ts:189` | untyped | `CrmService.bulkAction` | none (assign / status / priority / soft-delete) | n/a | CRM list | yes | no | no |
| `prisma/seed.ts:819` | — | — | direct `prisma.lead.create` | all three | none | — | no | yes | no |
| `CustomersService.createFromLead` / `syncFromLead` | via `POST /crm/leads/:id/customer-profile` | — | copies `lead.expectedRent` → `Customer.budgetMin` | reads Lead money, writes Customer money | none on either side | CRM | no | no | no |
| `ProposalsService` (`:274`, `:868`) | — | — | `prisma.lead.update` | **status only** | n/a | — | no | no | no |

No import path, no background job and no other module writes Lead money.
`estimatedValue` has exactly one writer: lead creation.

### 18.2 Canonical currency — decided from evidence, not assumed

**One currency per Lead: yes.** The aggregation treats `estimatedValue` and
`expectedRent × expectedArea` as substitutable for the same quantity
(`estimatedValue ?? expectedRent * expectedArea`, used in four places). Two
different currencies across those fields would make that expression incoherent,
so the platform already assumes one currency per Lead — this makes it explicit.

**Inheritance: none, and this is a finding, not a shortcut.** `Lead` has no
mandatory monetary parent. `mallId` is optional, there is no Unit relation, and
`Proposal`/`UnitBooking` are one-to-many and only come into existence *after*
the lead's figures are entered. The brief's condition — "a proven business
parent … mandatory and stable" — is not satisfied by anything on the model, so
the currency must be supplied explicitly.

The data proves the point rather than merely allowing it: seeded lead **Zara
Vietnam** links to an **MMK** Proposal and a **VND** UnitBooking at the same
time, and **KFC Vietnam** carries a VND-magnitude `expectedRent` of 900,000
against a **USD** Proposal. Inheriting from either relation would have produced
a wrong answer on real rows.

### 18.3 Existing data classification (read-only, pre-migration)

`prisma/scripts/lead-currency-reconciliation.sql`, run against the original
dataset of 20 active leads — every one of which had money:

| Classification | Leads |
|---|---|
| SAFE_TO_INFER | 9 |
| CURRENCY_UNKNOWN | 10 |
| CONFLICT | 1 |
| AMBIGUOUS | 0 |
| NO_MONETARY_VALUE | 0 |

7 of the 9 SAFE_TO_INFER rows would infer **VND**, and the script flags them
with `inference_is_vnd_default_risk`: both source columns
(`Proposal.rentCurrency`, `UnitBooking.currencyCode`) are `@default(VND)`, so a
VND reading there may be an untouched default rather than a decision. A backfill
built on that would reproduce the exact assumption being removed.

**Conclusion: no backfill rule exists.** A NOT NULL migration is unsafe.

### 18.4 Schema and migration

```prisma
currencyCode CurrencyCode?   // nullable, NO @default
```

Migration `20260906180000_add_currency_to_lead` is a single `ADD COLUMN` and
touches no rows: nullable, no default, no constraint, so no table rewrite and
only a brief `ACCESS EXCLUSIVE` lock. Rollback is
`ALTER TABLE "Lead" DROP COLUMN "currencyCode"`.

### 18.5 Enforcement, aggregation, presentation

`assertLeadCurrency` refuses **money present + currency absent** on create and
on update. It is evaluated against the *merged* state, so a legacy row can still
be edited — only a write that actually introduces or changes an amount is
blocked.

`pipelineValueByCurrency` and `valueByStatusAndCurrency` replace the
currency-less scalars as the authoritative figures; the scalars remain for
backward compatibility and `pipelineValueCurrencyUnknown` now means "at least
one lead still has money with no unit of account".

Frontend: a currency selector on the lead form (required once an amount is
entered), per-currency pipeline totals in the CRM toolbar and overview KPI, and
`formatLeadMoney` which renders a missing currency as **"(chưa rõ ĐVT)"** — the
hardcoded `formatMoney(..., 'VND')` calls are gone.

### 18.6 Runtime verification

Against the live stack and real Postgres.

```
POST /crm/leads {estimatedValue: 500000000}            -> 400 "không mặc định VND"
POST /crm/leads {estimatedValue: 25000, ccy: USD}      -> 201, currencyCode USD
POST /crm/leads {estimatedValue: 1, ccy: EUR}          -> 400 "must be one of VND, USD, MMK"

GET /crm/pipeline/stats
  pipelineValueByCurrency: VND 3,238,500,000 (15 leads)
                           MMK    87,000,000 (1)
                           UNKNOWN 140,000,000 (1)
  pipelineValueCurrencyUnknown: true
  legacy scalar (compat only): 3,465,500,000   <- the cross-currency sum

GET /crm/deals
  Aeon MaxValu  87,000,000  ccy=MMK
  Miniso       140,000,000  ccy=null      <- legacy row, NOT fabricated as VND
  Tous Les Jours 90,000,000 ccy=VND
```

The seed now gives every lead an explicit currency (18 VND, 1 USD, 1 MMK) so it
stops planting currency-less money. The UNKNOWN path was exercised by nulling
one row temporarily; that row and the probe leads were removed afterwards and
the table verified back at 20 leads with 18/1/1.

### 18.7 RPT-CUR-005 — NOT closed, one condition outstanding

Five of the brief's six closing conditions hold. The sixth does not:

> *downstream copy does not lose it*

`CustomersService.customerDataFromLead` maps `budgetMin ← lead.expectedRent`,
and `Customer` has **no currency column at all**. Before this wave the copy lost
nothing, because neither side had a currency; now it drops one that exists.
Fixing it requires a `Customer` schema change, which §10 of the brief explicitly
puts behind "open a separate issue and STOP".

Opened as **CUR-002-CUSTOMER**. RPT-CUR-005 is therefore **FIXED for the Lead
model, the CRM aggregation and every CRM surface**, and stays open pending that
boundary.

**CUR-002 is NOT globally fixed.** Only the Lead subset moved.
`SlotBooking`, `Customer.budgetMin/Max`, `SapReconciliationRecord` and
`OccupancySnapshot.revenuePerSqm` are unchanged.

---

## 19. Remediation Wave 4 — Customer budget currency integrity (2026-09-06)

Scope: **CUR-002-CUSTOMER**, plus closing RPT-CUR-005 if the downstream loss it
was blocked on is eliminated. SlotBooking, the shared formatter defaults,
`avgRentPerSqm`, the VND-only dashboard/report KPIs, SAP and FX policy were all
left untouched.

### 19.1 Customer money, audited before any schema change

`Customer` has exactly **two** monetary fields, and they are the two ends of one
range for one quantity (expected rent per m²):

| Field | Meaning | Create | Update | Lead-copy | Import/bulk | Seed | UI input | API output | Reporting | Downstream |
|---|---|---|---|---|---|---|---|---|---|---|
| `budgetMin` | lower bound of the tenant's rent budget, per m² | `CustomersService.create` (`POST /crm/customers`) | `CustomersService.update` | **yes** — `customerDataFromLead` maps `budgetMin ← lead.expectedRent` | none | `seed.ts:704-713`, written **directly** | CRM add dialog + `LeadEditDialog` profile tab | `findAll`, `findOne`, and `crm.service.ts:203` on the lead sheet | none | none |
| `budgetMax` | upper bound | same | same | **no** — never copied from a Lead | none | same | same | same | none | `DealScoringService.scoreProposal` → `financialCapacity` |

`expectedArea` is m², `rating` is 1–5; neither is money. There is no import path,
no bulk path and no background job that writes a Customer budget.

**`budgetMin` is not always from a Lead.** The seed and `CustomersService.create`
both write budgets directly — this matters for §19.3.

### 19.2 Canonical currency — one per Customer

`budgetMin` and `budgetMax` bound a single quantity. A range cannot span two
units of account ("between 700,000 VND and 900 USD" is not a budget), and every
write path sets them together. One `Customer.currencyCode` covers both. No
business decision was required and none was guessed.

### 19.3 Existing data classification (read-only, pre-migration)

`prisma/scripts/customer-budget-currency-reconciliation.sql`, 10 active
customers, all 10 holding a budget:

| Classification | Customers |
|---|---|
| SAFE_TO_INFER | **0** |
| CURRENCY_UNKNOWN | **10** |
| CONFLICT | 0 |
| AMBIGUOUS | 0 |
| NO_MONETARY_VALUE | 0 |

**Provenance is a precondition of inference, not a footnote.** A linked Lead does
not prove the budget came from it: `budgetMin` is written directly by
`CustomersService.create` and by the seed, and only `customerDataFromLead` copies
it from `Lead.expectedRent`. The script's `budget_equals_lead_rent` column is
**false for all 10** rows:

```
CUST-001  budgetMin   800,000   KFC Vietnam       expectedRent   900,000   VND   f
CUST-002  budgetMin   700,000   Zara Vietnam      expectedRent   800,000   VND   f
CUST-007  budgetMin   350,000   Vincom Retail     expectedRent   500,000   VND   f
...  (10 of 10 mismatched)
```

So the linked Lead's currency describes a **different monetary value** and cannot
be carried across. A Lead now only supplies a currency when
`lead.expectedRent = customer.budgetMin`, i.e. when the exact value being
inferred is demonstrably the same business value; `matched_leads` is 0 for every
current row, hence 10 × CURRENCY_UNKNOWN.

> **Correction.** An earlier revision of this script classified on the link alone
> and reported **10 SAFE_TO_INFER** for this same dataset. That label promised
> something the data did not support and has been fixed in the SQL itself. The
> diagnostic columns `linked_lead_currency` and `budget_equals_lead_rent` are
> retained so the distinction stays visible.

**No backfill was performed** — and on this dataset none is even a candidate.

### 19.4 Schema and migration

```prisma
currencyCode CurrencyCode?   // nullable, NO @default
```

`20260906190000_add_currency_to_customer` — one `ADD COLUMN`, no rows touched,
no table rewrite (nullable, no default, no constraint), brief `ACCESS EXCLUSIVE`
lock only. Rollback: `ALTER TABLE "Customer" DROP COLUMN "currencyCode"`.

### 19.5 Lead → Customer rule

`customerDataFromLead` now maps `currencyCode ← lead.currencyCode` alongside
`budgetMin ← lead.expectedRent`.

**A NULL Lead currency is copied as NULL, not as VND.** The alternative —
rejecting the copy — would block a legacy lead from ever being marked WON, since
`createFromLead` runs on that transition. That is a business regression, not a
safety gain. This is the brief's "legacy synchronisation" carve-out: the
destination explicitly means UNKNOWN and is rendered as such.

`syncFromLead` additionally fails closed with **`CUSTOMER_CURRENCY_CONFLICT`**
(carrying `leadId`, `customerId`, `leadCurrency`, `customerCurrency`, `field`)
when the Customer already holds a different explicit currency, **or** when the
Lead's currency is UNKNOWN and the Customer has an explicit one — the latter
would stamp a unit of account onto an amount that has none. Nothing is converted
and nothing is silently overwritten.

### 19.6 A second defect found in scope — deal scoring

`DealScoringService` computed `financialCapacity` as
`min(100, budgetMax / 1,000,000,000 × 100)`. That divisor is a **VND-scale
constant**. A 40,000 USD budget — a large one — scored **0.004**; an MMK budget
skewed the other way.

The scale is only defined for VND and there is no approved rate to define it
elsewhere, so `scoreFinancialCapacity` now returns the same neutral 50 already
used when a customer has no budget, for any non-VND or unknown currency.
Declining to compare across units is the fix; inventing a per-currency scale
would be FX under another name.

### 19.7 Presentation

Both budget surfaces rendered `"${min}–${max} tr/m²"`. **"tr" is triệu đồng** — a
VND unit word printed over values the model could not prove were VND.
`formatBudgetRange` now takes the Customer currency and renders
`"800.000–1.000.000 VND/m²"`, or `"800.000–1.000.000/m² (chưa rõ ĐVT)"` when it
is unknown. Both edit forms gained a required currency selector.

### 19.8 Runtime verification

```
POST /crm/customers  {budgetMin:800000, budgetMax:1000000}   -> 400 "không mặc định VND"
POST /crm/customers  {budgetMin:30, budgetMax:45, ccy:USD}   -> 201, currencyCode USD
POST /crm/customers  {budgetMin:1, ccy:EUR}                  -> 400 "must be one of VND, USD, MMK"

POST /crm/leads/<Nike, USD>/customer-profile   -> KH-2026-00002  ccy=USD  budgetMin=34
POST /crm/leads/<Aeon, MMK>/customer-profile   -> KH-2026-00003  ccy=MMK  budgetMin=29000
POST /crm/leads/<ALDO, VND>/sync-customer  into an MMK customer
    -> 409 CUSTOMER_CURRENCY_CONFLICT
```

All probe rows were deleted afterwards and the table verified back at 10
customers / 10 leads linked.

### 19.9 Status

**CUR-002-CUSTOMER — CLOSED.** The copy carries its currency, direct writes fail
closed, the conflict case is refused with diagnostics, and the UI no longer
prints a VND unit word over unknown values.

**RPT-CUR-005 — CLOSED.** All six of the Wave 3 closing conditions now hold; the
sixth ("downstream copy does not lose it") was the only one outstanding and this
wave removed it. Every confirmed downstream monetary copy out of `Lead` — the
deal-pipeline view and the Customer budget — preserves the currency, and an
UNKNOWN source stays UNKNOWN throughout.

**CUR-002 — remains open globally.** Only the `Lead` and `Customer` subsets are
done. `UnitSlot`/`SlotBooking` (RPT-CUR-006), `SapReconciliationRecord`
(SAP-004) and `OccupancySnapshot.revenuePerSqm` are unchanged.

---

## 20. Remediation Wave 5 — UnitSlot / SlotBooking currency lifecycle (2026-09-07)

Scope: **RPT-CUR-006 and the UnitSlot/SlotBooking subset of CUR-002.** SAP,
`OccupancySnapshot`, the shared formatter defaults, `avgRentPerSqm`, the
single-mall LONG revenue, parking internals and inventory were all left
untouched. No FX.

### 20.1 The lifecycle, traced before any schema change

```
Unit ── UnitSlot (price/day/m², price/hour, price/m²/month)
          └── SlotBooking  baseAmount → discount% → totalAmount
                 ├── Dashboard SHORT KPI  (summarizeShortBookingPipeline)
                 └── Invoice              (SHORT_TERM_BOOKING → payments → SAP)
```

| Model | Field | Writer | DTO | Service | Source value | Currency source (before) | UI input | Seed | Import/bulk | Job | Downstream |
|---|---|---|---|---|---|---|---|---|---|---|---|
| UnitSlot | `pricePerDaySqm` / `pricePerHour` / `pricePerSqmMonth` | `POST /slots/units/:unitId`, `PATCH /slots/:id`, `POST /slots/units/:unitId/grid` | `CreateUnitSlotDto` / `UpdateUnitSlotDto` | `SlotsService.createSlot` / `updateSlot` / grid `createMany` | typed by a user | **none** | `FloorPlanEditor` slot dialog | none — the seed creates no slots | none | none | `calculatePrice` |
| SlotBooking | `baseAmount` | `POST /slots/:id/bookings`, `PATCH /slots/bookings/:id` | `CreateSlotBookingDto` | `createBooking` / `updateSlotBooking` | `calculatePrice` | **none** | `CreateSlotBookingDialog` | none | none | none | Dashboard SHORT, Invoice |
| SlotBooking | `totalAmount` | same | same | same | `baseAmount × (1 − discount%)` | **none** | same | none | none | none | same |

`SlotPricingRule` holds `multiplier` and `discountPct` only — both dimensionless,
so it is not a monetary model and needs no currency.

### 20.2 Currency ownership — BOTH, and the second one is not a preference

**`UnitSlot.currencyCode`** = the pricing currency.
**`SlotBooking.currencyCode`** = an immutable booking-time snapshot.

The snapshot is required, not chosen for symmetry. Two pieces of code prove it:
`updateSlot` edits prices with no restriction, and `deleteSlot` is a **soft**
delete whose own comment says *"keep booking history"*. A booking's amount
therefore outlives the price that produced it, so reading the currency from the
slot at query time would silently relabel every historical booking the moment a
slot was re-priced or re-denominated.

### 20.3 Unit → UnitSlot: no inheritance, by evidence

`Unit.currencyCode` exists — but its own schema comment scopes it to
`baseRentPerSqm / camPerSqm / marketRentPerSqm / askingRentPerSqm`, the Unit's
**long-term** rent. Slot prices are not in that list, nothing in code derives one
from the other, and `updateSlot` never reads the Unit. The brief's condition for
enforcing a derived relation ("always derived from Unit by business rule") is not
met, so **UnitSlot carries its own explicit currency** and a slot priced
differently from its Unit is accepted rather than rejected. Inheriting would have
been an assumption wearing the word "inherit".

### 20.4 Existing data

The seed creates **no** `Unit` with `leaseTermType = SHORT`, no `UnitSlot` and no
`SlotBooking`, so the defect is latent in the reference dataset and every
classification is 0. `prisma/scripts/slot-currency-reconciliation.sql` was still
written and exercised against purpose-built rows (§20.7).

Its two structural findings are worth keeping:

- **`SAFE_TO_INFER_FROM_UNIT` is unreachable by construction**, for the reason in
  §20.3. The class is still emitted so the reasoning is visible.
- **`CONFLICT` is unreachable for a booking**: it has exactly one slot, so there
  is no second source to disagree with. A booking whose currency differs from its
  slot's *current* currency is the snapshot working as designed — reported as the
  diagnostic `booking_vs_slot_currency_differs`, not as an error.

A booking may only inherit from its slot when `baseAmount` still **reproduces**
from that slot's current price. The script replays the simple formula only;
WEEKEND / PEAK multipliers and VOLUME_DISCOUNT rules cannot be replayed, so an
affected booking reports CURRENCY_UNKNOWN. Failing to prove provenance is never
read as proving it.

### 20.5 Amount calculation — single-currency by construction

`calculatePrice` was traced in full. Every operand is either **the one slot price
field for that booking type** (monetary) or dimensionless: area in m², a day /
hour / month count, a weekend or peak multiplier, a volume or manual discount
percentage. There is **no second monetary operand anywhere** — no tax, no fee, no
deposit, no adjustment. So the result is denominated in exactly the slot's
pricing currency, and `baseAmount` and `totalAmount` cannot diverge.

### 20.6 Invoice crossing — a real defect, fixed here

`createDueInvoiceFromSource('SHORT_TERM_BOOKING')` creates an Invoice from a
booking and **never set `currencyCode`**, so every such invoice took
`Invoice.currencyCode`'s `@default(VND)` regardless of what the booking was
priced in. That label then travels into payments and SAP.

This is a direct consequence of SlotBooking currency loss, so it is fixed in this
wave rather than deferred: the invoice now carries `booking.currencyCode`, and a
booking with no currency **cannot produce an invoice at all**.

### 20.7 Runtime verification

The reference dataset has no short-term data, so a SHORT unit, three slots
(VND / USD / no-currency) and three bookings were created for the check and
removed afterwards. Local dev database only; the table was verified back at 0
slots / 0 bookings / 0 SHORT units / 30 units.

```
POST /slots/units/:id {pricePerDaySqm: 400000}              -> 400 "không mặc định VND"
POST /slots/units/:id {pricePerDaySqm: 60000, ccy: MMK}     -> 201, currencyCode MMK
POST /slots/units/:id {pricePerDaySqm: 1, ccy: EUR}         -> 400 "must be one of VND, USD, MMK"

GET /api/dashboard          byLeaseTerm.SHORT
GET /api/dashboard/cross-mall  malls[0].byLeaseTerm.SHORT
  revenueByCurrency: VND 15,000,000 (1) | USD 750 (1) | UNKNOWN 9,000,000 (1)
  revenueCurrencyUnknown: true
  legacy scalar: 24,000,750   <- the meaningless cross-currency sum, retained
                                 for compatibility and flagged

POST .../SHORT_TERM_BOOKING/<unknown-currency booking>/create-invoice -> 400
POST .../SHORT_TERM_BOOKING/<USD booking>/create-invoice
  -> ST-BOOKING-w5-bk-2  currencyCode USD  total 825
```

Both reconciliation branches were exercised inside a rolled-back transaction: a
booking whose `baseAmount` reproduces from a currency-bearing slot classifies
**SAFE_TO_INFER_FROM_SLOT**; re-price that slot and the same booking classifies
**CURRENCY_UNKNOWN**.

### 20.8 RPT-CUR-006 — CLOSED

| Closing condition | Status |
|---|---|
| pricing currency source is explicit | `UnitSlot.currencyCode`, enforced on create and update |
| booking snapshots currency | `SlotBooking.currencyCode`, written with the amount, refused if absent |
| amount calculation is single-currency | proven in §20.5 — no second monetary operand exists |
| Dashboard SHORT grouped by currency | `revenueByCurrency` on both `/dashboard` and `/dashboard/cross-mall` |
| downstream invoice preserves it | `SHORT_TERM_BOOKING` invoice carries the booking currency; fails closed without one |
| legacy unknown data not fabricated | UNKNOWN bucket, no backfill, reconciliation refuses unproven inference |

**CUR-002 remains open globally.** `SapReconciliationRecord` (SAP-004),
`OccupancySnapshot.revenuePerSqm`, `ParkingShift` and the inventory models are
unchanged.

### 20.9 Wave 5 closure cleanup (2026-09-07)

Three corrections applied after the first Wave 5 pass, before commit.

**1. The mixed-currency legacy scalar is gone.** Dashboard SHORT still emitted
`revenue = VND + USD + UNKNOWN` "for compatibility" — 24,000,750 on the
verification dataset. That number has no unit of account and breaks MON-CUR-02,
so keeping it for compatibility was keeping the defect. The contract is now:

```
revenueByCurrency      authoritative, one bucket per currency
monthlyRevenue         null unless exactly ONE known currency governs the period
revenueScalarCurrency  names that currency, or null
revenueCurrencyMixed   true when more than one currency is present
revenueCurrencyUnknown true when any counted booking has no captured currency
```

A single UNKNOWN currency also yields a null scalar: unknown is not a currency.
The cross-mall `totals` no longer sums SHORT scalars across malls either — that
would have rebuilt the same mixed number one level up — and merges the buckets
instead. `compliance.service.ts` carried the same scalar into a
`revenuePerSqm` division; it is null on the same condition.

**2. MON-CUR-SLOT-06 — the billable-state gate.** `confirmBooking` was a blind
status update, so a legacy PENDING booking with a positive amount and a NULL
currency could become CONFIRMED — which is exactly the revenue-recognised state
(`summarizeShortBookingPipeline` counts CONFIRMED and COMPLETED) and the
invoice-eligible one (`createDueInvoiceFromSource` accepts only those two). It
now refuses, and the currency may be supplied as part of the transition so a
legacy booking is not permanently stuck.

**Zero-value rule, stated rather than implied:** a booking whose `totalAmount`
is 0 may be confirmed with no currency. It recognises no revenue and can be
invoiced for no amount, so there is no unit of account to be missing. Tested
explicitly (T18) rather than left as an accident of the `!== 0` check.

**3. Structure regression for MON-CUR-SLOT-03.** That invariant holds because
`calculatePrice` has exactly one monetary operand — not because anything checks
it. Every other test would still pass if a fee, deposit, tax or fixed discount
amount were added to the formula, and the result would silently become a
cross-currency sum again. A test now reads the method's source (comments
stripped, so it scans code rather than the comment that names those words while
denying them) and fails when money-shaped vocabulary enters the calculation
path, forcing a deliberate decision about the new operand's currency.

Runtime after cleanup:

```
byLeaseTerm.SHORT
  revenueByCurrency: VND 15,000,000 | USD 750 | MMK 9,000,000
  monthlyRevenue: null   revenueScalarCurrency: null   revenueCurrencyMixed: true
  old scalar 24,000,750 -> emitted? false

PATCH /slots/bookings/:id/confirm  {}                 -> 400 (positive amount, NULL currency)
PATCH /slots/bookings/:id/confirm  {currencyCode:MMK} -> CONFIRMED, ccy MMK
```

---

## 21. Remediation Wave 6 — OccupancySnapshot monetary semantics (2026-09-07)

Scope: **the `OccupancySnapshot.revenuePerSqm` subset of CUR-002.** SAP
reconciliation, the shared formatter defaults, `avgRentPerSqm`, pricing
assumptions, parking and inventory were all left untouched. No FX.

### 21.1 Field classification

| Field | Class |
|---|---|
| `mallId`, `floorId`, `category`, `leaseTermType`, `period`, `snapshotDate` | NON_MONETARY (scope / identity) |
| `totalUnits`, `occupiedUnits`, `vacantUnits`, `underFitout` | COUNT |
| `totalAreaSqm`, `occupiedAreaSqm` | AREA |
| `occupancyRate` | PERCENTAGE |
| **`revenuePerSqm`** | **DERIVED_MONETARY** — a money/area ratio |

`revenuePerSqm` is the only monetary field. Dividing by m² does **not** make it
currency-neutral: VND/m² and USD/m² are different units.

### 21.2 Lifecycle and writers

`OccupancySnapshot` is a **historical monthly series**: `@@unique([mallId,
floorId, category, leaseTermType, period])` with an `upsert`, so it appends one
row per period and overwrites only within the same period. Mall-scoped and
period-scoped.

| Writer | Trigger | Source tables | Source money | Source currency | Aggregation | Period | Mall scope | Overwrite/append | Consumers |
|---|---|---|---|---|---|---|---|---|---|
| `OccupancyAnalyticsService.takeMonthlySnapshot` | `@Cron('0 1 1 * *')`, scheduler-locked | `Mall`, `Unit`, `SlotBooking`, `Invoice` | `Invoice.subtotal` | **explicit `currencyCode: 'VND'` filter** | SUM then ÷ occupiedArea | current month | per mall | upsert (overwrite within period, append across) | `/analytics/occupancy/trend` |
| `prisma/seed.ts:1592` | seeding | — | none — writes `400000 + random()` | **none** | none | last 6 months | one mall | create | same |

Consumers: `OccupancyAnalyticsService.getOccupancyTrend` returns it;
`SpacesService.getOccupancyTrend` reads the table but **does not expose**
`revenuePerSqm` at all. No frontend component renders it.

### 21.3 The formula

```
numerator   = SUM(Invoice.subtotal) WHERE currencyCode = 'VND'
                AND status IN (ISSUED, PAID, PARTIALLY_PAID)
                AND period = <snapshot period>
                AND contract.unit.mallId = <mall>
denominator = occupiedAreaSqm (m²)
aggregation before division = SUM over VND invoices only
```

For `leaseTermType = SHORT` the numerator is a hardcoded `0` — SHORT revenue is
not computed here at all.

### 21.4 Classification: A — EXPLICIT_SINGLE_CURRENCY

Proven from the query, not assumed. **The arithmetic was never unsafe**: the
`currencyCode: 'VND'` filter means no cross-currency SUM ever occurred. The
defect is the one §3 of the brief anticipated — *currency context missing / VND
scope undisclosed*. The scope was therefore **not widened**; doing so would
change what the KPI means, which §14 makes a business decision.

Section 3 of the reconciliation quantifies what the scope excludes: real USD
(5,625) and MMK (15,954,545) invoices exist in each of 2026-03/04/05 for
THISO-SALA and are correctly outside the figure.

### 21.5 Model contract: C — intentionally VND-only, with the scope persisted

`revenuePerSqmCurrency CurrencyCode?` on `OccupancySnapshot` — nullable, **no
`@default`**. The writer records `VND` for LONG because that is the currency its
source was filtered to; the two are the same named constant
(`OCCUPANCY_REVENUE_SCALE_CURRENCY`) so the filter and the label cannot drift
apart.

**SHORT records `null`, not VND.** Its `revenuePerSqm` is 0 because no monetary
source was consulted, not because it earned zero dong; a zero has no unit of
account to claim.

### 21.6 Historical immutability — MON-CUR-OCC-01

Snapshot history exists, so the invariant is promoted rather than proposed. The
currency is persisted on the row and the read path returns it verbatim; nothing
consults current `Mall`/`Unit` configuration to answer what a past snapshot was
denominated in.

### 21.7 Existing data

6 snapshots, all **CURRENCY_UNKNOWN**, and no backfill is possible:

- **Two writers produce identical-looking rows.** The cron computes from
  VND-scoped invoices; the seed writes a fabricated `400000 + random()`. Nothing
  persisted distinguishes them.
- **Even for cron rows, asserting VND today** means reading the *current*
  writer's filter back onto rows written by whatever the code did then — exactly
  the "derive historical currency from current configuration" that
  MON-CUR-OCC-01 forbids.

So `SAFE_TO_INFER_FROM_PROVEN_SOURCE` is **unreachable by construction** in this
script, and `MIXED_SOURCE` is too: one snapshot row comes from one writer and one
aggregate, so there is no second source to mix with. Both classes are still
emitted so the reasoning is visible.

### 21.8 Dependencies checked and found absent

- **`avgRentPerSqm` (RPT-CUR-002): no dependency.** `avgRentPerSqm` is computed
  in `groupByFieldWithRent` from `Unit.baseRentPerSqm`; the snapshot's ratio
  comes from `Invoice.subtotal`. The unsafe cross-currency average is **not**
  promoted into a "fixed" snapshot. RPT-CUR-002 remains a separate P2.
- **`estimatedLoss` / `totalEstimatedLoss`: no dependency.** They compute
  `areaNLA × 500000 × days/30` from a hardcoded constant, never from
  `revenuePerSqm`. RPT-CUR-008 stays out of scope, as §11 requires.

### 21.9 Runtime verification

The monthly writer **cannot currently persist anything** — see OCC-CRON-001
below — so its output was captured by intercepting the upsert, computed from real
data, without touching the table.

```
what the writer would persist (real data)
  2026-09 LONG  | revenuePerSqm = 0 | revenuePerSqmCurrency = "VND" | occupiedArea = 1632
  2026-09 SHORT | revenuePerSqm = 0 | revenuePerSqmCurrency = null  | occupiedArea = 0

API contract on the real (legacy) rows — /analytics/occupancy/trend
  2026-04..2026-09 LONG | revenuePerSqm = 425320..478994 | revenuePerSqmCurrency = null
```

Legacy rows return `null`, i.e. UNKNOWN — never VND. The table was verified
unchanged afterwards (6 rows, all currency NULL).

### 21.10 OCC-CRON-001 — NEW, pre-existing, NOT fixed here

`takeMonthlySnapshot` passes `floorId: null` and `category: null` inside the
compound-unique `where` of its `upsert`. Prisma rejects that
(`Argument 'floorId' must not be null`), so **the monthly occupancy snapshot job
has never successfully written a row**. Every snapshot in the database came from
the seed.

Confirmed pre-existing and untouched by this wave (`git show HEAD` carries the
same `floorId: null as any`). It is a functional defect, not a currency one, and
fixing it means deciding how the compound unique should treat a mall-level
snapshot — a design question with its own consequences. Raised rather than
remediated inline.

It does mean the Wave 6 write-path fix is **correct but currently inert**: the
currency it records cannot reach the table until OCC-CRON-001 is resolved.

### 21.11 Status

The OccupancySnapshot subset of CUR-002 is **CLOSED** against the six conditions:
semantics known and proven from the query, writer currency proven and persisted,
no cross-currency arithmetic (there never was any), the persisted and API values
carry their scope, the frontend infers nothing (there is no renderer on this
path), and historical unknown data is left unknown.

**CUR-002 is NOT closed globally.** `SapReconciliationRecord.ourAmount/sapAmount`
(SAP-004), `ParkingShift` and the inventory models remain.

### 21.12 Wave 6.1 — OCC-CRON-001 fixed: the snapshot job actually writes (2026-09-07)

Wave 6 recorded the currency correctly but the value could not reach the table,
because the writer had never worked. That is now fixed.

**Two defects, not one.**

1. **Prisma rejected the lookup.** The writer upserted on
   `@@unique([mallId, floorId, category, leaseTermType, period])` while passing
   `floorId: null` and `category: null`. Prisma refuses null inside a
   compound-unique `where` (`Argument 'floorId' must not be null`), so the call
   threw on the first mall of every run.
2. **The constraint would not have held anyway.** Postgres treats NULLs as
   DISTINCT in a standard unique index, so
   `(mallId, NULL, NULL, leaseTermType, period)` never collides with itself.
   Swapping the upsert for `findFirst` would have produced a working job with an
   application-level check and nothing behind it — the BILL-002 shape.

Proven, not asserted. With the new index dropped inside a rolled-back
transaction, inserting a second `(mall, LONG, 2026-04)` row **succeeded**:

```
OLD CONSTRAINT ALLOWED THE DUPLICATE | rows_for_key = 2
```

With the index in place the same insert is refused:

```
ERROR: duplicate key value violates unique constraint
       "OccupancySnapshot_mall_scope_period_key"
DETAIL: Key ("mallId","leaseTermType",period)=(..., LONG, 2026-04) already exists
```

**The fix**

- `20260907140000_occupancy_snapshot_mall_scope_unique` — a PARTIAL unique index
  on `(mallId, leaseTermType, period) WHERE floorId IS NULL AND category IS NULL`,
  carrying exactly the predicate the writer uses. Prisma cannot express a partial
  unique index, hence raw SQL. The original `@@unique` is left in place: it still
  covers any future per-floor or per-category snapshot, where the columns are NOT
  NULL and its semantics do hold. Verified 0 duplicates before creating it.
- The upsert becomes `findFirst` → `update` or `create`, with a **P2002 branch**
  that adopts the winner's row when a concurrent run wins the race. That branch
  is what makes the application check and the database constraint agree rather
  than merely coexist.
- Per-mall, per-segment `try/catch`, matching the sibling monthly schedulers, so
  one mall cannot take the whole month's run down.
- The summary log said *"Occupancy snapshot taken for N malls"* — computed from
  the mall count alone, so it reported success on every run while every write was
  throwing. **That is what let the defect sit unnoticed.** It now returns and
  logs `{ created, updated, failed, malls }`.

**Runtime verification** — the writer ran against real Postgres for the first
time:

```
BEFORE       6 rows, every revenuePerSqmCurrency = null   (all seed-written)
RUN 1     => { created: 1, updated: 1, failed: 0, malls: 1 }
             2026-09 LONG  0  | ccy = VND    <- Wave 6's currency finally lands
             2026-09 SHORT 0  | ccy = null
RUN 2     => { created: 0, updated: 2, failed: 0 }   idempotent
             duplicate mall-level keys after 2 runs: 0
RESTORED     6 rows, unchanged
```

The 2026-09 LONG ratio is 0 because that period holds no invoices, which is
correct rather than a failure.

**Consequence for the occupancy trend chart:** it has been showing seeded data
for its entire life. Once this reaches an environment where the cron runs, the
first real snapshot lands on the 1st of the following month; the 6 seeded rows
remain and stay CURRENCY_UNKNOWN, since nothing may fabricate their unit.
