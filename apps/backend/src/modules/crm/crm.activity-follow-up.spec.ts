import { ConflictException } from '@nestjs/common';
import { CrmFollowUpStatus, Role } from '@prisma/client';
import { CategoryResolverService } from '../../common/services/category-resolver.service';
import { CrmService } from './crm.service';

describe('CRM activity and follow-up evidence', () => {
  const scope = { userId: 'manager-a', role: Role.LEASING_MANAGER, mallIds: ['mall-a'] };
  let prisma: any;
  let events: any;
  let service: CrmService;

  beforeEach(() => {
    events = { append: jest.fn().mockResolvedValue({ id: 'event-1' }) };
    prisma = {
      lead: {
        findFirst: jest.fn().mockResolvedValue({ id: 'lead-a' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'lead-a', isActive: true, deletedAt: null, lastActivityAt: null }),
        update: jest.fn().mockResolvedValue({ id: 'lead-a' }),
      },
      leadActivity: {
        create: jest.fn().mockResolvedValue({
          id: 'activity-a', leadId: 'lead-a', type: 'CALL', note: 'Called',
          occurredAt: new Date('2026-09-12T01:00:00.000Z'), createdAt: new Date('2026-09-12T01:00:00.000Z'),
          createdBy: { id: 'manager-a', fullName: 'Manager A' },
        }),
      },
      leadFollowUp: {
        create: jest.fn().mockResolvedValue({
          id: 'follow-a', leadId: 'lead-a', assignedToId: 'manager-a', note: 'Call again',
          dueDate: new Date('2026-09-20T00:00:00.000Z'), createdAt: new Date('2026-09-12T02:00:00.000Z'),
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 'follow-a', leadId: 'lead-a', status: CrmFollowUpStatus.OPEN }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'follow-a', status: CrmFollowUpStatus.COMPLETED }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-a' }) },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    service = new CrmService(
      prisma,
      {} as any,
      new CategoryResolverService(prisma),
      events,
      {} as any,
    );
  });

  it('CRM-EVT-009 writes activity, last touch and event in one transaction', async () => {
    await service.addActivity('lead-a', {
      type: 'CALL' as any,
      note: 'Called',
      outcome: 'Meeting booked',
      occurredAt: '2026-09-12T01:00:00.000Z',
    }, 'manager-a');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.leadActivity.create).toHaveBeenCalled();
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { lastActivityAt: new Date('2026-09-12T01:00:00.000Z') },
    }));
    expect(events.append).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ACTIVITY_ADDED',
      sourceEntityId: 'activity-a',
    }), prisma);
  });

  it('CRM-EVT-010 does not regress lastActivityAt for a back-dated activity', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-a', isActive: true, deletedAt: null,
      lastActivityAt: new Date('2026-09-12T05:00:00.000Z'),
    });
    await service.addActivity('lead-a', {
      type: 'EMAIL' as any, note: 'Old email', occurredAt: '2026-09-11T01:00:00.000Z',
    }, 'manager-a');
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(events.append).toHaveBeenCalled();
  });

  it('CRM-EVT-011 records creator and emits follow-up creation evidence', async () => {
    await service.createFollowUp({
      leadId: 'lead-a', assignedToId: 'manager-a', dueDate: '2026-09-20', note: 'Call again',
    }, 'manager-a', scope);
    expect(prisma.leadFollowUp.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: 'manager-a', status: CrmFollowUpStatus.OPEN }),
    }));
    expect(events.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'FOLLOW_UP_CREATED' }), prisma);
  });

  it('CRM-CONC-043 completes a follow-up once and a retry creates no duplicate event', async () => {
    await service.completeFollowUp('follow-a', { outcome: 'Reached' }, scope);
    prisma.leadFollowUp.findFirst.mockResolvedValue({ id: 'follow-a', leadId: 'lead-a', status: CrmFollowUpStatus.COMPLETED });
    await service.completeFollowUp('follow-a', { outcome: 'Reached' }, scope);
    expect(prisma.leadFollowUp.updateMany).toHaveBeenCalledTimes(1);
    expect(events.append).toHaveBeenCalledTimes(1);
  });

  it('CRM-CONC-044 rejects a complete/cancel race loser without an event', async () => {
    prisma.leadFollowUp.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancelFollowUp('follow-a', 'Duplicate plan', scope))
      .rejects.toBeInstanceOf(ConflictException);
    expect(events.append).not.toHaveBeenCalled();
  });
});
