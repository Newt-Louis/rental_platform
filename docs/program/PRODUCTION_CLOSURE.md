# Production Closure Tracker

Tracks the operational items that keep `docs/readiness/POST_HARDENING_GATE_REVIEW.md`
at **CONDITIONAL GO** instead of full **GO**. None of these are code
defects; all require an action this environment cannot take on its own
(live server access, credential authority, or a decision only a human
owner can make). This list must stay visible in every future gate review —
it does not get marked resolved just because development work continues
elsewhere.

Status values: `OPEN` · `BLOCKED` · `HUMAN ACTION REQUIRED` · `RESOLVED` · `VERIFIED`

| # | Item | Status | Detail | Owner |
|---|---|---|---|---|
| 1 | **Live credential rotation** | HUMAN ACTION REQUIRED | `POSTGRES_PASSWORD`, `JWT_SECRET` on the real UAT server, and `ANTHROPIC_API_KEY` in the Anthropic Console still use the values exposed in the 2026-08-19 secret incident. Reinforced by a second live sighting during Phase 0 baseline freeze (`deploy-uat.sh.bk`, plaintext `SERVER_PASS`/`SERVER_HOST` for the same UAT host) — see `docs/program/00-BASELINE.md`. Cannot be done from this environment; requires SSH access to the UAT server and Anthropic Console access. | Security/DevOps owner (human) |
| 2 | **Git history remediation** | BLOCKED | Commits `07a045c`/`4ad127c` (already pushed to `origin/HUNG`) still contain the leaked secrets in history. A `git filter-repo` rewrite + force-push was prepared but not run — must happen *after* item 1 (rotation), and collaborator `PhieuLe` must be notified first since it invalidates their local clone. Blocked on item 1. | Security/DevOps owner (human) |
| 3 | **Off-site backup destination** | OPEN | Backups are local-disk-only in every environment reachable from here. A host failure would lose backups alongside the primary database — the single biggest gap against stated backup policy. No uploaded-file backup/restore procedure exists either (only the database is covered by the verified drill in `docs/readiness/BACKUP_RESTORE_READINESS.md`). | DBA/DevOps owner (human, needs off-site storage provisioning) |
| 4 | **`deploy-uat.sh` source-control resolution** | OPEN | The file is intentionally `.gitignore`'d (contains credentials), so fixes made to it (explicit `prisma migrate deploy` step) live only on whichever machine has them and are not shippable via git. Needs a decision: externalize credentials (env file / secrets manager) so the script itself can be tracked, or formalize an out-of-band distribution process for it. Compounded by the `.bk` file finding in Phase 0 — see `docs/program/00-BASELINE.md`. | Platform Engineering (design decision, human input needed) |
| 5 | **Remaining UAT evidence** | OPEN | Executed so far: persona/RBAC boundaries, mandatory tenant-isolation IDOR test, one idempotent-payment-retry check — all live, all passing (`docs/readiness/UAT_RESULTS.md`). Not executed: the full 12-scenario business-flow matrix, cross-Mall isolation (current seed has only one Mall), and the human new-user usability study (needs 5-8 real recruited testers — cannot be simulated by an agent). | Product Owner + recruited test users (human) |

## Rule

These five items are re-checked at every phase gate and at the final
Production Gate (Phase 14). None may be silently dropped from a report.
Marking `RESOLVED`/`VERIFIED` requires evidence (a doc, a log, a signed-off
drill), not a status change alone.
