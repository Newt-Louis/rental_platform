-- Proposal governance: decision evidence on ApprovalStep.
-- A decided step keeps the display identity of whoever decided it, so an
-- approved document does not change when that User is later renamed.
-- Existing decided rows are left NULL on purpose: nothing recorded who they
-- were at decision time, and copying today's name would fabricate history.

-- AlterTable
ALTER TABLE "ApprovalStep" ADD COLUMN     "decidedByDisplayName" TEXT,
ADD COLUMN     "decidedByUserId" TEXT;

-- Once decision evidence is captured it is frozen. The only runtime writer is
-- the PENDING -> APPROVED/REJECTED claim, which sets it exactly once.
CREATE OR REPLACE FUNCTION "approval_step_decision_evidence_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."decidedByDisplayName" IS NOT NULL AND (
       NEW."decidedByDisplayName" IS DISTINCT FROM OLD."decidedByDisplayName"
    OR NEW."decidedByUserId" IS DISTINCT FROM OLD."decidedByUserId"
    OR NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt"
    OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."comment" IS DISTINCT FROM OLD."comment"
  ) THEN
    RAISE EXCEPTION 'ApprovalStep % decision evidence is immutable', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "approval_step_decision_evidence_immutable"
BEFORE UPDATE ON "ApprovalStep"
FOR EACH ROW EXECUTE FUNCTION "approval_step_decision_evidence_immutable"();
