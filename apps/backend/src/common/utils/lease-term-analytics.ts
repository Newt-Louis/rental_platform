import { UnitLeaseTermType, UnitStatus } from '@prisma/client';

export type LeaseTermUnit = {
  id: string;
  leaseTermType: UnitLeaseTermType;
  status: UnitStatus | string;
  areaNLA: number;
};

export type ShortTermBookingWindow = {
  status: string;
  installationStartDatetime: Date | null;
  dismantlingEndDatetime: Date | null;
  startDatetime: Date;
  endDatetime: Date;
  totalAmount?: number | null;
  slot: { id: string; unitId: string; area: number };
};

export function summarizeOccupancyByLeaseTerm(
  units: LeaseTermUnit[],
  shortBookings: ShortTermBookingWindow[],
  at = new Date(),
) {
  const activeShortSlots = new Map<string, { unitId: string; area: number }>();
  for (const booking of shortBookings) {
    if (booking.status && !['PENDING', 'CONFIRMED'].includes(booking.status)) continue;
    const occupiedFrom = booking.installationStartDatetime ?? booking.startDatetime;
    const occupiedTo = booking.dismantlingEndDatetime ?? booking.endDatetime;
    if (occupiedFrom <= at && occupiedTo >= at) {
      activeShortSlots.set(booking.slot.id, { unitId: booking.slot.unitId, area: booking.slot.area });
    }
  }

  const summarize = (leaseTermType: UnitLeaseTermType, label: string) => {
    const zoneUnits = units.filter((unit) => unit.leaseTermType === leaseTermType);
    const unitIds = new Set(zoneUnits.map((unit) => unit.id));
    const totalArea = zoneUnits.reduce((sum, unit) => sum + (unit.areaNLA ?? 0), 0);
    const longOccupied = zoneUnits.filter((unit) => unit.status === UnitStatus.OCCUPIED);
    const relevantSlots = Array.from(activeShortSlots.values()).filter((slot) => unitIds.has(slot.unitId));
    const bookedUnitIds = new Set(relevantSlots.map((slot) => slot.unitId));
    const occupied = leaseTermType === UnitLeaseTermType.SHORT ? bookedUnitIds.size : longOccupied.length;
    const occupiedArea = leaseTermType === UnitLeaseTermType.SHORT
      ? Math.min(totalArea, relevantSlots.reduce((sum, slot) => sum + slot.area, 0))
      : longOccupied.reduce((sum, unit) => sum + (unit.areaNLA ?? 0), 0);

    return {
      leaseTermType,
      label,
      total: zoneUnits.length,
      occupied,
      vacant: Math.max(0, zoneUnits.length - occupied),
      totalArea,
      occupiedArea,
      vacantArea: Math.max(0, totalArea - occupiedArea),
      occupancyRate: totalArea > 0 ? Math.round((occupiedArea / totalArea) * 1000) / 10 : 0,
    };
  };

  return {
    LONG: summarize(UnitLeaseTermType.LONG, 'Cho thuê dài hạn'),
    SHORT: summarize(UnitLeaseTermType.SHORT, 'Cho thuê ngắn hạn'),
  };
}

export function summarizeShortBookingPipeline(bookings: ShortTermBookingWindow[]) {
  const count = (status: string) => bookings.filter((booking) => booking.status === status).length;
  return {
    total: bookings.length,
    pending: count('PENDING'),
    confirmed: count('CONFIRMED'),
    completed: count('COMPLETED'),
    cancelled: count('CANCELLED'),
    revenue: bookings
      .filter((booking) => ['CONFIRMED', 'COMPLETED'].includes(booking.status))
      .reduce((sum, booking) => sum + (booking.totalAmount ?? 0), 0),
  };
}
