# Business Decision Required: What Should the CEO Role Be Able to Do?

**Decision owner**: CEO / Business Owner, with input from IT Manager and Security.
**Prepared by**: Engineering (CR-101 security review), 2026-08-22.
**Urgency**: Not an emergency — no active incident. This is a "close the gap between what we documented and what the system actually does" decision.

## The Situation, in Plain Terms

When this platform was designed, someone wrote down what the CEO login should be able to see and do:

> *"CEO gets cross-mall visibility, analytics, final-level approvals, reports, and the AI assistant — deliberately excludes day-to-day operational work (no spaces, no CRM, no bookings, no tickets)."*

That's a sensible description of an executive role: see everything, approve the big decisions, don't get pulled into daily operations.

**The system today doesn't quite match that description.** A CEO login can currently:
- See and act on data for **every mall**, not just the malls they're assigned to — by design, this part is fine and matches the "portfolio visibility" intent.
- **Create and edit sales proposals directly** — not just approve them at the final step, but do the whole job a Leasing Manager would do.
- **Create and manage parking contracts** — an operational task.
- **Create, update, and manage maintenance work orders**, including running templates and approving completions — a fully operational, day-to-day task.
- **Create sales performance submissions** for tenants.
- **Change mall-wide pricing policy and data-retention settings** in the Analytics section — a system-configuration action, not oversight.

None of this is a security hole in the sense of a bug being exploited — it's simply broader access than what was written down as intended. No customer data or money is at risk from this gap by itself. But it means: if a CEO account is compromised, or a CEO mistakenly performs one of these actions, the system currently allows things the design never meant to allow.

## Why a Decision Is Needed Now

We just finished a multi-month security review of who-can-access-what across the whole platform (project name: CR-101). Every other confirmed gap of this kind has been fixed. This is the last significant one, and it's different from the others — it's not a bug to silently patch, because we don't actually know which is wrong: the description, or the system. Only the business can say which one should change.

## What the CEO Can Currently Access

Full detail is in the attached technical appendix (`docs/architecture-review/33-CR-101-CEO-CAPABILITY-MATRIX.md`). In short:

| Works as documented | Broader than documented |
|---|---|
| Dashboard, Reports, Analytics (viewing), Audit Log, AI Assistant, final-tier Approvals | Sales Proposals (full edit, not just approval), Parking (full operational control), Work Orders (full operational control), Sales record creation, Analytics configuration settings |

## Your Options

### Option A — "See Everything, Approve the Big Decisions, Don't Do the Operational Work" *(Recommended)*
CEO keeps full visibility across all malls for Dashboard, Reports, Analytics, and the AI Assistant, and keeps approving the specific high-value decisions already routed to them (large discounts, long rent-free periods). CEO loses the ability to directly create or edit Sales Proposals, Parking contracts, and Work Orders — those become view-only for the CEO login, matching what was originally written down.

- **Business benefit**: Matches the original design intent exactly. If a CEO account is ever compromised, the damage is limited to "can see everything," not "can create/change operational records across every mall."
- **Security exposure**: Lowest of the three options.
- **Operational impact**: If any CEO today genuinely uses the Parking/Work-Orders/Proposals editing capability for a real reason, that capability goes away — we recommend confirming with whoever holds the CEO login today before this ships.
- **Support impact**: Low — CEO would still see all the same data, just fewer edit buttons in a few screens.
- **Implementation complexity**: Moderate. Requires some real engineering work (not a one-line change) — expect a dedicated implementation phase with its own testing.
- **UAT impact**: Needs a short sign-off pass from whoever holds the CEO account, confirming nothing they actually rely on breaks.

### Option B — "Only Exactly What Was Documented"
CEO's access is trimmed to precisely the five items in the original description — Dashboard, Analytics (view only), Reports, final-tier Approvals, AI Assistant — and nothing else. This also removes two capabilities that aren't actually broken today (Service Contracts viewing, Sales approve/dispute), because they weren't explicitly written down.

- **Business benefit**: Most literal match to the written description.
- **Security exposure**: Lowest — even tighter than Option A.
- **Operational impact**: Highest risk of the three — removes two things (Service Contracts view, Sales approve/dispute) that aren't causing any problem today, purely because they weren't on the original list. If those are actually useful, this option breaks them for no security benefit.
- **Support impact**: Higher — more screens change for the CEO login than Option A.
- **Implementation complexity**: Similar to Option A, slightly larger.
- **UAT impact**: Same as Option A, plus specific confirmation on Service Contracts/Sales viewing before removing it.

### Option C — "Leave It As-Is, Update the Paperwork"
No system change. We rewrite the original description to match what the system actually does today, with a documented business reason for each broader capability.

- **Business benefit**: Zero disruption, zero risk of breaking a workflow someone relies on.
- **Security exposure**: Highest of the three — the operational-write exposure across every mall (Proposals, Parking, Work Orders) stays in place indefinitely.
- **Operational impact**: None — nothing changes for anyone.
- **Support impact**: None.
- **Implementation complexity**: None (documentation only).
- **UAT impact**: None.

## Our Recommendation

**Option A.** It closes every confirmed gap between intent and reality, while keeping every capability we have evidence a CEO account genuinely uses (approvals, oversight, reporting, AI). Option B goes further than the evidence supports and risks breaking two things that aren't actually problems. Option C leaves real exposure in place with no stated reason.

This is a recommendation, not a decision — the choice, and the responsibility for weighing "is this operational access actually used by someone today," belongs to the business.

## What We Need From You

1. Pick Option A, B, or C (or tell us a different combination you'd prefer — the technical appendix breaks this down capability-by-capability if you want to mix and match).
2. If A or B: confirm whether the current CEO account holder(s) actually use the Parking/Work-Orders/Proposals-editing capabilities for a real reason we should know about before we remove them.
3. One related, smaller item came up during this review: a bulk "edit multiple units at once" feature technically allows editing units across different malls in a single action, with no separate business sign-off on whether that's intended. This is not tied to the CEO decision above — it affects any staff member assigned to more than one mall. We'll raise it as its own small item unless you'd like it addressed here too.

## Reference (Technical Appendix)

- Full 21-area capability matrix: `docs/architecture-review/33-CR-101-CEO-CAPABILITY-MATRIX.md`
- Precise technical definitions (what "see across all malls" means, exactly): `docs/architecture-review/34-CR-101-CROSS-MALL-PERMISSION-MODEL.md`
- What would actually need to be built for each option: `docs/architecture-review/35-CR-101-PHASE-3G-IMPLEMENTATION-PLAN.md`
- Full readiness review: `docs/architecture-review/32-CR-101-CROSS-MALL-POLICY-READINESS.md`
