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
});
