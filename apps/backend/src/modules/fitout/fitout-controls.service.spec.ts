import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FitoutControlsService } from './fitout-controls.service';

describe('FitoutControlsService', () => {
  const prisma = {
    $transaction: jest.fn(),
    fitoutProject: { findUnique: jest.fn() },
    fitoutRisk: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    fitoutChangeOrder: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const accessPolicy = {
    getProjectContext: jest.fn(),
    assertActiveProjectMallUser: jest.fn(),
  };
  let service: FitoutControlsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    accessPolicy.getProjectContext.mockResolvedValue({
      id: 'project-1', tenantId: 'tenant-1', mallId: 'mall-1', contractCurrencyCode: 'USD',
    });
    service = new FitoutControlsService(prisma as unknown as PrismaService, accessPolicy as any);
  });

  it('creates a numbered risk and calculates its risk matrix score', async () => {
    prisma.fitoutRisk.count.mockResolvedValue(2);
    prisma.fitoutRisk.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await service.createRisk(
      'project-1',
      { title: 'Fire safety approval delay', probability: 4, impact: 5 },
      'user-1',
    );

    expect(result).toEqual(expect.objectContaining({
      riskNumber: 'RISK-003',
      score: 20,
      createdById: 'user-1',
    }));
  });

  it('recalculates score and closes a risk', async () => {
    prisma.fitoutRisk.findFirst.mockResolvedValue({
      id: 'risk-1',
      probability: 2,
      impact: 3,
    });
    prisma.fitoutRisk.update.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await service.updateRisk('project-1', 'risk-1', {
      probability: 5,
      status: 'CLOSED',
    });

    expect(result.score).toBe(15);
    expect(result.closedAt).toBeInstanceOf(Date);
  });

  it('rejects updating a risk from another project', async () => {
    prisma.fitoutRisk.findFirst.mockResolvedValue(null);

    await expect(service.updateRisk('project-1', 'risk-x', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates a submitted and numbered change order', async () => {
    prisma.fitoutChangeOrder.count.mockResolvedValue(0);
    prisma.fitoutChangeOrder.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await service.createChangeOrder(
      'project-1',
      { title: 'Upgrade sprinkler', proposedAmount: '12000000' },
      'user-1',
    );

    expect(result.changeNumber).toBe('CO-001');
    expect(result.status).toBe('SUBMITTED');
    expect(result.currency).toBe('USD');
    expect(result.proposedAmount).toEqual(new Prisma.Decimal(12000000));
  });

  it('preserves an exact Decimal string when creating a change order', async () => {
    prisma.fitoutChangeOrder.count.mockResolvedValue(0);
    prisma.fitoutChangeOrder.create.mockImplementation(({ data }) => Promise.resolve(data));

    const result = await service.createChangeOrder(
      'project-1',
      { title: 'Exact cost', proposedAmount: '9007199254740991.25', currency: 'USD' },
      'user-1',
    );

    expect(result.proposedAmount.toFixed(2)).toBe('9007199254740991.25');
    expect(result.currency).toBe('USD');
  });

  it('accepts a matching legacy currency and persists the authoritative Contract currency', async () => {
    prisma.fitoutChangeOrder.count.mockResolvedValue(0);
    prisma.fitoutChangeOrder.create.mockImplementation(({ data }) => Promise.resolve(data));

    await expect(service.createChangeOrder(
      'project-1', { title: 'Matching currency', proposedAmount: '10', currency: 'USD' }, 'user-1',
    )).resolves.toEqual(expect.objectContaining({ currency: 'USD' }));
  });

  it('rejects a legacy currency that differs from the authoritative Contract currency', async () => {
    await expect(service.createChangeOrder(
      'project-1', { title: 'Wrong currency', proposedAmount: '10', currency: 'VND' }, 'user-1',
    )).rejects.toThrow('Change Order currency must match the authoritative Contract currency USD');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.fitoutChangeOrder.create).not.toHaveBeenCalled();
  });

  it('blocks Change Order creation when the authoritative Contract currency is unavailable', async () => {
    accessPolicy.getProjectContext.mockResolvedValue({
      id: 'project-1', tenantId: 'tenant-1', mallId: 'mall-1', contractCurrencyCode: '',
    });

    await expect(service.createChangeOrder(
      'project-1', { title: 'No currency', proposedAmount: '10', currency: 'VND' }, 'user-1',
    )).rejects.toThrow('Fitout project Contract currency is unavailable');
    expect(prisma.fitoutChangeOrder.create).not.toHaveBeenCalled();
  });

  it('prevents unauthorized roles from deciding cost changes', async () => {
    await expect(
      service.decideChangeOrder(
        'project-1',
        'co-1',
        { decision: 'APPROVED', approvedAmount: '1' },
        { id: 'user-1', role: Role.LEASING_MANAGER },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires an approved amount when approving', async () => {
    prisma.fitoutChangeOrder.findFirst.mockResolvedValue({ id: 'co-1', status: 'SUBMITTED' });

    await expect(
      service.decideChangeOrder(
        'project-1',
        'co-1',
        { decision: 'APPROVED' },
        { id: 'director-1', role: Role.MALL_DIRECTOR },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('aggregates signed cost, schedule and risk exposure', async () => {
    prisma.fitoutRisk.findMany.mockResolvedValue([
      { status: 'OPEN', score: 20 },
      { status: 'MITIGATING', score: 15 },
      { status: 'CLOSED', score: 25 },
    ]);
    prisma.fitoutChangeOrder.findMany.mockResolvedValue([
      {
        status: 'APPROVED',
        currency: 'VND',
        costType: 'ADDITION',
        proposedAmount: new Prisma.Decimal(100),
        approvedAmount: new Prisma.Decimal(80),
        scheduleImpactDays: 3,
      },
      {
        status: 'APPROVED',
        currency: 'VND',
        costType: 'DEDUCTION',
        proposedAmount: new Prisma.Decimal(20),
        approvedAmount: new Prisma.Decimal(10),
        scheduleImpactDays: -1,
      },
      {
        status: 'SUBMITTED',
        currency: 'VND',
        costType: 'ADDITION',
        proposedAmount: new Prisma.Decimal(50),
        approvedAmount: null,
        scheduleImpactDays: 4,
      },
    ]);

    await expect(service.getSummary('project-1')).resolves.toEqual({
      risks: { total: 3, open: 2, high: 2, critical: 1 },
      changes: {
        total: 3,
        pending: 1,
        proposedCostImpact: 130,
        approvedCostImpact: 70,
        costByCurrency: [{ currency: 'VND', proposedCostImpact: '130.00', approvedCostImpact: '70.00' }],
        approvedScheduleImpactDays: 2,
      },
    });
  });

  it('returns lossless per-currency totals and suppresses unsafe mixed-currency bare totals', async () => {
    prisma.fitoutRisk.findMany.mockResolvedValue([]);
    prisma.fitoutChangeOrder.findMany.mockResolvedValue([
      {
        status: 'APPROVED', currency: 'USD', costType: 'ADDITION',
        proposedAmount: new Prisma.Decimal('9007199254740993.25'),
        approvedAmount: new Prisma.Decimal('1250.25'), scheduleImpactDays: 0,
      },
      {
        status: 'APPROVED', currency: 'VND', costType: 'DEDUCTION',
        proposedAmount: new Prisma.Decimal('1000'),
        approvedAmount: new Prisma.Decimal('800'), scheduleImpactDays: 0,
      },
    ]);

    const result = await service.getSummary('project-1');

    expect(result.changes.proposedCostImpact).toBeNull();
    expect(result.changes.approvedCostImpact).toBeNull();
    expect(result.changes.costByCurrency).toEqual([
      { currency: 'USD', proposedCostImpact: '9007199254740993.25', approvedCostImpact: '1250.25' },
      { currency: 'VND', proposedCostImpact: '-1000.00', approvedCostImpact: '-800.00' },
    ]);
  });

  it('suppresses unsafe legacy totals for a large single-currency amount', async () => {
    prisma.fitoutRisk.findMany.mockResolvedValue([]);
    prisma.fitoutChangeOrder.findMany.mockResolvedValue([{
      status: 'APPROVED', currency: 'USD', costType: 'ADDITION',
      proposedAmount: new Prisma.Decimal('9007199254740991.25'),
      approvedAmount: new Prisma.Decimal('9007199254740990.25'), scheduleImpactDays: 0,
    }]);

    const result = await service.getSummary('project-1');

    expect(result.changes.proposedCostImpact).toBeNull();
    expect(result.changes.approvedCostImpact).toBeNull();
    expect(result.changes.costByCurrency).toEqual([{
      currency: 'USD',
      proposedCostImpact: '9007199254740991.25',
      approvedCostImpact: '9007199254740990.25',
    }]);
  });

  it('does not substitute proposed cost when an approved row has no approved amount', async () => {
    prisma.fitoutRisk.findMany.mockResolvedValue([]);
    prisma.fitoutChangeOrder.findMany.mockResolvedValue([{
      status: 'APPROVED', currency: 'USD', costType: 'ADDITION',
      proposedAmount: new Prisma.Decimal('1000.00'), approvedAmount: null, scheduleImpactDays: 0,
    }]);

    const result = await service.getSummary('project-1');

    expect(result.changes.costByCurrency).toEqual([{
      currency: 'USD', proposedCostImpact: '1000.00', approvedCostImpact: '0.00',
    }]);
  });

  it('retries a numbering transaction after a serialization conflict', async () => {
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce((callback) => callback(prisma));
    prisma.fitoutRisk.count.mockResolvedValue(3);
    prisma.fitoutRisk.create.mockImplementation(({ data }) => Promise.resolve(data));

    await expect(service.createRisk(
      'project-1',
      { title: 'Concurrent risk', probability: 2, impact: 2 },
      'user-1',
    )).resolves.toEqual(expect.objectContaining({ riskNumber: 'RISK-004' }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('retries change-order numbering after a unique allocation race', async () => {
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce((callback) => callback(prisma));
    prisma.fitoutChangeOrder.count.mockResolvedValue(4);
    prisma.fitoutChangeOrder.create.mockImplementation(({ data }) => Promise.resolve(data));

    await expect(service.createChangeOrder(
      'project-1',
      { title: 'Concurrent change', proposedAmount: '10', currency: 'USD' },
      'user-1',
    )).resolves.toEqual(expect.objectContaining({ changeNumber: 'CO-005', currency: 'USD' }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('re-reads and commits a terminal decision inside one Serializable transaction', async () => {
    prisma.fitoutChangeOrder.findFirst.mockResolvedValue({ id: 'co-1', status: 'SUBMITTED' });
    prisma.fitoutChangeOrder.update.mockImplementation(({ data }) => Promise.resolve({ id: 'co-1', ...data }));

    await expect(service.decideChangeOrder(
      'project-1',
      'co-1',
      { decision: 'APPROVED', approvedAmount: '12.25' },
      { id: 'director-1', role: Role.MALL_DIRECTOR },
    )).resolves.toEqual(expect.objectContaining({ status: 'APPROVED' }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.fitoutChangeOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'co-1' },
      data: expect.objectContaining({ approvedAmount: new Prisma.Decimal('12.25') }),
    }));
  });

  it('keeps the winning terminal decision when a conflicting decision races', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    prisma.fitoutChangeOrder.findFirst.mockResolvedValue({ id: 'co-1', status: 'REJECTED' });

    await expect(service.decideChangeOrder(
      'project-1',
      'co-1',
      { decision: 'APPROVED', approvedAmount: '10' },
      { id: 'director-1', role: Role.MALL_DIRECTOR },
    )).rejects.toThrow('already decided as REJECTED');
    expect(prisma.fitoutChangeOrder.update).not.toHaveBeenCalled();
  });

  it('treats a replay of the winning terminal decision as idempotent', async () => {
    prisma.fitoutChangeOrder.findFirst.mockResolvedValue({ id: 'co-1', status: 'APPROVED' });

    await expect(service.decideChangeOrder(
      'project-1',
      'co-1',
      { decision: 'APPROVED', approvedAmount: '10' },
      { id: 'director-1', role: Role.MALL_DIRECTOR },
    )).resolves.toEqual({ id: 'co-1', status: 'APPROVED' });
    expect(prisma.fitoutChangeOrder.update).not.toHaveBeenCalled();
  });
});
