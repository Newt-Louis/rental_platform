# RENT_FREE — SEMANTIC INVENTORY & DATA RISK

Phase: rent-free semantic normalization, Step 1–2. **No code was modified.**
Evidence base: source tree + the running local stack (read-only queries) +
`docker/backup-20260709-132955.sql`.

---

## 1. The defect in one line

`rentFree` is a single `Int` column read as **months** by the code that charges
money, and as **days** by the code that decides who must approve the deal.

---

## Step 1 — Full usage inventory

### 1.1 Persistence

| Location | Field | Type | Unit declared |
|---|---|---|---|
| `schema.prisma:1423` | `Proposal.rentFree` | `Int @default(0)` | **none — no comment** |
| `schema.prisma:1608` | `Contract.rentFree` | `Int @default(0)` | **none — no comment** |
| `schema.prisma:2963` | `ProposalScenario.terms` (Json) | embedded `rentFree` | none |

`Int` means fractional months are not representable — a half-month rent-free
cannot be expressed under a MONTHS reading.

### 1.2 Classified occurrences

| File | Function / component | Class | Unit assumed | Risk |
|---|---|---|---|---|
| `billing-schedule.util.ts:120` | `generateBillingPeriods` — `monthIdx < contract.rentFree` | **BILLING** | **MONTHS** | **this one moves money** |
| `billing-schedule.service.ts:61` | passes `contract.rentFree` through | BILLING | MONTHS | — |
| `approval-policy.util.ts:5,46-47` | `RENT_FREE_DAYS` → `ctx.rentFreeDays` | **APPROVAL** | **DAYS** | governance |
| `approvals.service.ts:742` | condition type constant | APPROVAL | DAYS | — |
| `approval-policy-seed.util.ts:5,39` | mirror of the above | APPROVAL/SEED | DAYS | — |
| `seed.ts:245-254` | rule `MALL_DIRECTOR_LONG_RENT_FREE`, `> 60` | **SEED/APPROVAL** | **DAYS** | rule is dead — see §4 |
| `seed.ts:1385` | `rentFreeDays: proposal.rentFree` | SEED | DAYS | — |
| `proposals.service.ts:77,85` | `calcFinancials` — `billableMonths = term - rentFree` | CALCULATION | **MONTHS** | **not UI-reachable** |
| `proposals.service.ts:370` | `rentFreeDays: proposal.rentFree` (deal scoring ctx) | CALCULATION | DAYS | — |
| `proposals.service.ts:223,718` | verbatim copy on create / Proposal→Contract | DB | pass-through | — |
| `proposals.service.ts:280` | listed as a financial field triggering recompute | CALCULATION | — | — |
| `proposal-scenario.service.ts:89,96` | `totalValue = monthlyRent * (term - rentFree)` | **CALCULATION** | **MONTHS** | UI-reachable |
| `proposal-scenario.service.ts:105` | `rentFreePenalty = terms.rentFree * 1.5` | ANALYTICS | ambiguous | scoring only |
| `deal-scoring.service.ts:67` | `rentFreeDays: proposal.rentFree` | ANALYTICS | **DAYS** | scoring only |
| `deal-scoring.util.ts:16,34` | `- input.rentFreeDays * 0.2` | ANALYTICS | DAYS | scoring only |
| `booking.service.ts:1040` | `rentFree: dto.rentFree ?? 0` on convert | DB | pass-through | — |
| `booking.service.ts:1016` | `totalContractValue = monthlyRent * dto.term` | CALCULATION | **rentFree ignored** | see §5 |
| `contracts.service.ts:317` | `rentFree: dto.rentFree ?? 0` | DB | pass-through | — |
| `contracts.service.ts:49` | amendment-only field after ACTIVE | GOVERNANCE | — | — |
| `contract-templates.service.ts:14,19` | amendment-applicable field | GOVERNANCE | — | — |
| `create-booking.dto.ts:229` | `@ApiPropertyOptional('Số ngày miễn phí thuê')` | **DTO** | **DAYS** | contradicts billing |
| `create-proposal.dto.ts:56` | `rentFree?: number` | DTO | **undeclared** | — |
| `create-contract.dto.ts:62` | `rentFree?: number` | DTO | **undeclared** | — |
| `spaces.service.ts:458` | select projection only | DISPLAY | — | — |
| `proposal-version.util.ts:13,39,65` | version diffing | DB | pass-through | — |
| `contract-expiry.scheduler.ts:179` | renewal draft, hardcoded `0` | CALCULATION | n/a | — |

