# System Truth — 06 — Business Invariants

> **TEMPLATE — NOT YET POPULATED.** An invariant is a rule that must
> always hold across the platform. List only invariants verified to be
> enforced (or verified to be *assumed but not enforced* — that gap is
> itself an important finding).

## Per-invariant record

### INV-xxx — [Statement]
- **Statement:** (e.g. "An Invoice's currency must equal its Contract's
  currency.")
- **Domains involved:**
- **Enforcement mechanism:** (DB constraint / application validation /
  none found)
- **Enforcement location (file:line):**
- **Verified enforced by test?** yes/no
- **Known ways it can currently be violated (if any):**
- **Severity if violated:** P0/P1/P2/P3

## Candidate invariants to check (starting list — verify each)

- Money amounts are never negative except where explicitly modeling a
  credit/refund.
- An entity's currency, once set at creation, is immutable.
- A Contract cannot have overlapping active status for the same Unit.
- An Invoice cannot exist without a Contract.
- A Booking cannot double-allocate the same Slot for overlapping time.
- Every Tenant Portal user is scoped to exactly the Tenant(s) they belong
  to.
- A cross-Mall user action is denied unless the user's role explicitly
  grants cross-Mall scope.

## Invariant violation register

| INV-xxx | Enforced? | Evidence | Risk if violated |
|---|---|---|---|
