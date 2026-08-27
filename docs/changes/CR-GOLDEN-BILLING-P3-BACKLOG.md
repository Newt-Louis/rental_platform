# CR-GOLDEN-BILLING — P3 copy and localization backlog

**Status:** P3 / NON-BLOCKING

**Golden Billing status:** APPROVED / CLOSED

These items do not affect business logic, money correctness, authorization,
workflow, API contracts, or Golden UI approval:

1. Move remaining hard-coded Vietnamese operational copy in Billing detail,
   pending receivables, AR Aging, and Collection KPI surfaces into the existing
   `billing` locale namespace.
2. Normalize optional English terminology for `Billing`, `AR Aging`, `DSO`,
   and source labels without changing backend enums or financial semantics.
3. Remove legacy unused workflow locale keys after confirming no remaining
   consumer references them.

No implementation is authorized by this backlog. Handle it as a separate P3
localization cleanup only.