### 1.3 Frontend / i18n — the split is baked into both languages

| Location | Text | Unit |
|---|---|---|
| `vi/spaces.json:265` | `"Rent-free (tháng)"` | **MONTHS** |
| `en/spaces.json:265` | `"Rent-free (months)"` | **MONTHS** |
| `vi/bookings.json:341` | `"Rent-free (ngày)"` | **DAYS** |
| `en/bookings.json:341` | `"Rent-free (days)"` | **DAYS** |
| `vi/deals.json:137` | `"Miễn thuê (ngày)"` (scenarios) | DAYS |
| `vi/deals.json:308` | `"{{count}} ngày miễn phí"` | DAYS |
| `vi/contracts.json:209` | `"Điều chỉnh số tháng miễn phí thuê"` | **MONTHS** |
| `en/contracts.json:209` | `"Rent-free months adjustment"` | **MONTHS** |
| `SalesPipelineTab.tsx:264` | `{pr.rentFree} tháng` | **MONTHS** |
| `ApprovalsPage.tsx:271,573` | rendered with `scenarios.days` | DAYS |
| `ApprovalPolicyTab.tsx:55` | `unit = RENT_FREE_DAYS ? ' ngày' : '%'` | DAYS |
| `ProposalsPage.tsx:590` | label key `proposals.fields.freeRentMonths`, suffix `t('proposals.scenarios.days')` | **both, on one line** |

`ProposalsPage.tsx:590` is the clearest artefact of the confusion: the label is
named *months* and the value is suffixed *ngày*.

### 1.4 Test fixtures already encode both readings

| File | Value | Implied unit |
|---|---|---|
| `billing-schedule.util.spec.ts:14,83` | `rentFree: 1` | MONTHS |
| `proposals.service.spec.ts:61,116` | `rentFree: 30` | DAYS |
| `approvals.get-pending.spec.ts:18` | `rentFree: 30` | DAYS |
| `deal-scoring.util.spec.ts:13,22` | `rentFreeDays: 30 / 90` | DAYS |
| `seed.ts:999` | `rentFree: i % 3 === 0 ? 30 : 0` | DAYS |
| `seed.ts:1689` | scenario `rentFree: 1` | MONTHS |

No existing test asserts a cross-layer invariant, so the contradiction is
invisible to CI — every test is internally consistent with its own assumption.

### 1.5 Which reading is actually executable

Filtering the inventory to paths reachable from the running UI:

| Reachable path | Reads rentFree as |
|---|---|
| Booking → Proposal conversion (both dialogs) | stored verbatim; **not used in valuation at all** |
| Approval routing (`RENT_FREE_DAYS > 60`) | **DAYS** |
| Deal scoring | DAYS |
| Proposal scenario `totalValue` | **MONTHS** |
| Proposal → Contract conversion | verbatim |
| **Billing schedule generation** | **MONTHS** |
| Contract amendment `RENT_FREE_CHANGE` (rebuilds schedule) | **MONTHS** |

`ProposalsService.create` and `.update` — the only code implementing
`billableMonths = term - rentFree` for a real Proposal — are **not reachable from
the frontend**: `proposalsApi.createProposal` and `updateProposal` exist in
`apps/frontend/src/api/proposals.ts:7,10` but **no component calls either**. The
same dead-API pattern found for `createContract` in Phase 3.

**Therefore the operative conflict is: billing says MONTHS, approval says DAYS.**

---

## Step 2 — Existing data risk

### 2.1 Can the creation source be determined? **No.**

Both dialogs POST to the **same** endpoint,
`POST /bookings/:id/convert-to-proposal` → `BookingService.convertToProposal`.
Nothing in the request or the persisted row records which UI produced it. There is
no `source`, `channel`, `createdVia` or equivalent column on `Proposal`.

A heuristic was considered and is **rejected as unreliable**: one might guess that
Spaces-created proposals have `businessModel`/`specialConditions`/`handoverDate`
set and Booking-created ones do not. It fails because every one of those fields is
optional in the Spaces dialog and may legitimately be left blank, and because the
silent defaults (`fitoutDays ?? 90`, `paymentTermDays ?? 30`) make a
Booking-created row indistinguishable from a Spaces-created row where the user
typed those same values.

**Per instruction, no migration rule is proposed.**

### 2.2 Observed value distribution

