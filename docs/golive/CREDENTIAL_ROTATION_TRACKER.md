# Credential Rotation Tracker

**Date:** 2026-08-19. No secret values recorded anywhere in this document,
per this workstream's own rule. Every row is genuinely **NOT STARTED** —
none of this can be performed from this environment (no SSH access to the
live UAT/production server, no Anthropic Console access, no SMTP provider
console access). Do not read a later date on this file as evidence of
progress unless a row's status actually changed with linked evidence.

| Secret | System | Environment | New Created | Service Updated | Old Revoked | Verified |
|---|---|---|---:|---:|---:|---:|
| `POSTGRES_PASSWORD` | PostgreSQL | UAT (125.234.136.72) | No | No | No | No |
| `JWT_SECRET` | Backend auth | UAT | No | No | No | No |
| `ANTHROPIC_API_KEY` | Anthropic Console | UAT/shared | No | No | No | No |
| SSH login (`deploy-uat.sh`) | UAT server OS | UAT | No | No | No | No |
| `SMTP_PASS` | Email provider | UAT (if this credential was among those exposed — not confirmed either way this pass; re-check `docs/security/SECRET_INCIDENT_REMEDIATION.md`'s original file list before assuming it's out of scope) | No | No | No | No |
| `REDIS` (if password-protected in the target environment; local dev Redis here has none) | Redis | UAT (if applicable) | No | No | No | No |

## Required rotation order (per credential, not yet started for any of them)

```text
1. Generate new credential                    ← blocked, needs human with system access
2. Update target service's own config          ← blocked
3. Update the deployment secret store          ← blocked
4. Deploy/restart the affected service safely  ← blocked
5. Verify the application against the new secret ← blocked
6. Revoke the old credential                    ← blocked, must happen AFTER step 5
7. Verify the old credential now fails           ← blocked
```

**Do not revoke an old credential before confirming the new one works in
the live service** — this is the sequencing rule this workstream itself
specifies, and it matters: revoking first, if the new secret turns out to
be misconfigured, would cause a self-inflicted outage.

## Evidence format required to mark any row done (none met yet)

For each credential:
```text
NEW SECRET:      works — [evidence: which check, when]
OLD SECRET:       revoked / fails — [evidence: attempted auth with old value, got denied]
APPLICATION:      healthy — [evidence: /health/ready check post-rotation]
DEPENDENT JOBS:   healthy — [evidence: /operations/jobs check post-rotation]
```

No row may be marked `DONE` on this tracker without all four evidence
lines filled in with an actual timestamp and check result — a password
having been changed somewhere is not sufficient evidence on its own.
