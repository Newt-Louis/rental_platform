ALTER TABLE "User" ADD COLUMN "inviteTokenHash" TEXT, ADD COLUMN "inviteExpiresAt" TIMESTAMP(3), ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "User_inviteTokenHash_idx" ON "User"("inviteTokenHash");
