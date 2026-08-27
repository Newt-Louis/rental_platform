import { Test, TestingModule } from '@nestjs/testing';
import { ContractExpiryScheduler } from './contract-expiry.scheduler';
import { PrismaService } from '../../prisma/prisma.service';

const makeContract = (daysFromNow: number, overrides: any = {}) => {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + daysFromNow);
  return {
    id: `contract-${daysFromNow}`,
    contractNumber: `HĐ-${daysFromNow}`,
    endDate,
    tenant: { id: 'tenant-1', brandName: 'Brand A', contactEmail: 'a@a.com' },
    unit: { id: 'unit-1', code: 'A01', mall: { id: 'mall-1', name: 'THISO Mall' } },
    managedById: 'user-1',
    ...overrides,
  };
};

describe('ContractExpiryScheduler', () => {
  let scheduler: ContractExpiryScheduler;

  const prisma = {
    contract: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractExpiryScheduler,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    scheduler = module.get(ContractExpiryScheduler);
  });

  it('creates CRITICAL notification for contract expiring in ≤ 30 days', async () => {
    prisma.contract.findMany.mockResolvedValue([makeContract(15)]);
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    const result = await scheduler.checkContractExpiry();

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'CONTRACT_EXPIRY_CRITICAL',
          }),
        ]),
      }),
    );
    expect(result.notified).toBeGreaterThan(0);
  });

  it('creates WARNING notification for contract expiring in 31-60 days', async () => {
    prisma.contract.findMany.mockResolvedValue([makeContract(45)]);
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    const result = await scheduler.checkContractExpiry();

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'CONTRACT_EXPIRY_WARNING',
          }),
        ]),
      }),
    );
  });

  it('creates UPCOMING notification for contract expiring in 61-90 days', async () => {
    prisma.contract.findMany.mockResolvedValue([makeContract(75)]);
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    const result = await scheduler.checkContractExpiry();

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'CONTRACT_EXPIRY_UPCOMING',
          }),
        ]),
      }),
    );
  });

  it('creates EARLY_WARNING notification for contract expiring in 91-180 days', async () => {
    prisma.contract.findMany.mockResolvedValue([makeContract(120)]);
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    const result = await scheduler.checkContractExpiry();

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'CONTRACT_EXPIRY_EARLY_WARNING',
          }),
        ]),
      }),
    );
  });

  it('skips contracts expiring in > 180 days', async () => {
    prisma.contract.findMany.mockResolvedValue([makeContract(200)]);

    const result = await scheduler.checkContractExpiry();

    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
  });

  it('processes multiple contracts with correct urgency levels', async () => {
    prisma.contract.findMany.mockResolvedValue([
      makeContract(20, { id: 'c1' }),  // CRITICAL
      makeContract(50, { id: 'c2' }),  // WARNING
      makeContract(80, { id: 'c3' }),  // UPCOMING
      makeContract(150, { id: 'c4' }), // EARLY_WARNING
    ]);
    prisma.notification.createMany.mockResolvedValue({ count: 4 });

    const result = await scheduler.checkContractExpiry();

    const callArg = prisma.notification.createMany.mock.calls[0][0];
    const types = callArg.data.map((n: any) => n.type);
    expect(types).toContain('CONTRACT_EXPIRY_CRITICAL');
    expect(types).toContain('CONTRACT_EXPIRY_WARNING');
    expect(types).toContain('CONTRACT_EXPIRY_UPCOMING');
    expect(types).toContain('CONTRACT_EXPIRY_EARLY_WARNING');
    expect(result.notified).toBe(4);
  });

  it('returns zero when no contracts near expiry', async () => {
    prisma.contract.findMany.mockResolvedValue([]);

    const result = await scheduler.checkContractExpiry();
    expect(result.notified).toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
