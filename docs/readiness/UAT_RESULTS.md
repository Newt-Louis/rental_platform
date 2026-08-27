# UAT Results — Post Option B / Production Hardening A

**Status:** PARTIAL EVIDENCE (security/permission boundaries live-verified;
full business-flow walkthroughs and the human usability study not executed
in this pass) · 2026-08-19 · Sprint: Production Hardening A

This converts a slice of `docs/readiness/UAT_PLAN.md` from plan to
evidence: real HTTP calls against the live rebuilt Docker environment
(`leasing-backend`/`leasing-db`/`leasing-frontend` containers, same image
just verified in `docs/reliability/OBSERVABILITY.md`), using real seeded
accounts (`prisma/seed.ts`), not mocks or unit tests. What follows is
honest about what was and wasn't covered — this is not a substitute for
`UAT_PLAN.md`'s full 12-scenario matrix or its new-user usability study,
both of which need either much deeper scripted business-flow execution or
real human testers.

## Entry criteria check against `UAT_PLAN.md`

- P0 credential rotation: **not done** — see
  `docs/security/SECRET_INCIDENT_REMEDIATION.md`, still blocked on the
  user for the live UAT server.
- Seeded data covering **two Malls**: **not met**. This environment's seed
  produces exactly one Mall ("THISO Mall Sala"). This blocks a
  conclusive UAT-10 (cross-Mall scoping) result — see below.
- Two staff roles, two tenant accounts: **met** (8 staff roles seeded,
  10 tenant portal accounts seeded).

Given the unmet Mall-count criterion, results below should be read as
"permission and workflow mechanics verified" rather than "full UAT entry
criteria satisfied."

## Executed: persona access-boundary checks

Logged in as each seeded account (`email` / `User123!` for staff,
`Tenant123!` for tenant-portal accounts) and hit real endpoints with real
JWTs — not simulated.

| Persona | Account | Check | Result |
|---|---|---|---|
| End User (Leasing Executive) | executive@thiso.com | `GET /dashboard` | 200 |
| End User | executive@thiso.com | `GET /crm/leads` | 200 |
| End User | executive@thiso.com | `GET /users` (admin-only) | **403** (correctly denied) |
| End User | executive@thiso.com | `GET /operations/jobs` (ADMIN/CEO-only) | **403** (correctly denied) |
| Manager-Approver (Leasing Manager) | manager@thiso.com | `GET /approvals/pending` | 200 |
| Operator (Operation) | operation@thiso.com | `GET /work-orders` | 200 |
| Operator | operation@thiso.com | `GET /billing/invoices` (Finance-only) | **403** (correctly denied) |
| Finance | finance@thiso.com | `GET /billing/invoices` | 200 |
| Administrator | admin@thiso.com | `GET /operations/jobs`, `GET /operations/metrics` | 200, real ledger data returned |

All role/route boundaries held exactly as designed. No unexpected 200s or
unexpected 403s.

## Executed: mandatory tenant-isolation test (UAT-09)

Logged in as `portal.shopee@thiso.com` (Shopee's tenant-portal account,
`Tenant123!`) and attempted to reach another tenant's (FPT Retail) data by
guessing/using its real IDs, obtained via an admin lookup beforehand:

| Check | Result |
|---|---|
| Own contracts list (`GET /contracts`) | 200, correctly scoped to Shopee's own `tenantId` only |
| FPT Retail's contract by ID (`GET /contracts/:fptContractId`) | **403** |
| FPT Retail's invoice by ID (`GET /billing/invoices/:fptInvoiceId`) | **403** |
| Fitout module (`GET /fitout/projects`, tenant role should have no access) | **404** |
| Legacy unauthenticated static file path (`GET /uploads/contracts/...`) | **404** — confirms the P1 public-uploads fix (`docs/security/PUBLIC_UPLOADS_REMEDIATION.md`) holds under a real cross-tenant login, not just in unit tests |

**Result: PASS.** No cross-tenant disclosure. This is the single most
important negative test in the plan and it holds.

