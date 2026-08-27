-- Migration: spaces_gap_features
-- GAP Analysis Section 1 — Tab Mặt Bằng (/spaces)
-- Items: #2 (merge/split), #3 (leaseTermType), #4 (spaceType), #5 (flexibleArea),
--        #6 (tier), #7 (contractedArea), #8 (businessModel enum),
--        #15 (ServicePriceCatalog + ProposalService), #42 (exchangeRate)

-- ─── New Enums ────────────────────────────────────────────────────────────────

CREATE TYPE "UnitLeaseTermType" AS ENUM ('LONG', 'SHORT');

CREATE TYPE "SpaceType" AS ENUM (
  'RETAIL_UNIT',
  'LED',
  'ESCALATOR_WRAP',
  'KIOSK_EVENT',
  'ADVERTISING',
  'SERVICE'
);

CREATE TYPE "UnitTier" AS ENUM ('A', 'B', 'C');

CREATE TYPE "BusinessModelEnum" AS ENUM ('SHOP', 'KIOSK', 'POP_UP', 'EVENT', 'CHAIN');

-- Add MERGED to existing UnitStatus enum
ALTER TYPE "UnitStatus" ADD VALUE IF NOT EXISTS 'MERGED';

-- ─── Unit — new fields ────────────────────────────────────────────────────────

ALTER TABLE "Unit"
  ADD COLUMN IF NOT EXISTS "leaseTermType"  "UnitLeaseTermType",
  ADD COLUMN IF NOT EXISTS "spaceType"      "SpaceType",
  ADD COLUMN IF NOT EXISTS "tier"           "UnitTier",
  ADD COLUMN IF NOT EXISTS "isFlexibleArea" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "minFlexArea"    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "maxFlexArea"    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "isCombined"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mergedFromIds"  JSONB,
  ADD COLUMN IF NOT EXISTS "mergedIntoId"   TEXT;

CREATE INDEX IF NOT EXISTS "Unit_leaseTermType_idx" ON "Unit"("leaseTermType");
CREATE INDEX IF NOT EXISTS "Unit_spaceType_idx"     ON "Unit"("spaceType");
CREATE INDEX IF NOT EXISTS "Unit_tier_idx"          ON "Unit"("tier");

-- ─── Proposal — new fields ────────────────────────────────────────────────────

-- Change businessModel from TEXT to enum
ALTER TABLE "Proposal"
  ALTER COLUMN "businessModel" DROP DEFAULT;

-- Convert existing text values before changing type
UPDATE "Proposal" SET "businessModel" = NULL
  WHERE "businessModel" NOT IN ('SHOP', 'KIOSK', 'POP_UP', 'EVENT', 'CHAIN');

ALTER TABLE "Proposal"
  ALTER COLUMN "businessModel" TYPE "BusinessModelEnum"
  USING "businessModel"::"BusinessModelEnum";

ALTER TABLE "Proposal"
  ADD COLUMN IF NOT EXISTS "exchangeRate"        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "exchangeRateSource"  TEXT,
  ADD COLUMN IF NOT EXISTS "contractedArea"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "actualArea"          DOUBLE PRECISION;

-- ─── Contract — new fields ────────────────────────────────────────────────────

ALTER TABLE "Contract"
  ADD COLUMN IF NOT EXISTS "contractedArea" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "actualArea"     DOUBLE PRECISION;

-- ─── ServicePriceCatalog (GAP #15) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ServicePriceCatalog" (
  "id"           TEXT NOT NULL,
  "mallId"       TEXT NOT NULL,
  "serviceCode"  TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "unit"         TEXT NOT NULL,
  "defaultPrice" DOUBLE PRECISION NOT NULL,
  "currency"     TEXT NOT NULL DEFAULT 'VND',
  "description"  TEXT,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServicePriceCatalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServicePriceCatalog_mallId_serviceCode_key"
  ON "ServicePriceCatalog"("mallId", "serviceCode");

CREATE INDEX IF NOT EXISTS "ServicePriceCatalog_mallId_isActive_idx"
  ON "ServicePriceCatalog"("mallId", "isActive");

ALTER TABLE "ServicePriceCatalog"
  ADD CONSTRAINT "ServicePriceCatalog_mallId_fkey"
  FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── ProposalService (GAP #15) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ProposalService" (
  "id"               TEXT NOT NULL,
  "proposalId"       TEXT NOT NULL,
  "serviceCatalogId" TEXT,
  "serviceCode"      TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "quantity"         DOUBLE PRECISION NOT NULL DEFAULT 1,
  "unit"             TEXT NOT NULL,
  "unitPrice"        DOUBLE PRECISION NOT NULL,
  "totalPrice"       DOUBLE PRECISION NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'VND',
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProposalService_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProposalService_proposalId_idx"
  ON "ProposalService"("proposalId");

ALTER TABLE "ProposalService"
  ADD CONSTRAINT "ProposalService_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProposalService"
  ADD CONSTRAINT "ProposalService_serviceCatalogId_fkey"
  FOREIGN KEY ("serviceCatalogId") REFERENCES "ServicePriceCatalog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
