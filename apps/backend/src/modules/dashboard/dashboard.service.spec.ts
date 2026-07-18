import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma: any = {
    unit: { findMany: jest.fn() }, contract: { count: jest.fn() },
    approvalWorkflow: { count: jest.fn() }, ticket: { count: jest.fn() },
    invoice: { findMany: jest.fn() }, tenant: { count: jest.fn() },
    unitBooking: { count: jest.fn() },
  };
  const redis = { getJson: jest.fn(), setJson: jest.fn() };
  const mallAccess = { assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn() };
  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    redis.getJson.mockResolvedValue(null);
    redis.setJson.mockResolvedValue(undefined);
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    prisma.unit.findMany.mockResolvedValue([
      { status: 'OCCUPIED', areaNLA: 80 }, { status: 'VACANT', areaNLA: 20 },
    ]);
    prisma.contract.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    prisma.approvalWorkflow.count.mockResolvedValue(3);
    prisma.ticket.count.mockResolvedValue(4);
    prisma.invoice.findMany
      .mockResolvedValueOnce([
        { totalAmount: 1000, status: 'PARTIALLY_PAID', payments: [{ amount: 250 }] },
        { totalAmount: 500, status: 'PAID', payments: [{ amount: 500 }, { amount: 100 }] },
      ])
      .mockResolvedValueOnce([{ totalAmount: 1000, payments: [{ amount: 250 }] }]);
    prisma.tenant.count.mockResolvedValue(5);
    prisma.unitBooking.count.mockResolvedValueOnce(6).mockResolvedValueOnce(7).mockResolvedValueOnce(8);
    service = new DashboardService(prisma, redis as any, mallAccess as any);
  });

  it('limits an all-mall dashboard to malls assigned to the user', async () => {
    const result = await service.getDashboard(undefined, { id: 'user-1', role: 'OPERATION' });
    expect(mallAccess.getAccessibleMallIds).toHaveBeenCalledWith('user-1', 'OPERATION');
    expect(prisma.unit.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { mallId: { in: ['mall-1'] } },
          { floor: { mallId: { in: ['mall-1'] } } },
        ]),
      }),
    }));
    expect(result).toMatchObject({ focusAreas: ['tickets', 'fitout'], openTickets: 4 });
    expect(result).not.toHaveProperty('monthlyRevenue');
    expect(result).not.toHaveProperty('bookingStats');
  });

  it('validates a requested mall and calculates collection from valid payments', async () => {
    const result = await service.getDashboard('mall-1', { id: 'user-1', role: 'ADMIN' });
    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('user-1', 'ADMIN', 'mall-1');
    expect(result).toMatchObject({
      monthlyRevenue: 1500, collectedRevenue: 850, overdueAmount: 750,
      bookingStats: { active: 6, pending: 7, expiringSoon: 8 }, focusAreas: ['overview'],
    });
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        payments: { where: { reversedAt: null }, select: { amount: true } },
      }),
    }));
  });
});
