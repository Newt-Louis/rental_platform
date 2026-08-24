# AGENTS.md — Mandatory Reading for Every AI Coding Agent

This repository is **THISO Leasing Platform**: one integrated, end-to-end mall
leasing ERP, implemented as a NestJS backend (`apps/backend/src/modules/`)
and a React frontend (`apps/frontend/src/pages/`), sharing one database.

**It is governed as ONE BUSINESS SYSTEM WITH MULTIPLE DOMAINS, not as many
modules that happen to share a database.**

Every AI agent — Claude Code, a subagent, or any other coding assistant —
operating in this repository MUST read this file before making any change,
and MUST follow the protocol below without exception.

---

## 1. Why this file exists

Prior AI-assisted development in this repo produced changes that were
**locally correct but globally wrong**: a module was edited correctly in
isolation, while the end-to-end business process it belongs to broke.
Concrete failure classes already observed or plausible in this codebase:

- Currency changed in Contracts but not propagated to Billing, Parking,
  Service Contracts, Sales, or Reports.
- Module-level tests pass while downstream data (invoices, reports,
  reconciliation) becomes inconsistent.
- Financial formulas (contract value, outstanding balance, revenue share)
  duplicated between Billing, Dashboard, and Reports and allowed to drift.
- A state-machine transition in one module (e.g. Booking → Proposal →
  Contract) leaves a downstream entity in an invalid or orphaned state.
- Mall-scoped authorization enforced in one controller/guard but bypassed
  in another (previously root-caused to `MallAccessGuard` gaps — see
  `docs/implementation/` and prior ERP audit history).
- Async events (outbox, jobs, webhooks) silently lost, creating hidden
  operational failure with no visible error.
- A broad find-and-replace (e.g. "search VND → replace all") changes
  business semantics in places that were never analyzed.
- Multiple agents, working independently, infer different "sources of
  truth" for the same concept (currency, status, price) and diverge.

This file, together with `docs/ai-governance/`, `docs/ai-erp-team/`, and
`docs/system-truth/` (once reconstructed), exists to make this class of
failure structurally harder to produce.

## 2. Mandatory reading order

Before touching code for any non-trivial change, read in this order:

1. `docs/ai-governance/00-START-HERE.md`
2. `docs/ai-governance/01-PLATFORM-SCOPE.md`
3. `docs/system-truth/` (if it exists — module/domain/journey you are
   touching; run `docs/ai-governance/10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md`
   first if it does not exist yet)
4. `docs/ai-governance/03-CHANGE-IMPACT-PROTOCOL.md`
5. `docs/ai-governance/04-CODING-GUARDRAILS.md`
6. Any domain-specific docs under `docs/program/`, `docs/redesign/`, or
   `docs/audit/` that cover the module you are changing.

## 3. Non-negotiable rules

### NO IMPACT MAP → NO CODE
Any change that touches more than a single-file, single-function, purely
local fix requires a completed Change Request
(`docs/change-templates/CR-TEMPLATE.md`) with an Impact Map before any
implementation begins. See `docs/ai-governance/03-CHANGE-IMPACT-PROTOCOL.md`.

### NO BUSINESS GUESSING
If the correct business behavior is not clear from code, tests, or existing
docs, the agent MUST NOT invent it. State:

> **UNKNOWN — BUSINESS CONFIRMATION REQUIRED**

and log it using `docs/change-templates/BC-TEMPLATE.md`. See
`docs/ai-governance/06-BUSINESS-CONFIRMATION-PROTOCOL.md`.

### NO MASS REPLACEMENT
Never perform a blind search-and-replace across business meaning
boundaries (currency symbols, status strings, formulas, locale strings).
Every occurrence must be individually classified. See
`docs/ai-governance/04-CODING-GUARDRAILS.md`.

### NO SILENT SCOPE EXPANSION
Implement exactly the Change Request's declared scope. If implementation
reveals the change must touch more domains than planned, stop, update the
Impact Map, and get it reviewed before continuing — do not silently expand.

### FINANCIAL SAFETY
Money fields, currency, formulas, and rounding are Tier 0 concerns. Never
sum values across currencies without an explicit FX/consolidation design.
Never infer historical currency from a mall's *current* currency setting.
See `docs/ai-governance/08-MULTI-CURRENCY-GUARDRAILS.md`.

### MALL / TENANT AUTHORIZATION
Every new or modified endpoint, query, and background job MUST enforce
Mall-scoped and Tenant-scoped access at the data-access layer, not only in
the UI. Authorization correctness is verified per-endpoint, never assumed
from a sibling endpoint's behavior.

### CONCURRENCY / IDEMPOTENCY
Any change to booking, billing, invoicing, contract-state, or job
processing must consider concurrent writers and retried/duplicate events.
State the concurrency behavior explicitly in the Change Request.

### RECONCILIATION
Any change touching money, quantity, or status that is displayed in more
than one place (module UI, dashboard, reports) must be checked for
consistency across all displays before being considered complete.

## 4. Required pre-code output

Before writing implementation code for a non-trivial change, the agent
must produce and share:

1. A completed Change Request (impact map, upstream/downstream, financial,
   currency, Mall/tenant, authorization, event/job impact).
2. The Golden E2E scenario(s) that must still pass (from
   `docs/ai-governance/05-E2E-QUALITY-GATES.md`).
3. Any `UNKNOWN — BUSINESS CONFIRMATION REQUIRED` items, surfaced instead
   of guessed.

## 5. Required completion output

After implementation, the agent must report:

- What changed, and why (business reason, not just diff summary).
- Which modules/domains were touched and which were checked-but-not-changed.
- Which Golden E2E scenarios were exercised.
- Any reconciliation checks performed across duplicated financial/status
  displays.
- Any residual risk or `UNKNOWN` items left open.

## 6. Escalation

A coding agent must never self-approve a platform-level change (one that
crosses Tier 0/Tier 1 boundaries — see
`docs/ai-governance/09-ERP-CHANGE-SEVERITY.md`, or spans more than one
business domain per `docs/ai-erp-team/03-DOMAIN-OWNERSHIP.md`). Such
changes require the review chain in
`docs/ai-governance/02-AGENT-OPERATING-MODEL.md`.

## 7. Full framework index

- `docs/ai-governance/` — operating rules, guardrails, quality gates.
- `docs/ai-erp-team/` — roles, domain ownership, business process catalog,
  financial/security/quality models, decision & risk registers.
- `docs/system-truth-templates/` — empty templates for the authoritative
  System Truth documentation set (filled in only by running
  `docs/ai-governance/10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md`).
- `docs/change-templates/` — CR, ADR, XMOD, Golden Scenario, and Business
  Confirmation templates used on every non-trivial change.
- `RUN-FIRST.md` — the one command to bootstrap the AI ERP Team and
  reconstruct System Truth (audit-only, no code changes).
