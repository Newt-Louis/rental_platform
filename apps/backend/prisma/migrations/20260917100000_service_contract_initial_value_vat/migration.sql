-- Preserve historic totals: prior ServiceContract rows do not reveal whether
-- their value included VAT, so source values must remain NULL rather than be
-- guessed. New writes are enforced in ServiceContractsService.
ALTER TABLE "ServiceContract"
  ADD COLUMN "initialValue" DOUBLE PRECISION,
  ADD COLUMN "VAT" DOUBLE PRECISION;
