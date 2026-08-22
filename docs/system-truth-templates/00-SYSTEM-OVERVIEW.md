# System Truth — 00 — System Overview

> **TEMPLATE — NOT YET POPULATED.** Do not fill this with invented
> conclusions. Populate only by direct code inspection, per
> `docs/ai-governance/10-SYSTEM-TRUTH-RECONSTRUCTION-PROMPT.md`. Mark any
> unresolved item `UNKNOWN — BUSINESS CONFIRMATION REQUIRED`.

## Reconstruction metadata
- Date reconstructed:
- Agent/reviewer:
- Scope covered this pass (full platform / specific domain):
- Prior version superseded (if any):

## Platform identity
(What the system actually is, in one paragraph, verified against
top-level app structure — not copied from marketing/README language.)

## Runtime architecture
- Backend: (framework, verified version, module-loading mechanism)
- Frontend: (framework, verified version, routing mechanism)
- Database: (engine, ORM/query layer, migration tool)
- Deployment topology: (verified from actual config, not assumed)

## Cross-cutting capability inventory
For each item in `docs/ai-governance/01-PLATFORM-SCOPE.md`'s cross-cutting
list (Files, Email, Outbox, Retry Queue, Distributed Lock, Job Ledger,
Search, Export, Reconciliation, Configuration, Feature Flags, Monitoring,
Backup/Restore): confirm EXISTS / DOES NOT EXIST / PARTIAL, with file
references.

| Capability | Status | Evidence (file:line) | Notes |
|---|---|---|---|

## Confirmed module count
- Backend modules (count, source path, date verified):
- Frontend page directories (count, source path, date verified):
- Discrepancies from `docs/ai-governance/01-PLATFORM-SCOPE.md`:

## Open questions
(List any `BC-xxx` raised during this document's reconstruction.)
