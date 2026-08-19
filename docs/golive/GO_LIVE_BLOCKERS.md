# Go-Live Blockers

**Date:** 2026-08-19. Only true blockers — items that must close before
Pilot or Full Production, not general backlog. Status values:
`NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `DONE`. No subjective percentages.

| ID | Item | Status | Threshold | Evidence | Owner |
|---|---|---|---|---|---|
| GL-01 | Credential rotation | **NOT STARTED** | Pilot + Full Production | `docs/golive/CREDENTIAL_ROTATION_TRACKER.md` — 0 of 4-6 credentials rotated | Security/DevOps (human, needs UAT server + Anthropic Console access) |
| GL-02 | Off-site DB backup | **BLOCKED** | Pilot + Full Production | `docs/readiness/BACKUP_RESTORE_READINESS.md` — mechanism proven, `BACKUP_OFFSITE_COMMAND` unset everywhere; blocked on a human decision for the destination (object storage, remote host, etc.) | DBA/DevOps (human) |
| GL-03 | Upload/document backup | **IN PROGRESS** | Pilot (mitigation acceptable) + Full Production (must be DONE) | `docs/golive/RESTORE_DRILL.md` — mechanism now built and drill-verified this workstream (`scripts/backup-uploads.mjs`/`verify-uploads-restore.mjs`, 13/13 files restored, checksum match); off-site destination still not configured, same blocker as GL-02 | DBA/DevOps (human, mechanism ready — just needs the destination decision) |
| GL-04 | Git history remediation | **BLOCKED** | Full Production (not Pilot-blocking on its own, but should not be indefinitely deferred) | `docs/security/SECRET_INCIDENT_REMEDIATION.md` — rewrite prepared, explicitly blocked on GL-01 completing first (rotate before rewrite) | Security/DevOps (human) |
| GL-05 | Full human UAT | **NOT STARTED** | Pilot (pilot-Mall-scope minimum) + Full Production (complete matrix) | `docs/readiness/UAT_RESULTS.md` — only security-boundary + one idempotency check done; business-flow walkthroughs, cross-Mall, and the new-user usability study not executed | Product Owner (human coordination — needs a UAT team and a second seeded Mall) |
| GL-06 | Cross-Mall live validation | **NOT STARTED** | Pilot (if pilot Mall count > 1) + Full Production | Same root cause as GL-05 — current seed data has exactly one Mall | Product Owner |
| GL-07 | Monitoring/alerting | **NOT STARTED** | Full Production (manual-watch mitigation acceptable for Pilot per `PILOT_PLAN.md`) | `docs/reliability/OBSERVABILITY.md`'s alert set is a target spec; health/job/metrics endpoints exist and are live-verified, but nothing pages anyone automatically | SRE/Platform (human, needs a monitoring platform decision) |
| GL-08 | Training material | **NOT STARTED** at plan time, **IN PROGRESS** this workstream | Pilot + Full Production | `docs/golive/training/` — 7 role-based quick guides drafted this workstream (text only, no screenshots — see gap noted in each guide) | Product Enablement |
| GL-09 | Support staffing | **NOT STARTED** | Pilot (L2/L3 reachable is enough) + Full Production (fully staffed L1) | `docs/golive/SUPPORT_MODEL.md` — structure and severity model defined, 0 named individuals assigned | Support/Ops leadership (human decision) |

## Pilot-entry threshold (subset of the above)

```text
GL-01  DONE
GL-02  DONE
GL-03  DONE or explicitly approved pilot mitigation
GL-04  REMEDIATED
GL-05  PASS for the pilot Mall's scope
GL-06  PASS (if the pilot spans more than one Mall; N/A for a single-Mall pilot)
GL-07  Manual-watch mitigation approved (per PILOT_PLAN.md), not full automation required
GL-08  At minimum the pilot Mall's relevant role guides exist
GL-09  L2/L3 reachable
```

**Current state: 0 of the 6 mandatory pilot-entry items (GL-01, 02, 04,
05, and — if multi-Mall — 06) are DONE.** Pilot cannot begin today.

## Full-production threshold

All 9 items `DONE`, plus a completed, successful Pilot per
`docs/golive/PILOT_PLAN.md`'s exit criteria.
