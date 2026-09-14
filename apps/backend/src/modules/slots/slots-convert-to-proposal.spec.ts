import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SlotsService } from './slots.service';

/**
 * Short-term booking (SlotBooking) used to dead-end at CONFIRMED — no path into
 * Proposal/Approval/Contract existed. convertToProposal() opens that path; these
 * tests cover its guards and the field mapping onto Proposal (a model designed
 * for monthly-recurring long-term leases, so the mapping is a documented
 * approximation — see the comment on convertToProposal itself).
 */
describe('SlotsService.convertToProposal', () => {
  const BOOKING = {
    id: 'sb-1',
    bookingRef: 'SB-2026-00001',
    slotId: 'slot-1',
    leadId: 'lead-1',
    customerId: null,
    status: 'CONFIRMED',
    startDatetime: new Date('2026-09-10T08:00:00Z'),
    endDatetime: new Date('2026-09-12T18:00:00Z'),
    installationStartDatetime: new Date('2026-09-10T06:00:00Z'),
    dismantlingEndDatetime: new Date('2026-09-12T20:00:00Z'),
    totalArea: 10,
    baseAmount: 5_000_000,
    discountPct: 10,
    totalAmount: 4_500_000,
    currencyCode: 'VND',
    notes: 'Pop-up cuối tuần',
    proposal: null,
    slot: { id: 'slot-1', code: 'S-01', unitId: 'unit-1', area: 10 },
  };

  const prisma: any = {
    slotBooking: { findUnique: jest.fn(), update: jest.fn() },
    lead: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
    proposal: { create: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new SlotsService(prisma, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
    prisma.proposal.count.mockResolvedValue(0);
    prisma.lead.findUnique.mockResolvedValue({ tenantId: 'tenant-1' });
  });

  it('rejects a booking that is not CONFIRMED', async () => {
    prisma.slotBooking.findUnique.mockResolvedValue({ ...BOOKING, status: 'PENDING' });
    await expect(service.convertToProposal('sb-1', {}, 'user-1')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a booking already linked to a proposal', async () => {
    prisma.slotBooking.findUnique.mockResolvedValue({ ...BOOKING, proposal: { id: 'p-existing' } });
    await expect(service.convertToProposal('sb-1', {}, 'user-1')).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown booking id', async () => {
    prisma.slotBooking.findUnique.mockResolvedValue(null);
    await expect(service.convertToProposal('missing', {}, 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('maps the booking onto a Proposal, marks the booking CONVERTED, and carries source metadata for audit', async () => {
    prisma.slotBooking.findUnique
      .mockResolvedValueOnce(BOOKING) // initial fetch with includes
      .mockResolvedValueOnce({ ...BOOKING, status: 'CONVERTED', proposal: { id: 'prop-1', proposalNumber: 'PROP-2026-00001', status: 'DRAFT' } }); // post-conversion refetch
    prisma.proposal.create.mockResolvedValue({ id: 'prop-1', proposalNumber: 'PROP-2026-00001' });

    const result = await service.convertToProposal('sb-1', { businessModel: 'POP_UP' as any, notes: 'Ghi chú riêng' }, 'user-1');

    expect(prisma.proposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slotBookingId: 'sb-1',
        unitId: 'unit-1',
        leadId: 'lead-1',
        tenantId: 'tenant-1',
        area: 10,
        term: 1,
        startDate: BOOKING.startDatetime,
        endDate: BOOKING.endDatetime,
        totalContractValue: 4_500_000, // the real value — not run through the monthly computeContractValue formula
        discount: 10,
        rentCurrency: 'VND',
        notes: 'Ghi chú riêng',
        businessModel: 'POP_UP',
        createdById: 'user-1',
        pricingSnapshot: expect.objectContaining({ sourceType: 'SLOT_BOOKING', slotBookingId: 'sb-1', bookingRef: 'SB-2026-00001' }),
      }),
    });
    expect(prisma.slotBooking.update).toHaveBeenCalledWith({ where: { id: 'sb-1' }, data: { status: 'CONVERTED' } });
    expect(result.proposal).toMatchObject({ id: 'prop-1' });
    expect(result.booking.proposal).toMatchObject({ id: 'prop-1' });
  });

  it('resolves tenantId from the customer when the booking has no lead', async () => {
    prisma.slotBooking.findUnique
      .mockResolvedValueOnce({ ...BOOKING, leadId: null, customerId: 'cust-1' })
      .mockResolvedValueOnce({ ...BOOKING, leadId: null, customerId: 'cust-1', status: 'CONVERTED' });
    prisma.customer.findUnique.mockResolvedValue({ tenantId: 'tenant-9' });
    prisma.proposal.create.mockResolvedValue({ id: 'prop-2' });

    await service.convertToProposal('sb-1', {}, 'user-1');

    expect(prisma.lead.findUnique).not.toHaveBeenCalled();
    expect(prisma.customer.findUnique).toHaveBeenCalledWith({ where: { id: 'cust-1' }, select: { tenantId: true } });
    expect(prisma.proposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-9', leadId: undefined }),
    });
  });
});
