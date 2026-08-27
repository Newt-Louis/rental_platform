-- AlterTable
ALTER TABLE "UnitBooking" ADD COLUMN     "budgetRentMax" DOUBLE PRECISION,
ADD COLUMN     "budgetRentMin" DOUBLE PRECISION,
ADD COLUMN     "businessSupportFeeSqm" DOUBLE PRECISION,
ADD COLUMN     "exchangeRate" DOUBLE PRECISION,
ADD COLUMN     "serviceFeeSqm" DOUBLE PRECISION;
