/**
 * REMEDIATION WAVE 3 — RPT-CUR-005 / CUR-002 (Lead subset).
 *
 * `Lead.expectedRent` and `Lead.estimatedValue` were monetary with no currency
 * column, and the CRM pipeline summed them into one currency-less scalar that
 * the UI then rendered as VND. `Lead.currencyCode` now exists.
 *
 * These tests pin four properties: money cannot be written without a unit of
 * account, aggregates are grouped by currency, a NULL currency surfaces as
 * UNKNOWN rather than VND, and the downstream deal view carries the currency
 * that actually belongs to the amount it chose.
 */
import { BadRequestException } from '@nestjs/common';
import { CrmService } from './crm.service';
import {
  groupPipelineValueByCurrency,
  groupValueByStatusAndCurrency,
  leadValue,
  leadCurrencyKey,
  resolveDealCurrency,
  UNKNOWN_LEAD_CURRENCY,
} from './lead-pipeline-currency';

const lead = (
  currencyCode: 'VND' | 'USD' | 'MMK' | null,
  estimatedValue: number | null,
  status = 'QUALIFIED',
  expectedRent: number | null = null,
  expectedArea: number | null = null,
) => ({ currencyCode, estimatedValue, expectedRent, expectedArea, status });

describe('lead valuation and currency keying (RPT-CUR-005)', () => {
  it('preserves the existing valuation rule: estimatedValue wins, else rent × area', () => {
    expect(leadValue({ estimatedValue: 500, expectedRent: 10, expectedArea: 3 })).toBe(500);
    expect(leadValue({ estimatedValue: null, expectedRent: 10, expectedArea: 3 })).toBe(30);
    expect(leadValue({})).toBe(0);
  });

  // T10
  it('T10: an undefined currency never becomes VND', () => {
    expect(leadCurrencyKey({ currencyCode: null })).toBe(UNKNOWN_LEAD_CURRENCY);
    expect(leadCurrencyKey({})).toBe(UNKNOWN_LEAD_CURRENCY);
    expect(leadCurrencyKey({ currencyCode: null })).not.toBe('VND');
  });
});

describe('CRM pipeline aggregation (RPT-CUR-005)', () => {
  // T7
  it('T7: groups VND / USD / MMK into separate buckets', () => {
    const buckets = groupPipelineValueByCurrency([
      lead('VND', 1_000_000_000),
      lead('USD', 10_200),
      lead('MMK', 87_000_000),
    ]);

    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK']);
    expect(buckets.find((b) => b.currencyCode === 'VND')!.amount).toBe(1_000_000_000);
    expect(buckets.find((b) => b.currencyCode === 'USD')!.amount).toBe(10_200);
    expect(buckets.find((b) => b.currencyCode === 'MMK')!.amount).toBe(87_000_000);
  });

  // T8
  it('T8: produces no cross-currency total', () => {
    const leads = [lead('VND', 1_000_000_000), lead('USD', 10_200), lead('MMK', 87_000_000)];
    const naiveSum = leads.reduce((s, l) => s + leadValue(l), 0);

    const buckets = groupPipelineValueByCurrency(leads);
    expect(buckets.some((b) => b.amount === naiveSum)).toBe(false);
    expect(buckets).toHaveLength(3);
  });

  // T11
  it('T11: a legacy NULL-currency lead becomes an UNKNOWN bucket, not a VND one', () => {
    const buckets = groupPipelineValueByCurrency([lead('VND', 100), lead(null, 900)]);

    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', UNKNOWN_LEAD_CURRENCY]);
    expect(buckets.find((b) => b.currencyCode === 'VND')!.amount).toBe(100);
    expect(buckets.find((b) => b.currencyCode === UNKNOWN_LEAD_CURRENCY)!.amount).toBe(900);
  });

  it('counts leads per bucket so an incomplete pipeline is visible', () => {
    const buckets = groupPipelineValueByCurrency([lead(null, 1), lead(null, 2), lead('USD', 3)]);
    expect(buckets.find((b) => b.currencyCode === UNKNOWN_LEAD_CURRENCY)!.leadCount).toBe(2);
  });

  it('groups value by status and currency without ever crossing the two', () => {
    const byStatus = groupValueByStatusAndCurrency([
      lead('VND', 100, 'NEW'),
      lead('USD', 20, 'NEW'),
      lead('VND', 300, 'QUALIFIED'),
    ]);

    expect(byStatus.NEW.map((b) => b.currencyCode)).toEqual(['VND', 'USD']);
    expect(byStatus.NEW.find((b) => b.currencyCode === 'USD')!.amount).toBe(20);
    expect(byStatus.QUALIFIED).toEqual([
      { currencyCode: 'VND', amount: 300, leadCount: 1 },
    ]);
  });

  // T15 — REGRESSION PROOF. The pre-fix aggregation is exactly what the new
  // contract forbids, and it is what the CRM toolbar rendered as VND.
  it('T15: the old currency-less scalar is a figure no bucket matches', () => {
    const leads = [lead('VND', 1_000_000_000), lead('USD', 10_200), lead('MMK', 87_000_000), lead(null, 5)];

    const oldTotalPipelineValue = leads.reduce(
      (sum, l) => sum + (l.estimatedValue ?? ((l.expectedRent ?? 0) * (l.expectedArea ?? 0))),
      0,
    );
    expect(oldTotalPipelineValue).toBe(1_087_010_205);

    const buckets = groupPipelineValueByCurrency(leads);
    expect(buckets.some((b) => b.amount === oldTotalPipelineValue)).toBe(false);
    // And the old shape had no currency dimension at all.
    expect(buckets.map((b) => b.currencyCode)).toEqual(['VND', 'USD', 'MMK', UNKNOWN_LEAD_CURRENCY]);
  });
});

