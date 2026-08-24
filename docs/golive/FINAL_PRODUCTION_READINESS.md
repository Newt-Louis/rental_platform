# Final Production Readiness Gate — Report

**Date:** 2026-08-19 · Release Candidate: **RC1**
(`2701bd1a8f61e5434ccc44615029c9954d89f108`)

> **Superseded by RC3** (`c61fdb9`, 2026-08-20 — Multi-Currency Foundation,
> VND/USD/MMK; see `docs/golive/RELEASE_CANDIDATE.md` and
> `docs/program/MULTI_CURRENCY_COMPLETION.md`). Unlike RC2 (docs/CI tooling
> only), RC3 is real application code, so its own Functional/Reliability
> evidence is newer than what's quoted below (368/368 tests, 17/17
> reconciliation checks) — see `docs/golive/FINAL_GO_LIVE_MATRIX.md` for the
> updated rows. The **verdict below is otherwise unchanged**: still NO-GO,
> gated on the same pre-existing, unrelated, human/DevOps-owned operational
> blockers (credential rotation, off-site backup, git-history remediation) —
> none of which RC3 touches or resolves. RC3 does add one new UAT-scope item
> not covered by this report: the full lifecycle should be re-tested with
> VND, USD, and MMK before go-live.

## Release Candidate

RC1 — 7 commits on top of the `CONDITIONAL GO` baseline (`c317ad0`),
covering this program's complete reliability pass across Proposal,
Contract, Billing, Fitout, and Booking. Full detail:
`docs/golive/RELEASE_CANDIDATE.md`. Not built into a Docker image, not
deployed anywhere.

## Tests

**359 / 359** backend tests passing, 67/67 suites. `npx tsc --noEmit`
clean. Frontend suite unchanged by this program (pre-existing gap tracked
separately, `docs/reliability/TEST_BASELINE_REMEDIATION.md`).

## Build

**PASS** (typecheck). No production Docker image built this pass.

## Known P0

**0.**

## Known Critical P1

**0.** Every P0/P1 reliability finding raised across this entire program
(Phases 2 through 6 and the Backbone Consolidation Gate) is resolved.
7 open backlog items remain, all P2/P3 — see "Reliability backlog
disposition" below.

## Secret Rotation

**NOT DONE.** `docs/golive/CREDENTIAL_ROTATION_EVIDENCE.md` — 0 of the
identified exposed credentials (Postgres password, JWT secret, Anthropic
API key, UAT SSH password) have been rotated. This is a **human action**
this environment has no authorization or access to perform. **Triggers
this gate's automatic NO-GO condition.**

## Git History

**NOT REMEDIATED**, blocked on the item above by design (rotate before
rewrite, so collaborators aren't invalidated against credentials that are
still the live ones). `docs/security/SECRET_INCIDENT_REMEDIATION.md`.

## Security

Code-level: **clean.** `scripts/secret-scan.mjs` — 0 issues across 344
tracked files. `npm audit` — 0 critical in backend or frontend; all
existing high/moderate findings are pre-documented, deferred
major-version bumps, none newly introduced by this program.
Operational: see Secret Rotation above.

## Tenant Isolation

Code-level and unit-test coverage: **strong** — every hardened flow in
this program carries explicit tenant/mall-scoping tests. Live evidence:
**partial** — `docs/readiness/UAT_RESULTS.md`'s cross-tenant IDOR check
passed for Contract/Invoice; Fitout-document cross-tenant access and
cross-Mall isolation were not live-tested (single-Mall seed data, no
Fitout documents seeded). No violation found anywhere tested.

## Data Reconciliation

**13 / 13 live-data invariant checks clean**
(`scripts/backbone-reconciliation.mjs`, re-run this gate against the
current database), including the two most safety-critical checks this
program's atomicity work exists to guarantee: 0 duplicate Contracts per
Proposal, 0 duplicate ACTIVE Bookings per Unit.

## Backup

**Mechanism proven, off-site destination missing.** Database backup/
restore live-drilled and passing (`docs/readiness/BACKUP_RESTORE_READINESS.md`)
— but local-disk-only (no `BACKUP_OFFSITE_COMMAND` configured anywhere).
Uploaded files have **no backup mechanism at all.** **Triggers this
gate's automatic NO-GO condition** (no usable off-site production
backup).

## Restore

**Demonstrated at dev-scale**, not production-scale. 124 tables restored
and verified in 8 seconds against a ~426KB dataset — the mechanism works
correctly end-to-end, but this is not evidence of the 4-hour production
RTO target at real data volume.

## Monitoring

Health/readiness endpoints, job-execution ledger, and process metrics are
**live and verified this gate** (direct API calls against the running
container: `/health/ready` → all components up; `/operations/jobs` → 6
jobs, all `SUCCEEDED`, 0 consecutive failures). **No automated alerting
exists anywhere** — someone has to actively check these endpoints; nothing
pages anyone on a critical failure yet. Documented as a target spec in
`docs/reliability/OBSERVABILITY.md`, not live.

## Deployment

Procedure is complete and specific (`docs/OPERATIONS_RUNBOOK.md` §2-4),
reused rather than rebuilt this gate. **Unexercised against RC1
specifically** — no image has been built or deployed from this commit.

## Rollback

Decision procedure is specific and evidence-based
(`docs/OPERATIONS_RUNBOOK.md` §9), including the migration-compatibility
discipline that makes application-only rollback safe in the common case.
**Not rehearsed live** — this gate's own rule (section 28) asks for at
least one live rollback test, which requires a live deployment that
doesn't exist yet.

## UAT

