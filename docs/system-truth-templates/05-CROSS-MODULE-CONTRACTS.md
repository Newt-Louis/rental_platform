# System Truth — 05 — Cross-Module Contracts

> **TEMPLATE — NOT YET POPULATED.** Catalog of every `XMOD-xxx` contract
> found in the codebase, using `docs/change-templates/XMOD-TEMPLATE.md`
> per entry. This is the reconstructed reality Gate 3
> (`docs/ai-governance/05-E2E-QUALITY-GATES.md`) verifies against.

## Discovery method

1. For each module, list every outbound call to another module's
   service/API/repository.
2. For each event emitted (see `09-EVENT-CATALOG.md`), list every
   consumer.
3. For each scheduled job, list which modules' data it reads and writes.

## Contract index

| XMOD-xxx | Source | Destination | Trigger | Idempotent? | Transactional? | Confidence |
|---|---|---|---|---|---|---|

## Full contract detail

(One `XMOD-xxx` block per entry, using the full
`docs/change-templates/XMOD-TEMPLATE.md` structure — SOURCE, DESTINATION,
TRIGGER, PRECONDITIONS, INPUT, DATA PROPAGATION, SNAPSHOT DATA,
GUARANTEED OUTPUT, UNIQUENESS, TRANSACTION, IDEMPOTENCY, FAILURE, RETRY,
EVENT, AUTHORIZATION, OBSERVABILITY.)

## Contracts with no failure/retry handling found

(Explicit list — these are `ANTI_PATTERNS.md` candidates and P1/P2 risk
register entries.)
