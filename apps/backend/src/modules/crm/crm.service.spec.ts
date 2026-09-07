import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeadStatus, Role } from '@prisma/client';
import { CrmService } from './crm.service';

describe('CrmService lead list filters', () => {
  const prisma = {
    lead: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
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

  it('scopes a leasing executive by mall, same as other roles', async () => {
    await service.findAll({
      scope: { userId: 'executive-1', role: Role.LEASING_EXECUTIVE, mallIds: ['mall-1'] },
    });

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual(expect.arrayContaining([
      { mallId: { in: ['mall-1'] } },
    ]));
    expect(where.AND[0].OR).not.toEqual(expect.arrayContaining([
      { assignedToId: 'executive-1' },
    ]));
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

  it('scopes unified deals for a leasing executive by mall, same as other roles', async () => {
    await service.getUnifiedDeals({
      scope: { userId: 'executive-1', role: Role.LEASING_EXECUTIVE, mallIds: ['mall-1'] },
    });

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual(expect.arrayContaining([
      { mallId: { in: ['mall-1'] } },
    ]));
  });
});

describe('CrmService.assertLeadEditAccess', () => {
  const prisma = { lead: { findFirst: jest.fn() } } as any;
  const service = new CrmService(prisma, {} as any);

  beforeEach(() => jest.clearAllMocks());

  it('allows a leasing executive to edit their own lead', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' });

    await expect(service.assertLeadEditAccess('lead-1', {
      userId: 'executive-1', role: Role.LEASING_EXECUTIVE, mallIds: ['mall-1'],
    })).resolves.toBeUndefined();
  });

  it('rejects a leasing executive editing a lead assigned to someone else', async () => {
    prisma.lead.findFirst
      .mockResolvedValueOnce({ id: 'lead-1' }) // assertLeadAccess: within mall scope
      .mockResolvedValueOnce(null); // ownership check fails

    await expect(service.assertLeadEditAccess('lead-1', {
      userId: 'executive-1', role: Role.LEASING_EXECUTIVE, mallIds: ['mall-1'],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects access to a lead outside the caller mall scope entirely', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(service.assertLeadEditAccess('lead-1', {
      userId: 'executive-1', role: Role.LEASING_EXECUTIVE, mallIds: ['mall-1'],
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not restrict other roles by assignee', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' });

    await expect(service.assertLeadEditAccess('lead-1', {
      userId: 'manager-1', role: Role.LEASING_MANAGER, mallIds: ['mall-1'],
    })).resolves.toBeUndefined();
    expect(prisma.lead.findFirst).toHaveBeenCalledTimes(1);
  });
});