**Partial evidence, not a sign-off.** Role/permission boundaries and one
payment-idempotency check are live-verified. The full business-flow
matrix (Booking→Proposal→Approval→Contract→Fitout/Billing→Handover),
cross-Mall access, and the human new-user usability study are **not
executed** — none of these can be produced by this environment; they
need real recruited users, a second seeded Mall, and scheduled sessions.

## Training

**Not created.** No quick-start or role-based workflow guides exist in
this repo yet.

## Support

**Proposed, not staffed.** `docs/golive/SUPPORT_MODEL.md`, written this
gate, reuses `OPERATIONS_RUNBOOK.md`'s existing incident playbooks — but
has no named on-call individuals.

## GO-LIVE DECISION: **NO-GO (for full Production)**

Two of this gate's own automatic NO-GO conditions are triggered:
unrotated live credentials, and no usable off-site backup. Per this
gate's explicit rule (section 50), either alone overrides any
CONDITIONAL GO the rest of the evidence would otherwise support.

**This is not a statement that the engineering work is unready.** Split
explicitly, because the two halves are genuinely different kinds of
readiness:

```text
ENGINEERING / RELIABILITY GATE:  PASS
  0 P0, 0 P1, 359/359 tests, 13/13 live invariants clean,
  every named reliability cluster from Phases 2-6 closed.

PRODUCTION GO-LIVE GATE:         NO-GO
  Blocked entirely by operational/human-action items this
  environment cannot perform — not by any code defect.
```

## Blocking Actions (must complete before a full Production GO)

1. **Rotate all exposed credentials** (Postgres, JWT, Anthropic API key,
   UAT SSH password) on the real UAT/production infrastructure, then
   revoke the old ones. *Human action, outside this environment.*
2. **Configure an off-site backup destination** (`BACKUP_OFFSITE_COMMAND`)
   and re-run the restore drill against it. *Human/DevOps decision.*
3. **Rewrite git history** to remove the leaked secrets, after #1, with
   collaborator notification (invalidates existing clones). *Human
   action, destructive, requires explicit authorization.*
4. **Execute full human UAT**: the business-flow matrix, cross-Mall
   isolation (needs a second Mall seeded), and the new-user usability
   study (needs 5-8 recruited testers). *Human coordination.*
5. **Add an uploaded-file backup mechanism** — currently none exists.
6. **Stand up monitoring/alerting** — at minimum, the alert set already
   specified in `docs/reliability/OBSERVABILITY.md`.
7. **Prepare lightweight training material** and staff the proposed
   support model with named individuals.

None of these are code-level reliability gaps — they are the exact set of
items this program has consistently flagged since Phase 0 and carried
forward without ever marking resolved until genuinely closed.

## Accepted Risks (reliability backlog disposition)

Per section 47-48 (do not require the backlog to be zero — only P0/critical-P1
zero, with everything else understood and owned):

| ID | Item | Disposition | Reason |
|---|---|---|---|
| 8 | Approval `step-advanced` event not retried | **POST-GO-LIVE** | Notification-only, state already committed atomically before the event fires — no correctness risk, evaluated three times across this program |
| 10 | Termination-cancel stale-schedule edge case | **POST-GO-LIVE** | Narrow (requires an amendment mid-termination), a schedule already exists from prior activation, not a "no schedule at all" case |
| 11 | Dunning-vs-payment timing window | **POST-GO-LIVE** | Accepted eventual-consistency window; at most one stale reminder, never repeating |
| 12 | Outstanding-AR formula duplicated across 5 call sites | **POST-GO-LIVE** | Verified mathematically identical today; a refactor-only consistency risk, not a live bug |
| 16 | Fitout stage-advance has no Contract-status guard | **ACCEPT BEFORE GO-LIVE, fix immediately after** | P2 — 0 live occurrences, directly parallels an already-fixed Billing-side guard, cheap fix; **not fixed in this gate** per the Release Freeze rule (only P0/P1 fixes allowed during a readiness gate) |
| 18 | Seed script's demo-data hygiene | **POST-GO-LIVE** | Dev/demo-data concern only — production will not run `prisma/seed.ts` |
| 21 | Booking-number generation has no explicit P2002 handling | **POST-GO-LIVE** | Low probability; Serializable isolation should already prevent the trigger condition |

Every accepted item has an owner (the phase that found it), a reason, and
an implicit target (post-go-live follow-up, except item 16 which is
recommended as the very next small change once the freeze lifts).

## Recommended Pilot

Once blocking actions 1-3 are complete (credentials, off-site backup,
git history — the three genuinely irreversible/access-gated items), a
**controlled internal pilot** — not a full production rollout — is
reasonable even before items 4-7 are fully mature, provided:
- Pilot scope is one real Mall/business unit with a small user group, not
  synthetic data (per this gate's own pilot-scope guidance).
- A manual, human-watched substitute for automated alerting is in place
  for the pilot's duration (someone checks `/health/ready` and
  `/operations/jobs` on a schedule until real alerting exists).
- Support Tier L2/L3 (this program's engineering team) is actually
  reachable during the pilot window, even without a fully staffed L1.
- The uploaded-file backup gap is either closed first or the pilot
  explicitly avoids being the only copy of anything irreplaceable during
  its window.

## Next Action

Handed to the business/operations owner: complete blocking actions 1-3
(all outside engineering's reach), schedule the human UAT session
(action 4), and decide on monitoring/training/support investment level
for the pilot scope chosen. This program's engineering deliverable is
complete and does not block on further code changes — the remaining path
to Production is entirely in "human action required" territory this
report has now itemized precisely, not left as a vague "operational
readiness" checkbox.
