# Golden ERP Business Journeys

Status: CANONICAL WORKING MAP

| Journey | Authoritative outcome | Golden scenarios |
|---|---|---|
| Lead to Booking | eligible unit is reserved for the selected party without bypassing Mall scope | GS01-GS04 |
| Proposal to Approval | commercial terms follow the implemented approval model; UI does not invent states | GS03-GS04 |
| Contract activation | valid approved commercial context becomes an active Contract atomically | GS04-GS05 |
| Fitout to opening | one Fitout Project advances through configured gates; opening synchronizes Unit state | GS05, GS08-GS10 |
| Invoice to payment | persisted currency and backend balance remain authoritative | GS06-GS07 |
| Cross-Mall isolation | records, files, exports, reports and mutations remain Mall-scoped | GS11-GS15 |

Golden UI changes may improve decision clarity, density, localization and responsive behavior, but may not redefine these outcomes.

## Automated fixture evidence — 2026-08-24

`node scripts/golden-journey-evidence.mjs` performs read-only checks against the
current Compose PostgreSQL database. It evidences 5/8 fixture segments:

- Lead → Booking → approved Proposal workflow → Contract: 2 chains.
- Active Contract → Fitout Project + Billing Schedule: 13 contracts.
- Invoice → Payment: 15 invoices.
- Resolved/closed operational Ticket: 6 tickets.
- Persisted Contract/Invoice currency variants: VND, USD and MMK represented.

Missing fixture coverage is explicit: no rejected workflow, no single linked
Lead→Collection record and only one Mall. This evidence supports integration
review but is not a substitute for the 12-scenario live/human UAT matrix.
