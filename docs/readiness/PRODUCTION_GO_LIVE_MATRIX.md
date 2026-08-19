# Production Go-Live Matrix

Review date: 2026-08-18  
Decision: **NO-GO**

| Area | Status | Blocker | Owner | Required Before Production |
| --- | --- | --- | --- | --- |
| Functional | AMBER | Backend/frontend full suites have 46 failures; host e2e did not execute because of Docker hostname context. | Engineering leads | Repair risk-bearing tests; run integration in the correct network; all critical journeys pass. |
| UX | AMBER | Option B critical findings are fixed, but onboarding/accessibility are weak and high-density modules remain. | Product/UX | Complete staff UAT and new-user study; accept documented residual issues. |
| Reliability | RED | Six unlocked cron jobs; no durable job ledger; production app starts by running migrations; outbox lacks claim/lease; Proposal->Contract fan-out is not atomic. | Platform Engineering | Close static gate; add job ledger/alerts; separate migration job; make critical fan-out replay-safe. |
| Security | RED | Non-placeholder secrets/API key are tracked in Git; protected uploads are publicly served. | Security + DevOps + module owners | Rotate/scrub secrets and prove scanning; enforce authenticated resource downloads and upload policy; run SCA/DAST/IDOR tests. |
| Performance | AMBER | Historical 2026-07-17 read-only result passed at 5 rps/p95 144 ms, but it is not current or representative of write-heavy critical flows. | Performance owner | Run approved current workload for Dashboard, Proposal, Approval, Contract, Billing and file download; define capacity and thresholds. |
| Data | RED | Proposal->Contract multi-write can leave Contract/Unit/Booking/Proposal/Lead states mismatched; activation Billing handoff is outside status transaction. | Leasing/Platform | Atomic/replay-safe conversion; reconciliation job/query; concurrency and forced-failure tests. |
| Backup | AMBER | Scripts and RPO/RTO exist; no fresh backup manifest/real restore drill attached to this gate. | DBA/DevOps | Encrypted off-host backup plus upload snapshot; isolated restore drill; measured RPO/RTO evidence. |
| Monitoring | RED | No centralized proof, frontend telemetry, job heartbeat, missed-run/outbox/audit-loss alerts. | SRE/Platform | Implement minimum monitoring in `OBSERVABILITY_READINESS.md` and exercise alerts. |
| RBAC | AMBER | Global roles/Mall guard and explicit checks exist; nested-resource coverage is heuristic and public files bypass authorization. | Security/Backend | Negative role/Mall/tenant IDOR suite for every critical resource and documents. |
| UAT | RED | Current Option B business UAT and new-user usability evidence are absent. | Product Owner | Execute `UAT_PLAN.md`; all mandatory scenarios pass with signed evidence. |
| Training | AMBER | No measured onboarding outcome; status/terminology still varies. | Product Enablement | Role-based quick guides, escalation path and trained pilot champions; new-user targets met. |
| Support | AMBER | Runbook exists but current job/delivery/security incident paths are incomplete. | Support/SRE | On-call ownership, severity model, request-ID workflow and incident drills. |
| Rollback | AMBER | Application rollback script/runbook exists; schema migration is coupled to app startup and no current rehearsal is attached. | DevOps/DBA | Separate migration, rehearse image rollback, document forward-compatible DB recovery and verify backup. |

## Non-negotiable exit conditions

- No P0 Security finding remains.
- No tenant/Mall isolation or protected-document bypass remains.
- No known critical workflow corruption/duplicate-side-effect path remains.
- Static operations gate and release-readiness automation pass.
- Migration, backup, monitoring, UAT and rollback evidence are current for the candidate release.

## Conditional pilot only

An internal non-production pilot may continue on the current controlled single-instance environment for validation, provided compromised credentials are rotated first, no real confidential files/data are used, and the pilot is not described as production readiness.
