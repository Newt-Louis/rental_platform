import { BillingAddInScheduler } from './billing-addin.scheduler';

describe('BillingAddInScheduler — Operations notifications', () => {
  const prisma: any = {
    userMallAccess: { findMany: jest.fn() },
    notification: { findFirst: jest.fn() },
  };
  const notificationsService: any = { create: jest.fn() };
  const billingAddInService: any = { listDueSoonOrOverdue: jest.fn() };
  let scheduler: BillingAddInScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new BillingAddInScheduler(billingAddInService, {} as any, prisma, notificationsService);
  });

  describe('notifyOperationsOfNewEntries (new PENDING entries generated)', () => {
    it('notifies every OPERATION user with mall access, grouped by mall', async () => {
      prisma.userMallAccess.findMany.mockResolvedValue([
        { mallId: 'mall-A', userId: 'ops-1' },
        { mallId: 'mall-A', userId: 'ops-2' },
        { mallId: 'mall-B', userId: 'ops-3' },
      ]);
      const entries = [
        { id: 'entry-1', mallId: 'mall-A', contractNumber: 'CTR-A1', chargeType: 'UTILITY' },
        { id: 'entry-2', mallId: 'mall-B', contractNumber: 'CTR-B1', chargeType: 'AFTER_HOURS_COOLING' },
      ];

      await (scheduler as any).notifyOperationsOfNewEntries(entries, '2026-08');

      expect(notificationsService.create).toHaveBeenCalledTimes(3); // 2 mall-A recipients + 1 mall-B recipient
      const mallACalls = notificationsService.create.mock.calls.filter((c: any) => c[0].userId === 'ops-1' || c[0].userId === 'ops-2');
      expect(mallACalls).toHaveLength(2);
      expect(mallACalls[0][0]).toMatchObject({ entityType: 'PERIODIC_CHARGE_ENTRY', entityId: 'entry-1', type: 'BILLING_ADDIN' });
      const mallBCall = notificationsService.create.mock.calls.find((c: any) => c[0].userId === 'ops-3');
      expect(mallBCall[0]).toMatchObject({ entityId: 'entry-2' });
    });

    it('does not throw and logs when no OPERATION user has access to the affected mall', async () => {
      prisma.userMallAccess.findMany.mockResolvedValue([]);
      const entries = [{ id: 'entry-1', mallId: 'mall-A', contractNumber: 'CTR-A1', chargeType: 'UTILITY' }];

      await expect((scheduler as any).notifyOperationsOfNewEntries(entries, '2026-08')).resolves.toBeUndefined();
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('remindDueSoonUnlocked (due-soon / overdue reminder)', () => {
    it('reminds OPERATION users about PENDING/DRAFT entries due soon, once per day', async () => {
      const dueDate = new Date(Date.now() + 2 * 86400000);
      billingAddInService.listDueSoonOrOverdue.mockResolvedValue([
        { id: 'entry-1', period: '2026-08', chargeType: 'UTILITY', dueDate, contract: { contractNumber: 'CTR-1', unit: { mallId: 'mall-A' } } },
      ]);
      prisma.notification.findFirst.mockResolvedValue(null); // not yet reminded today
      prisma.userMallAccess.findMany.mockResolvedValue([{ mallId: 'mall-A', userId: 'ops-1' }]);

      await (scheduler as any).remindDueSoonUnlocked();

      expect(notificationsService.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'ops-1', entityId: 'entry-1', entityType: 'PERIODIC_CHARGE_ENTRY',
        title: expect.stringContaining('sắp đến hạn'),
      }));
    });

    it('labels an already-past-due entry as overdue, not "sắp đến hạn"', async () => {
      const dueDate = new Date(Date.now() - 86400000);
      billingAddInService.listDueSoonOrOverdue.mockResolvedValue([
        { id: 'entry-1', period: '2026-08', chargeType: 'UTILITY', dueDate, contract: { contractNumber: 'CTR-1', unit: { mallId: 'mall-A' } } },
      ]);
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.userMallAccess.findMany.mockResolvedValue([{ mallId: 'mall-A', userId: 'ops-1' }]);

      await (scheduler as any).remindDueSoonUnlocked();

      expect(notificationsService.create).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('quá hạn') }));
    });

    it('does not remind twice in the same day (dedup guard)', async () => {
      billingAddInService.listDueSoonOrOverdue.mockResolvedValue([
        { id: 'entry-1', period: '2026-08', chargeType: 'UTILITY', dueDate: new Date(), contract: { contractNumber: 'CTR-1', unit: { mallId: 'mall-A' } } },
      ]);
      prisma.notification.findFirst.mockResolvedValue({ id: 'already-sent-today' });
      prisma.userMallAccess.findMany.mockResolvedValue([{ mallId: 'mall-A', userId: 'ops-1' }]);

      await (scheduler as any).remindDueSoonUnlocked();

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('does nothing when there are no due-soon/overdue entries', async () => {
      billingAddInService.listDueSoonOrOverdue.mockResolvedValue([]);
      await (scheduler as any).remindDueSoonUnlocked();
      expect(prisma.userMallAccess.findMany).not.toHaveBeenCalled();
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });
});
