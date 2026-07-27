-- More-specific category pricing rules may leave individual values NULL to
-- inherit them from zone/floor/mall or a parent category rule.
ALTER TABLE "CategoryMallPricing"
  ALTER COLUMN "minRentPerSqm" DROP NOT NULL,
  ALTER COLUMN "maxRentPerSqm" DROP NOT NULL,
  ALTER COLUMN "camPerSqm" DROP DEFAULT,
  ALTER COLUMN "camPerSqm" DROP NOT NULL;

ALTER TABLE "UnitBooking"
  ADD COLUMN "pricingRuleId" TEXT,
  ADD COLUMN "pricingSnapshot" JSONB;

ALTER TABLE "Proposal"
  ADD COLUMN "pricingRuleId" TEXT,
  ADD COLUMN "pricingSnapshot" JSONB;
