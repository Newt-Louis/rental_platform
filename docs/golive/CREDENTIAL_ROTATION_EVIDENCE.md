# Credential Rotation Evidence

**Date:** 2026-08-19. Status: **NOT DONE — HUMAN ACTION REQUIRED.**

This document exists to make that status impossible to miss, per this
gate's own rule ("Gate phải xác minh bằng evidence, không chỉ checkbox").
No row below can be marked done from inside this environment — every one
requires SSH/console access to a live server, an Anthropic Console login,
or an SMTP-provider account, none of which this environment has
credentials or authorization for.

| Secret Type | Environment | Rotated | Old Revoked | Verified |
|---|---|---:|---:|---:|
| `POSTGRES_PASSWORD` | UAT server (125.234.136.72) | **No** | **No** | **No** |
| `JWT_SECRET` | UAT server | **No** | **No** | **No** |
| `ANTHROPIC_API_KEY` | Anthropic Console | **No** | **No** | **No** |
| UAT SSH password (`deploy-uat.sh`/`deploy-uat.sh.bk`) | UAT server | **No** | **No** | **No** |
| `SMTP_PASS` (if the leaked-secret incident touched it) | Email provider | Not assessed this pass — see note | — | — |

## Why this is still open

First identified in `docs/security/SECRET_INCIDENT_REMEDIATION.md`
(pre-dating this program). Re-confirmed at the start of this program
(`docs/program/00-BASELINE.md`, Phase 0) and **re-confirmed a second time**
during this gate: `deploy-uat.sh.bk`, an untracked file containing the
same live UAT SSH password in plaintext, still exists on disk in this
environment (`docs/program/00-BASELINE.md`'s Security Note already fixed
the `.gitignore` gap that could have leaked it into git a second time —
that fix does not rotate the credential itself, only prevents a *repeat*
of the original leak).

**Git-tracked secret status:** `scripts/secret-scan.mjs` reports **PASS: 0
issues across 344 tracked files** as of this gate — no real secret is
currently committed to the tracked working tree. This is necessary but not
sufficient: the credentials that were *historically* committed (see
`docs/security/SECRET_INCIDENT_REMEDIATION.md` for commit references) are
still live and unrotated, and old commits containing them are still
reachable in this branch's history (see `docs/golive/`'s companion
finding on git history remediation, which explicitly cannot proceed until
rotation happens first).

## Required sequence (already defined, not yet executed)

```text
1. Identify every exposed credential (DONE — SECRET_INCIDENT_REMEDIATION.md)
2. Generate new credentials                                    ← NOT DONE
3. Update the live UAT server's environment / Anthropic Console ← NOT DONE
4. Revoke the old credentials                                   ← NOT DONE
5. Retest the application against the new credentials            ← NOT DONE
```

None of steps 2-5 can be performed from this environment. This is not a
process gap in this program's engineering work — it is an intentional
boundary: rotating live production/UAT credentials, and revoking old ones,
is an irreversible action against real infrastructure this environment has
no authorization to touch, matching this program's own standing rule to
stop and require human action for exactly this class of operation.

## Gate impact

Per this gate's own automatic NO-GO rule ("exposed live credential not
rotated"): **this alone is sufficient to block a full production GO
decision**, independent of every other green signal in this report. See
`FINAL_GO_LIVE_MATRIX.md` and `FINAL_PRODUCTION_READINESS.md` for how this
is weighted against the rest of the evidence.