Local stack, `leasing_platform`, read-only:

```
 entity   | rentFree | count
----------+----------+-------
 Contract |        0 |    15
 Proposal |        0 |     7
 Proposal |       30 |     3
```

All ten proposals were created 2026-09-05 with `fitoutDays = 90`,
`paymentTermDays = 30`, and no `handoverDate`/`openingDate`/`businessModel`/
`specialConditions` — the signature of `prisma/seed.ts`. The three `rentFree = 30`
rows match `seed.ts:999` (`i % 3 === 0 ? 30 : 0`) exactly.

`docker/backup-20260709-132955.sql` (2026-07-09) shows the identical pattern:
`PROP-2026-0001/0004/0007` at `rentFree = 30`, all others `0`.

**Every observable value is seed-generated. There is no human-entered `rentFree`
data in any dataset available to this audit, and no production database is
accessible from here.** Nothing about real-world unit mixing can be concluded from
these numbers, and this section must not be read as evidence that production is
clean.

What the seed data *does* prove is that the shipped seed itself plants a
day-flavoured value (`30`) into a column that billing reads as months. Seeding a
demo environment and activating one of those contracts would produce a **30-month**
rent-free period.

### 2.3 Blast radius if a mixed-unit value exists

For a stored value `v` on an ACTIVE contract:

- **Billing** (`billing-schedule.util.ts:120`): the first `v` months are charged
  zero rent. If `v` was entered meaning *days*, the tenant receives `v` months
  free. At `v = 30` on a 36-month term, that is 30 months of free rent —
  effectively the whole lease.
- **Approval**: `v > 60` never fires for any realistic month value, so the Mall
  Director rent-free control is bypassed regardless.
- **CAM** is unaffected — `camAmount` accrues during rent-free months
  (`billing-schedule.util.ts:123` sits outside the `if (!inRentFree)` guard).
  That appears deliberate.

### 2.4 Affected entities and fields

| Entity | Field | Downstream effect |
|---|---|---|
| `Proposal.rentFree` | Int | approval routing, deal score, scenario valuation, copied to Contract |
| `Contract.rentFree` | Int | **billing schedule generation** (real money) |
| `ProposalScenario.terms.rentFree` | Json | scenario `totalValue` only |
| `ApprovalPolicyRule.threshold` where `conditionType = RENT_FREE_DAYS` | Int | routing threshold, currently `60` |

### 2.5 Verdict

- Existing records **cannot** be automatically classified by unit.
- Manual reconciliation is required for any non-zero `rentFree` on a live
  Proposal or Contract in production.
- The population needing review is small and precisely identifiable:
  `SELECT ... WHERE "rentFree" > 0` on `Proposal` and `Contract`.
- In every dataset reachable from here that set is **seed-only**, so no
  reconciliation is needed for local or demo environments beyond re-seeding.

---

## Step 3 — Canonical invariants (proposed, not yet enforced)

**RENTFREE-01** — `rentFree` has exactly one unit platform-wide.
Working canonical unit: **MONTHS**, because billing — the only consumer that
moves money — already implements months, and changing billing to days would alter
the charge computation for every existing contract.

**RENTFREE-02** — billing, proposal valuation, approval routing, UI labels and
persistence all use that one unit.

**RENTFREE-03** — no implicit days↔months conversion anywhere. If a day-granular
rent-free is a genuine business need, it requires its own explicitly named field,
not a reinterpretation of this one.

**RENTFREE-04** — approval thresholds are expressed in the canonical unit, and
the condition type is named for that unit.

Consequence of RENTFREE-01 + the `Int` column type: **rent-free periods shorter
than one month become unrepresentable.** This needs business confirmation — see §4.

---

## Step 4 — Approval policy: BUSINESS_CONFIRMATION_REQUIRED

Current seeded rule (`seed.ts:245-254`):

```
code:          MALL_DIRECTOR_LONG_RENT_FREE
name:          "Mall Director on rent free > 60 days"
conditionType: RENT_FREE_DAYS
operator:      >
threshold:     60
```

Because `ctx.rentFreeDays` is fed `proposal.rentFree`, which billing treats as
months, this rule effectively reads *"rent-free greater than 60 **months**"*. On
realistic lease terms it **can never fire**. The Mall Director escalation for long
rent-free periods is currently dead.

**Two questions must be answered by the business before any value is changed:**