**Not covered:** the new authenticated `FilesController` routes
(`/files/contracts/:fileId`, `/files/documents/:fileId`, etc.) could not be
exercised live here — the seed script creates zero `ContractFile` /
`UnifiedDocument` rows, so there is no real file to attempt cross-tenant
access against in this environment. That path's tenant/role scoping is
covered by the 24 unit tests in `files.controller.spec.ts` instead; it has
not been live-verified end-to-end the way the contract/invoice IDOR checks
above were.

## Executed: idempotent payment retry (UAT-08)

Recorded a payment against a real `OVERDUE` invoice twice, same
`Idempotency-Key` header, same body:

```
POST /billing/invoices/:id/payment  (Idempotency-Key: uat-08-idem-test-...)
→ 200, payment id cmszjbffr001p115775o98v6h
POST /billing/invoices/:id/payment  (same key, same body, immediate retry)
→ 200, same payment id cmszjbffr001p115775o98v6h (not a new one)
```

Verified directly against the database: exactly **one** `Payment` row for
that invoice/reference after both calls.

**Result: PASS.** The retry did not create a duplicate payment.

Note: this check first ran as `finance@thiso.com` and was rejected with
403 "You do not have access to this mall" — not a bug, but confirmation of
a real seed-data gap: only `admin@thiso.com`, `ceo@thiso.com`, and
`director@thiso.com` have any `UserMallAccess` row in the seed data.
Re-ran as `admin@thiso.com` (who does have a grant) to get a clean
idempotency result. Flagged below.

## Not executed in this pass

- **UAT-01 through UAT-07, UAT-11, UAT-12** (full business-flow
  walkthroughs: create Proposal from Booking, submit for approval, approve
  with policy context, reject with reason, convert to Contract, follow
  Fitout/Billing handoff, complete an overdue Ticket, and the release
  rehearsal). These need either substantially more API scripting per
  scenario or an actual UI walkthrough — not done here given the scope
  already covered (security boundaries + the two highest-risk financial/
  data-integrity checks). Recommended as the next UAT session's focus.
- **UAT-10 (cross-Mall access).** Cannot be conclusively tested: this
  environment's seed produces exactly one Mall. A second, distinguishable
  Mall with its own units/leads/contracts is required per `UAT_PLAN.md`'s
  own entry criteria before this scenario can run meaningfully.
- **New-user usability study (NU-01 through NU-04).** Requires 5-8
  recruited representative users with no deep product training, given
  outcome-only prompts and observed live. This cannot be simulated or
  faked with scripted API calls — it needs to be scheduled as a real
  session with real people. Not attempted.

## Findings to carry forward (not fixed in this pass — out of scope for a UAT run)

- **Seed data grants `UserMallAccess` to only 3 of 8 staff roles**
  (`admin`, `ceo`, `director`). `finance`/`executive`/`manager`/`operation`
  have none, yet successfully read several list endpoints (200, not 403).
  With only one Mall in the seed and most seeded records carrying
  `mallId: null` (e.g. Leads), this could not be distinguished from
  correct behavior in this environment — `MallAccessGuard`
  (`apps/backend/src/common/guards/mall-access.guard.ts`) only validates
  mall access when a request references a concrete `mallId`/resource ID;
  plain list endpoints without a mall filter aren't checked by the guard
  itself and must self-scope in their service layer. Whether every list
  endpoint actually does that correctly could not be confirmed here — it
  needs the same two-Mall dataset UAT-10 needs. Flagged, not
  investigated further in this pass.

## Exit-criteria assessment against `UAT_PLAN.md`

- "Zero cross-tenant/Mall disclosure or unauthorized mutation" — **met for
  the checks executed** (tenant isolation, role boundaries); **not fully
  assessed** for Mall-level isolation (single-Mall seed) or for the
  business-flow scenarios not executed.
- "Zero duplicate financial/workflow side effect under retry/concurrency" —
  **met for the one case executed** (payment idempotency); Proposal→Contract
  concurrency was addressed at the code level earlier in this sprint
  (`docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md`) but not re-verified
  live here.
- New-user study targets — **not assessed**, study not run.

**Overall: this is not a full UAT sign-off.** It is live evidence that the
highest-risk security and data-integrity properties hold under real
conditions. The remaining business-flow scenarios and the usability study
are real, unclosed items — not silently dropped.
