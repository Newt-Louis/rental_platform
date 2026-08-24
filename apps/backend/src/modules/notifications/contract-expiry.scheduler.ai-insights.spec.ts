import { ContractExpiryScheduler } from './contract-expiry.scheduler';

// CR-101 Phase 3D (INV-AI-005): confirmed gap -- sendAiProactiveInsightsUnlocked()
// previously computed ONE platform-wide aggregate and sent the identical
// insight text to every ADMIN + CEO + MALL_DIRECTOR recipient, regardless of
// which Mall(s) they're actually authorized for. Fixed by partitioning:
// ADMIN/CEO keep the original global behavior (BYPASS_ROLES, unchanged
// platform policy); MALL_DIRECTOR is scoped per-Mall via UserMallAccess. This
// file proves: (a) two directors in different Malls receive DIFFERENT
// aggregates reflecting only their own Mall's data, (b) neither director's
// notification is built from the other's data, (c) ADMIN/CEO still receive
// the original global aggregate unchanged.
describe('ContractExpiryScheduler — AI proactive insights Mall partitioning (CR-101 Phase 3D)', () => {
  const prisma: any = {
    invoice: { count: jest.fn() },
    contract: { count: jest.fn() },
    ticket: { count: jest.fn() },
    unit: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    userMallAccess: { findMany: jest.fn() },
  };
  const notificationsService: any = { create: jest.fn() };
  const scheduler = new ContractExpiryScheduler(
    prisma,
    notificationsService,
    {} as any, // emailService
    {} as any, // emailDelivery
    {} as any, // schedulerLock
  );

  let fetchSpy: jest.SpyInstance;
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    // Each fetch call returns an insight tagged with a call-index marker so
    // tests can prove which mock response landed in which recipient's
    // notification -- without inspecting real Claude output shape beyond
    // `content[0].text`, matching the real code's own parsing.
    let call = 0;
    fetchSpy = jest.spyOn(global, 'fetch' as any).mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        json: async () => ({ content: [{ text: `insight-call-${call}` }] }),
      } as any;
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('two directors in different Malls each get an aggregate query scoped to their OWN Mall only', async () => {
    prisma.user.findMany.mockResolvedValue([]); // no ADMIN/CEO in this test
    prisma.userMallAccess.findMany.mockResolvedValue([
      { mallId: 'mall-A', userId: 'director-A' },
      { mallId: 'mall-B', userId: 'director-B' },
    ]);
    prisma.invoice.count.mockResolvedValue(0);
    prisma.contract.count.mockResolvedValue(0);
    prisma.ticket.count.mockResolvedValue(0);
    prisma.unit.findMany.mockResolvedValue([]);

    await (scheduler as any).sendAiProactiveInsightsUnlocked();

    // Every per-Mall aggregate query must be scoped to exactly one mallId --
    // never omitted (which would silently fall back to platform-wide).
    const invoiceCalls = prisma.invoice.count.mock.calls.map((c: any[]) => c[0].where.mallId);
    expect(invoiceCalls.sort()).toEqual(['mall-A', 'mall-B']);

    const unitCalls = prisma.unit.findMany.mock.calls.map((c: any[]) => c[0].where.mallId);
    expect(unitCalls.sort()).toEqual(['mall-A', 'mall-B']);
  });

  it('director A and director B each receive exactly one notification, built from their own Mall\'s insight call -- never the other\'s', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.userMallAccess.findMany.mockResolvedValue([
      { mallId: 'mall-A', userId: 'director-A' },
      { mallId: 'mall-B', userId: 'director-B' },
    ]);
    prisma.invoice.count.mockResolvedValue(0);
    prisma.contract.count.mockResolvedValue(0);
    prisma.ticket.count.mockResolvedValue(0);
    prisma.unit.findMany.mockResolvedValue([]);

    await (scheduler as any).sendAiProactiveInsightsUnlocked();

    expect(notificationsService.create).toHaveBeenCalledTimes(2);
    const recipientIds = notificationsService.create.mock.calls.map((c: any[]) => c[0].userId);
    expect(recipientIds.sort()).toEqual(['director-A', 'director-B']);
    // Each recipient's notification body came from a DIFFERENT fetch call
    // (proving two independent, per-Mall AI calls were made, not one shared
    // global call reused for both).
    const bodies = notificationsService.create.mock.calls.map((c: any[]) => c[0].body);
    expect(new Set(bodies).size).toBe(2);
  });

  it('a director assigned to two Malls receives one notification per Mall (intentional, not a duplicate-delivery bug)', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.userMallAccess.findMany.mockResolvedValue([
      { mallId: 'mall-A', userId: 'director-multi' },
      { mallId: 'mall-B', userId: 'director-multi' },
    ]);
    prisma.invoice.count.mockResolvedValue(0);
    prisma.contract.count.mockResolvedValue(0);
    prisma.ticket.count.mockResolvedValue(0);
    prisma.unit.findMany.mockResolvedValue([]);

    await (scheduler as any).sendAiProactiveInsightsUnlocked();

    const calls = notificationsService.create.mock.calls.filter((c: any[]) => c[0].userId === 'director-multi');
    expect(calls).toHaveLength(2);
  });

  it('ADMIN/CEO still receive the original global (platform-wide, unfiltered) aggregate, unchanged -- existing policy preserved', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'ceo-1' }]);
    prisma.userMallAccess.findMany.mockResolvedValue([]); // no directors in this test
    prisma.invoice.count.mockResolvedValue(5);
    prisma.contract.count.mockResolvedValue(2);
    prisma.ticket.count.mockResolvedValue(1);
    prisma.unit.findMany.mockResolvedValue([{ status: 'OCCUPIED' }, { status: 'VACANT' }]);

    await (scheduler as any).sendAiProactiveInsightsUnlocked();

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isActive: true, role: { in: ['ADMIN', 'CEO'] } },
      select: { id: true },
    });
    // The global aggregate call carries no mallId filter at all.
    const globalInvoiceCall = prisma.invoice.count.mock.calls.find((c: any[]) => !('mallId' in c[0].where));
    expect(globalInvoiceCall).toBeDefined();
    const recipientIds = notificationsService.create.mock.calls.map((c: any[]) => c[0].userId);
    expect(recipientIds.sort()).toEqual(['admin-1', 'ceo-1']);
  });

  it('one Mall\'s AI-provider failure does not block delivery to other Malls\' directors', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.userMallAccess.findMany.mockResolvedValue([
      { mallId: 'mall-A', userId: 'director-A' },
      { mallId: 'mall-B', userId: 'director-B' },
    ]);
    prisma.invoice.count.mockResolvedValue(0);
    prisma.contract.count.mockResolvedValue(0);
    prisma.ticket.count.mockResolvedValue(0);
    prisma.unit.findMany.mockResolvedValue([]);

    // Call 1 is always the global (ADMIN/CEO) insight call, made unconditionally
    // by sendGlobalInsight() before it even checks whether there are any
    // ADMIN/CEO recipients -- so call 2 is the first per-Mall call (mall-A,
    // per the Map insertion order from the mocked grants above). That's the
    // one this test fails, to prove mall-B (call 3) is unaffected.
    let call = 0;
    fetchSpy.mockImplementation(async () => {
      call += 1;
      if (call === 2) throw new Error('provider unavailable');
      return { ok: true, json: async () => ({ content: [{ text: 'insight-ok' }] }) } as any;
    });

    await (scheduler as any).sendAiProactiveInsightsUnlocked();

    // Exactly one of the two directors got a notification -- the failing
    // Mall's failure didn't throw and abort the whole job.
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
  });
});