1. Was the intended threshold **60 days** (≈2 months), or was "60" chosen against
   some other understanding? Do not assume "> 60 days" ⇒ "> 2 months" — the audit
   brief explicitly forbids that mechanical substitution, and rounding 60 days to
   2 months silently changes the rule for a 61-day period.
2. Does the business ever grant rent-free in **days** rather than whole months
   (e.g. 45 days)? If yes, MONTHS-as-canonical is wrong and the column type must
   change; if no, MONTHS is safe and `Int` is adequate.

**Recommended technical shape once answered** — rename the condition so the unit
is self-evident rather than editing a number under a misleading name:

- `RENT_FREE_DAYS` → `RENT_FREE_MONTHS` (new condition type; keep the old one
  recognised for a deprecation window so existing `ApprovalPolicyRule` rows do not
  silently stop matching), and
- `PolicyContext.rentFreeDays` → `rentFreeMonths`.

Note this is **admin-editable data**, not only code: `ApprovalPolicyTab.tsx` lets
an ADMIN edit these thresholds, and `ApprovalPolicyTab.tsx:55` hardcodes the
suffix `' ngày'`. Any existing tenant-configured rules carry the same ambiguity.

---

## Step 5 — Duplicate totalContractValue formulas

**Three** live implementations, differing on two independent axes — whether
rent-free is deducted, and whether CAM is included:

| # | Location | Formula | rentFree | CAM | UI-reachable |
|---|---|---|---|---|---|
| 1 | `booking.service.ts:1016` | `monthlyRent * term` | **ignored** | **excluded** | **yes** — both dialogs |
| 2 | `proposals.service.ts:85-86` | `discountedRent * (term - rentFree) + monthlyCAM * term` | months | included | **no** — dead API |
| 3 | `proposal-scenario.service.ts:96` | `monthlyRent * (term - rentFree)` | months | **excluded** | **yes** — scenarios |
| — | `seed.ts:978` | `monthlyRent * term` | ignored | excluded | n/a |

