import { Test, TestingModule } from '@nestjs/testing';
import { BillingScheduleService } from './billing-schedule.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationalMetricsService } from '../../common/services/operational-metrics.service';
import { BillingService } from './billing.service';

describe('BillingScheduleService integration (mocked DB)', () => {
  let service: BillingScheduleService;
  const prisma = {
    contract: { findUnique: jest.fn(), findMany: jest.fn() },
    billingScheduleEntry: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    invoice: { create: jest.fn() },
    billingConfig: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingScheduleService,
        { provide: PrismaService, useValue: prisma },
        { provide: OperationalMetricsService, useValue: { increment: jest.fn() } },
        { provide: BillingService, useValue: { enqueueInvoiceIssuedNotification: jest.fn() } },
      ],
    }).compile();
    service = module.get(BillingScheduleService);
  });

  it('buildScheduleForContract generates entries', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'c1',
      isActive: true,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      rent: 100,
      cam: 10,
      rentFree: 0,
      escalationPercent: 0,
      paymentTerm: 15,
      billingCycle: 'MONTHLY',
    });
    prisma.billingScheduleEntry.findMany.mockResolvedValue([]);
    prisma.billingScheduleEntry.deleteMany.mockResolvedValue({ count: 0 });
    prisma.billingScheduleEntry.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create, id: `e-${create.period}` }),
    );

    const result = await service.buildScheduleForContract('c1');
    expect(result.periodsGenerated).toBeGreaterThanOrEqual(3);
    expect(prisma.billingScheduleEntry.upsert).toHaveBeenCalled();
  });

  // Multi-currency foundation (docs/program/MULTI_CURRENCY_ARCHITECTURE.md):
  // BillingScheduleEntry.currencyCode is DERIVED from Contract.currencyCode at
  // schedule-build time, not left at the schema default.
  it('derives BillingScheduleEntry.currencyCode from Contract.currencyCode (USD contract)', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'c1',
      isActive: true,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      rent: 100,
      cam: 10,
      rentFree: 0,
      escalationPercent: 0,
      paymentTerm: 15,
      billingCycle: 'MONTHLY',
      currencyCode: 'USD',
    });
    prisma.billingScheduleEntry.findMany.mockResolvedValue([]);
    prisma.billingScheduleEntry.deleteMany.mockResolvedValue({ count: 0 });
    prisma.billingScheduleEntry.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create, id: `e-${create.period}` }),
    );

    await service.buildScheduleForContract('c1');

    expect(prisma.billingScheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currencyCode: 'USD' }),
      }),
    );
  });

  // Regression: the upsert's `update` branch (existing PENDING entry, not yet invoiced)
  // used to omit currencyCode entirely, so a currency Amendment (VND -> USD) updated
  // Contract.currencyCode but left already-generated BillingScheduleEntry rows stuck on
  // the old currency forever -- only brand-new periods picked up the change via `create`.
  it('updates BillingScheduleEntry.currencyCode on rebuild when a PENDING entry already exists', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'c1',
      isActive: true,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      rent: 100,
      cam: 10,
      rentFree: 0,
      escalationPercent: 0,
      paymentTerm: 15,
      billingCycle: 'MONTHLY',
      currencyCode: 'USD',
    });
    prisma.billingScheduleEntry.findMany.mockResolvedValue([
      { id: 'e-2026-01', period: '2026-01', invoiceId: null, status: 'PENDING', currencyCode: 'VND' },
    ]);
    prisma.billingScheduleEntry.deleteMany.mockResolvedValue({ count: 0 });
    prisma.billingScheduleEntry.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create, id: `e-${create.period}` }),
    );

    await service.buildScheduleForContract('c1');

    expect(prisma.billingScheduleEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractId_period: { contractId: 'c1', period: '2026-01' } },
        update: expect.objectContaining({ currencyCode: 'USD' }),
      }),
    );
  });

  it('refuses to (re)build a schedule for a TERMINATED contract — closes the manual-rebuild resurrection gap', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'c1',
      isActive: true, // soft-delete flag only — used to be the sole guard
      status: 'TERMINATED',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rent: 100,
      cam: 10,
      rentFree: 0,
      escalationPercent: 0,
      paymentTerm: 15,
      billingCycle: 'MONTHLY',
    });

    await expect(service.buildScheduleForContract('c1')).rejects.toThrow(/ACTIVE or EXPIRING/);
    expect(prisma.billingScheduleEntry.upsert).not.toHaveBeenCalled();
  });

  it('generateDueInvoices skips a contract whose schedule rebuild fails instead of aborting the whole batch (Backbone Gate finding D)', async () => {
    const brokenContract = { id: 'c-broken', unit: {}, tenant: {} };
    const healthyContract = { id: 'c-healthy', unit: {}, tenant: {} };
    prisma.contract.findMany.mockResolvedValue([brokenContract, healthyContract]);
    prisma.billingConfig.findFirst.mockResolvedValue({ autoIssueInvoices: false });
    // buildScheduleForContract's own internal findUnique: null for the broken one (simulates
    // it having been terminated/removed between the batch fetch and this call), a real
    // ACTIVE contract for the healthy one.
    prisma.contract.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'c-healthy',
        isActive: true,
        status: 'ACTIVE',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
        rent: 100,
        cam: 10,
        rentFree: 0,
        escalationPercent: 0,
        paymentTerm: 15,
        billingCycle: 'MONTHLY',
      });
    prisma.billingScheduleEntry.findMany.mockResolvedValue([]); // no existing entries, no pending due
    prisma.billingScheduleEntry.deleteMany.mockResolvedValue({ count: 0 });
    prisma.billingScheduleEntry.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create, id: `e-${create.period}` }),
    );

    const result = await service.generateDueInvoices(new Date('2026-01-01'));

    // The broken contract's failure didn't throw out of generateDueInvoices, and the
    // healthy contract was still reached (proven by its schedule having been built).
    expect(result).toEqual({ created: 0, details: [] });
    expect(prisma.billingScheduleEntry.upsert).toHaveBeenCalled();
  });
});
