import {
  CrmActorType,
  CrmBusinessEventType,
  CrmEventScope,
  CrmEventSourceModule,
  LeadStatus,
  Role,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { CrmBusinessEventService } from './crm-business-event.service';

describe('CrmBusinessEventService', () => {
  let prisma: any;
  let service: CrmBusinessEventService;

  beforeEach(() => {
    prisma = {
      lead: { findUnique: jest.fn() },
      crmBusinessEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new CrmBusinessEventService(prisma);
  });

  const input = {
    leadId: 'lead-a',
    eventType: CrmBusinessEventType.LEAD_STATUS_CHANGED,
    occurredAt: new Date('2026-09-12T01:00:00.000Z'),
    actor: { type: CrmActorType.USER, userId: 'user-a' },
    sourceModule: CrmEventSourceModule.CRM,
    fromStatus: LeadStatus.NEW,
    toStatus: LeadStatus.CONTACTED,
    idempotencyKey: 'manual:lead-a:contacted:request-1',
  };

  it('derives MALL ownership only from persisted Lead.mallId', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-a', mallId: 'mall-a', customerId: null });
    prisma.crmBusinessEvent.create.mockImplementation(({ data }: any) => ({ id: 'event-a', ...data }));

    await service.append(input);

    expect(prisma.crmBusinessEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'lead-a',
        mallId: 'mall-a',
        scope: CrmEventScope.MALL,
        actorUserId: 'user-a',
      }),
    });
  });

  it('keeps null-Mall history GLOBAL_UNASSIGNED without inference', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-a', mallId: null, customerId: 'customer-a' });
    prisma.crmBusinessEvent.create.mockImplementation(({ data }: any) => ({ id: 'event-a', ...data }));

    await service.append(input);

    expect(prisma.crmBusinessEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mallId: null, scope: CrmEventScope.GLOBAL_UNASSIGNED }),
    });
  });

  it('accepts an identical idempotent replay and rejects conflicting meaning', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-a', mallId: 'mall-a', customerId: null });
    prisma.crmBusinessEvent.create.mockImplementation(({ data }: any) => ({ id: 'event-a', ...data }));
    const first = await service.append(input);
    prisma.crmBusinessEvent.findUnique.mockResolvedValue(first);

    await expect(service.append(input)).resolves.toEqual(first);
    await expect(service.append({ ...input, toStatus: LeadStatus.QUALIFIED })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('filters ordinary users to MALL events in their authorized Mall set', async () => {
    await service.listForLead('lead-a', {
      userId: 'manager-a',
      role: Role.LEASING_MANAGER,
      mallIds: ['mall-a'],
    });

    expect(prisma.crmBusinessEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadId: 'lead-a',
          scope: CrmEventScope.MALL,
          mallId: { in: ['mall-a'] },
        }),
      }),
    );
  });
});
