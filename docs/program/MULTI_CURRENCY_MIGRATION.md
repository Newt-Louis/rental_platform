# Multi-Currency Migration

**Date:** 2026-08-20 · migration `20260820010734_add_multi_currency_support`

## Why this migration is hand-written, not `prisma migrate dev`-generated

`prisma migrate dev` requires an interactive confirmation for the
`Proposal.rentCurrency` column (`String` -> enum) because Prisma's default
diffing strategy for that change is DROP + RECREATE, which the CLI
correctly flags as data-lossy and refuses to run non-interactively. That
default strategy is unnecessary here: every existing value in that column is
already a valid `CurrencyCode` member (verified live —
`SELECT "rentCurrency", count(*) FROM "Proposal" GROUP BY 1` returned a
single row, `VND | 8`, before this migration ran), so an in-place
`ALTER COLUMN ... TYPE ... USING ...::"CurrencyCode"` cast is both safe and
lossless. The migration was written by hand to use that cast instead.

## What it does

```sql
CREATE TYPE "CurrencyCode" AS ENUM ('VND', 'USD', 'MMK');

ALTER TABLE "UnitBooking" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';

ALTER TABLE "Proposal" ALTER COLUMN "rentCurrency" DROP DEFAULT;
ALTER TABLE "Proposal" ALTER COLUMN "rentCurrency" TYPE "CurrencyCode" USING "rentCurrency"::"CurrencyCode";
ALTER TABLE "Proposal" ALTER COLUMN "rentCurrency" SET DEFAULT 'VND';

ALTER TABLE "Contract" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';
ALTER TABLE "BillingScheduleEntry" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';
ALTER TABLE "Invoice" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';
ALTER TABLE "Payment" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';
```

## Migration-order safety (spec §31-32)

The five `ADD COLUMN ... NOT NULL DEFAULT 'VND'` statements collapse the
usual "add nullable -> backfill -> validate -> constrain" sequence into one
step deliberately: since Postgres 11, adding a column with a non-volatile
constant default is a metadata-only operation — no table rewrite, every
existing row is instantly and correctly backfilled to that default, and the
`NOT NULL` constraint is enforced from the same instant. There is no window
where a historical row has a null currency. This is safe specifically
*because* the backfill value is a constant ('VND') applying uniformly to
every existing row — the general nullable-first pattern exists for cases
where the backfill value must be computed per-row, which doesn't apply here.

## Applying it

Run from `apps/backend` (this environment has no live bind-mount into the
running containers — see "Environment note" below):

```bash
DATABASE_URL="postgresql://leasing:leasing123@localhost:5432/leasing_platform" npx prisma migrate deploy
DATABASE_URL="postgresql://leasing:leasing123@localhost:5432/leasing_platform" npx prisma generate
```

Verified: `prisma migrate status` reports "Database schema is up to date!"
immediately after, with no drift against `schema.prisma`.

## Environment note (unrelated to this migration's correctness, recorded so it isn't re-discovered)

The running `leasing-backend`/`leasing-db` containers in this environment
are started from `docker-compose.yml` (production-style, baked image, no
source bind mount) rather than `docker-compose.dev.yml` — the same
situation `docs/golive/RELEASE_CANDIDATE.md` documents for RC1
("currently-running local containers... do not reflect RC1's code").
`prisma migrate`/`generate` were therefore run directly on the host against
Postgres's published port (`localhost:5432`, matching
`docker-compose.yml`'s `DB_PORT` mapping) rather than via `docker compose
exec backend`.

## Unrelated environment quirk found and fixed while working on this schema

`npx prisma generate` failed with a bare `Error: Invalid character` after
the schema edits, while `prisma validate`/`format` succeeded — bisected to
three em-dash (`—`, U+2014) characters introduced in new schema comments;
the Prisma 5.10 client-generator child process on this specific Windows/
Node setup chokes on them even though the rest of the file (which already
contained non-ASCII bytes in pre-existing stripped-Vietnamese comments)
generates fine. Fixed by using plain ASCII `--` in the new comments, matching
the file's own comment style elsewhere. Recorded here in case a future
schema edit reintroduces an em-dash and `prisma generate` mysteriously
breaks again — the fix is exactly this, not a Prisma reinstall or schema
rewrite.

## Verification performed

- `prisma migrate deploy`: applied cleanly, `prisma migrate status`: up to date.
- `prisma generate`: clean.
- `npx tsc --noEmit` (backend): clean.
- Backend test suite: 69/69 suites, 368/368 tests (RC2 baseline was 67/67,
  359/359 — the 2 new suites / 9 new tests are this pass's own currency
  coverage; nothing pre-existing regressed).
- `prisma/seed.ts` re-run end to end against the migrated schema: succeeds,
  produces real USD and MMK rows threaded through Proposal -> Contract ->
  BillingScheduleEntry -> Invoice -> Payment (see Test Matrix doc for the
  exact seeded values).
- `scripts/backbone-reconciliation.mjs`: 17/17 clean (13 pre-existing checks
  + 4 new currency-invariant checks), run against the freshly reseeded
  database containing the new USD/MMK rows -- not just against empty tables.
