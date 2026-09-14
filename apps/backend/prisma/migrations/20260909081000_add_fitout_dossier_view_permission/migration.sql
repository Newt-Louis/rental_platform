-- Action-level permission rows for the completed Fitout dossier archive.
-- ADMIN is intentionally absent because RolesGuard already grants its platform bypass.
WITH scopes AS (
  SELECT DISTINCT "mallId" FROM "ModulePermission"
  UNION SELECT 'GLOBAL'
), roles(role) AS (
  VALUES
    ('LEASING_MANAGER'::"Role"),
    ('LEASING_EXECUTIVE'::"Role"),
    ('MALL_DIRECTOR'::"Role"),
    ('FINANCE'::"Role"),
    ('LEGAL'::"Role"),
    ('FITOUT_BASIC_TEAM'::"Role")
)
INSERT INTO "ModulePermission" (
  "id", "module", "role", "mallId", "allowed", "updatedAt", "createdAt"
)
SELECT
  'fitout-dossier-view-' || md5(scopes."mallId" || roles.role::text),
  'fitout-dossier-view',
  roles.role,
  scopes."mallId",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM scopes CROSS JOIN roles
ON CONFLICT ("module", "role", "mallId") DO NOTHING;
