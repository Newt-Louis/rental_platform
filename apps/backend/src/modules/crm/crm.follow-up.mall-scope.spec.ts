import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CrmService } from './crm.service';

describe('CRM follow-up Mall isolation (CR-120)', () => {
  const scope = { userId: 'manager-a', role: Role.LEASING_MANAGER, mallIds: ['mall-a'] };
  let prisma: any;
  let service: CrmService;

  beforeEach(() => {
    prisma = {
      lead: { findFirst: jest.fn().mockResolvedValue({ id: 'lead-a', category: 'F&B', assignedToId: null }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'assignee-a' }) },
      leadFollowUp: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'follow-up-a' }),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      proposal: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    service = new CrmService(prisma, {} as any);
  });

  it('SEC-MALL-004 keeps the Mall predicate when assignedToId is supplied', async () => {
    await service.listFollowUps({ assignedToId: 'user-b', scope });
    expect(prisma.leadFollowUp.findMany.mock.calls[0][0].where).toMatchObject({
      assignedToId: 'user-b',
      AND: [{ OR: expect.any(Array) }],
    });
  });

  it('treats explicit Lead.mallId as authoritative over a cross-Mall assignee relationship', async () => {
    await service.createFollowUp({ leadId: 'lead-b', assignedToId: 'assignee-a', dueDate: '2026-09-10' }, 'manager-a', scope);
    const leadWhere = prisma.lead.findFirst.mock.calls[0][0].where;
    const scopeOr = leadWhere.AND[0].OR;
    expect(scopeOr[0]).toEqual({ mallId: { in: ['mall-a'] } });
    expect(scopeOr[1]).toMatchObject({ mallId: null, OR: expect.any(Array) });
  });

  it('SEC-MALL-006 validates both a Lead parent and assignee before create', async () => {
    await service.createFollowUp({ leadId: 'lead-a', assignedToId: 'assignee-a', dueDate: '2026-09-10' }, 'manager-a', scope);
    expect(prisma.lead.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'lead-a' });
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'assignee-a',
      mallAccess: { some: { isActive: true, mallId: { in: ['mall-a'] } } },
    });
    expect(prisma.leadFollowUp.create).toHaveBeenCalled();
  });

  it('SEC-MALL-005 rejects a foreign-Mall assignee before create', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.createFollowUp({ assignedToId: 'assignee-b', dueDate: '2026-09-10' }, 'manager-a', scope))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.leadFollowUp.create).not.toHaveBeenCalled();
  });

  it.each([
    ['complete', (s: CrmService) => s.completeFollowUp('follow-up-b', scope), 'update'],
    ['delete', (s: CrmService) => s.deleteFollowUp('follow-up-b', scope), 'delete'],
  ])('SEC-MALL-002/003 denies %s by foreign id with zero write side effects', async (_name, call, mutation) => {
    prisma.leadFollowUp.findFirst.mockResolvedValue(null);
    await expect(call(service)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.leadFollowUp[mutation]).not.toHaveBeenCalled();
  });

  it('does not let a Mall-B Lead pass through a Mall-A assignee fallback', async () => {
    await service.completeFollowUp('follow-up-b', scope);
    const where = prisma.leadFollowUp.findFirst.mock.calls[0][0].where;
    expect(where.AND[0].OR[1]).toMatchObject({ leadId: null });
  });

  it('SEC-MALL-009 applies the canonical Lead Mall boundary to pipeline aggregates', async () => {
    prisma.lead.findMany = jest.fn().mockResolvedValue([]);
    await service.getPipelineStats(scope);
    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR[0]).toEqual({ mallId: { in: ['mall-a'] } });
    expect(where.AND[0].OR[1]).toMatchObject({ mallId: null });
    expect(where).not.toHaveProperty('assignedToId');
  });

  it('scopes the stale-lead batch update instead of mutating every Mall', async () => {
    prisma.lead.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    await service.autoMoveStaleToLost(60, scope);
    const where = prisma.lead.updateMany.mock.calls[0][0].where;
    expect(where.AND[0].OR[0]).toEqual({ mallId: { in: ['mall-a'] } });
  });

  it('scopes both the Lead and selected assignee during automatic assignment', async () => {
    prisma.lead.update = jest.fn();
    prisma.user.findFirst.mockResolvedValue({ id: 'exec-a', fullName: 'Executive A' });
    await service.autoAssignLead('lead-a', scope);
    const leadCall = prisma.lead.findFirst.mock.calls[prisma.lead.findFirst.mock.calls.length - 1][0];
    const userCall = prisma.user.findFirst.mock.calls[prisma.user.findFirst.mock.calls.length - 1][0];
    expect(leadCall.where.AND[0].OR[0]).toEqual({ mallId: { in: ['mall-a'] } });
    expect(userCall.where).toMatchObject({
      mallAccess: { some: { isActive: true, mallId: { in: ['mall-a'] } } },
    });
  });
});
