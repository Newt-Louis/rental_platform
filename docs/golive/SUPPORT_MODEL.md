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

## Severity model (P1-P4, per this workstream's requested nomenclature — no pre-existing organizational standard found in this repo to align to instead)

| Severity | Definition | Example | Target response |
|---|---|---|---|
| P1 | Service unavailable / business stopped | `GET /health/ready` degraded platform-wide; a confirmed cross-tenant data leak; database down | Immediate — follow `OPERATIONS_RUNBOOK.md` §10 "General procedure": disable public traffic if data integrity is at risk, preserve logs, restore from known-good images |
| P2 | Critical function degraded, workaround limited | Invoice generation cron `FAILED` with `consecutiveFailures >= 2`; a whole role can't complete their critical workflow | Same-business-day — use the matching `OPERATIONS_RUNBOOK.md` playbook |
| P3 | Normal defect | One user can't download one document; a cosmetic/UX issue with a workaround | Standard ticket queue |
| P4 | Request/enhancement | "Can this list also show X column" | Backlog, no SLA |

## Support contact requirements (what users must know)

Users must know **where to report** an issue and **what information to
provide** — do not make them guess or make support staff chase details.

Required fields for every report:

```text
User (who is reporting)
Time (when it happened)
Screen/function (where in the app)
Action (what they were trying to do)
Screenshot (if applicable)
Reference ID (the X-Request-Id from the error, if shown — already
  implemented platform-wide via RequestObservabilityInterceptor, present
  in both the response header and the structured backend log line)
```

**Never ask a user for their password** as part of a support request —
existing platform convention (JWT auth, no shared credentials) already
makes this unnecessary; call it out explicitly here so it's never
normalized as a troubleshooting step.

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
