-- Repair legacy lifecycle drift: a unit with a live contract cannot remain
-- VACANT, BOOKING or NEGOTIATING. Keep later fit-out statuses unchanged.
WITH live_contract AS (
  SELECT DISTINCT ON (c."unitId")
    c."unitId",
    c."tenantId",
    c."startDate",
    c."endDate"
  FROM "Contract" c
  WHERE c."isActive" = true
    AND c."deletedAt" IS NULL
    AND c.status NOT IN ('EXPIRED', 'TERMINATED')
  ORDER BY c."unitId", c."updatedAt" DESC
)
UPDATE "Unit" u
SET
  status = 'CONTRACTED',
  "tenantId" = lc."tenantId",
  "leaseStartDate" = lc."startDate",
  "leaseEndDate" = lc."endDate",
  "vacantSince" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM live_contract lc
WHERE u.id = lc."unitId"
  AND u."isActive" = true
  AND u.status IN ('VACANT', 'BOOKING', 'NEGOTIATING');

-- Release stale BOOKING units that no longer have a live booking or contract.
UPDATE "Unit" u
SET
  status = 'VACANT',
  "tenantId" = NULL,
  "leaseStartDate" = NULL,
  "leaseEndDate" = NULL,
  "vacantSince" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE u."isActive" = true
  AND u.status = 'BOOKING'
  AND NOT EXISTS (
    SELECT 1
    FROM "UnitBooking" b
    WHERE b."unitId" = u.id
      AND b."isActive" = true
      AND b.status IN ('ACTIVE', 'PENDING')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Contract" c
    WHERE c."unitId" = u.id
      AND c."isActive" = true
      AND c."deletedAt" IS NULL
      AND c.status NOT IN ('EXPIRED', 'TERMINATED')
  );
