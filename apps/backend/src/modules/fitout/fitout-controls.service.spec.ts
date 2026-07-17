import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FitoutControlsService } from './fitout-controls.service';

describe('FitoutControlsService', () => {
  const prisma = {
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
  let service: FitoutControlsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.fitoutProject.findUnique.mockResolvedValue({ id: 'project-1' });
    service = new FitoutControlsService(prisma as unknown as PrismaService);
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
      { title: 'Upgrade sprinkler', proposedAmount: 12000000 },
      'user-1',
    );

    expect(result.changeNumber).toBe('CO-001');
    expect(result.status).toBe('SUBMITTED');
    expect(result.proposedAmount).toEqual(new Prisma.Decimal(12000000));
  });

  it('prevents unauthorized roles from deciding cost changes', async () => {
    await expect(
      service.decideChangeOrder(
        'project-1',
        'co-1',
        { decision: 'APPROVED', approvedAmount: 1 },
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
        costType: 'ADDITION',
        proposedAmount: new Prisma.Decimal(100),
        approvedAmount: new Prisma.Decimal(80),
        scheduleImpactDays: 3,
      },
      {
        status: 'APPROVED',
        costType: 'DEDUCTION',
        proposedAmount: new Prisma.Decimal(20),
        approvedAmount: new Prisma.Decimal(10),
        scheduleImpactDays: -1,
      },
      {
        status: 'SUBMITTED',
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
        approvedScheduleImpactDays: 2,
      },
    });
  });
});
