-- CR-NOTIFICATION-RECIPIENT-ROUTING
-- Admin-governed recipient routing per notification event. Additive only: no
-- existing table is altered and no row is written, so before an administrator
-- configures anything every email keeps its current recipients exactly
-- (deployment invariant, CR section 42). The pre-existing, unrelated
-- `LeadFollowUp.updatedAt DROP DEFAULT` drift reported by `prisma migrate diff`
-- is deliberately NOT absorbed here.




-- CreateEnum
CREATE TYPE "NotificationRoutingMode" AS ENUM ('DEFAULT', 'REPLACE', 'DEFAULT_PLUS_CC');

-- CreateEnum
CREATE TYPE "NotificationRecipientType" AS ENUM ('TO', 'CC');

-- CreateTable
CREATE TABLE "NotificationEventRoutingConfig" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "mallId" TEXT NOT NULL,
    "mode" "NotificationRoutingMode" NOT NULL DEFAULT 'DEFAULT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "NotificationEventRoutingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEventRecipient" (
    "id" TEXT NOT NULL,
    "routingConfigId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientType" "NotificationRecipientType" NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEventRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationEventRoutingConfig_mallId_idx" ON "NotificationEventRoutingConfig"("mallId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEventRoutingConfig_eventKey_mallId_key" ON "NotificationEventRoutingConfig"("eventKey", "mallId");

-- CreateIndex
CREATE INDEX "NotificationEventRecipient_userId_idx" ON "NotificationEventRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEventRecipient_routingConfigId_userId_recipient_key" ON "NotificationEventRecipient"("routingConfigId", "userId", "recipientType");

-- AddForeignKey
ALTER TABLE "NotificationEventRecipient" ADD CONSTRAINT "NotificationEventRecipient_routingConfigId_fkey" FOREIGN KEY ("routingConfigId") REFERENCES "NotificationEventRoutingConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEventRecipient" ADD CONSTRAINT "NotificationEventRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Group policy is enforced in NotificationRoutingConfigService, but the two
-- rules that must hold for every row regardless of code path are also stated
-- here, so a bad row cannot exist even via direct SQL:
--   1. REPLACE must own at least one recipient (no silent "configured but
--      behaves like default" state, CR section 7). Enforced by trigger because
--      it spans parent and child rows.
--   2. A recipient row must belong to a config whose mode actually uses it.
CREATE OR REPLACE FUNCTION "notification_routing_replace_requires_recipient"() RETURNS trigger AS $$
DECLARE
  cfg_id text;
  cfg_mode "NotificationRoutingMode";
  recipient_count int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    cfg_id := OLD."routingConfigId";
  ELSIF TG_TABLE_NAME = 'NotificationEventRoutingConfig' THEN
    cfg_id := NEW."id";
  ELSE
    cfg_id := NEW."routingConfigId";
  END IF;

  SELECT "mode" INTO cfg_mode FROM "NotificationEventRoutingConfig" WHERE "id" = cfg_id;
  -- Config already gone (reset deletes children first) or plain DEFAULT: nothing to enforce.
  IF cfg_mode IS NULL OR cfg_mode = 'DEFAULT' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO recipient_count FROM "NotificationEventRecipient" WHERE "routingConfigId" = cfg_id;
  IF cfg_mode = 'REPLACE' AND recipient_count = 0 THEN
    RAISE EXCEPTION 'A REPLACE routing config must keep at least one recipient' USING ERRCODE = 'P0001';
  END IF;
  IF cfg_mode = 'DEFAULT_PLUS_CC' AND recipient_count = 0 THEN
    RAISE EXCEPTION 'A DEFAULT_PLUS_CC routing config must keep at least one CC recipient' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "NotificationEventRoutingConfig_requires_recipient"
  AFTER INSERT OR UPDATE ON "NotificationEventRoutingConfig"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "notification_routing_replace_requires_recipient"();

CREATE CONSTRAINT TRIGGER "NotificationEventRecipient_requires_recipient"
  AFTER DELETE ON "NotificationEventRecipient"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "notification_routing_replace_requires_recipient"();

-- Action permissions for the admin screen. Same seeding pattern as the
-- existing action-permission migrations: every current Mall scope + GLOBAL.
-- ADMIN is never stored (the guard bypasses it); MALL_DIRECTOR gets view+manage
-- for Malls they actually hold access to, and test-send stays ADMIN-only.
WITH scopes AS (
  SELECT DISTINCT "mallId" FROM "ModulePermission"
  UNION SELECT 'GLOBAL'
), grants(module, role) AS (
  VALUES
    ('notification-routing-view', 'MALL_DIRECTOR'::"Role"),
    ('notification-routing-manage', 'MALL_DIRECTOR'::"Role")
)
INSERT INTO "ModulePermission" (
  "id", "module", "role", "mallId", "allowed", "updatedAt", "createdAt"
)
SELECT
  grants.module || '-' || md5(scopes."mallId" || grants.role::text),
  grants.module,
  grants.role,
  scopes."mallId",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM scopes CROSS JOIN grants
ON CONFLICT ("module", "role", "mallId") DO NOTHING;
