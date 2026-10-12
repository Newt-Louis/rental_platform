/**
 * Who is holding each space, for the Spaces screens.
 *
 * The list, the floor plan and the mall map each used to describe a space in
 * their own words: only the list mentioned the handover, only the plan showed
 * the short-term slots, and none of the three said who was booking it -- so a
 * space could read "Đang giữ chỗ" on the map with no way to tell whose hold it
 * was without opening it. This resolves the answer once, from bookings the page
 * already has authority to read, and all three views render the same thing.
 */

export interface UnitBookingSummary {
  /** The party holding the space: the lead's brand, or the customer's company. */
  customerName: string;
  /** ACTIVE = holding it now; PENDING = waiting in the queue behind someone. */
  status: string;
  bookingNumber: string;
  /** How many live bookings this space carries, the holder included. */
  queueCount: number;
  expiresAt?: string | null;
}

const LIVE = new Set(['ACTIVE', 'PENDING']);

function nameOf(booking: any): string {
  return booking?.lead?.brandName
    ?? booking?.customer?.companyName
    ?? booking?.customer?.brandName
    ?? booking?.lead?.contactName
    ?? '—';
}

/**
 * Index live bookings by the space they are on.
 *
 * A space can carry a queue, so the one shown is the holder: ACTIVE before
 * PENDING, then lowest priority number. `queueCount` says how many others are
 * behind them, which is the part a leasing executive acts on.
 */
export function buildUnitBookingIndex(response: unknown): Record<string, UnitBookingSummary> {
  const rows: any[] = Array.isArray(response)
    ? response
    : ((response as any)?.data ?? []);
  if (!Array.isArray(rows)) return {};

  const byUnit: Record<string, any[]> = {};
  for (const row of rows) {
    if (!row?.unitId || !LIVE.has(row.status)) continue;
    (byUnit[row.unitId] ??= []).push(row);
  }

  const index: Record<string, UnitBookingSummary> = {};
  for (const [unitId, list] of Object.entries(byUnit)) {
    const holder = [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1;
      return (a.priority ?? 99) - (b.priority ?? 99);
    })[0];
    index[unitId] = {
      customerName: nameOf(holder),
      status: holder.status,
      bookingNumber: holder.bookingNumber ?? '',
      queueCount: list.length,
      expiresAt: holder.expiresAt ?? null,
    };
  }
  return index;
}

/** One line for a card, a tile or a map panel: "Zara Vietnam (+2 chờ)". */
export function bookingHolderLabel(summary: UnitBookingSummary | undefined): string | null {
  if (!summary) return null;
  const waiting = summary.queueCount - 1;
  return waiting > 0 ? `${summary.customerName} (+${waiting} chờ)` : summary.customerName;
}
