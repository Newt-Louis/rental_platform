# Support Model

**Date:** 2026-08-19. A proposed structure derived from
`docs/OPERATIONS_RUNBOOK.md`'s existing incident playbooks and this
program's role/permission model — not yet confirmed with actual named
staff, since staffing is an organizational decision outside this
environment's authority.

| Tier | Scope | Suggested owner (role, not a named person) | Escalates to |
|---|---|---|---|
| L1 — Business support | "How do I...", data-entry questions, expected workflow behavior, password resets | Product/Enablement or a designated super-user per persona (Leasing, Finance, Operation) | L2 if the issue looks like a system defect rather than a usage question |
| L2 — Application/IT | Login failures, permission errors that look wrong, failed scheduled jobs, slow pages, file-download errors | IT/Application support, using `OPERATIONS_RUNBOOK.md` §10's four existing playbooks (scheduled job failure, storage issue, auth issue, database issue) and `GET /api/operations/jobs`/`metrics` for diagnosis | L3 if the playbooks don't resolve it or data appears incorrect |
| L3 — Development/DB | Data corruption, need for a manual DB fix, a genuine application bug, migration issues | This program's engineering team | — |

## Severity model (proposed, matching `OPERATIONS_RUNBOOK.md`'s existing incident procedure)

| Severity | Definition | Example | Target response |
|---|---|---|---|
| SEV1 | Application down, data corruption in progress, tenant-isolation breach | `GET /health/ready` degraded platform-wide; a confirmed cross-tenant data leak | Immediate — follow §10 "General procedure": disable public traffic if data integrity is at risk, preserve logs, restore from known-good images |
| SEV2 | A critical workflow is broken for all/most users (e.g. no one can create a Proposal) but the app is otherwise up | Invoice generation cron `FAILED` with `consecutiveFailures >= 2` | Same-business-day — use the matching `OPERATIONS_RUNBOOK.md` playbook |
| SEV3 | A single user or a non-critical feature is affected | One user can't download one document | Standard ticket queue |

## What's missing before this is a real, operational support model

- **No named individuals or on-call schedule** — this document proposes
  the structure; staffing it is a decision for the business, not something
  this program can do.
- **No ticketing system integration** referenced anywhere in this repo —
  `X-Request-Id` (already implemented, `RequestObservabilityInterceptor`)
  is ready to be used as the correlation key once one exists.
- **No trained L1/L2 staff yet** — see Training gap in the final matrix.

This document should be treated as a starting proposal for the business
to adopt, adjust, and staff — not a completed deliverable.
