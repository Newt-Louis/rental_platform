ALTER TABLE "ParkingCustomerContract"
ADD COLUMN "contractType" TEXT NOT NULL DEFAULT 'FIXED_QUOTA';

CREATE INDEX "ParkingCustomerContract_contractType_status_idx"
ON "ParkingCustomerContract"("contractType", "status");
