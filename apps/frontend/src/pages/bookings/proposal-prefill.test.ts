import { describe, expect, it } from 'vitest';
import { buildProposalPrefill } from './proposal-prefill';

describe('buildProposalPrefill', () => {
  it('prioritizes approved sales pricing and inherits the booking terms', () => {
    const result = buildProposalPrefill({
      id: 'booking-1',
      bookingNumber: 'BK-2026-00001',
      unitId: 'unit-1',
      status: 'ACTIVE',
      priority: 1,
      requestedArea: 125,
      requestedTerm: 48,
      expectedRent: 700000,
      proposedRentPerSqm: 680000,
      proposedCamPerSqm: 85000,
      notes: 'Điều kiện đã thống nhất tại booking',
      holdDays: 30,
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
      unit: {
        id: 'unit-1', mallId: 'mall-1', code: 'L1-01', areaGFA: 150, areaNLA: 140,
        baseRentPerSqm: 750000, camPerSqm: 90000, status: 'BOOKING', escalationRate: 6,
      },
    });

    expect(result).toMatchObject({
      area: '125', term: '48', rentPerSqm: '680000', camPerSqm: '85000',
      escalationPercent: '6', notes: 'Điều kiện đã thống nhất tại booking',
    });
  });

  it('falls back to unit pricing when booking pricing is absent', () => {
    const result = buildProposalPrefill({
      id: 'booking-2', bookingNumber: 'BK-2026-00002', unitId: 'unit-2', status: 'ACTIVE',
      priority: 1, holdDays: 30, createdAt: '', updatedAt: '',
      unit: {
        id: 'unit-2', mallId: 'mall-1', code: 'K-01', areaGFA: 30, areaNLA: 25,
        baseRentPerSqm: 500000, askingRentPerSqm: 480000, camPerSqm: 50000,
        minLeaseTerm: 12, spaceType: 'KIOSK_EVENT', status: 'BOOKING',
      },
    });

    expect(result).toMatchObject({
      area: '25', term: '12', rentPerSqm: '480000', camPerSqm: '50000', businessModel: 'KIOSK',
    });
  });

  it('inherits the booking currency instead of defaulting to VND', () => {
    const result = buildProposalPrefill({
      id: 'booking-3', bookingNumber: 'BK-2026-00003', unitId: 'unit-3', status: 'ACTIVE',
      priority: 1, holdDays: 30, createdAt: '', updatedAt: '',
      currencyCode: 'USD',
      unit: {
        id: 'unit-3', mallId: 'mall-1', code: 'L2-01', areaGFA: 60, areaNLA: 55,
        baseRentPerSqm: 25, camPerSqm: 3, status: 'BOOKING',
      },
    });

    expect(result.rentCurrency).toBe('USD');
  });

  // Regression: found live in the running dev environment. A booking priced in USD had
  // proposedRentPerSqm set (a real USD rate) but no proposedCamPerSqm, so the prefill fell back
  // to Unit.camPerSqm -- a VND-denominated field -- and silently mixed a VND-scale CAM rate
  // (e.g. 75,000) into an otherwise-USD proposal, producing a wildly wrong monthly bill once the
  // resulting contract was billed.
  it('does not fall back to Unit.camPerSqm/baseRentPerSqm (VND-only fields) for a non-VND booking', () => {
    const result = buildProposalPrefill({
      id: 'booking-5', bookingNumber: 'BK-2026-00005', unitId: 'unit-5', status: 'ACTIVE',
      priority: 1, holdDays: 30, createdAt: '', updatedAt: '',
      currencyCode: 'USD',
      proposedRentPerSqm: 323,
      unit: {
        id: 'unit-5', mallId: 'mall-1', code: 'L4-B02', areaGFA: 240, areaNLA: 233,
        baseRentPerSqm: 600000, camPerSqm: 75000, status: 'BOOKING',
      },
    });

    expect(result.rentPerSqm).toBe('323');
    expect(result.camPerSqm).toBe('');
  });

  it('still falls back to Unit.camPerSqm/baseRentPerSqm for a VND booking (unchanged behavior)', () => {
    const result = buildProposalPrefill({
      id: 'booking-6', bookingNumber: 'BK-2026-00006', unitId: 'unit-6', status: 'ACTIVE',
      priority: 1, holdDays: 30, createdAt: '', updatedAt: '',
      unit: {
        id: 'unit-6', mallId: 'mall-1', code: 'L4-B03', areaGFA: 240, areaNLA: 233,
        baseRentPerSqm: 600000, camPerSqm: 75000, status: 'BOOKING',
      },
    });

    expect(result.rentPerSqm).toBe('600000');
    expect(result.camPerSqm).toBe('75000');
  });

  // Units carry their own currencyCode now, so the fallback rule is "same currency as the
  // proposal", not "proposal is VND". These two cases only became reachable once a Unit
  // could be quoted in something other than VND.
  it('falls back to a USD Unit for a USD booking (previously left blank)', () => {
    const result = buildProposalPrefill({
      id: 'booking-7', bookingNumber: 'BK-2026-00007', unitId: 'unit-7', status: 'ACTIVE',
      priority: 1, holdDays: 30, createdAt: '', updatedAt: '',
      currencyCode: 'USD',
      unit: {
        id: 'unit-7', mallId: 'mall-1', code: 'L3-E01', areaGFA: 60, areaNLA: 55,
        baseRentPerSqm: 25, camPerSqm: 3, status: 'BOOKING', currencyCode: 'USD',
      } as any,
    });

    expect(result.rentPerSqm).toBe('25');
    expect(result.camPerSqm).toBe('3');
  });

  it('does not let a USD Unit prefill a VND booking', () => {
    const result = buildProposalPrefill({
      id: 'booking-8', bookingNumber: 'BK-2026-00008', unitId: 'unit-8', status: 'ACTIVE',
      priority: 1, holdDays: 30, createdAt: '', updatedAt: '',
      currencyCode: 'VND',
      unit: {
        id: 'unit-8', mallId: 'mall-1', code: 'L3-E02', areaGFA: 60, areaNLA: 55,
        baseRentPerSqm: 25, camPerSqm: 3, status: 'BOOKING', currencyCode: 'USD',
      } as any,
    });

    expect(result.rentPerSqm).toBe('');
    expect(result.camPerSqm).toBe('');
  });

  it('defaults to VND when the booking has no currencyCode', () => {
    const result = buildProposalPrefill({
      id: 'booking-4', bookingNumber: 'BK-2026-00004', unitId: 'unit-4', status: 'ACTIVE',
      priority: 1, holdDays: 30, createdAt: '', updatedAt: '',
      unit: {
        id: 'unit-4', mallId: 'mall-1', code: 'L2-02', areaGFA: 60, areaNLA: 55,
        baseRentPerSqm: 500000, camPerSqm: 50000, status: 'BOOKING',
      },
    });

    expect(result.rentCurrency).toBe('VND');
  });
});
