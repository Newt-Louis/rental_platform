-- Master data (Unit rent fields, CategoryMallPricing bands) had no currency at
-- all -- implicitly VND-only -- unlike Proposal/Contract/Invoice which already
-- carry a real currencyCode. See docs/program/MULTI_CURRENCY_ARCHITECTURE.md.

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';

-- AlterTable
ALTER TABLE "CategoryMallPricing" ADD COLUMN "currencyCode" "CurrencyCode" NOT NULL DEFAULT 'VND';

-- A mall/category/floor/zone scope can now carry one rule per currency (e.g. a
-- VND-quoted band alongside a USD-quoted one for the same category), so
-- currencyCode joins the uniqueness key.
DROP INDEX "CategoryMallPricing_mallId_categoryId_floorId_zoneId_effect_key";

CREATE UNIQUE INDEX "CategoryMallPricing_scope_currency_effectiveFrom_key" ON "CategoryMallPricing"("mallId", "categoryId", "floorId", "zoneId", "currencyCode", "effectiveFrom");
