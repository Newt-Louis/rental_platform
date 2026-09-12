import { LeadStatus, Role } from '@prisma/client';
import { CategoryResolverService } from '../../common/services/category-resolver.service';
import {
  AUTO_LOST_MODE,
  AUTO_LOST_REASON_CODE,
  CrmService,
} from './crm.service';

describe('CR-CRM-BUSINESS-EVENT-001A auto-LOST safety gate', () => {
  const scope = {
    userId: 'manager-a',
    role: Role.LEASING_MANAGER,
    mallIds: ['mall-a'],
  };
  const staleLead = {
    id: 'lead-a',
    brandName: 'Stale Lead A',
    status: LeadStatus.QUALIFIED,
    mallId: 'mall-a',
    lastActivityAt: new Date('2026-06-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  let prisma: any;
  let service: CrmService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-12T00:00:00.000Z'));
    prisma = {
      lead: {
        findMany: jest.fn().mockResolvedValue([staleLead]),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new CrmService(
      prisma,
      {} as any,
      new CategoryResolverService(prisma as any),
      {} as any,
      { transition: jest.fn().mockResolvedValue({ changed: true }) } as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('AUTOLOST-001 detects a candidate and returns observable selection evidence', async () => {
    const logSpy = jest.spyOn((service as any).logger, 'log');
    const result = await service.autoMoveStaleToLost(60, scope);

    expect(result).toMatchObject({
      mode: AUTO_LOST_MODE,
      dryRun: true,
      thresholdDays: 60,
      candidateCount: 1,
      moved: 0,
      statusMutations: 0,
    });
    expect(result.candidates[0]).toMatchObject({
      leadId: staleLead.id,
      currentStatus: LeadStatus.QUALIFIED,
      mallId: 'mall-a',
      basis: 'LAST_ACTIVITY_AT',
      basisAt: staleLead.lastActivityAt.toISOString(),
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"mode":"DRY_RUN"'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"statusMutations":0'));
  });

  it('AUTOLOST-002 leaves Lead.status unchanged and performs no write', async () => {
    await service.autoMoveStaleToLost(60, scope);

    expect(staleLead.status).toBe(LeadStatus.QUALIFIED);
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('AUTOLOST-003 repeated runs return the same report with zero business-data side effects', async () => {
    const first = await service.autoMoveStaleToLost(60, scope);
    const second = await service.autoMoveStaleToLost(60, scope);

    expect(second).toEqual(first);
    expect(prisma.lead.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('AUTOLOST-004 causes no Lead.updatedAt mutation', async () => {
    await service.autoMoveStaleToLost(60, scope);

    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('AUTOLOST-005 applies the canonical Mall scope before returning candidate detail', async () => {
    const result = await service.autoMoveStaleToLost(60, scope);
    const query = prisma.lead.findMany.mock.calls[0][0];

    expect(query.where.mallId).toEqual({ in: ['mall-a'] });
    expect(result.candidates).toEqual([
      expect.objectContaining({ leadId: 'lead-a', mallId: 'mall-a' }),
    ]);
  });

  it('AUTOLOST-006 returns a deterministic reason and creation-time fallback', async () => {
    prisma.lead.findMany.mockResolvedValueOnce([
      { ...staleLead, lastActivityAt: null },
    ]);

    const first = await service.autoMoveStaleToLost(60, scope);
    prisma.lead.findMany.mockResolvedValueOnce([
      { ...staleLead, lastActivityAt: null },
    ]);
    const second = await service.autoMoveStaleToLost(60, scope);

    expect(first.candidates[0]).toMatchObject({
      reasonCode: AUTO_LOST_REASON_CODE,
      reason: 'No Lead activity recorded for 60+ days',
      basis: 'CREATED_AT',
      basisAt: staleLead.createdAt.toISOString(),
    });
    expect(second.candidates[0].reason).toBe(first.candidates[0].reason);
  });

  it('AUTOLOST-007 query/scheduler failure cannot partially mutate a Lead', async () => {
    prisma.lead.findMany.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.autoMoveStaleToLost(60, scope)).rejects.toThrow(
      'database unavailable',
    );
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });

  it('AUTOLOST-008 preserves the existing manual LOST path', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      ...staleLead,
      customerId: null,
      activities: [],
      proposals: [],
      bookings: [],
    });
    await service.moveLead(staleLead.id, LeadStatus.LOST, 0, 'manager-a');

    expect((service as any).leadLifecycle.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: staleLead.id,
        targetStatus: LeadStatus.LOST,
        position: 0,
      }),
    );
  });
});
