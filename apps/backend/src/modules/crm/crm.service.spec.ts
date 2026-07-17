import { BadRequestException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
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
});
