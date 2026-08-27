import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketSlaService } from './ticket-sla.service';

describe('Tickets secondary-path authorization', () => {
  const user = { id: 'user-1', role: Role.OPERATION };
  let tickets: any;
  let sla: any;
  let mallAccess: any;
  let controller: TicketsController;

  beforeEach(() => {
    tickets = {
      getEscalations: jest.fn(),
      rateTicket: jest.fn(),
      getTicketRating: jest.fn(),
      getCsatSummary: jest.fn(),
    };
    sla = { listPolicies: jest.fn(), upsertPolicy: jest.fn(), getStats: jest.fn() };
    mallAccess = {
      extractAndValidateMallAccess: jest.fn(),
      getAccessibleMallIds: jest.fn().mockResolvedValue(['mall-1']),
    };
    controller = new TicketsController(tickets, sla, mallAccess);
  });

  it('restricts global SLA policy configuration to ADMIN', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TicketsController.prototype.listSlaPolicies)).toEqual([Role.ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, TicketsController.prototype.upsertSlaPolicy)).toEqual([Role.ADMIN]);
  });

  it('excludes TENANT from aggregate SLA and CSAT statistics', () => {
    for (const method of ['getSlaStats', 'getCsatSummary'] as const) {
      const roles: Role[] = Reflect.getMetadata(ROLES_KEY, TicketsController.prototype[method]);
      expect(roles).toContain(Role.OPERATION);
      expect(roles).not.toContain(Role.TENANT);
    }
  });

  it('validates Ticket ownership before reading escalation history', async () => {
    await controller.getEscalations('ticket-1', user);

    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(user.id, user.role, { ticketId: 'ticket-1' });
    expect(tickets.getEscalations).toHaveBeenCalledWith('ticket-1', user);
  });

  it('validates Ticket ownership before writing or reading a rating', async () => {
    await controller.rateTicket('ticket-1', { rating: 5, comment: 'Resolved' }, user);
    await controller.getTicketRating('ticket-1', user);

    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledTimes(2);
    expect(tickets.rateTicket).toHaveBeenCalledWith('ticket-1', 5, 'Resolved', user);
    expect(tickets.getTicketRating).toHaveBeenCalledWith('ticket-1', user);
  });

  it('passes the caller accessible Mall set to aggregate services', async () => {
    await controller.getSlaStats(user);
    await controller.getCsatSummary(user);

    expect(sla.getStats).toHaveBeenCalledWith(['mall-1']);
    expect(tickets.getCsatSummary).toHaveBeenCalledWith(['mall-1']);
  });
});

describe('Tickets aggregate and Tenant scope predicates', () => {
  const mallPredicate = {
    unit: {
      OR: [
        { mallId: { in: ['mall-1'] } },
        { floor: { mallId: { in: ['mall-1'] } } },
      ],
    },
  };

  it('scopes SLA statistics to accessible Malls', async () => {
    const prisma: any = {
      ticket: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TicketSlaService(prisma, {} as any, {} as any, {} as any);

    await service.getStats(['mall-1']);

    expect(prisma.ticket.count).toHaveBeenNthCalledWith(1, { where: { isActive: true, ...mallPredicate } });
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, ...mallPredicate, status: { notIn: ['RESOLVED', 'CLOSED'] } },
    }));
    expect(prisma.ticket.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, ...mallPredicate },
    }));
  });

  it('scopes CSAT statistics to accessible Malls', async () => {
    const prisma: any = {
      ticketRating: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new TicketsService(prisma, {} as any, {} as any, {} as any, {} as any);

    await service.getCsatSummary(['mall-1']);

    expect(prisma.ticketRating.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticket: mallPredicate },
    }));
  });

  it('rejects a Tenant rating read for another Tenant Ticket', async () => {
    const prisma: any = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          tenantId: 'tenant-2',
          comments: [],
        }),
      },
      ticketRating: { findUnique: jest.fn() },
    };
    const service = new TicketsService(prisma, {} as any, {} as any, {} as any, {} as any);

    await expect(service.getTicketRating('ticket-1', {
      id: 'tenant-user',
      role: Role.TENANT,
      tenantId: 'tenant-1',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ticketRating.findUnique).not.toHaveBeenCalled();
  });
});
