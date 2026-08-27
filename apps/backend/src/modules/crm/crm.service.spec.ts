import { BadRequestException } from '@nestjs/common';
import { LeadStatus, Role } from '@prisma/client';
import { CrmService } from './crm.service';

describe('CrmService lead list filters', () => {
  const prisma = {
    lead: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  } as any;
  const service = new CrmService(prisma, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);
  });

  it('returns all booking-eligible lead stages requested by the UI', async () => {
    await service.findAll({ statuses: 'NEW,CONTACTED,QUALIFIED', limit: 200 });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED] },
      }),
      take: 200,
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('rejects invalid multi-status values instead of silently returning a wrong list', async () => {
    await expect(service.findAll({ statuses: 'NEW,UNKNOWN' })).rejects.toThrow(BadRequestException);
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
  });

  it('rejects ambiguous status and statuses filters', async () => {
    await expect(service.findAll({ status: LeadStatus.NEW, statuses: 'QUALIFIED' }))
      .rejects.toThrow(BadRequestException);
  });

  it('limits a leasing executive to leads assigned to that user', async () => {
    await service.findAll({
      scope: { userId: 'executive-1', role: Role.LEASING_EXECUTIVE, mallIds: ['mall-1'] },
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ OR: [{ assignedToId: 'executive-1' }] }],
      }),
    }));
  });

  it('keeps mall scope when a search filter also adds an OR clause', async () => {
    await service.findAll({
      search: 'Acme',
      scope: { userId: 'manager-1', role: Role.LEASING_MANAGER, mallIds: ['mall-1'] },
    });

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(1);
    expect(where.OR).toHaveLength(4);
  });

  it('restricts an explicit Mall search to Leads owned by that Mall', async () => {
    await service.findAll({
      mallId: 'mall-1',
      scope: { userId: 'manager-1', role: Role.LEASING_MANAGER, mallIds: ['mall-1'] },
    });

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.mallId).toBe('mall-1');
    expect(where.AND).toHaveLength(1);
  });

  it('applies caller and explicit Mall scope before querying unified deals', async () => {
    await service.getUnifiedDeals({
      mallId: 'mall-1',
      scope: { userId: 'manager-1', role: Role.LEASING_MANAGER, mallIds: ['mall-1'] },
    });

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.mallId).toBe('mall-1');
    expect(where.AND).toHaveLength(1);
    expect(where.AND[0].OR).toEqual(expect.arrayContaining([
      { mallId: { in: ['mall-1'] } },
    ]));
  });

  it('limits unified deals to the assigned Leads of a leasing executive', async () => {
    await service.getUnifiedDeals({
      scope: { userId: 'executive-1', role: Role.LEASING_EXECUTIVE, mallIds: ['mall-1'] },
    });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ OR: [{ assignedToId: 'executive-1' }] }],
      }),
    }));
  });
});
