-- CreateEnum
CREATE TYPE "SalesApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DISPUTED');

-- AlterTable
ALTER TABLE "SalesTurnover" ADD COLUMN     "status" "SalesApprovalStatus" NOT NULL DEFAULT 'PENDING';
