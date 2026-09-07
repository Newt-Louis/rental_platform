import { UnitLeaseTermType, UnitStatus, CurrencyCode } from '@prisma/client';

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
  // RPT-CUR-006: the booking-time currency snapshot. Optional because legacy
  // rows predate the column -- null means UNKNOWN, never VND.
  currencyCode?: CurrencyCode | null;
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
    // RPT-CUR-006 — the authoritative monetary contract: one bucket per
    // currency, plus an explicit UNKNOWN for bookings recorded before
    // SlotBooking carried a currency. No combined total: there is no FX engine.
    revenueByCurrency: groupSlotRevenueByCurrency(
      bookings.filter((booking) => ['CONFIRMED', 'COMPLETED'].includes(booking.status)),
    ),
    ...scalarRevenue(
      bookings.filter((booking) => ['CONFIRMED', 'COMPLETED'].includes(booking.status)),
    ),
  };
}

/**
 * RPT-CUR-006 — the scalar that used to sit here was
 * `VND + USD + UNKNOWN` added together. A number like that has no unit of
 * account, cannot be labelled, and violates MON-CUR-02, so it is not emitted as
 * money at all.
 *
 * `revenueScalar` is a real figure ONLY when exactly one known currency governs
 * every counted booking; then `revenueScalarCurrency` names it. In every other
 * case — more than one currency, or any booking whose currency was never
 * captured — it is `null` and `revenueCurrencyMixed` says why. Consumers read
 * `revenueByCurrency`, which is authoritative.
 */
function scalarRevenue(counted: { totalAmount?: number | null; currencyCode?: CurrencyCode | null }[]) {
  const currencies = new Set(counted.map((b) => b.currencyCode ?? UNKNOWN_SLOT_CURRENCY));
  const hasUnknown = currencies.has(UNKNOWN_SLOT_CURRENCY);
  const single = currencies.size === 1 && !hasUnknown
    ? ([...currencies][0] as CurrencyCode)
    : null;

  return {
    revenueScalar: single
      ? counted.reduce((sum, b) => sum + (b.totalAmount ?? 0), 0)
      : null,
    revenueScalarCurrency: single,
    revenueCurrencyMixed: currencies.size > 1,
    revenueCurrencyUnknown: hasUnknown,
  };
}

/** Merge SHORT revenue buckets across malls, still never mixing currencies. */
export function mergeSlotRevenueBuckets(lists: SlotRevenueBucket[][]): SlotRevenueBucket[] {
  const merged = new Map<SlotCurrencyKey, { amount: number; bookingCount: number }>();
  for (const bucket of lists.flat()) {
    const acc = merged.get(bucket.currencyCode) ?? { amount: 0, bookingCount: 0 };
    acc.amount += bucket.amount;
    acc.bookingCount += bucket.bookingCount;
    merged.set(bucket.currencyCode, acc);
  }
  return [...merged.entries()]
    .map(([currencyCode, v]) => ({ currencyCode, ...v }))
    .sort((a, b) => slotCurrencyRank(a.currencyCode) - slotCurrencyRank(b.currencyCode));
}

export const UNKNOWN_SLOT_CURRENCY = 'UNKNOWN' as const;
export type SlotCurrencyKey = CurrencyCode | typeof UNKNOWN_SLOT_CURRENCY;

export interface SlotRevenueBucket {
  currencyCode: SlotCurrencyKey;
  amount: number;
  bookingCount: number;
}

const SLOT_CURRENCY_ORDER: SlotCurrencyKey[] = ['VND', 'USD', 'MMK', UNKNOWN_SLOT_CURRENCY];

/**
 * RPT-CUR-006 — group short-term booking revenue by the currency each booking
 * snapshotted. NOT `?? 'VND'`: a booking with no captured currency is unknown,
 * and saying so is the entire point.
 */
export function groupSlotRevenueByCurrency(
  bookings: { totalAmount?: number | null; currencyCode?: CurrencyCode | null }[],
): SlotRevenueBucket[] {
  const map = new Map<SlotCurrencyKey, { amount: number; bookingCount: number }>();
  for (const booking of bookings) {
    const key: SlotCurrencyKey = booking.currencyCode ?? UNKNOWN_SLOT_CURRENCY;
    const acc = map.get(key) ?? { amount: 0, bookingCount: 0 };
    acc.amount += booking.totalAmount ?? 0;
    acc.bookingCount += 1;
    map.set(key, acc);
  }
  return [...map.entries()]
    .map(([currencyCode, v]) => ({ currencyCode, ...v }))
    .sort((a, b) => slotCurrencyRank(a.currencyCode) - slotCurrencyRank(b.currencyCode));
}

function slotCurrencyRank(k: SlotCurrencyKey): number {
  const i = SLOT_CURRENCY_ORDER.indexOf(k);
  return i === -1 ? 98 : i;
}
