# Golden ERP Production Readiness

Assessment date: 2026-08-24

Overall decision: **NOT READY**

This gate separates engineering evidence from permission to release. A green
build is not a production approval. Current operational evidence is taken from
the newest source where older readiness documents conflict, especially
`docs/golive/RESTORE_DRILL.md` for uploaded-file backup/restore capability.

## Gate matrix

| Gate | Status | Current evidence and blocking condition |
|---|---|---|
| Engineering | PASS | Backend is 598/598 and both builds pass. The frontend full suite is 249/259; all ten failures reproduce the isolated pre-program Booking/navigation baseline and no implementation-wave regression was identified. |
| Security | FAIL | Previously exposed live credentials remain unrotated and reachable git history still requires remediation. Current code-level controls and secret scanning do not close the operational incident. |
| Authorization | FAIL | Core audited paths are scoped, but CRM unified deals, Ticket secondary paths, and Analytics Compliance exports retain confirmed ownership/scope gaps. |
| Tenant isolation | FAIL | Live Contract/Invoice cross-tenant IDOR checks passed, but confirmed Ticket secondary-path ownership gaps remain. Files have focused tests but no live cross-tenant UAT. |
| Cross-Mall isolation | BLOCKED | The UAT seed contains one Mall, so a meaningful two-Mall denial matrix cannot be executed. Confirmed adjacent endpoint gaps must also be remediated first. |
| Data integrity | PASS | Read-only backbone reconciliation completed 17/17 checks clean on 2026-08-24; backend concurrency/invariant suites pass. This is dev-data evidence, not production-data certification. |
| Database migration safety | PASS | This program introduced no schema or migration. Existing deployment policy requires explicit migration execution and prohibits migration-on-startup. |
| Backup mechanism | PASS | Checksummed database and uploaded-file backup mechanisms exist and their safety guards pass. This does not include off-site survivability. |
| Restore drill | PASS | Database restore was drill-verified for 124 tables; uploaded-file restore was drill-verified for 13 files into isolated targets. Both are local, development-scale drills. |
| Off-site backup | FAIL | Database and uploaded-file backups share the local host/failure domain. No approved remote destination or off-site restore evidence exists. |
| Credential rotation | FAIL | PostgreSQL, JWT, Anthropic, SSH and possibly SMTP/Redis rows remain NOT STARTED in `docs/golive/CREDENTIAL_ROTATION_TRACKER.md`. |
| Secrets/history remediation | FAIL | Rotation must complete before revocation verification and the prepared history rewrite. Neither is complete. |
| Logging | BLOCKED | Structured request/job logs exist, but there is no centralized collection/retention evidence for a production environment. |
| Monitoring | FAIL | Health, job ledger and metrics endpoints exist; no alerting platform or paging ownership is wired. |
| Error tracking | FAIL | No frontend error capture or centralized backend exception tracking is production-verified. |
| Docker health | PASS | Postgres, Redis, backend and frontend are healthy; localhost frontend and backend health returned HTTP 200 on 2026-08-24. |
| Production configuration | BLOCKED | Local compose is healthy, but the target production/UAT configuration and this release have not completed a controlled deployment gate. |
| Rate limiting | BLOCKED | No current production load/throttle verification closes the security readiness finding. |
| Upload security | PASS | Legacy public upload access is closed, authenticated file routes have focused coverage, and unsafe storage paths are rejected. Live cross-tenant file UAT remains part of the Tenant-isolation blocker. |
| Recovery procedures | BLOCKED | Backup/restore runbooks exist, but off-site recovery, production-scale RTO and a release rollback rehearsal are unverified. |
| UAT | FAIL | Only UAT-08 and UAT-09 are evidenced. UAT-01 through -07, -10 through -12 and the new-user study are not complete. |
| Cross-module journeys | FAIL | Focused service tests and reconciliation cover handoff invariants, but the full Lead-to-Collection and exception journey matrix has not been executed end-to-end. |
| Visual verification | BLOCKED | Automated browser runtime was unavailable. Fitout, CRM, Inventory, Operations, Reporting, Admin and the protected Dashboard audit still require rendered human review at the required viewports. |
| Release procedure | BLOCKED | The runbook exists, but a release candidate containing this commit chain has not been cut, deployed or signed off. |
| Rollback procedure | BLOCKED | The procedure is documented but has not been rehearsed for this release candidate. |

## Automatic no-go conditions

- Live credential rotation and old-credential revocation are incomplete.
- No usable off-site database/upload backup exists.
- Full UAT and cross-Mall isolation evidence do not exist.
- Confirmed authorization gaps remain in reachable adjacent surfaces.
- Automated rendered verification was unavailable and the new Golden
  candidates have no human visual sign-off.

## Required human evidence

Only actions that require external authority, access or genuine human review
are listed here:

1. Rotate and revoke the exposed live credentials, then approve and coordinate
   git-history remediation.
2. Provision an approved off-site backup destination and execute an off-site
   restore drill at production-representative scale.
3. Wire monitoring, alerting and error tracking to named operational owners.
4. Seed a second Mall and conduct the remaining UAT, cross-Mall denial, full
   Golden journey and rollback-rehearsal sessions.
5. Perform rendered human visual review of the Golden candidates at 1920x1080,
   1440x900, 1366x768 and 1024x768.
6. Resolve the Tier 0/Tier 1 business confirmations identified in the final
   report before their corresponding correctness/security changes proceed.