Live consequence: a proposal's headline value (#1) and the value of a scenario
built from the same terms (#3) **disagree whenever `rentFree > 0`**, and neither
matches the definition in #2. With `rentFree = 30, term = 36`, #3 yields
`monthlyRent × 6` against #1's `monthlyRent × 36` — the comparison screen shows an
83% drop that reflects no real change in terms.

**FIN-CALC-01** — every screen, proposal, approval decision, contract conversion,
PDF and report must derive `totalContractValue` from one shared function. The
canonical definition still needs a business answer on two points: is CAM part of
"total contract value", and is the discount applied before or after the rent-free
deduction.

---

## Step 6 — Silent defaults in `convertToProposal`

`booking.service.ts:1040-1066`. Classification:

| Default | Value | Class | Justification |
|---|---|---|---|
| `rentFree ?? 0` | 0 | **TECHNICAL_FALLBACK** | safe — 0 means "no concession" |
| `escalationPercent ?? 0` | 0 | TECHNICAL_FALLBACK | safe |
| `deposit ?? 3` | **3 months** | **BUSINESS_DEFAULT** | a real commercial term; not shown as a default anywhere |
| `fitoutDays ?? 90` | **90 days** | **BUSINESS_DEFAULT** | Booking dialog has no such field → **every** proposal from that screen silently gets 90 |
| `paymentTermDays ?? 30` | **30 days** | **BUSINESS_DEFAULT** | Spaces dialog has no such field → silently 30 |
| `depositFitout ?? 0` | 0 | **UNKNOWN** | is "no fit-out deposit" a real business position, or an unfilled field? |
| `fitoutFee ?? 0` | 0 | **UNKNOWN** | same |
| `utilityFee ?? 0` | 0 | UNKNOWN | same |
| `afterHoursFee ?? 0` | 0 | UNKNOWN | same |
| `depositLease` (undefined) | auto-computed | TECHNICAL_FALLBACK | documented: `null = deposit × monthlyRent` |
| `serviceFeeSqm ?? booking.serviceFeeSqm ?? 0` | inherit | TECHNICAL_FALLBACK | correct — inherits negotiated value |
| `handoverDate` (undefined) | **NULL** | **TECHNICAL_FALLBACK with lifecycle impact** | Booking dialog never sends it → flows to `FitoutProject.handoverDate` as NULL — ties to LIFE-001 |
| `openingDate` (undefined) | NULL | TECHNICAL_FALLBACK | same |

The rule to apply: **a field a particular UI never rendered must not silently
become a contractual value.** `deposit`, `fitoutDays` and `paymentTermDays` each
violate this today. They should either appear in both forms with the default
pre-filled and visible, or be rejected as missing.

---

---

# IMPLEMENTED — 2026-09-06

Business decisions received; normalization carried out. **No production data was
mutated.**

## Confirmed business decisions

1. **Canonical unit: MONTHS.** `rentFree` = whole billing months of Base Rent
   concession. Never days, anywhere.
2. **No day-based concessions in this field.** A future day-granular concession
   needs its own explicitly named concept. `fitoutDays` stays a separate
   day-based field.
3. **Mall Director rule: rent-free > 2 months.** 0/1/2 → no escalation, 3+ →
   Mall Director.
4. **TCV = net Base Rent over billable months + CAM over the full applicable
   term.** Deposits excluded. VAT and usage-based utility/after-hours charges
   excluded. Discount applies to Base Rent before aggregation. CAM continues
   during rent-free.

## The canonical calculator

`apps/backend/src/common/finance/rent-calculation.util.ts` is now the single
source of truth. It exports:

- `applyEscalation` — compound annual, unchanged semantics;
- **`baseRentForMonthIndex`** — the shared primitive: Base Rent for one month
  after rent-free waiver and escalation;
- `computeContractValue` — canonical TCV.

`generateBillingPeriods` (billing-schedule.util.ts:118-127) now derives its
per-month rent from `baseRentForMonthIndex` and applies its own day-proration on
top. **Proposal valuation and billing schedule therefore sit on the same
primitive and cannot drift apart** — the cross-layer test asserts they produce
identical totals, including with escalation.

Escalation is summed month by month rather than multiplied flat, per the
instruction not to assume flat multiplication: a 24-month lease at 8% now values
at `12×base + 12×base×1.08`, not `24×base`.

## Duplicate formulas removed (3 → 1)

| Was | Now |
|---|---|
| `booking.service.ts:1023` `monthlyRent * dto.term` (ignored rentFree **and** CAM) | `computeContractValue(...)` |
| `proposals.service.ts:85` `discountedRent * (term - rentFree) + monthlyCAM * term` (ignored escalation) | `computeContractValue(...)` |
| `proposal-scenario.service.ts:96` `(baseRent + cam) * (1-discount) * (term - rentFree)` (discounted CAM, waived CAM during rent-free, ignored escalation) | `computeContractValue(...)` |

The scenario formula had two additional defects the consolidation fixes: it
applied the discount to CAM, and it waived CAM during rent-free months. Both
contradict the confirmed definition.

## Approval policy

- New canonical condition `RENT_FREE_MONTHS`; seeded rule
  `MALL_DIRECTOR_LONG_RENT_FREE` is now `RENT_FREE_MONTHS > 2`.
- `RENT_FREE_DAYS` removed from `ApprovalPolicyConditionType` — **new rules of
  that type cannot be created** (backend DTO enum + frontend dropdown).
- **Legacy rows still evaluate.** `approval-policy.util.ts:40-75` keeps matching
  persisted `RENT_FREE_DAYS` rows, converting the stored day threshold to months
  at 30 days = 1 month, and logs a one-time deprecation warning naming the rule.
  The conversion is unrounded so a legacy `> 45 days` becomes `> 1.5 months`
  rather than being snapped and silently changing which deals it escalates.
  Silently ignoring these rows would have removed an approval step unnoticed.
- The admin UI still *displays* legacy rows with their stored unit (`ngày`) and
  an "đã ngừng dùng" label, so the reason for migrating is visible.

## Deal scoring — a judgement call worth flagging

`deal-scoring.util.ts:34` penalised `rentFreeDays * 0.2` while already being fed
months. Re-expressed as `rentFreeMonths * 6` (0.2 × 30) to preserve the scoring
behaviour a 30-day concession used to produce. Taking the number at face value
would have collapsed the penalty to 0.2/month, effectively deleting it. **This
coefficient was inferred, not specified — confirm it if deal scores are used for
anything consequential.**

## Silent defaults resolved

| Field | Classification | Resolution |
|---|---|---|
| `deposit` = 3 months | BUSINESS_DEFAULT | now pre-filled and visible in the shared form; submitted explicitly |
| `fitoutDays` = 90 | BUSINESS_DEFAULT | same |
| `paymentTermDays` = 30 | BUSINESS_DEFAULT | same |
| `depositFitout`, `fitoutFee`, `utilityFee`, `afterHoursFee` | **OPTIONAL_ZERO_ALLOWED** | 0 is a legitimate commercial position; rendered zero-prefilled and always submitted explicitly |
| `depositLease` | DERIVED | 0 → backend computes `deposit × monthlyRent`; labelled "0 = tự tính" |
| `handoverDate`, `openingDate` | OPTIONAL | now present in **both** entry points |

Backend `??` defaults are retained for API/legacy compatibility, but no UI flow
depends on them any more.

## Shared conversion form — 100% field parity

`apps/frontend/src/components/proposals/ProposalConversionForm.tsx` is now the
only implementation. Both `ConvertBookingDialog` (Spaces) and
`ConvertToProposalDialog` (Bookings) are thin wrappers over it; the only
behavioural difference retained is the Bookings entry point's post-success
navigation into the new proposal.

Sections: **A. Mặt bằng & Thời hạn · B. Điều khoản Tài chính · C. Tiến độ &
Bàn giao · D. Điều khoản khác.**

### Field parity matrix

| Field | Section | Classification |
|---|---|---|
| area, term, startDate | A | REQUIRED |
| businessModel | A | OPTIONAL |
| rentCurrency | B | REQUIRED (defaults to booking currency) |
| rentPerSqm | B | REQUIRED |
| camPerSqm, serviceFeeSqm, businessSupportFeeSqm | B | OPTIONAL_ZERO_ALLOWED |
| deposit | B | VISIBLE_BUSINESS_DEFAULT (3) |
| **rentFree** | B | OPTIONAL_ZERO_ALLOWED — **MONTHS** |
| escalationPercent | B | OPTIONAL_ZERO_ALLOWED |
| paymentTermDays | B | VISIBLE_BUSINESS_DEFAULT (30) |
| depositLease | B | DERIVED |
| depositFitout, fitoutFee, utilityFee, afterHoursFee | B | OPTIONAL_ZERO_ALLOWED |
| fitoutDays | C | VISIBLE_BUSINESS_DEFAULT (90) |
| handoverDate, openingDate | C | OPTIONAL |
| operatingHours, specialConditions, notes | D | OPTIONAL |
| exchangeRate | — | NOT_APPLICABLE in this form (inherited from Booking server-side) |

A regression test submits through **both** wrappers and asserts the two payloads
are deeply equal — the assertion that would have failed before consolidation.

The form also warns inline when rent-free exceeds 2 months that Mall Director
approval will be required, so the governance consequence is visible at entry.

### Incidental fixes made while consolidating

See the dedicated section below — the NumericFormat/RHF defect was remediated
properly in a follow-up pass rather than patched.

## Data safety — nothing was rewritten

Per instruction, no `Proposal.rentFree` or `Contract.rentFree` value was
modified. A read-only reconciliation script is provided at
`apps/backend/prisma/scripts/rent-free-reconciliation.sql`. It lists every
non-zero row with tenant, unit, mall, term, the value as a percentage of term, a
plausibility assessment, and — for contracts — whether billing has already
invoiced against it. Section 4 lists any surviving `RENT_FREE_DAYS` policy rules.

`prisma/seed.ts` no longer seeds `rentFree: 30` (which billing reads as a
30-month concession on a 36-month lease). It seeds `3`, which is realistic and
also exercises the "> 2 months" escalation path.

## Tests

23 backend tests in `rent-calculation.util.spec.ts` and 13 frontend tests in
`ProposalConversionForm.test.tsx`, covering all 17 required cases.

The mandated cross-layer test is
`SEM-001 CROSS-LAYER: one value, one unit, four layers`. It takes a single
`rentFree = 3` and asserts that proposal valuation yields 9 billable months,
approval routing escalates to Mall Director, the billing schedule zeroes Base
Rent for exactly the first 3 periods while still charging CAM in all of them, and
the billed totals equal the proposal's TCV. **Before this change it would have
failed at the approval layer** (`3 > 60` was false), which is the defect it
exists to prevent recurring.

---

# FORM-001 — NumericFormat / react-hook-form controlled-value defect

Remediated 2026-09-06, after the semantic normalization. **No business rule was
changed** — rent-free semantics, billing, approval rules, handover and currency
logic were all left untouched.

## Root cause

`components/ui/input.tsx:16-41` — `<Input type="number">` does not render a
native `<input>`. It renders a **controlled** `NumericFormat` driven by its
`value` prop. React-hook-form's `register()` returns only
`{name, onChange, onBlur, ref}` — **no `value`**. So:

1. NumericFormat receives `value={undefined}` and falls back to its own internal
   state;
2. on `reset()`, RHF writes through the ref directly to the DOM node
   (`getInputRef`), and NumericFormat overwrites that on its next render;
3. the field therefore keeps showing the *previous* record's number — or nothing.

The bridge also emitted `values.value` (the raw **string**), so even a working
binding put strings into form state.

The old Spaces dialog used `register()` on every numeric field, so it carried
this defect. Reopening it for a second booking showed the first booking's
figures.

## Fix

New `components/form/NumericField.tsx` — NumericFormat bound through
`useController`, the supported integration for a controlled third-party input.
`components/ui/input.tsx` now exports `INPUT_BASE_CLASS` so the field matches the
design system without duplicating styles. No DOM manipulation, no reliance on
`defaultValue` after mount.

Semantics:

| Concern | Behaviour |
|---|---|
| Form state | holds `number`, or `null` when empty |
| Zero | `field.value ?? ''` — a real `0` renders as "0", never blank |
| Empty vs zero | cleared field → `null`; typed zero → `0`; distinguishable |
| Decimals | `decimalScale` per field kind; integer kinds reject fractions at input |
| Separators | display-only; payload carries numeric primitives |
| Feedback loop | `onValueChange` ignores `sourceInfo.source === 'prop'`, so a reset is not echoed back into form state |

`buildProposalPrefill` now returns numbers (`null` when absent) instead of
strings, so form state is authoritative end to end.

## Field inventory

| Field | Kind | Decimals |
|---|---|---|
| area | DECIMAL | 2 |
| term | MONTHS | 0 |
| rentPerSqm, camPerSqm, serviceFeeSqm, businessSupportFeeSqm | CURRENCY_AMOUNT | 2 |
| deposit | MONTHS | 0 |
| **rentFree** | **MONTHS** | **0** |
| escalationPercent | PERCENT | 2 |
| paymentTermDays | DAYS | 0 |
| depositLease, depositFitout, fitoutFee, utilityFee, afterHoursFee | CURRENCY_AMOUNT | 2 |
| fitoutDays | DAYS | 0 |
| exchangeRate | DECIMAL | 2 (not rendered in this form) |

Integer kinds have `decimalScale: 0`, so `rentFree` cannot take a fractional
month through the UI — consistent with the `Int` column and with business
decision 2.

## Validation

Required fields (`area`, `term`, `rentPerSqm`, `startDate`) validate through RHF
rather than a hand-rolled `canSubmit` flag. On failure the message renders with
`role="alert"` and is linked to its input via `aria-describedby`; the input gets
`aria-invalid`. The submit button is no longer pre-disabled, so a user gets told
*which* field is missing instead of facing an inert button.

## Accessibility

The `htmlFor`/`id` associations added during consolidation are kept and extended:

- every numeric field is labelled by exactly one `<label htmlFor>`;
- ids come from `useId`, asserted unique across the dialog;
- error text is associated via `aria-describedby`;
- required state exposed as `aria-required`;
- tab order verified between adjacent numeric fields.

**A real defect was caught here by the new tests**: Radix `Select` does not
forward an `id` from its root to the trigger button, so the labels for
"Mô hình Kinh doanh" and "Đơn vị tiền tệ" pointed at non-existent elements. Both
now use a `SelectField` helper that puts the id on `SelectTrigger`.

## Tests

`ProposalConversionForm.test.tsx` — 33 tests. The reset coverage was verified to
actually catch the defect: removing the `value` prop from `NumericField`
(reproducing exactly what `register()` supplies) makes the two reset tests fail
with `expected '' to be '100'`. Restoring it returns 33/33.

`proposal-prefill.test.ts` assertions were updated from strings to numbers. The
currency-boundary fallback rules those tests protect are unchanged.

## Remaining business decisions

1. The deal-scoring coefficient (6 per rent-free month) was inferred.
2. Legacy `RENT_FREE_DAYS` policy rows — if any exist in production, the shim
   keeps them working, but each still needs a decision on its migrated threshold.
   Section 4 of the reconciliation script lists them.
3. `Proposal.rentFree` / `Contract.rentFree` remain `Int`, so sub-month rent-free
   is unrepresentable. Accepted under decision 2, recorded here in case it
   surfaces later.
