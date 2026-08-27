import { AiService, AiRequestContext } from './ai.service';

// CR-101 Phase 3D (INV-AI-001/002/003/004): AiService.buildContext()/
// getSuggestions() previously issued every business-data query with zero Mall
// filter -- confirmed gap. This file proves every query block now applies the
// caller's authorizedMallIds, and that prompt text (`message`) only ever
// selects WHICH block runs, never WHICH Mall's data it reads -- the mock
// `message` strings below deliberately try to name a foreign Mall in the
// question text, proving that alone doesn't change the DB query issued.
describe('AiService — CR-101 Phase 3D Mall scoping', () => {
  const prisma: any = {
    unit: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    contract: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    invoice: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: 0 }), count: jest.fn().mockResolvedValue(0) },
    salesTurnover: { aggregate: jest.fn().mockResolvedValue({ _sum: {}, _count: 0 }) },
    ticket: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    tenant: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    proposal: { count: jest.fn().mockResolvedValue(0) },
  };
  const service = new AiService(prisma);

  const scoped: AiRequestContext = { userId: 'u1', role: 'LEASING_MANAGER', authorizedMallIds: ['mall-A'] };
  const unrestricted: AiRequestContext = { userId: 'admin-1', role: 'ADMIN', authorizedMallIds: null };

  beforeEach(() => jest.clearAllMocks());

  // buildContext() is private, called from chat() only after the apiKey check
  // passes and before the actual provider fetch -- so we set a dummy apiKey
  // (making chat() proceed into buildContext(), which hits the mocked prisma
  // calls below) and mock global.fetch to reject (so no real network call is
  // ever made; chat()'s own try/catch turns that into a thrown
  // ServiceUnavailableException, which the test expects).
  async function runBuildContext(message: string, ctx: AiRequestContext) {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network disabled in test'));
    try {
      await expect(service.chat(message, [], ctx)).rejects.toThrow();
    } finally {
      fetchSpy.mockRestore();
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    }
  }

  it('occupancy block: scoped caller filters Unit by mallId; unrestricted caller does not', async () => {
    await runBuildContext('tỷ lệ lấp đầy của mall B?', scoped);
    expect(prisma.unit.findMany).toHaveBeenCalledWith({ where: { isActive: true, mallId: { in: ['mall-A'] } }, select: { status: true, areaNLA: true } });

    jest.clearAllMocks();
    await runBuildContext('occupancy?', unrestricted);
    expect(prisma.unit.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { status: true, areaNLA: true } });
  });

  it('contract block: scoped caller filters via unit.mallId -- prompt naming another Mall does not widen the query', async () => {
    await runBuildContext('hợp đồng sắp hết hạn ở mall B thế nào?', scoped);
    expect(prisma.contract.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ unit: { mallId: { in: ['mall-A'] } } }),
    }));
  });

  it('invoice block: scoped caller filters Invoice.mallId directly', async () => {
    await runBuildContext('công nợ quá hạn?', scoped);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ mallId: { in: ['mall-A'] } }),
    }));
  });

  it('sales block: scoped caller filters SalesTurnover via unit.mallId', async () => {
    await runBuildContext('doanh thu tháng này?', scoped);
    expect(prisma.salesTurnover.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ unit: { mallId: { in: ['mall-A'] } } }),
    }));
  });

  it('ticket block: scoped caller filters Ticket via unit.mallId', async () => {
    await runBuildContext('ticket vận hành đang mở?', scoped);
    expect(prisma.ticket.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ unit: { mallId: { in: ['mall-A'] } } }),
    }));
  });

  it('tenant block: scoped caller filters Tenant via occupiedUnits.mallId', async () => {
    await runBuildContext('khách thuê hiện tại?', scoped);
    expect(prisma.tenant.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ occupiedUnits: { some: { mallId: { in: ['mall-A'] } } } }),
    }));
  });

  it('proposal block: scoped caller filters Proposal via unit.mallId', async () => {
    await runBuildContext('proposal đang chờ duyệt?', scoped);
    expect(prisma.proposal.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ unit: { mallId: { in: ['mall-A'] } } }),
    }));
  });

  describe('getSuggestions', () => {
    it('scoped caller filters every underlying count by mallId', async () => {
      await service.getSuggestions(scoped);
      expect(prisma.contract.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ unit: { mallId: { in: ['mall-A'] } } }),
      }));
      expect(prisma.invoice.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ mallId: { in: ['mall-A'] } }),
      }));
      expect(prisma.ticket.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ unit: { mallId: { in: ['mall-A'] } } }),
      }));
      expect(prisma.unit.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ mallId: { in: ['mall-A'] } }),
      }));
    });

    it('unrestricted caller (ADMIN/CEO) does not add a mallId filter -- preserves existing platform-wide policy', async () => {
      await service.getSuggestions(unrestricted);
      expect(prisma.unit.count).toHaveBeenCalledWith({ where: { isActive: true, status: 'VACANT' } });
    });
  });
});
