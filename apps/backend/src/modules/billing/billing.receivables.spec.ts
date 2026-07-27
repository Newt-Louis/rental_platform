import { BillingService } from './billing.service';

describe('BillingService receivables workbench', () => {
  const prisma = {
    invoice: { findMany: jest.fn(), count: jest.fn() },
    billingScheduleEntry: { findMany: jest.fn() },
    serviceContractPayment: { findMany: jest.fn() },
  } as any;
  let service: BillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingService(prisma);
  });

  it('returns balance, overdue days and summary calculated across all matching invoices', async () => {
    const dueDate = new Date(Date.now() - 5 * 86400000);
    const overdueInvoice = {
      id: 'invoice-1', status: 'ISSUED', sourceType: 'SERVICE_CONTRACT', type: 'SERVICE_CONTRACT',
      totalAmount: 1_100_000, dueDate,
      payments: [{ amount: 200_000, reversedAt: null }, { amount: 100_000, reversedAt: new Date() }],
    };
    const draftInvoice = {
      id: 'invoice-2', status: 'DRAFT', sourceType: 'LEASE_CONTRACT', type: 'MONTHLY_RENT',
      totalAmount: 2_000_000, dueDate: new Date(Date.now() + 5 * 86400000), payments: [],
    };
    prisma.invoice.findMany.mockResolvedValueOnce([overdueInvoice]).mockResolvedValueOnce([overdueInvoice, draftInvoice]);
    prisma.invoice.count.mockResolvedValue(1);

    const result = await service.findAllInvoices({ bucket: 'OVERDUE', page: 1, limit: 25 }, undefined, ['mall-1']);

    expect(result.data[0].totalPaid).toBe(200_000);
    expect(result.data[0].balance).toBe(900_000);
    expect(result.data[0].daysOverdue).toBeGreaterThanOrEqual(5);
    expect(result.summary.totalOutstanding).toBe(2_900_000);
    expect(result.summary.overdue).toEqual({ count: 1, amount: 900_000 });
    expect(result.summary.draft).toEqual({ count: 1, amount: 2_000_000 });
  });

  it('groups service-contract aging by billing party instead of merging null tenants', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      { id: 'i1', tenantId: null, billingPartyId: 'party-1', billingParty: { id: 'party-1', name: 'Đối tác A' }, tenant: null, totalAmount: 100, dueDate: new Date(), payments: [] },
      { id: 'i2', tenantId: null, billingPartyId: 'party-2', billingParty: { id: 'party-2', name: 'Đối tác B' }, tenant: null, totalAmount: 200, dueDate: new Date(), payments: [] },
    ]);

    const rows = await service.getArAging(['mall-1']) as any[];

    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.counterpartyName)).toEqual(expect.arrayContaining(['Đối tác A', 'Đối tác B']));
  });

  it('combines unbilled lease and service-contract obligations with a due summary', async () => {
    const past = new Date(Date.now() - 86400000);
    prisma.billingScheduleEntry.findMany.mockResolvedValue([{
      id: 'lease-period', contractId: 'lease-1', period: '2026-07', dueDate: past,
      subtotal: 1_000, rentAmount: 800, camAmount: 200,
      contract: { contractNumber: 'LEASE-001', tenant: { brandName: 'Tenant A' }, unit: { mallId: 'mall-1', code: 'L1-01' } },
    }]);
    prisma.serviceContractPayment.findMany.mockResolvedValue([{
      id: 'service-period', contractId: 'service-1', milestone: 'Ky 1', dueDate: past,
      invoicePlannedDate: past, amount: 2_200, subtotal: 2_000, vatRate: 10, totalAmount: 2_200,
      periodStart: null,
      contract: { contractNumber: 'SC-001', title: 'Service', mallId: 'mall-1', counterpartyName: 'Partner B', counterpartyTax: 'TAX', defaultVatRate: 10, billingParty: null },
    }]);

    const result = await service.getPendingReceivables({}, ['mall-1']);

    expect(result.data).toHaveLength(2);
    expect(result.summary).toMatchObject({ count: 2, amount: 3_300, dueCount: 2, dueAmount: 3_300 });
    expect(result.data.map(row => row.sourceType)).toEqual(expect.arrayContaining(['LEASE_CONTRACT', 'SERVICE_CONTRACT']));
  });

  it('bulk-creates only selected receivables that are due', async () => {
    jest.spyOn(service, 'getPendingReceivables').mockResolvedValue({
      data: [
        { id: 'due-1', sourceType: 'LEASE_CONTRACT', isDueForInvoice: true },
        { id: 'due-2', sourceType: 'SERVICE_CONTRACT', isDueForInvoice: true },
        { id: 'future-1', sourceType: 'LEASE_CONTRACT', isDueForInvoice: false },
      ],
    } as any);
    const create = jest.spyOn(service, 'createInvoiceFromPending').mockResolvedValue({
      id: 'invoice-2', invoiceNumber: 'SC-PAYMENT-due-2',
    } as any);

    const result = await service.createDueInvoicesFromPending({
      items: [{ id: 'due-2', sourceType: 'SERVICE_CONTRACT' }],
    }, 'user-1', ['mall-1']);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('SERVICE_CONTRACT', 'due-2', 'user-1', ['mall-1']);
    expect(result).toMatchObject({ requested: 1, created: 1, failed: 0 });
  });
});
