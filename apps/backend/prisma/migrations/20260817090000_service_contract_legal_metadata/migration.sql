CREATE TYPE "ServiceContractServiceCategory" AS ENUM (
  'CLEANING',
  'SECURITY',
  'MAINTENANCE',
  'TECHNICAL',
  'IT_SOFTWARE',
  'CONSULTING',
  'INSURANCE',
  'CONSTRUCTION',
  'LABOR_SUPPLY',
  'MARKETING',
  'PARKING',
  'LANDSCAPING',
  'PEST_CONTROL',
  'WASTE_MANAGEMENT',
  'UTILITIES',
  'OTHER'
);

CREATE TYPE "ServiceContractValueBasis" AS ENUM (
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
  'PROJECT',
  'OTHER'
);

ALTER TABLE "ServiceContract"
ADD COLUMN "serviceCategory" "ServiceContractServiceCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN "valueBasis" "ServiceContractValueBasis" NOT NULL DEFAULT 'ONE_TIME';

CREATE INDEX "ServiceContract_mallId_serviceCategory_valueBasis_idx"
ON "ServiceContract"("mallId", "serviceCategory", "valueBasis");
