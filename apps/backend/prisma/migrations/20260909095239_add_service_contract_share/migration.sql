-- CreateEnum
CREATE TYPE "ServiceContractSharePermission" AS ENUM ('READ', 'EDIT', 'DELETE');

-- CreateTable
CREATE TABLE "ServiceContractShare" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "ServiceContractSharePermission" NOT NULL DEFAULT 'READ',
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContractShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceContractShare_userId_idx" ON "ServiceContractShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContractShare_contractId_userId_key" ON "ServiceContractShare"("contractId", "userId");

-- AddForeignKey
ALTER TABLE "ServiceContractShare" ADD CONSTRAINT "ServiceContractShare_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractShare" ADD CONSTRAINT "ServiceContractShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractShare" ADD CONSTRAINT "ServiceContractShare_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
