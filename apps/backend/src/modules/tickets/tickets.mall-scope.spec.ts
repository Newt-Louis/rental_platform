/**
 * SCOPE-001 / CONTRA-003 — the three ticket routes annotated GAP were already
 * enforced; the annotation was stale, not the code.
 *
 * Verified at runtime 2026-09-07 on a two-Mall database:
 *   MALL_DIRECTOR holding Mall A, against a Mall B ticket -> 403 on all three
 *   TENANT CircleK, against a Highlands ticket            -> 403 on all three
 *   TENANT Highlands, against its own ticket              -> 200
 *   no TicketRating row was written by any denied request
 *
 * An annotation is not a control, so these tests pin the two real mechanisms —
 * the Mall check in the controller and the Tenant check in the service — so the
 * corrected status cannot drift back into being a claim about nothing.
 */
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SCOPE_KEY } from '../../common/decorators/scope.decorator';
import { EnforcementStatus } from '../../common/constants/scope.types';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

const director = { id: 'director-1', role: Role.MALL_DIRECTOR };

function buildController() {
  const ticketsService: any = {
    getEscalations: jest.fn(),
    rateTicket: jest.fn(),
    getTicketRating: jest.fn(),
  };
  const slaService: any = {};
  const mallAccess: any = { extractAndValidateMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
  return {
    controller: new TicketsController(ticketsService, slaService, mallAccess),
    ticketsService,
    mallAccess,
  };
}

describe('TicketsController — the formerly-GAP routes check the owning Mall', () => {
  it.each([
    ['getEscalations', (c: TicketsController) => c.getEscalations('tkt-b', director)],
    ['rateTicket', (c: TicketsController) => c.rateTicket('tkt-b', { rating: 5 }, director)],
    ['getTicketRating', (c: TicketsController) => c.getTicketRating('tkt-b', director)],
  ] as [string, (c: TicketsController) => Promise<unknown>][])('%s resolves the ticket Mall before acting', async (_n, call) => {
    const { controller, mallAccess } = buildController();

    await call(controller);

    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(
      director.id,
      director.role,
      { ticketId: 'tkt-b' },
    );
  });

  it('rateTicket writes nothing when the Mall check refuses', async () => {
    const { controller, ticketsService, mallAccess } = buildController();
    mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());

    await expect(controller.rateTicket('tkt-b', { rating: 5 }, director)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ticketsService.rateTicket).not.toHaveBeenCalled();
  });
});

describe('TicketsService — the formerly-GAP routes check the owning Tenant', () => {
  function buildService(ticket: any) {
    const prisma: any = {
      ticket: { findUnique: jest.fn().mockResolvedValue(ticket) },
      ticketEscalation: { findMany: jest.fn().mockResolvedValue([]) },
      ticketRating: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    };
    return { service: new TicketsService(prisma as any, {} as any, {} as any, {} as any, {} as any), prisma };
  }

  const foreignTicket = { id: 'tkt-1', tenantId: 'tenant-highlands', comments: [] };
  const other = { id: 'u-circlek', role: 'TENANT', tenantId: 'tenant-circlek' };
  const owner = { id: 'u-highlands', role: 'TENANT', tenantId: 'tenant-highlands' };

  it.each([
    ['getEscalations', (s: TicketsService, u: any) => s.getEscalations('tkt-1', u)],
    ['getTicketRating', (s: TicketsService, u: any) => s.getTicketRating('tkt-1', u)],
    ['rateTicket', (s: TicketsService, u: any) => s.rateTicket('tkt-1', 5, undefined, u)],
  ] as [string, (s: TicketsService, u: any) => Promise<unknown>][])('%s refuses a tenant that does not own the ticket', async (_n, call) => {
    const { service } = buildService(foreignTicket);

    await expect(call(service, other)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rateTicket does not upsert a rating for a foreign tenant', async () => {
    const { service, prisma } = buildService(foreignTicket);

    await expect(service.rateTicket('tkt-1', 5, undefined, other)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.ticketRating.upsert).not.toHaveBeenCalled();
  });

  it('the owning tenant is still allowed through', async () => {
    const { service, prisma } = buildService(foreignTicket);

    await service.rateTicket('tkt-1', 5, 'good', owner);

    expect(prisma.ticketRating.upsert).toHaveBeenCalled();
  });
});

describe('SCOPE-001 — the ticket annotations now match the code', () => {
  it.each(['getEscalations', 'rateTicket', 'getTicketRating'])(
    '%s no longer declares itself a GAP',
    (method) => {
      const scope = Reflect.getMetadata(SCOPE_KEY, (TicketsController.prototype as any)[method]);
      expect(scope.status).toBe(EnforcementStatus.ENFORCED);
    },
  );
});
