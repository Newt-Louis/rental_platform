import { describe, expect, it } from 'vitest';
import { buildUnitBookingIndex, bookingHolderLabel } from './unitBookingSummary';

/**
 * A space can carry a queue of bookings. The Spaces screens have room for one
 * name, so it has to be the right one: the party actually holding the space,
 * not whoever the API happened to return first.
 */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'b1', unitId: 'u1', status: 'ACTIVE', priority: 1,
  bookingNumber: 'BK-1', lead: { brandName: 'Zara Vietnam' },
  ...over,
});

describe('buildUnitBookingIndex', () => {
  it('names the party holding the space', () => {
    const index = buildUnitBookingIndex({ data: [row()] });
    expect(index.u1.customerName).toBe('Zara Vietnam');
    expect(index.u1.queueCount).toBe(1);
  });

  it('prefers the holder over anyone queued behind them', () => {
    const index = buildUnitBookingIndex({
      data: [
        row({ id: 'b2', status: 'PENDING', priority: 2, lead: { brandName: 'Second' } }),
        row({ id: 'b1', status: 'ACTIVE', priority: 1, lead: { brandName: 'Holder' } }),
      ],
    });
    expect(index.u1.customerName).toBe('Holder');
    expect(index.u1.queueCount).toBe(2);
  });

  it('falls back through the ways a counterparty can be named', () => {
    const index = buildUnitBookingIndex({
      data: [
        row({ unitId: 'u2', lead: null, customer: { companyName: 'Công ty A' } }),
        row({ unitId: 'u3', lead: { contactName: 'Chị Lan' } }),
      ],
    });
    expect(index.u2.customerName).toBe('Công ty A');
    expect(index.u3.customerName).toBe('Chị Lan');
  });

  it('ignores bookings that no longer hold anything', () => {
    const index = buildUnitBookingIndex({
      data: [row({ status: 'CANCELLED' }), row({ id: 'b2', unitId: 'u9', status: 'EXPIRED' })],
    });
    expect(index).toEqual({});
  });

  it('survives whatever shape the endpoint hands back', () => {
    expect(buildUnitBookingIndex(undefined)).toEqual({});
    expect(buildUnitBookingIndex({ data: null })).toEqual({});
    expect(buildUnitBookingIndex([row()]).u1.customerName).toBe('Zara Vietnam');
  });
});

describe('bookingHolderLabel', () => {
  it('says how many are waiting behind the holder', () => {
    const index = buildUnitBookingIndex({
      data: [row(), row({ id: 'b2', status: 'PENDING', priority: 2 }), row({ id: 'b3', status: 'PENDING', priority: 3 })],
    });
    expect(bookingHolderLabel(index.u1)).toBe('Zara Vietnam (+2 chờ)');
  });

  it('stays quiet when nobody is holding the space', () => {
    expect(bookingHolderLabel(undefined)).toBeNull();
  });
});
