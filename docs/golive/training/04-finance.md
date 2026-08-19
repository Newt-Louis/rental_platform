# Quick Guide — Finance

**Note on format:** text-only, no screenshots — see `01-sales-crm.md`'s note.

## What do I use this for?

Billing — invoice generation, issuing, payment recording, AR/overdue
tracking, and reconciliation.

## What do I need to do daily?

- Check the Billing screen's pending/draft invoices — most are generated
  automatically on the 1st of each month from each active Contract's
  billing schedule, but you can also generate or issue individual ones
  manually.
- Record payments as they come in, against the correct invoice.
- Review overdue invoices and the dunning (reminder) history.

## Critical workflow

```text
Contract activated
  → Billing schedule generated automatically (you can view it on the
     Contract detail screen — look for the "Billing" readiness badge)
  → Monthly cron generates DRAFT invoices from schedule periods that are
     due (or you can trigger this manually)
  → Issue the invoice (moves it to ISSUED, tenant notified if that
     setting is on) — recalculates totals from the line items first, so
     make any line-item corrections before issuing, not after
  → Record payment(s) against the invoice — partial payments are
     supported, status updates automatically (PARTIALLY_PAID → PAID)
```

**Retrying a payment or issue action is safe.** If a request times out
and you're not sure it went through, it's safe to try again — the system
is designed to avoid creating a duplicate payment or double-issuing.

## Common errors

- **"Invoice is not DRAFT"** trying to issue — it's already issued, paid,
  or cancelled; check its current status first.
- **A Contract shows "Billing chưa lên lịch" (billing not scheduled)** —
  this shouldn't normally happen for an ACTIVE contract; escalate as a P2
  if you see it (per `docs/golive/SUPPORT_MODEL.md`'s severity model) —
  it may indicate the automatic schedule generation failed.
- **Can't record a payment exceeding the outstanding balance** — this is
  intentional; use an adjustment/credit note instead if the amount is
  genuinely different from what's owed.

## Where to get support

See `docs/golive/SUPPORT_MODEL.md`.
