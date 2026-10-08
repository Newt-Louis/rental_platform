-- Booking period: optional date range a unit is booked for. Additive only.
ALTER TABLE "UnitBooking" ADD COLUMN "bookingStartDate" TIMESTAMP(3),
ADD COLUMN "bookingEndDate" TIMESTAMP(3);
