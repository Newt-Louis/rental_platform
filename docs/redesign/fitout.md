# Redesign Spec — Fitout

**Purpose:** Reduce Fitout's ~15-tab project detail (per V2) into task-oriented
workspaces, matching the AECIS-aligned target already defined in
`docs/FITOUT_AECIS_TARGET_MODEL.md` — this spec adds the UX/screen-structure layer
on top of that capability mapping, it does not redefine the capabilities.
**Persona:** Operation (fitout coordinator), Tenant, Contractor.
**User goal:** Know which stage a project is on, what's overdue, and what needs
tenant/contractor input — without opening 15 tabs to find it.

## Current problems

V2: ~15 tabs risk information overload; role-specific default views don't exist
yet (Tenant/Contractor/Operation/Director all see the same tab set today).

## Information hierarchy (per `FITOUT_AECIS_TARGET_MODEL.md` capability groups,
regrouped into 5 workspaces per V2's own recommendation)

1. **Overview** — stage progress (`FitoutStageConfig` pipeline visualization,
   already exists as a Kanban-like tracker), countdown to open date, delay days,
   at-risk flag
2. **Documents** — submittals, D-Form register
3. **Field Control** — Issues, D-Map, Daily Reports
4. **Schedule** — Gantt, Milestones
5. **Risk/Cost** — Risk register, Change orders
6. **Administration** (Operation/Admin only) — Contractors, worker gate-entry,
   stage/form-type configuration (already separated into `FitoutSettingsPage.tsx`
   — keep that separation, just ensure it's not reachable by Tenant/Contractor)

## Components

- Reuse every existing tab's content wholesale — this is a regrouping into 5
  parent workspaces (each possibly still tabbed internally), not new
  functionality, consistent with V2's own recommendation #1 for this module.
- Role-specific default landing workspace: Tenant → Overview + Documents;
  Contractor → Field Control + Schedule; Operation → all 5.

## States

- Overview's at-risk flag should link directly into whichever of the 5 workspaces
  contains the overdue item (issue, milestone, or document) — closing the
  "user doesn't know where the delay is" gap implicit in V2's finding.

## Permissions

- Restrict stage/gate/SLA/form-type configuration APIs to explicit Admin-level
  permissions per V2's Fitout recommendation #3 — this is the one item in this
  spec that is an actual permission change, not just a UI regroup; call it out
  separately in implementation.

## Acceptance criteria

- A Tenant opening their Fitout project sees Overview + Documents by default, not
  all 15 original tabs.
- No existing capability (Issue, Submittal, D-Map, Risk, Daily Report, Gantt,
  Contractors) is removed — only regrouped into the 5 workspaces above.
