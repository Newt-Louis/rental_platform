/*
  Warnings:

  - You are about to drop the column `shortTermPlanUrl` on the `Unit` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "UnitMediaType" ADD VALUE 'SHORT_TERM_PLAN';

-- AlterTable
ALTER TABLE "Unit" DROP COLUMN "shortTermPlanUrl";
