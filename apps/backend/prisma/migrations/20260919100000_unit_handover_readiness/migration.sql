-- CR-UNIT-HANDOVER-READINESS
-- Project → Leasing/Operation handover-readiness lifecycle. Additive only: no
-- existing table or column is altered. (The pre-existing, unrelated
-- `LeadFollowUp.updatedAt DROP DEFAULT` drift that `prisma migrate diff` also
-- reports was deliberately NOT absorbed into this migration.)

-- CreateEnum
CREATE TYPE "HandoverReadinessLifecycle" AS ENUM ('TRACKING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HandoverReadinessEventType" AS ENUM ('TRACKING_STARTED', 'TARGET_DATE_CHANGED', 'RISK_ADDED', 'RISK_RESOLVED', 'FOLLOWER_ADDED', 'FOLLOWER_REMOVED', 'EVIDENCE_ADDED', 'EVIDENCE_REMOVED', 'REMINDER_SENT', 'COMMITMENT_CONFLICT_DETECTED', 'CONFIRMED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HandoverRiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "HandoverRiskStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "UnitHandoverReadiness" (
    "id" TEXT NOT NULL,
    "mallId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "activeUnitId" TEXT,
    "lifecycleStatus" "HandoverReadinessLifecycle" NOT NULL DEFAULT 'TRACKING',
    "originalTargetDate" DATE NOT NULL,
    "targetReadyDate" DATE NOT NULL,
    "projectOwnerId" TEXT,
    "projectOwnerName" TEXT,
    "recordedById" TEXT NOT NULL,
    "note" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "UnitHandoverReadiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitHandoverReadinessEvent" (
    "id" TEXT NOT NULL,
    "readinessId" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "eventType" "HandoverReadinessEventType" NOT NULL,
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "oldDate" DATE,
    "newDate" DATE,
    "riskId" TEXT,
    "metadata" JSONB,
    "dedupeKey" TEXT,

    CONSTRAINT "UnitHandoverReadinessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitHandoverRisk" (
    "id" TEXT NOT NULL,
    "readinessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "HandoverRiskSeverity" NOT NULL,
    "status" "HandoverRiskStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "UnitHandoverRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitHandoverFollower" (
    "id" TEXT NOT NULL,
    "readinessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitHandoverFollower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitHandoverEvidence" (
    "id" TEXT NOT NULL,
    "readinessId" TEXT NOT NULL,
    "mallId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmationEventId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "UnitHandoverEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitHandoverReadiness_activeUnitId_key" ON "UnitHandoverReadiness"("activeUnitId");

-- CreateIndex
CREATE INDEX "UnitHandoverReadiness_mallId_lifecycleStatus_idx" ON "UnitHandoverReadiness"("mallId", "lifecycleStatus");

-- CreateIndex
CREATE INDEX "UnitHandoverReadiness_unitId_createdAt_idx" ON "UnitHandoverReadiness"("unitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnitHandoverReadinessEvent_dedupeKey_key" ON "UnitHandoverReadinessEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "UnitHandoverReadinessEvent_readinessId_sequence_idx" ON "UnitHandoverReadinessEvent"("readinessId", "sequence");

-- CreateIndex
CREATE INDEX "UnitHandoverReadinessEvent_readinessId_eventType_idx" ON "UnitHandoverReadinessEvent"("readinessId", "eventType");

-- CreateIndex
CREATE INDEX "UnitHandoverRisk_readinessId_status_severity_idx" ON "UnitHandoverRisk"("readinessId", "status", "severity");

-- CreateIndex
CREATE INDEX "UnitHandoverFollower_userId_idx" ON "UnitHandoverFollower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitHandoverFollower_readinessId_userId_key" ON "UnitHandoverFollower"("readinessId", "userId");

-- CreateIndex
CREATE INDEX "UnitHandoverEvidence_readinessId_confirmationEventId_idx" ON "UnitHandoverEvidence"("readinessId", "confirmationEventId");

-- AddForeignKey
ALTER TABLE "UnitHandoverReadiness" ADD CONSTRAINT "UnitHandoverReadiness_mallId_fkey" FOREIGN KEY ("mallId") REFERENCES "Mall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverReadiness" ADD CONSTRAINT "UnitHandoverReadiness_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverReadiness" ADD CONSTRAINT "UnitHandoverReadiness_projectOwnerId_fkey" FOREIGN KEY ("projectOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverReadiness" ADD CONSTRAINT "UnitHandoverReadiness_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverReadiness" ADD CONSTRAINT "UnitHandoverReadiness_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverReadiness" ADD CONSTRAINT "UnitHandoverReadiness_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverReadinessEvent" ADD CONSTRAINT "UnitHandoverReadinessEvent_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "UnitHandoverReadiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverReadinessEvent" ADD CONSTRAINT "UnitHandoverReadinessEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverRisk" ADD CONSTRAINT "UnitHandoverRisk_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "UnitHandoverReadiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverRisk" ADD CONSTRAINT "UnitHandoverRisk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverRisk" ADD CONSTRAINT "UnitHandoverRisk_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverFollower" ADD CONSTRAINT "UnitHandoverFollower_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "UnitHandoverReadiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverFollower" ADD CONSTRAINT "UnitHandoverFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverEvidence" ADD CONSTRAINT "UnitHandoverEvidence_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "UnitHandoverReadiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverEvidence" ADD CONSTRAINT "UnitHandoverEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitHandoverEvidence" ADD CONSTRAINT "UnitHandoverEvidence_confirmationEventId_fkey" FOREIGN KEY ("confirmationEventId") REFERENCES "UnitHandoverReadinessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Integrity rules Prisma cannot express ──────────────────────────────────

-- HANDOVER-002: activeUnitId mirrors unitId exactly while the record is live,
-- and is NULL exactly when it is CANCELLED. Together with the UNIQUE index on
-- activeUnitId this is the DB-level "one active readiness per Unit" rule.
ALTER TABLE "UnitHandoverReadiness"
  ADD CONSTRAINT "UnitHandoverReadiness_activeUnit_consistent_chk"
  CHECK (
    ("lifecycleStatus" = 'CANCELLED' AND "activeUnitId" IS NULL)
    OR ("lifecycleStatus" <> 'CANCELLED' AND "activeUnitId" = "unitId")
  );

ALTER TABLE "UnitHandoverReadiness"
  ADD CONSTRAINT "UnitHandoverReadiness_confirmation_consistent_chk"
  CHECK (
    ("lifecycleStatus" = 'CONFIRMED') = ("confirmedAt" IS NOT NULL AND "confirmedById" IS NOT NULL)
  );

-- HANDOVER-003: originalTargetDate, mallId and unitId never change after insert.
CREATE OR REPLACE FUNCTION "handover_readiness_immutable_guard"() RETURNS trigger AS $$
BEGIN
  IF NEW."originalTargetDate" IS DISTINCT FROM OLD."originalTargetDate" THEN
    RAISE EXCEPTION 'UnitHandoverReadiness.originalTargetDate is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."mallId" IS DISTINCT FROM OLD."mallId" OR NEW."unitId" IS DISTINCT FROM OLD."unitId" THEN
    RAISE EXCEPTION 'UnitHandoverReadiness ownership (mallId/unitId) is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitHandoverReadiness_immutable_guard"
  BEFORE UPDATE ON "UnitHandoverReadiness"
  FOR EACH ROW EXECUTE FUNCTION "handover_readiness_immutable_guard"();

-- The event ledger is business evidence: append-only. DELETE is possible only
-- in a session that explicitly opts in (disposable test fixtures / a governed
-- data-retention job): SET LOCAL handover_readiness.allow_purge = 'on'.
CREATE OR REPLACE FUNCTION "handover_readiness_event_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('handover_readiness.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'UnitHandoverReadinessEvent is append-only (% rejected)', TG_OP USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitHandoverReadinessEvent_append_only"
  BEFORE UPDATE OR DELETE ON "UnitHandoverReadinessEvent"
  FOR EACH ROW EXECUTE FUNCTION "handover_readiness_event_append_only"();

-- Confirmation evidence: file identity never changes; once linked to a
-- CONFIRMED event the row is frozen; linked rows cannot be soft-deleted and
-- soft-deleted rows cannot be linked. Rows are never hard-deleted outside an
-- explicit purge session (same opt-in as the event ledger).
CREATE OR REPLACE FUNCTION "handover_evidence_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('handover_readiness.allow_purge', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'UnitHandoverEvidence rows cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."readinessId" IS DISTINCT FROM OLD."readinessId"
     OR NEW."mallId" IS DISTINCT FROM OLD."mallId"
     OR NEW."fileName" IS DISTINCT FROM OLD."fileName"
     OR NEW."filePath" IS DISTINCT FROM OLD."filePath"
     OR NEW."fileSize" IS DISTINCT FROM OLD."fileSize"
     OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType"
     OR NEW."sha256" IS DISTINCT FROM OLD."sha256"
     OR NEW."uploadedById" IS DISTINCT FROM OLD."uploadedById"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'UnitHandoverEvidence file identity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD."confirmationEventId" IS NOT NULL AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    RAISE EXCEPTION 'UnitHandoverEvidence linked to a confirmation is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."confirmationEventId" IS NOT NULL AND NEW."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Deleted UnitHandoverEvidence cannot be confirmation evidence' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitHandoverEvidence_guard"
  BEFORE UPDATE OR DELETE ON "UnitHandoverEvidence"
  FOR EACH ROW EXECUTE FUNCTION "handover_evidence_guard"();

-- ─── Action permissions (DB-backed ModulePermission matrix) ─────────────────
-- Same seeding pattern as 20260909081000_add_fitout_dossier_view_permission:
-- every existing Mall scope + GLOBAL. ADMIN is never stored in this table; its
-- per-action treatment is explicit in HANDOVER_READINESS_ADMIN_ACTIONS
-- (handover-readiness-access.service.ts) -- in particular ADMIN is NOT a
-- default confirmer. FITOUT_BASIC_TEAM is deliberately absent everywhere
-- (a Project user gets authority by being granted the action, not by role).
WITH scopes AS (
  SELECT DISTINCT "mallId" FROM "ModulePermission"
  UNION SELECT 'GLOBAL'
), grants(module, role) AS (
  VALUES
    ('handover-readiness-view', 'MALL_DIRECTOR'::"Role"),
    ('handover-readiness-view', 'LEASING_MANAGER'::"Role"),
    ('handover-readiness-view', 'LEASING_EXECUTIVE'::"Role"),
    ('handover-readiness-view', 'OPERATION'::"Role"),
    ('handover-readiness-manage', 'MALL_DIRECTOR'::"Role"),
    ('handover-readiness-manage', 'LEASING_MANAGER'::"Role"),
    ('handover-readiness-risk-manage', 'MALL_DIRECTOR'::"Role"),
    ('handover-readiness-risk-manage', 'LEASING_MANAGER'::"Role"),
    ('handover-readiness-risk-manage', 'OPERATION'::"Role"),
    ('handover-readiness-confirm', 'OPERATION'::"Role"),
    ('handover-readiness-reopen', 'MALL_DIRECTOR'::"Role")
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
