/**
 * CR-NOTIFICATION-RECIPIENT-ROUTING -- both delivery mechanisms must go through
 * the same routing boundary (CR section 18): the queued path
 * (EmailDeliveryService.enqueue) and the direct path (EmailService.sendMail).
 */
import { ContractExpiryScheduler } from '../contract-expiry.scheduler';
import { TicketSlaService } from '../../tickets/ticket-sla.service';

const routingStub = (recipients: any[], failClosed = false) => ({
  plan: jest.fn(async () => ({ mode: failClosed ? 'REPLACE' : 'DEFAULT', overridden: failClosed, failClosed, recipients, diagnostics: [] })),
});

describe('CR-NOTIFICATION-RECIPIENT-ROUTING integration points', () => {
  describe('NOTIF-ROUTE-024 queued path (contract expiry internal reminder)', () => {
    const contract = {
      id: 'c1', contractNumber: 'CTR-1', endDate: new Date('2026-12-01'),
      tenant: { brandName: 'Tenant', contactName: 'T', contactEmail: null },
      unit: { code: 'A-1', mallId: 'mall-a', mall: { name: 'Mall A' } },
      managedBy: { id: 'u-mgr', fullName: 'Manager', email: 'mgr@x.test' },
    };
    const build = (routing: any) => {
      const emailDelivery = { enqueue: jest.fn() };
      // Only the first threshold pass returns the contract; the rest are empty,
      // so the test asserts exactly one notification round.
      let served = false;
      const prisma = {
        contract: { findMany: jest.fn(async () => { if (served) return []; served = true; return [contract]; }) },
        notification: { findFirst: jest.fn(async () => null), create: jest.fn() },
      };
      const scheduler = new ContractExpiryScheduler(
        prisma as any,
        { create: jest.fn() } as any,
        { contractExpiryHtml: () => '<p/>' } as any,
        emailDelivery as any,
        { runExclusive: (_n: string, _t: number, task: any) => task() } as any,
        routing as any,
      );
      return { scheduler, emailDelivery, prisma };
    };

    it('sends to the routed recipients, keeping the producer delivery key when unrouted', async () => {
      const routing = routingStub([{ email: 'mgr@x.test', userId: 'u-mgr', fullName: 'Manager', kind: 'TO', keySuffix: 'manager' }]);
      const { scheduler, emailDelivery } = build(routing);
      await scheduler.checkContractExpiry();
      expect(routing.plan).toHaveBeenCalledWith(expect.objectContaining({ eventKey: 'CONTRACT_EXPIRY_INTERNAL', mallId: 'mall-a', resourceId: 'c1' }));
      const keys = emailDelivery.enqueue.mock.calls.map((c: any[]) => c[1].eventKey);
      expect(keys.some((k: string) => k.endsWith(':manager'))).toBe(true);
    });

    it('sends to a replaced recipient instead of the default manager', async () => {
      const routing = routingStub([{ email: 'other@x.test', userId: 'u-other', fullName: 'Other', kind: 'TO', keySuffix: 'routed:to:u-other' }]);
      const { scheduler, emailDelivery } = build(routing);
      await scheduler.checkContractExpiry();
      const recipientsSent = emailDelivery.enqueue.mock.calls.map((c: any[]) => c[1].to);
      expect(recipientsSent).toContain('other@x.test');
      expect(recipientsSent).not.toContain('mgr@x.test');
    });

    it('withholds the mail when a REPLACE configuration has no eligible recipient', async () => {
      const routing = routingStub([], true);
      const { scheduler, emailDelivery } = build(routing);
      await scheduler.checkContractExpiry();
      expect(emailDelivery.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('NOTIF-ROUTE-025 direct path (ticket SLA escalation)', () => {
    const ticket = {
      id: 't1', ticketNumber: 'TK-1', subject: 'Hỏng điều hoà', type: 'MAINTENANCE', priority: 'HIGH',
      escalations: [], assignedTo: null,
      tenant: { brandName: 'Tenant' }, unit: { code: 'A-1', mallId: 'mall-a' },
    };
    const build = (routing: any) => {
      const emailService = { sendMail: jest.fn(async () => ({ skipped: true })), ticketSlaHtml: () => '<p/>' };
      const prisma = {
        ticketSlaPolicy: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
        ticket: { findMany: jest.fn(async () => [ticket]), update: jest.fn(async () => ticket) },
        ticketEscalation: { create: jest.fn() },
        user: { findMany: jest.fn(async () => [{ id: 'u-mgr', fullName: 'Manager', email: 'mgr@x.test' }]) },
        notification: { create: jest.fn() },
      };
      const service = new TicketSlaService(
        prisma as any,
        { create: jest.fn() } as any,
        emailService as any,
        { runExclusive: (_n: string, _t: number, task: any) => task() } as any,
        routing as any,
      );
      return { service, emailService, prisma };
    };

    it('routes the escalation mail through the same boundary as the queued events', async () => {
      const routing = routingStub([{ email: 'ops@x.test', userId: 'u-ops', fullName: 'Ops', kind: 'TO', keySuffix: 'routed:to:u-ops' }]);
      const { service, emailService } = build(routing);
      await service.checkSlaBreaches();
      expect(routing.plan).toHaveBeenCalledWith(expect.objectContaining({ eventKey: 'TICKET_SLA_ESCALATION', mallId: 'mall-a', resourceId: 't1' }));
      const sentTo = emailService.sendMail.mock.calls.map((c: any[]) => c[0].to);
      expect(sentTo).toEqual(['ops@x.test']);
      expect(sentTo).not.toContain('mgr@x.test');
    });

    it('withholds a direct-send mail too when routing fails closed', async () => {
      const routing = routingStub([], true);
      const { service, emailService } = build(routing);
      await service.checkSlaBreaches();
      expect(emailService.sendMail).not.toHaveBeenCalled();
    });
  });
});
