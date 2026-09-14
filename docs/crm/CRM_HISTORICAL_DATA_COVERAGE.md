# CRM historical data coverage

`CRM_EVENT_LEDGER_ACTIVATION_AT` defaults to `2026-09-12T00:00:00.000Z`. Coverage before that instant is `PARTIAL`.

No status, actor, reason, Mall, or occurrence timestamp is backfilled from `Lead.updatedAt`, current Proposal/Booking state, or current Lead status. Those values are snapshots, not evidence.

- New Lead lifecycle mutations, Lead activities, and Lead-bound follow-up actions write immutable events.
- Pre-activation LeadActivity rows may appear as `LEGACY_SOURCE_RECORD`, never as reconstructed transitions.
- CustomerActivity remains source-specific pending BC-016; comments remain withheld pending BC-028.
- Timeline and KPI responses expose coverage, activation instant, and a Vietnamese warning.
- Historical KPI values with no evidence are `null`, not zero. Current distribution and currency-bucketed pipeline values remain valid snapshots.
- KPI evidence queries are capped at 5,000 events and expose `evidenceTruncated`.

Management use requires full cohort coverage and reconciliation. Auto-LOST remains `DRY_RUN` until BC-029 separately approves the rule and meaningful-contact coverage.