describe('downstream deal-view currency (T14, RPT-CUR-005)', () => {
  // T14 — the currency must follow whichever amount the view actually chose.
  it('T14: uses the Lead currency when the Lead supplied the amount', () => {
    expect(resolveDealCurrency({ estimatedValue: 10_200, currencyCode: 'USD' }, { rentCurrency: 'VND' }))
      .toBe('USD');
  });

  it('T14b: uses the Proposal currency only when the amount came from the Proposal', () => {
    expect(resolveDealCurrency({ estimatedValue: null, currencyCode: 'USD' }, { rentCurrency: 'MMK' }))
      .toBe('MMK');
  });

  // The pre-fix behaviour: a Lead-supplied amount was labelled 'VND' outright.
  it('T14c: a Lead amount with no captured currency yields null, never VND', () => {
    expect(resolveDealCurrency({ estimatedValue: 180_000_000, currencyCode: null }, { rentCurrency: 'VND' }))
      .toBeNull();
    expect(resolveDealCurrency({ estimatedValue: 180_000_000, currencyCode: null }, null))
      .toBeNull();
  });

  it('T14d: no amount and no proposal yields null', () => {
    expect(resolveDealCurrency({ estimatedValue: null, currencyCode: null }, null)).toBeNull();
  });
});

describe('Lead write-path currency enforcement (RPT-CUR-005)', () => {
  let service: CrmService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      lead: {
        create: jest.fn(async ({ data }: any) => ({ id: 'lead-1', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'lead-1', ...data })),
        findUnique: jest.fn(),
      },
    };
    service = new CrmService(prisma as any, {} as any);
  });

  // T1 / T2 / T3
  it.each([
    ['VND', 180_000_000],
    ['USD', 10_200],
    ['MMK', 87_000_000],
  ])('T1-T3: accepts money denominated in %s', async (currencyCode, estimatedValue) => {
    const created: any = await service.create({
      brandName: 'B', contactName: 'C',
      estimatedValue, currencyCode,
    } as any);

    expect(created.currencyCode).toBe(currencyCode);
    expect(created.estimatedValue).toBe(estimatedValue);
  });

  // T4
  it('T4: rejects money with no currency on a new write', async () => {
    await expect(
      service.create({ brandName: 'B', contactName: 'C', estimatedValue: 180_000_000 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create({ brandName: 'B', contactName: 'C', expectedRent: 900_000 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('T4b: the rejection never mentions a default currency', async () => {
    await expect(
      service.create({ brandName: 'B', contactName: 'C', expectedRent: 1 } as any),
    ).rejects.toThrow(/không mặc định VND/);
  });

  // T5
  it('T5: a lead with no money may have no currency', async () => {
    const created: any = await service.create({ brandName: 'B', contactName: 'C' } as any);
    expect(created.currencyCode).toBeUndefined();
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  // T12 — there is deliberately NO inheritance rule. This test pins that
  // decision: Lead has no mandatory monetary parent, so nothing is derived.
  it('T12: no currency is inherited from any relation — it must be explicit', async () => {
    await expect(
      service.create({
        brandName: 'B', contactName: 'C', estimatedValue: 100,
        mallId: 'mall-1', tenantId: 'tenant-1', customerId: 'cust-1',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Lead update currency enforcement (RPT-CUR-005)', () => {
  let service: CrmService;
  let prisma: any;
  const legacyLead = {
    id: 'lead-1', status: 'QUALIFIED', brandName: 'B',
    expectedRent: 900_000, estimatedValue: 180_000_000, currencyCode: null,
    proposals: [],
  };

  beforeEach(() => {
    prisma = {
      lead: {
        update: jest.fn(async ({ data }: any) => ({ id: 'lead-1', customerId: null, ...data })),
      },
    };
    service = new CrmService(prisma as any, {} as any);
    jest.spyOn(service, 'findOne').mockResolvedValue(legacyLead as any);
  });

  // T13 — a legacy row is NOT auto-backfilled just because it is touched.
  it('T13: editing a legacy currency-less lead without touching money is allowed and infers nothing', async () => {
    const updated: any = await service.update('lead-1', { notes: 'called them' } as any);

    expect(prisma.lead.update).toHaveBeenCalled();
    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data.currencyCode).toBeUndefined(); // nothing fabricated
    expect(updated.notes).toBe('called them');
  });

  it('T13b: setting a NEW amount on a legacy currency-less lead is rejected', async () => {
    await expect(
      service.update('lead-1', { expectedRent: 1_000_000 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('supplying the currency in the same update unblocks it', async () => {
    const updated: any = await service.update(
      'lead-1',
      { expectedRent: 1_000_000, currencyCode: 'USD' } as any,
    );
    expect(updated.currencyCode).toBe('USD');
    expect(updated.expectedRent).toBe(1_000_000);
  });

  it('lets a legacy row be corrected by setting only the currency', async () => {
    const updated: any = await service.update('lead-1', { currencyCode: 'VND' } as any);
    expect(updated.currencyCode).toBe('VND');
  });
});
