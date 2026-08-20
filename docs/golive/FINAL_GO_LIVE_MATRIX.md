# Final Go-Live Matrix

**Date:** 2026-08-19 · Release Candidate: RC1 at the time this matrix was
first written; superseded by RC2 (`acf6a26e929f7f1ee6f98f2b5e007781e4fb9a44`,
docs/CI tooling only), now **superseded by RC3**
(`c61fdb9`, see `docs/golive/RELEASE_CANDIDATE.md`) — the Multi-Currency
Foundation (VND/USD/MMK). Unlike RC2, RC3 **is** application code; the
Functional and Reliability rows below are updated with RC3's evidence. Every
other row is unaffected — RC3 touches no security/credential/deployment/
performance surface. Overall verdict unchanged (still gated on the
unrelated RED/AMBER rows below); see
`docs/program/MULTI_CURRENCY_COMPLETION.md` for the new UAT-scope item this
adds (re-test the lifecycle with VND/USD/MMK before go-live).

| Area | Status | Evidence | Blocker | Owner |
|---|---|---|---|---|
| Functional | **GREEN** | 368/368 backend tests passing (RC2 baseline 359/359 — +9 this pass, Multi-Currency Foundation); every business-lifecycle transition (Proposal→Approval→Contract→Billing/Fitout→Handover, CRM→Booking) traced against live code and hardened; currency now propagates explicitly VND/USD/MMK across Booking→Proposal→Contract→Billing→Invoice→Payment (`docs/program/MULTI_CURRENCY_COMPLETION.md`) | None | This program |
| Reliability | **GREEN** | `docs/program/RELIABILITY_BACKLOG.md`: 22 tracked findings, 15 resolved, 7 open, **0 P0, 0 P1**; live-data reconciliation **17/17 clean** via `scripts/backbone-reconciliation.mjs` (13 pre-existing + 4 new currency-invariant checks, run against the dev DB reseeded with real USD/MMK data) | None | This program |
| Security (code-level) | **GREEN** | `scripts/secret-scan.mjs`: 0 issues across 344 tracked files; `npm audit`: 0 critical (backend or frontend), all existing high/moderate findings are pre-documented deferred major-version bumps (`docs/security/DEPENDENCY_AUDIT.md`), none newly introduced | None | This program |
| **Credentials (operational)** | **RED** | `docs/golive/CREDENTIAL_ROTATION_EVIDENCE.md` — 0 of 4+ exposed credentials rotated | **Live UAT credentials (Postgres, JWT, Anthropic API key, SSH) still valid and exposed** | Security/DevOps (human) |
| Git history | **RED** | `docs/security/SECRET_INCIDENT_REMEDIATION.md` — old commits with leaked secrets still reachable; rewrite prepared but blocked on credential rotation happening first (rotate-then-rewrite ordering, to avoid invalidating credentials that are still needed before the new ones are live) | Depends on Credentials row above | Security/DevOps (human) |
| Tenant isolation | **GREEN** (code) / **AMBER** (live evidence) | Every hardened flow has direct tenant-scoping tests; live cross-tenant IDOR check passed (`docs/readiness/UAT_RESULTS.md`) for Contract/Invoice; Fitout-document cross-tenant path not live-tested (only unit-tested); cross-Mall isolation entirely untested (single-Mall seed) | Live cross-Mall + Fitout-document UAT not executed | Product Owner (schedule a 2-Mall UAT session) |
| Data integrity | **GREEN** | Duplicate-prevention invariants (Contract-per-Proposal, FitoutProject-per-Contract, ApprovalWorkflow-per-Proposal, ACTIVE-booking-per-unit) all DB-constraint-backed and live-verified at 0 violations | None | This program |
| Backup | **AMBER** | DB backup mechanism works, checksummed, tested (`docs/readiness/BACKUP_RESTORE_READINESS.md`) | **No off-site destination configured** (local-disk-only — shares fate with the primary DB on host failure); **no uploaded-file backup mechanism exists at all** | DBA/DevOps (human — needs an approved off-site storage destination) |
| Restore | **AMBER** | Live restore drill executed and passed this environment (124 tables, 8s wall-clock, dev-scale ~426KB) | Dev-scale only — production-scale RTO unverified; uploads not covered by any restore procedure | DBA/DevOps |
| Monitoring | **RED** | Health endpoints (`/health/live`, `/health/ready`), job ledger (`GET /operations/jobs`), and process metrics (`GET /operations/metrics`) all live and verified working this gate (real curl calls against the running container) | **No alerting platform wired up in any reachable environment** — `docs/reliability/OBSERVABILITY.md`'s alert table is a target spec, not live alerts; someone has to be actively watching the dashboards, nothing pages anyone automatically | SRE/Platform (human — needs a monitoring platform decision) |
| Deployment | **AMBER** | `docs/OPERATIONS_RUNBOOK.md` §2-4 gives a complete, specific pre-deployment gate and smoke-test procedure; migration-on-startup already removed (explicit migration step only) | RC1 has not actually been built into a Docker image or deployed anywhere — the documented procedure is unexercised against this specific RC | DevOps |
| Rollback | **AMBER** | `docs/OPERATIONS_RUNBOOK.md` §9 gives a specific, evidence-based rollback decision procedure (migration-aware, forward-compatible-schema discipline documented) | **Not rehearsed** — section 28 of this gate explicitly asks for at least one live rollback test; none was performed (no live deployment of RC1 exists to roll back) | DevOps |
| Performance | **AMBER** | Historical baseline exists (`docs/readiness/PRODUCTION_GO_LIVE_MATRIX.md`: 5 rps, p95 144ms, 2026-07-17) and `scripts/performance-smoke.mjs` exists with defined thresholds (p95 ≤750ms, error rate ≤1%) | Historical baseline predates this program's changes and is flagged stale in its own source doc; no fresh smoke run performed against RC1 this gate (RC1 isn't deployed anywhere to smoke-test) | Performance owner |
| Concurrency (re-verified) | **GREEN** | Every concurrency-critical flow named in section 23 (same-unit Booking, Proposal submit, Contract activation, Invoice generation/issue, Payment record, Fitout auto-create/stage-advance) has dedicated automated tests simulating the actual Postgres conflict classes (P2002/P2034), not just "doesn't crash" assertions | None | This program |
| UAT | **RED** | `docs/readiness/UAT_RESULTS.md` — partial evidence only: role/permission boundaries and one payment-idempotency check, live-verified. **Full business-flow walkthroughs (UAT-01 to -07, -11, -12), cross-Mall access (UAT-10), and the human new-user usability study are not executed** | Needs real personas per role, a second Mall seeded, and 5-8 recruited usability-study participants — none of which can be simulated | Product Owner (human coordination required) |
| Training | **RED** | No lightweight training material exists yet in this repo | Quick-start guides, role-based workflow guides, admin training — none created | Product Enablement |
| Support | **AMBER** | `docs/golive/SUPPORT_MODEL.md` proposes a structure this gate, reusing existing operational playbooks | Not staffed — no named on-call individuals or escalation contacts | Support/Ops leadership (human decision) |

## Automatic NO-GO conditions triggered (section 50)

- ❌ **Exposed live credential not rotated** — triggered (Credentials row).
- ❌ **No usable off-site production backup** — triggered (Backup row, database off-site leg; uploads have no backup at all).
- ⚠️ Restore possible but only demonstrated at dev-scale, not full production-representative — does not itself trigger "restore impossible," but is a real gap.
- No P0 UAT failure was found (nothing tested has *failed*) — but UAT is **incomplete**, which the exit rule (section 38) treats as not-yet-satisfied, distinct from "failed."
- No tenant-isolation failure, no data-corruption invariant failure, no unsafe migration/deployment path, and the system **can** be monitored well enough to detect a critical failure manually (health/job/metrics endpoints work) even though nothing pages anyone automatically yet — none of these trigger an automatic NO-GO on their own.

## Verdict basis

Per section 50-52's own rules, **two automatic NO-GO conditions are
currently triggered** (credentials, off-site backup). This overrides any
CONDITIONAL GO the otherwise-green engineering evidence would justify. See
`FINAL_PRODUCTION_READINESS.md` for the full decision and the distinction
between "engineering/reliability gate" (which passes) and "production
go-live gate" (which does not, yet).
