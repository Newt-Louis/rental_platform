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
