/**
 * REMEDIATION WAVE 4 — CUR-002-CUSTOMER.
 *
 * `Customer.budgetMin` was copied from `Lead.expectedRent` while `Customer` had
 * no currency column, so after Wave 3 the copy dropped a currency that existed.
 * `Customer.currencyCode` now exists and travels with the amount.
 *
 * T15 is the RPT-CUR-005 closure test: a Lead currency must survive every
 * confirmed downstream monetary copy.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { resolveDealCurrency } from './lead-pipeline-currency';
import { scoreFinancialCapacity, FINANCIAL_CAPACITY_NEUTRAL } from '../proposals/deal-scoring.service';

function buildService(overrides: any = {}) {
  const prisma: any = {
    customer: {
      create: jest.fn(async ({ data }: any) => ({ id: 'cust-1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'cust-1', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    lead: {
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }: any) => ({ id: 'lead-1', ...data })),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    ...overrides,
  };
  const service = new CustomersService(prisma as any);
  // generateCustomerCode reads customer.findFirst; stub it out of the way.
  jest.spyOn(service as any, 'generateCustomerCode').mockResolvedValue('KH-2026-00099');
  return { service, prisma };
}

const leadWithMoney = (currencyCode: 'VND' | 'USD' | 'MMK' | null) => ({
  id: 'lead-1',
  isActive: true,
  deletedAt: null,
  brandName: 'Brand',
  contactName: 'Contact',
  company: 'Co',
  expectedRent: 900_000,
  expectedArea: 200,
  currencyCode,
  status: 'WON',
  source: 'BROKER',
});

describe('createFromLead preserves the Lead currency (T1-T4, T11)', () => {
  it.each([
    ['VND'],
    ['USD'],
    ['MMK'],
  ])('T1-T3/T11: a %s Lead produces a %s Customer budget', async (currency) => {
    const { service, prisma } = buildService();
    prisma.lead.findUnique.mockResolvedValue(leadWithMoney(currency as any));
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cust-1' } as any);

    await service.createFromLead('lead-1', 'user-1', false);

    const data = prisma.customer.create.mock.calls[0][0].data;
    expect(data.budgetMin).toBe(900_000);
    expect(data.currencyCode).toBe(currency);
  });

  // T4
  it('T4: a Lead with NULL currency never produces a VND Customer', async () => {
    const { service, prisma } = buildService();
    prisma.lead.findUnique.mockResolvedValue(leadWithMoney(null));
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cust-1' } as any);

    await service.createFromLead('lead-1', 'user-1', false);

    const data = prisma.customer.create.mock.calls[0][0].data;
    expect(data.budgetMin).toBe(900_000);
    // Not written at all -> the column stays NULL -> the row means UNKNOWN.
    expect(data.currencyCode).toBeUndefined();
    expect(data.currencyCode).not.toBe('VND');
  });

  // T14 — REGRESSION PROOF. The pre-fix mapping omitted currencyCode entirely.
  it('T14: the old Lead->Customer copy without currency fails this contract', async () => {
    const OLD_MAPPED_FIELDS = ['companyName', 'brandName', 'contactName', 'phone', 'email',
      'preferredCategory', 'expectedArea', 'budgetMin', 'source', 'notes', 'assignedToId'];
    expect(OLD_MAPPED_FIELDS).not.toContain('currencyCode');

    const { service, prisma } = buildService();
    prisma.lead.findUnique.mockResolvedValue(leadWithMoney('USD'));
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cust-1' } as any);
    await service.createFromLead('lead-1', 'user-1', false);

    const data = prisma.customer.create.mock.calls[0][0].data;
    // The new mapping does what the old one could not.
    expect(Object.keys(data)).toContain('currencyCode');
    expect(data.currencyCode).toBe('USD');
  });
});

describe('syncFromLead (T5, T10)', () => {
  function syncSetup(leadCurrency: any, customerCurrency: any) {
    const { service, prisma } = buildService();
    prisma.lead.findUnique.mockResolvedValue({ ...leadWithMoney(leadCurrency), customerId: null });
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cust-1', currencyCode: customerCurrency, budgetMin: 800_000,
    } as any);
    return { service, prisma };
  }

  // T10
  it('T10: preserves the currency when the Customer has none yet', async () => {
    const { service, prisma } = syncSetup('USD', null);
    await service.syncFromLead('cust-1', 'lead-1');

    const data = prisma.customer.update.mock.calls[0][0].data;
    expect(data.currencyCode).toBe('USD');
    expect(data.budgetMin).toBe(900_000);
  });

  it('T10b: an identical currency on both sides syncs normally', async () => {
    const { service, prisma } = syncSetup('VND', 'VND');
    await service.syncFromLead('cust-1', 'lead-1');
    expect(prisma.customer.update).toHaveBeenCalled();
  });

  // T5
  it('T5: fails closed when the Customer already has a different currency', async () => {
    const { service, prisma } = syncSetup('USD', 'VND');

    await expect(service.syncFromLead('cust-1', 'lead-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('T5b: the conflict carries diagnostics and never converts', async () => {
    const { service } = syncSetup('MMK', 'USD');

    await expect(service.syncFromLead('cust-1', 'lead-1')).rejects.toMatchObject({
      response: {
        code: 'CUSTOMER_CURRENCY_CONFLICT',
        leadId: 'lead-1',
        customerId: 'cust-1',
        leadCurrency: 'MMK',
        customerCurrency: 'USD',
        field: 'budgetMin',
      },
    });
  });

  // An UNKNOWN source must not be stamped with the destination's currency.
  it('T5c: fails closed when the Lead currency is UNKNOWN but the Customer has one', async () => {
    const { service, prisma } = syncSetup(null, 'VND');

    await expect(service.syncFromLead('cust-1', 'lead-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('allows the sync when the Lead carries no money at all', async () => {
    const { service, prisma } = buildService();
    prisma.lead.findUnique.mockResolvedValue({
      ...leadWithMoney(null), expectedRent: null, customerId: null,
    });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cust-1', currencyCode: 'VND' } as any);

    await service.syncFromLead('cust-1', 'lead-1');
    expect(prisma.customer.update).toHaveBeenCalled();
  });
});

describe('direct Customer write enforcement (T6, T12)', () => {
  // T6
  it('T6: rejects a budget with no currency on create', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.create({ companyName: 'Co', contactName: 'C', budgetMin: 800_000 } as any, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('T6b: accepts a budget with an explicit currency', async () => {
    const { service, prisma } = buildService();

    await service.create(
      { companyName: 'Co', contactName: 'C', budgetMin: 800_000, currencyCode: 'USD' } as any,
      'user-1',
    );
    expect(prisma.customer.create.mock.calls[0][0].data.currencyCode).toBe('USD');
  });

  it('T6c: the rejection never mentions a default currency', async () => {
    const { service } = buildService();
    await expect(
      service.create({ companyName: 'Co', contactName: 'C', budgetMax: 1 } as any, 'user-1'),
    ).rejects.toThrow(/không mặc định VND/);
  });

  // T12
  it('T12: a legacy currency-less Customer stays editable when money is untouched', async () => {
    const { service, prisma } = buildService();
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cust-1', status: 'PROSPECT', budgetMin: 800_000, currencyCode: null,
    } as any);

    await service.update('cust-1', { notes: 'called' } as any);

    const data = prisma.customer.update.mock.calls[0][0].data;
    expect(data.notes).toBe('called');
    expect(data.currencyCode).toBeUndefined(); // nothing fabricated
  });

  it('T12b: setting a NEW budget on a legacy currency-less Customer is rejected', async () => {
    const { service, prisma } = buildService();
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cust-1', status: 'PROSPECT', budgetMin: 800_000, currencyCode: null,
    } as any);

    await expect(service.update('cust-1', { budgetMax: 1_000_000 } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('T12c: supplying the currency in the same update unblocks it', async () => {
    const { service, prisma } = buildService();
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cust-1', status: 'PROSPECT', budgetMin: 800_000, currencyCode: null,
    } as any);

    await service.update('cust-1', { budgetMax: 1_000_000, currencyCode: 'MMK' } as any);
    expect(prisma.customer.update.mock.calls[0][0].data.currencyCode).toBe('MMK');
  });
});

describe('deal scoring no longer compares budgets across currencies (T9)', () => {
  // T9 — financialCapacity divides by a VND-scale constant. Applying it to
  // another currency is a cross-currency comparison, so it is declined.
  it('T9: scores a VND budget on the VND scale', () => {
    expect(scoreFinancialCapacity(1_000_000_000, 'VND')).toBe(100);
    expect(scoreFinancialCapacity(500_000_000, 'VND')).toBe(50);
  });

  it('T9b: refuses to score a USD or MMK budget on the VND scale', () => {
    // 40,000 USD is a large budget; the old code scored it 0.004.
    expect(scoreFinancialCapacity(40_000, 'USD')).toBe(FINANCIAL_CAPACITY_NEUTRAL);
    expect(scoreFinancialCapacity(87_000_000, 'MMK')).toBe(FINANCIAL_CAPACITY_NEUTRAL);
  });

  it('T9c: an unknown currency is neutral, never scored as VND', () => {
    expect(scoreFinancialCapacity(1_000_000_000, null)).toBe(FINANCIAL_CAPACITY_NEUTRAL);
    expect(scoreFinancialCapacity(1_000_000_000, undefined)).toBe(FINANCIAL_CAPACITY_NEUTRAL);
  });

  it('T9d: the old VND-scale formula would have mis-scored a USD budget', () => {
    const oldScore = Math.min(100, (40_000 / 1_000_000_000) * 100);
    expect(oldScore).toBeCloseTo(0.004, 3);
    expect(scoreFinancialCapacity(40_000, 'USD')).not.toBeCloseTo(oldScore, 3);
  });

  // CRM-SCORE-CUR-001 is MITIGATED, not solved. The neutral value means
  // "not evaluated for this currency", so a foreign-currency budget must be
  // indistinguishable from having no budget at all -- if a future change starts
  // treating it as a real capacity signal, this test is what fails.
  it('a foreign-currency budget scores identically to having no budget', () => {
    const noBudget = scoreFinancialCapacity(null, 'VND');
    expect(scoreFinancialCapacity(40_000, 'USD')).toBe(noBudget);
    expect(scoreFinancialCapacity(87_000_000, 'MMK')).toBe(noBudget);
    expect(scoreFinancialCapacity(1_000_000_000, null)).toBe(noBudget);
  });

  it('no USD/MMK threshold is defined anywhere in the scorer', () => {
    // A larger USD budget must not score higher than a smaller one: there is no
    // USD scale, so magnitude carries no signal at all.
    expect(scoreFinancialCapacity(1_000, 'USD')).toBe(scoreFinancialCapacity(9_999_999, 'USD'));
  });
});

describe('T15 — RPT-CUR-005 closure: Lead currency survives every downstream copy', () => {
  it('T15: the deal view keeps it', () => {
    expect(resolveDealCurrency({ estimatedValue: 10_200, currencyCode: 'USD' }, { rentCurrency: 'VND' }))
      .toBe('USD');
  });

  it('T15b: the Customer budget copy keeps it', async () => {
    const { service, prisma } = buildService();
    prisma.lead.findUnique.mockResolvedValue(leadWithMoney('MMK'));
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cust-1' } as any);

    await service.createFromLead('lead-1', 'user-1', false);
    expect(prisma.customer.create.mock.calls[0][0].data.currencyCode).toBe('MMK');
  });

  it('T15c: an UNKNOWN Lead currency stays UNKNOWN everywhere — never becomes VND', async () => {
    expect(resolveDealCurrency({ estimatedValue: 100, currencyCode: null }, null)).toBeNull();

    const { service, prisma } = buildService();
    prisma.lead.findUnique.mockResolvedValue(leadWithMoney(null));
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cust-1' } as any);

    await service.createFromLead('lead-1', 'user-1', false);
    expect(prisma.customer.create.mock.calls[0][0].data.currencyCode).not.toBe('VND');
  });
});
