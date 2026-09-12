import {
  CrmActorType,
  CrmBusinessEventType,
  CrmEventSourceModule,
  LeadStatus,
} from '@prisma/client';
import { LeadLifecycleService } from './lead-lifecycle.service';

describe('LeadLifecycleService', () => {
  let prisma: any;
  let events: any;
  let service: LeadLifecycleService;

  beforeEach(() => {
    prisma = {
      crmBusinessEvent: { findUnique: jest.fn().mockResolvedValue(null) },
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lead-a', status: LeadStatus.NEW, mallId: 'mall-a',
          customerId: null, isActive: true, deletedAt: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'lead-a', status: LeadStatus.CONTACTED }),
      },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    events = { append: jest.fn().mockResolvedValue({ id: 'event-a' }) };
    service = new LeadLifecycleService(prisma, events);
  });

  const transition = {
    leadId: 'lead-a',
    targetStatus: LeadStatus.CONTACTED,
    actor: { type: CrmActorType.USER, userId: 'user-a' },
    sourceModule: CrmEventSourceModule.CRM,
    occurredAt: new Date('2026-09-12T01:00:00.000Z'),
    idempotencyKey: 'manual:lead-a:contacted:request-1',
  };

  it('writes current state and authoritative event through one transaction client', async () => {
    const result = await service.transition(transition);

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-a' },
      data: { status: LeadStatus.CONTACTED },
    });
    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: CrmBusinessEventType.LEAD_STATUS_CHANGED,
        fromStatus: LeadStatus.NEW,
        toStatus: LeadStatus.CONTACTED,
      }),
      prisma,
    );
    expect(result).toMatchObject({ changed: true, eventId: 'event-a' });
  });

  it('does not fabricate an event when the state already equals the target', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-a', status: LeadStatus.CONTACTED, isActive: true, deletedAt: null,
    });

    const result = await service.transition(transition);

    expect(result.changed).toBe(false);
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(events.append).not.toHaveBeenCalled();
  });

  it('propagates event failure so the enclosing transaction can roll back', async () => {
    events.append.mockRejectedValue(new Error('event unavailable'));

    await expect(service.transition(transition)).rejects.toThrow('event unavailable');
  });
});
