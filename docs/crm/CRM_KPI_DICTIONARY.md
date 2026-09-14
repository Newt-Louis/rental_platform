# CRM KPI dictionary

Status: Wave 0 current formulas VERIFIED from code. Proposed formulas are **PROPOSED DEFAULT**, not business-approved. Currency rules inherit the platform prohibition on cross-currency summation.

## Common query contract

- Scope: authorized Mall set, optional explicit Mall, optional actor/owner, optional lease term.
- Time: UTC instants resolved from business timezone `Asia/Ho_Chi_Minh`; period is `[from,to)`.
- Historical response metadata: `coverageStartedAt`, `eligibleLeadCount`, `unknownLeadCount`, `lateRecordedEventCount`, `metricStatus` (`AVAILABLE`, `PARTIAL_COVERAGE`, `INSUFFICIENT_DATA`).
- Undefined ratio: `null` with `metricStatus=INSUFFICIENT_DATA`; never fabricated `0`, `NaN`, or Infinity.
- Money: array of `{currencyCode, amount}` buckets. `UNKNOWN` remains explicit. No combined total without approved FX policy.

## Dictionary

| KPI | Current formula/source | Current meaning/problem | Proposed formula | Time / legacy rule |
|---|---|---|---|---|
| Total Leads | Count active Lead rows in scope, `crm.service.ts:667-685` | Current inventory | Same, with `asOf` and scope metadata | No history required |
| Current pipeline distribution | Count current Lead rows by `status`, `crm.service.ts:687-693` | Valid snapshot, currently also used to imply funnel conversion | Preserve and label `currentDistribution`; not conversion | `asOf` snapshot |
| Active Leads | Total minus current WON and LOST, `crm.service.ts:708` | Open current inventory | Count current status not in WON/LOST | `asOf` snapshot |
| Pipeline value | Open Lead `estimatedValue` else `expectedRent*expectedArea`, bucketed by `currencyCode`, `lead-pipeline-currency.ts` and `crm.service.ts:762-768` | Currency-safe bucket exists; legacy scalar remains unsafe compatibility data | Keep canonical buckets; remove scalar from new contract | Snapshot; UNKNOWN bucket retained |
| Snapshot stage reach proxy | Current `conversionRates.*` formulas, `crm.service.ts:700-718` | Ratios of current-state counts; lost/backward/skipped Leads distort denominators | Rename/deprecate; do not call historical conversion | Available for compatibility only, explicitly `SNAPSHOT_PROXY` |
| Historical conversion A→B | Not available | No transition evidence | Unique cohort Leads with event A before event B by cutoff / unique cohort Leads with event A by cutoff | Cohort by Lead `createdAt in [from,to)`; require reliable event coverage |
| Overall closed win rate | Current WON/(WON+LOST), based on current status | Current closed-outcome ratio, not period conversion | For current snapshot keep same honest label; historical win rate uses Leads whose first closed event is in period, per reviewed policy | Denominator zero → null |
| New Leads in period | `createdAt >= startOfMonth`, `crm.service.ts:793` | Lacks explicit end/timezone | Count Lead created in `[from,to)` | Existing Lead creation time is reliable |
| WON in period | Current status WON and `updatedAt >= startOfMonth`, `crm.service.ts:791` | Any later edit moves a historical win into the current month | Count Leads with a real WON transition event in `[from,to)`; expose first-WON and any-WON variants separately | Legacy Leads without event are unknown, not inferred |
| LOST in period | Current status LOST and `updatedAt >= startOfMonth`, `crm.service.ts:792` | Same updatedAt defect | Count real LOST transition events in `[from,to)` according to unique-Lead policy | Legacy unknown excluded with coverage count |
| Average time to first win | Mean floor-days of `updatedAt-createdAt` for current WON, `crm.service.ts:720-724` | Later edits change result | Mean/median of `firstWonAt-createdAt` for eligible cohort Leads | First WON remains stable after reopen or later edit |
| Time in stage | Not available | Cannot derive from snapshot | Sum intervals from entry event to next transition/cutoff; multiple visits remain separate and may be aggregated | Requires ordered transition events; identical timestamps tie-break by event ID/sequence |
| Stale Lead | Open Lead where `lastActivityAt < now-days`, `crm.service.ts:880-902` | Primary UI writes CustomerActivity, and non-qualifying activity refreshes timestamp | Open Lead with no qualifying contact since threshold; never-contacted uses Lead creation time and explicit reason | Backdated contact compares `occurredAt`; projection rebuildable from events |
| Activity volume | Not canonical | Lead and Customer activity are separate | Count unique qualifying/non-qualifying activity events by event type and actual actor | Use occurred time; show late-entry count by recorded time |
| Productivity by staff | Not available | Owner cannot substitute for performer | Unique activity/follow-up completion events grouped by actorId and Mall; dedupe by event ID | SYSTEM separated from humans; no current-owner attribution |
| Follow-up due/overdue/completed | Current row flags/dates | No creator/completer/result/cancel history | Count by OPEN/COMPLETED/CANCELLED and due/result timestamps, grouped by creator/assignee/completer as requested | Use due date in business timezone; completion event time |
| Win/loss by source/category | Current terminal statuses grouped by Lead source/category, `crm.service.ts:726-753` | Current closed inventory, not period outcome | Preserve snapshot version; historical version groups reviewed close-event cohort using Lead source/category snapshot policy | Renames after category change require explicit as-of policy; pending review |
| Proposal count by status | Root-level Proposal groupBy, `crm.service.ts:770-787` | Not included in `byLeaseTerm`, so Pipeline Stats reads missing fields | Return a complete segment contract per lease term, scoped through Proposal Unit lease term | Snapshot; reconcile to Proposal rows |
| Proposal value by status | VND-only groupBy, `crm.service.ts:775-787` | Safe arithmetic but silently incomplete if consumer misses `proposalValueCurrency` | Currency buckets per status and lease term; never zero-fill missing segment | UNKNOWN/currency coverage explicit |

## Pipeline Stats contract defect

Backend `byLeaseTerm.LONG/SHORT` currently returns only Lead summary/status/priority and overall win rate (`crm.service.ts:795-830`). Frontend selects that segment and then reads `proposalByStatus`, `proposalValueByStatus`, detailed conversion keys, and `avgDaysToWin` at the wrong level (`SalesPipelineStatsPage.tsx:106-167,287-335`).

Required compatibility correction:

- Define one typed `PipelineStatsSegment` used for root and each supported lease term.
- Populate proposal count/value buckets from source queries filtered by the same Mall and lease term.
- Return unsupported historical metrics as `null` plus `metricStatus`, not omitted or zero.
- Frontend validates finite numeric ratios and renders “Chưa đủ dữ liệu” for null/invalid data.
- Snapshot ratios are labelled current distribution proxies until event coverage supports historical conversion.

## Reconciliation queries required after implementation

1. Current Lead counts by status: CRM Overview = CRM workspace = Pipeline Stats API.
2. Proposal counts by status and lease term: Pipeline Stats = direct Proposal aggregate under identical Mall scope.
3. Proposal value buckets: exact match by status/lease term/currency; no USD/MMK hidden behind VND zero.
4. `lastMeaningfulContactAt`: projection equals maximum qualifying event occurrence per Lead.
5. First-WON and period WON: KPI result equals event query and is unchanged by a later non-status Lead update.
6. Pagination: concatenated pages equal one stable ordered event set with no repeated/missing `(occurredAt,id)` pair.

