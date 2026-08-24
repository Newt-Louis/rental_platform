# 12 — Go-Live Readiness (UX/Workflow lens)

> Phase 24. This checklist is scoped to UX/workflow readiness. Operational
> readiness (backup, scheduler HA, observability, security hardening) is already
> covered in `docs/OPERATIONS_RUNBOOK.md` and `FULL_SYSTEM_UX_FUNCTION_AUDIT_V2.md`
> §Operations roadmap — not restated here, only cross-referenced.

| Area | Status | Basis |
|---|---|---|
| UX — navigation clarity | **PARTIALLY READY** | Task-sequenced groups work (`salesProcess`); technical groups don't (FR-12); fix is a config change (06-IA), not a rebuild |
| UX — core journey completeness | **PARTIALLY READY** | Lead→Contract journey works end-to-end but has 2 critical discovery gaps (FR-01, FR-02) |
| Workflow — approval clarity | **PARTIALLY READY** | Mechanically correct and already well-labeled (business-language status), but decision context isn't co-located with the decision (FR-04) |
| Workflow — notification/task separation | **NOT READY** | FR-07 — explicitly named in the audit brief as a required capability, currently absent |
| Permission — RBAC correctness | **NOT READY** | FR-01 confirmed live frontend/backend permission drift producing a dead link for the TENANT persona; FR-13 names the structural cause |
| Data — status model readability | **READY** | Every module's status values are business-language, i18n-routed; verified across Contracts/Tickets/Fitout/Billing/Booking |
| Performance | Not assessed in this audit — see V2 §Observability baseline / OPERATIONS_RUNBOOK | — |
| Security | Not assessed in this audit — RBAC/guard architecture reviewed structurally only (00-SYSTEM-INVENTORY §5); no penetration/security review performed here | — |
| Error handling — loading/error states | **READY** | Skeletons + retry consistently present across all spot-checked list views | 
| Error handling — empty states | **NOT READY** | FR-09 — 3 of 4 flagship list screens have no CTA and no empty-vs-filtered distinction; the fix pattern already exists in-codebase (Tickets) and is cheap to replicate |
| Notification delivery | Not assessed for reliability here — see V2 §Notifications, email and announcements (durable outbox gap) | — |
| Documentation | `README.md`, `OPERATIONS_RUNBOOK.md`, `ERP_UX_STANDARD.md` exist and are substantive | READY |
| Training / onboarding | **NOT READY** | No first-login tour, no contextual help/tooltip pattern found in the pages reviewed; `ErpProcessGuide` is the closest thing to in-context guidance and only covers the sales process, not fitout/billing/ops |
| UAT | Not verifiable from static code review — ask the user/team whether a UAT round against real mall staff has occurred | — |
| Rollback | Covered by `OPERATIONS_RUNBOOK.md` (Docker-based, out of this audit's scope) | — |

## Overall

**CONDITIONAL GO** on the UX/workflow dimension specifically:

- Cannot be scored READY while a confirmed live dead-link exists for an external
  persona (FR-01) and the platform's flagship "what do I do" ask (task/notification
  separation, empty-state guidance) is unaddressed — these are the two Critical
  items.
- Can be scored **conditionally ready for internal staff use** once the 3 Critical
  items (FR-01, FR-02, FR-07) and the empty-state gap (FR-09) are fixed — none of
  these require architectural rework, all four are UI/config-level changes against
  code that already exists (existing patterns to copy: Tickets' empty state,
  existing `entityLink()` mapping, existing `focusAreas` mechanism).
- Full GO should also require closing V2's Sprint A reliability items (atomic
  billing, distributed scheduler lock) — those are outside this audit's UX scope
  but sit on the same critical path to a trustworthy Go-Live.

See [14-IMPROVEMENT-ROADMAP](14-IMPROVEMENT-ROADMAP.md) for sequencing.
