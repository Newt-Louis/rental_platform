# Cross-Module Invariants

Status: ENFORCED PROGRAM BASELINE

1. Persisted document currency propagates downstream; current Mall currency cannot rewrite history.
2. Amounts in worklists are exact numeric values with an explicit ISO currency field/column.
3. Backend status/state-machine values are authoritative; frontend maps them to localized presentation only.
4. Mall and Tenant access is enforced at data-query level, not only by route guards or UI hiding.
5. Booking eligibility and queue semantics are backend-authoritative.
6. Invoice `balance` is backend-authoritative; the UI does not replace it with a local formula.
7. One active Contract creates at most one Fitout Project; retried activation is idempotent.
8. Fitout stage advancement is forward-only and respects configured document gates and override authority.
9. Fitout `OPENED` synchronization with Unit occupancy occurs in the backend transaction boundary.
10. Checklist/issues are operational context unless an implemented backend rule explicitly makes them a gate.
11. Exports preserve active scope, raw amounts and explicit currency, and disclose truncation.
12. Protected Golden modules are not modified by later waves without explicit authorization.
