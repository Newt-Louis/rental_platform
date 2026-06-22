import { Test, TestingModule } from '@nestjs/testing';
import { BillingScheduleService } from './billing-schedule.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BillingScheduleService integration (mocked DB)', () => {
  let service: BillingScheduleService;
  const prisma = {
    contract: { findUnique: jest.fn(), findMany: jest.fn() },
    billingScheduleEntry: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
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
      ],
    }).compile();
    service = module.get(BillingScheduleService);
  });

  it('buildScheduleForContract generates entries', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'c1',
      isActive: true,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      rent: 100,
      cam: 10,
      rentFree: 0,
      escalationPercent: 0,
      paymentTerm: 15,
      billingCycle: 'MONTHLY',
    });
    prisma.billingScheduleEntry.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create, id: `e-${create.period}` }),
    );

    const result = await service.buildScheduleForContract('c1');
    expect(result.periodsGenerated).toBeGreaterThanOrEqual(3);
    expect(prisma.billingScheduleEntry.upsert).toHaveBeenCalled();
  });
});
