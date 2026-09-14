// RPT-CUR-006 / CUR-002 (slot subset) — presentation of slot pricing and
// short-term booking amounts.
//
// Slot prices were rendered with a literal '₫' and booking amounts through a
// `fmtMoney` that appended '₫' unconditionally, over values the model could not
// prove were VND. `UnitSlot.currencyCode` and `SlotBooking.currencyCode` now
// exist, so the unit comes from the data.
//
// A NULL currency is a row recorded before the column existed. It is shown as
// unknown, never as VND.
import { formatMoney, type CurrencyCode } from '@/lib/currency';

export const UNKNOWN_SLOT_CURRENCY = 'UNKNOWN' as const;
export type SlotCurrencyKey = CurrencyCode | typeof UNKNOWN_SLOT_CURRENCY;

export interface SlotRevenueBucket {
  currencyCode: SlotCurrencyKey;
  amount: number;
  bookingCount: number;
}

export interface SlotBookingAmount {
  totalAmount?: number | null;
  currencyCode?: CurrencyCode | null;
}

const BUCKET_ORDER: SlotCurrencyKey[] = ['VND', 'USD', 'MMK', UNKNOWN_SLOT_CURRENCY];

const rank = (key: SlotCurrencyKey) => {
  const i = BUCKET_ORDER.indexOf(key);
  return i === -1 ? 98 : i;
};

/** NOT `?? 'VND'`. */
export function slotCurrencyKey(row: SlotBookingAmount): SlotCurrencyKey {
  return row.currencyCode ?? UNKNOWN_SLOT_CURRENCY;
}

/**
 * A slot price or booking amount with its own currency. When the currency is
 * unknown the figure is still shown — hiding it would lose information — but it
 * is labelled as having no unit of account rather than being given one.
 */
export function formatSlotMoney(
  amount: number | null | undefined,
  currencyCode: CurrencyCode | null | undefined,
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  if (!currencyCode) return `${Math.round(amount).toLocaleString('vi-VN')} (chưa rõ ĐVT)`;
  return formatMoney(amount, currencyCode);
}

/** Mirrors the backend's groupSlotRevenueByCurrency — keep the two in sync. */
export function groupSlotRevenueByCurrency(bookings: SlotBookingAmount[]): SlotRevenueBucket[] {
  const map = new Map<SlotCurrencyKey, { amount: number; bookingCount: number }>();
  for (const booking of bookings) {
    const key = slotCurrencyKey(booking);
    const acc = map.get(key) ?? { amount: 0, bookingCount: 0 };
    acc.amount += booking.totalAmount ?? 0;
    acc.bookingCount += 1;
    map.set(key, acc);
  }
  return [...map.entries()]
    .map(([currencyCode, v]) => ({ currencyCode, ...v }))
    .sort((a, b) => rank(a.currencyCode) - rank(b.currencyCode));
}

export function formatSlotBucket(bucket: SlotRevenueBucket): string {
  return bucket.currencyCode === UNKNOWN_SLOT_CURRENCY
    ? `${Math.round(bucket.amount).toLocaleString('vi-VN')} (chưa rõ ĐVT)`
    : formatMoney(bucket.amount, bucket.currencyCode);
}
