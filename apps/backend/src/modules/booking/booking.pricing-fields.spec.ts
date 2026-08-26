import { BookingService } from './booking.service';
import { BookingStatus, PriceApprovalStatus, UnitStatus } from '@prisma/client';

/**
 * P.CT TTTM (Mall Leasing) request: the long-term booking detail screen gains budget-range,
 * exchange-rate memo, and Mall/TTTM-specific fee fields (serviceFeeSqm/businessSupportFeeSqm),
 * distinct from the Office-only CAM field. This covers the new fields passing through
 * create()/update() unchanged, and convertToProposal() correctly inheriting them from the
 * Booking when the conversion dto doesn't override them (booking-stage negotiation data should
 * not silently disappear when a Proposal is generated).
 */
describe('BookingService — budget/exchange-rate/service-fee pricing fields', () => {
  let service: BookingService;

  const prisma: any = {
    unit: { findUnique: jest.fn() },
    lead: { findUnique: jest.fn(), update: jest.fn() },
    customer: { findUnique: jest.fn() },
    proposal: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
    unitBooking: {
      findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(),
      aggregate: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(),
    },
    bookingActivity: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const unitStatus = {
    isCommittedToTenant: jest.fn().mockReturnValue(false),
    isLockedForBooking: jest.fn().mockReturnValue(false),
    transition: jest.fn().mockResolvedValue({}),
  } as any;
  const categories = { validateProposedPrice: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    prisma.unitBooking.findFirst.mockResolvedValue(null);
    prisma.unitBooking.aggregate.mockResolvedValue({ _max: { priority: 0 } });
    prisma.unitBooking.count.mockResolvedValue(0);
    prisma.unitBooking.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'booking-new', ...data }));
    prisma.unitBooking.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'b1', ...data }));
    prisma.bookingActivity.create.mockResolvedValue({});
    prisma.lead.update.mockResolvedValue({});
    prisma.proposal.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'proposal-1', ...data }));
    service = new BookingService(prisma, categories, unitStatus);
  });

  describe('create()', () => {
    it('passes budgetRentMin/Max, exchangeRate, serviceFeeSqm and businessSupportFeeSqm through to the created row', async () => {
      prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', mallId: 'mall-1', categoryId: null, status: UnitStatus.VACANT, isActive: true });
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', mallId: 'mall-1', isActive: true });

      const booking = await service.create({
        unitId: 'unit-1', leadId: 'lead-1', holdDays: 7, currencyCode: 'USD',
        budgetRentMin: 20, budgetRentMax: 25, exchangeRate: 24500,
        serviceFeeSqm: 0.5, businessSupportFeeSqm: 0.3,
      } as any, 'user-1');

      expect(booking.budgetRentMin).toBe(20);
      expect(booking.budgetRentMax).toBe(25);
      expect(booking.exchangeRate).toBe(24500);
      expect(booking.serviceFeeSqm).toBe(0.5);
      expect(booking.businessSupportFeeSqm).toBe(0.3);
    });
  });

  describe('update()', () => {
    it('passes the new fields through to the update data', async () => {
      prisma.unitBooking.findUnique.mockResolvedValue({
        id: 'b1', unitId: 'unit-1', status: BookingStatus.ACTIVE, isActive: true,
        currencyCode: 'USD', leadId: 'lead-1',
      });
      prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', mallId: 'mall-1', categoryId: null, isActive: true });

      const updated = await service.update('b1', {
        budgetRentMin: 22, budgetRentMax: 27, exchangeRate: 24600,
        serviceFeeSqm: 0.6, businessSupportFeeSqm: 0.35,
      } as any, 'user-1');

      expect(updated.budgetRentMin).toBe(22);
      expect(updated.budgetRentMax).toBe(27);
      expect(updated.exchangeRate).toBe(24600);
      expect(updated.serviceFeeSqm).toBe(0.6);
      expect(updated.businessSupportFeeSqm).toBe(0.35);
    });
  });

  describe('convertToProposal()', () => {
    const activeBooking = {
      id: 'b1', unitId: 'unit-1', status: BookingStatus.ACTIVE, isActive: true,
      leadId: 'lead-1', customerId: null, notes: null, proposal: null,
      priceApprovalStatus: null, pricingRuleId: null, pricingSnapshot: null,
      currencyCode: 'USD', serviceFeeSqm: 0.5, businessSupportFeeSqm: 0.3, exchangeRate: 24500,
    };

    beforeEach(() => {
      prisma.unitBooking.findUnique.mockResolvedValue({ ...activeBooking, activities: [] });
      prisma.lead.findUnique.mockResolvedValue({ tenantId: null });
    });

    it('inherits serviceFeeSqm/businessSupportFeeSqm/exchangeRate from the Booking when the dto omits them', async () => {
      await service.convertToProposal('b1', {
        area: 100, term: 36, startDate: '2026-01-01', rentPerSqm: 30,
      } as any, 'user-1');

      expect(prisma.proposal.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ serviceFeeSqm: 0.5, businessSupportFeeSqm: 0.3, exchangeRate: 24500 }),
      }));
    });

    it('prefers explicit dto values over the Booking-stage values when both are provided', async () => {
      await service.convertToProposal('b1', {
        area: 100, term: 36, startDate: '2026-01-01', rentPerSqm: 30,
        serviceFeeSqm: 0.9, businessSupportFeeSqm: 0.7, exchangeRate: 25000,
      } as any, 'user-1');

      expect(prisma.proposal.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ serviceFeeSqm: 0.9, businessSupportFeeSqm: 0.7, exchangeRate: 25000 }),
      }));
    });

    it('defaults serviceFeeSqm/businessSupportFeeSqm to 0 when neither dto nor Booking has a value', async () => {
      prisma.unitBooking.findUnique.mockResolvedValue({
        ...activeBooking, serviceFeeSqm: null, businessSupportFeeSqm: null, exchangeRate: null, activities: [],
      });

      await service.convertToProposal('b1', {
        area: 100, term: 36, startDate: '2026-01-01', rentPerSqm: 30,
      } as any, 'user-1');

      expect(prisma.proposal.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ serviceFeeSqm: 0, businessSupportFeeSqm: 0 }),
      }));
    });
  });
});
