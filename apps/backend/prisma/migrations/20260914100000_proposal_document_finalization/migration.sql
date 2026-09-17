-- CR-PROPOSAL-DOCUMENT-FINALIZATION
-- Immutable submitted Tờ trình versions, workflow → version binding, and the
-- external-send ledger.

-- CreateEnum
CREATE TYPE "ProposalDocumentVersionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "ApprovalWorkflow" ADD COLUMN     "documentVersionId" TEXT;

-- CreateTable
CREATE TABLE "ProposalDocumentVersion" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProposalDocumentVersionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "sourceFingerprint" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "factsSnapshot" JSONB NOT NULL,
    "contentSnapshot" JSONB NOT NULL,
    "renderedSnapshot" JSONB NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalDocumentSend" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "recipients" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "attachmentFilename" TEXT NOT NULL,
    "attachmentSha256" TEXT NOT NULL,
    "emailDeliveryId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalDocumentSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalDocumentVersion_proposalId_status_idx" ON "ProposalDocumentVersion"("proposalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDocumentVersion_proposalId_versionNumber_key" ON "ProposalDocumentVersion"("proposalId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDocumentSend_emailDeliveryId_key" ON "ProposalDocumentSend"("emailDeliveryId");

-- CreateIndex
CREATE INDEX "ProposalDocumentSend_proposalId_createdAt_idx" ON "ProposalDocumentSend"("proposalId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDocumentSend_proposalId_idempotencyKey_key" ON "ProposalDocumentSend"("proposalId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalWorkflow_documentVersionId_key" ON "ApprovalWorkflow"("documentVersionId");

-- AddForeignKey
ALTER TABLE "ApprovalWorkflow" ADD CONSTRAINT "ApprovalWorkflow_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "ProposalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDocumentVersion" ADD CONSTRAINT "ProposalDocumentVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDocumentSend" ADD CONSTRAINT "ProposalDocumentSend_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDocumentSend" ADD CONSTRAINT "ProposalDocumentSend_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "ProposalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDocumentSend" ADD CONSTRAINT "ProposalDocumentSend_emailDeliveryId_fkey" FOREIGN KEY ("emailDeliveryId") REFERENCES "EmailDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A submitted document is evidence. Only its lifecycle status may change; the
-- reviewed content, facts, fingerprint and identity are frozen at submit.
CREATE OR REPLACE FUNCTION "proposal_document_version_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."proposalId" IS DISTINCT FROM OLD."proposalId"
     OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
     OR NEW."sourceFingerprint" IS DISTINCT FROM OLD."sourceFingerprint"
     OR NEW."contentVersion" IS DISTINCT FROM OLD."contentVersion"
     OR NEW."factsSnapshot" IS DISTINCT FROM OLD."factsSnapshot"
     OR NEW."contentSnapshot" IS DISTINCT FROM OLD."contentSnapshot"
     OR NEW."renderedSnapshot" IS DISTINCT FROM OLD."renderedSnapshot"
     OR NEW."submittedById" IS DISTINCT FROM OLD."submittedById"
     OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt" THEN
    RAISE EXCEPTION 'ProposalDocumentVersion % is immutable; only status may change', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "proposal_document_version_immutable"
BEFORE UPDATE ON "ProposalDocumentVersion"
FOR EACH ROW EXECUTE FUNCTION "proposal_document_version_immutable"();

-- Action-level permission for sending a Tờ trình outside the company, following
-- the fitout-dossier-view pattern. ADMIN is absent: RolesGuard grants its bypass.
WITH scopes AS (
  SELECT DISTINCT "mallId" FROM "ModulePermission"
  UNION SELECT 'GLOBAL'
), roles(role) AS (
  VALUES ('LEASING_MANAGER'::"Role"), ('MALL_DIRECTOR'::"Role")
)
INSERT INTO "ModulePermission" ("id", "module", "role", "mallId", "allowed", "updatedAt", "createdAt")
SELECT
  'proposal-send-external-' || md5(scopes."mallId" || roles.role::text),
  'proposal-send-external',
  roles.role,
  scopes."mallId",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM scopes CROSS JOIN roles
ON CONFLICT ("module", "role", "mallId") DO NOTHING;
