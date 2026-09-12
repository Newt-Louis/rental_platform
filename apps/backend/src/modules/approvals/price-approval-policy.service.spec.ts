/**
 * CR-BOOKING-PRICE-APPROVAL-ALWAYS-WARN-004 — Pricing Decision contract.
 *
 * Two properties are under test here and they are easy to conflate:
 *
 *   1. Every evaluation produces a decision the user can read. Silence used to
 *      mean either "fine" or "nobody could tell" and the two looked identical.
 *   2. Who signs comes from configuration. The thresholds and the role names
 *      used to be written into the pricing service; nothing in this file may
 *      pass because the code happens to agree with 5% / 10%.
 */
import { Role } from '@prisma/client';
import { PriceApprovalPolicyService } from './price-approval-policy.service';
import type { PricingDecisionStatus } from './pricing-decision.types';

const MANAGER_RULE = {
  code: 'PRICE_BELOW_MIN_5',
  name: 'Duyệt giá cấp 1',
  stepName: 'Leasing Manager Price Review',
  stepOrder: 15,
  approverRole: Role.LEASING_MANAGER,
  approverId: 'user-manager',
  approver: { id: 'user-manager', fullName: 'Nguyễn Văn A' },
  conditionType: 'PRICE_DEVIATION_PCT',
  operator: 'BETWEEN',
  threshold: 0,
  matchValue: '5',
  isRequired: false,
};

const DIRECTOR_RULE = {
  ...MANAGER_RULE,
  code: 'PRICE_BELOW_MIN_10',
  name: 'Duyệt giá cấp 2',
  stepName: 'Mall Director Price Review',
  stepOrder: 25,
  approverRole: Role.MALL_DIRECTOR,
  approverId: 'user-director',
  approver: { id: 'user-director', fullName: 'Nguyễn Văn B' },
  threshold: 5,
  matchValue: '10',
};

const CEO_RULE = {
  ...MANAGER_RULE,
  code: 'PRICE_BELOW_MIN_OVER_10',
  name: 'Duyệt giá cấp 3',
  stepName: 'CEO Price Review',
  stepOrder: 35,
  approverRole: Role.CEO,
  approverId: 'user-ceo',
  approver: { id: 'user-ceo', fullName: 'Nguyễn Văn C' },
  operator: '>',
  threshold: 10,
  matchValue: null,
};

const RULES = [MANAGER_RULE, DIRECTOR_RULE, CEO_RULE];

const BAND = {
  isValid: false,
  categoryPricing: { id: 'band-1', suggestedRent: null, camPerSqm: null, sources: null },
  proposedRentPerSqm: 0,
  minRentPerSqm: 900_000,
  maxRentPerSqm: 1_500_000,
  deviationPercent: 0,
  requiresApproval: false,
  message: '',
};

function makeService(opts: { rules?: any[]; band?: any; otherCurrencyBand?: string | null } = {}) {
  const prisma: any = {
    approvalPolicyRule: { findMany: jest.fn().mockResolvedValue(opts.rules ?? RULES) },
    categoryMallPricing: {
      findFirst: jest.fn().mockResolvedValue(
        opts.otherCurrencyBand ? { currencyCode: opts.otherCurrencyBand } : null,
      ),
    },
  };
  const categories: any = {
    validateProposedPrice: jest.fn().mockResolvedValue(opts.band === undefined ? BAND : opts.band),
  };
  return { service: new PriceApprovalPolicyService(prisma, categories), prisma, categories };
}

const BASE = { mallId: 'mall-1', categoryId: 'cat-1', includeApproverNames: true };

describe('PricingDecision — the always-warn invariant', () => {
  // BOOK-WARN-010
  it('BOOK-WARN-010 every status carries a non-empty user-visible message', async () => {
    const seen = new Map<PricingDecisionStatus, string>();

    const cases: Array<[string, () => Promise<any>]> = [
      ['NOT_REQUIRED', () =>
        makeService({ band: { ...BAND, requiresApproval: false } }).service.evaluate({
          ...BASE, proposedRentPerSqm: 1_000_000,
        })],
      ['ROUTED', () =>
        makeService({ band: { ...BAND, requiresApproval: true, deviationPercent: 22.2 } }).service.evaluate({
          ...BASE, proposedRentPerSqm: 700_000,
        })],
      ['POLICY_NOT_CONFIGURED', () =>
        makeService({ rules: [], band: { ...BAND, requiresApproval: true, deviationPercent: 22.2 } }).service.evaluate({
          ...BASE, proposedRentPerSqm: 700_000,
        })],
      ['POLICY_AMBIGUOUS', () =>
        makeService({
          rules: [MANAGER_RULE, { ...DIRECTOR_RULE, stepOrder: 15, threshold: 0, matchValue: '5' }],
          band: { ...BAND, requiresApproval: true, deviationPercent: 3 },
        }).service.evaluate({ ...BASE, proposedRentPerSqm: 873_000 })],
      ['PRICING_REFERENCE_MISSING', () =>
        makeService({ band: { ...BAND, categoryPricing: null } }).service.evaluate({
          ...BASE, proposedRentPerSqm: 700_000,
        })],
      ['CURRENCY_MISMATCH', () =>
        makeService({ band: { ...BAND, categoryPricing: null }, otherCurrencyBand: 'USD' }).service.evaluate({
          ...BASE, proposedRentPerSqm: 700_000, currencyCode: 'VND',
        })],
    ];

    for (const [expected, run] of cases) {
      const decision = await run();
      expect(decision.status).toBe(expected);
      expect(typeof decision.message).toBe('string');
      expect(decision.message.trim().length).toBeGreaterThan(20);
      expect(decision.warningCode).toBe(`PRICE_${expected}`);
      seen.set(decision.status, decision.message);
    }

    // All six outcomes really were produced, not just the easy ones.
    expect(seen.size).toBe(6);
  });
});

describe('PricingDecision — category band', () => {
  // BOOK-WARN-001
  it('BOOK-WARN-001 states the band and that no approval is needed', async () => {
    const { service } = makeService({ band: { ...BAND, requiresApproval: false } });

    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 1_000_000 });

    expect(d.status).toBe('NOT_REQUIRED');
    expect(d.severity).toBe('INFO');
    expect(d.requiresAcknowledgement).toBe(false);
    expect(d.basis).toBe('CATEGORY_BAND');
    expect(d.reference).toMatchObject({ minRentPerSqm: 900_000, maxRentPerSqm: 1_500_000 });
    expect(d.message).toContain('không yêu cầu phê duyệt');
    expect(d.approval.required).toBe(false);
  });

  // BOOK-WARN-002
  it('BOOK-WARN-002 warns and names the configured signers when approval is needed', async () => {
    const { service } = makeService({ band: { ...BAND, requiresApproval: true, deviationPercent: 4 } });

    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 864_000 });

    expect(d.status).toBe('ROUTED');
    expect(d.severity).toBe('WARNING');
    expect(d.requiresAcknowledgement).toBe(true);
    expect(d.blocking).toBe(false);
    expect(d.message).toContain('thấp hơn giá sàn');
    expect(d.message).toContain('4,00%');
    expect(d.approval.steps).toEqual([
      expect.objectContaining({
        approverId: 'user-manager',
        approverName: 'Nguyễn Văn A',
        policyRuleCode: 'PRICE_BELOW_MIN_5',
      }),
    ]);
  });

  it('reports a price above the ceiling as above, not below', async () => {
    const { service } = makeService({ band: { ...BAND, requiresApproval: true, deviationPercent: 20 } });

    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 1_800_000 });

    expect(d.message).toContain('cao hơn giá trần');
  });
});

describe('PricingDecision — unit base rent fallback', () => {
  const NO_BAND = { ...BAND, categoryPricing: null };

  // BOOK-WARN-003
  it('BOOK-WARN-003 says which reference it used and that nothing is needed', async () => {
    const { service } = makeService({ band: NO_BAND });

    const d = await service.evaluate({
      ...BASE,
      proposedRentPerSqm: 1_000_000,
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    expect(d.status).toBe('NOT_REQUIRED');
    expect(d.basis).toBe('UNIT_BASE_RENT');
    expect(d.message).toContain('Ngành hàng chưa khai báo khung giá');
    expect(d.message).toContain('giá thuê cơ bản');
  });

  // BOOK-WARN-004
  it('BOOK-WARN-004 warns with the configured chain when below the base rent', async () => {
    const { service } = makeService({ band: NO_BAND });

    const d = await service.evaluate({
      ...BASE,
      proposedRentPerSqm: 700_000,
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    expect(d.status).toBe('ROUTED');
    expect(d.basis).toBe('UNIT_BASE_RENT');
    expect(d.deviationPercent).toBeCloseTo(30, 5);
    expect(d.approval.steps.map((s: any) => s.approverId)).toEqual(['user-ceo']);
  });

  it('never uses the base rent while a band applies', async () => {
    const { service } = makeService({ band: { ...BAND, requiresApproval: true, deviationPercent: 22.2 } });

    const d = await service.evaluate({
      ...BASE,
      proposedRentPerSqm: 700_000,
      // A base rent that would have said "fine" is deliberately ignored.
      unitBaseRentPerSqm: 500_000,
      unitCurrencyCode: 'VND',
    });

    expect(d.basis).toBe('CATEGORY_BAND');
  });
});

describe('PricingDecision — configuration outcomes', () => {
  const NEEDS_APPROVAL = { ...BAND, requiresApproval: true, deviationPercent: 22.2 };

  // BOOK-WARN-005 / BOOK-WARN-006
  it('BOOK-WARN-005/006 reports missing policy and infers no approver', async () => {
    const { service } = makeService({ rules: [], band: NEEDS_APPROVAL });

    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 700_000 });

    expect(d.status).toBe('POLICY_NOT_CONFIGURED');
    expect(d.severity).toBe('WARNING');
    expect(d.approval.policyConfigured).toBe(false);
    expect(d.approval.steps).toEqual([]);
    // Nothing may name an authority the configuration did not.
    expect(d.message).not.toMatch(/Manager|Director|CEO|Giám đốc|Tổng giám đốc/i);
    expect(d.message).toContain('chưa tìm thấy quy trình phê duyệt');
  });

  // BOOK-WARN-007
  it('BOOK-WARN-007 blocks on an ambiguous configuration instead of picking one', async () => {
    // Two rules claim the SAME step position but name different people: the
    // order would otherwise come from whatever the query plan returned.
    const { service } = makeService({
      rules: [MANAGER_RULE, { ...DIRECTOR_RULE, stepOrder: 15, threshold: 0, matchValue: '5' }],
      band: { ...BAND, requiresApproval: true, deviationPercent: 3 },
    });

    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 873_000 });

    expect(d.status).toBe('POLICY_AMBIGUOUS');
    expect(d.severity).toBe('ERROR');
    expect(d.blocking).toBe(true);
    expect(d.approval.steps).toEqual([]);
    expect(d.message).toContain('Cấu hình quy trình duyệt chưa hợp lệ');
  });

  it('treats different step orders as a sequential chain, not ambiguity', async () => {
    // Both rules match 5.00% but sit at different positions: that IS the
    // configuration expressing "both sign, in this order".
    const { service } = makeService({ band: { ...BAND, requiresApproval: true, deviationPercent: 5 } });

    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 855_000 });

    expect(d.status).toBe('ROUTED');
    expect(d.approval.steps.map((s: any) => s.approverId)).toEqual(['user-manager', 'user-director']);
    expect(d.approval.steps.map((s: any) => s.stepOrder)).toEqual([1, 2]);
  });

  // BOOK-WARN-008
  it('BOOK-WARN-008 refuses to compare across currencies and says so', async () => {
    const { service } = makeService({ band: { ...BAND, categoryPricing: null }, otherCurrencyBand: 'USD' });

    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 700_000, currencyCode: 'VND' });

    expect(d.status).toBe('CURRENCY_MISMATCH');
    expect(d.deviationPercent).toBeNull();
    expect(d.message).toContain('không thực hiện quy đổi tự động');
    expect(d.reference.referenceCurrency).toBe('USD');
  });

  it('reports a currency mismatch against the unit base rent too', async () => {
    const { service } = makeService({ band: { ...BAND, categoryPricing: null } });

    const d = await service.evaluate({
      ...BASE,
      proposedRentPerSqm: 25,
      currencyCode: 'USD',
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
    });

    expect(d.status).toBe('CURRENCY_MISMATCH');
    expect(d.deviationPercent).toBeNull();
  });

  // BOOK-WARN-009
  it('BOOK-WARN-009 reports a missing reference without inventing a deviation', async () => {
    const { service } = makeService({ band: { ...BAND, categoryPricing: null } });

    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 700_000, unitBaseRentPerSqm: 0 });

    expect(d.status).toBe('PRICING_REFERENCE_MISSING');
    expect(d.basis).toBe('NONE');
    // The old code reported 100% here and escalated everything to one person.
    expect(d.deviationPercent).toBeNull();
    expect(d.message).toContain('Chưa có giá tham chiếu');
  });

  it('falls back to the base rent when the unit has no category at all', async () => {
    const { service, categories } = makeService();

    const d = await service.evaluate({
      mallId: 'mall-1',
      categoryId: null,
      proposedRentPerSqm: 900_000,
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    expect(categories.validateProposedPrice).not.toHaveBeenCalled();
    expect(d.basis).toBe('UNIT_BASE_RENT');
    expect(d.status).toBe('ROUTED');
  });
});

describe('PricingDecision — routing is configuration, not code', () => {
  const NEEDS_APPROVAL = { ...BAND, requiresApproval: true, deviationPercent: 3 };

  // BOOK-WARN-020
  it('BOOK-WARN-020 the same facts route differently when the configuration differs', async () => {
    const facts = { ...BASE, proposedRentPerSqm: 873_000 };

    const asSeeded = await makeService({ band: NEEDS_APPROVAL }).service.evaluate(facts);
    // Identical pricing facts; only the configured rule changed.
    const reconfigured = await makeService({
      rules: [{ ...MANAGER_RULE, approverId: 'user-chairman', approver: { id: 'user-chairman', fullName: 'Chủ tịch' }, code: 'CUSTOM' }],
      band: NEEDS_APPROVAL,
    }).service.evaluate(facts);

    expect(asSeeded.approval.steps.map((s: any) => s.approverId)).toEqual(['user-manager']);
    expect(reconfigured.approval.steps.map((s: any) => s.approverId)).toEqual(['user-chairman']);
    expect(asSeeded.deviationPercent).toBe(reconfigured.deviationPercent);
  });

  it('reads only PRICE_* rules, never the proposal workflow mandatory steps', async () => {
    const { service, prisma } = makeService({ band: NEEDS_APPROVAL });
    await service.evaluate({ ...BASE, proposedRentPerSqm: 873_000 });

    expect(prisma.approvalPolicyRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conditionType: { in: ['PRICE_DEVIATION_PCT', 'PRICE_BELOW_MIN'] },
        }),
      }),
    );
  });
});

describe('PricingDecision — fingerprint', () => {
  it('is stable across two evaluations of identical inputs', async () => {
    const facts = { ...BASE, proposedRentPerSqm: 873_000 };
    const band = { ...BAND, requiresApproval: true, deviationPercent: 3 };

    const a = await makeService({ band }).service.evaluate(facts);
    const b = await makeService({ band }).service.evaluate(facts);

    // Timestamps differ; the fingerprint must not.
    expect(a.evaluatedAt).not.toBe('');
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('changes when the configured approver changes', async () => {
    const facts = { ...BASE, proposedRentPerSqm: 873_000 };
    const band = { ...BAND, requiresApproval: true, deviationPercent: 3 };

    const a = await makeService({ band }).service.evaluate(facts);
    const b = await makeService({
      band,
      rules: [{ ...MANAGER_RULE, approverId: 'someone-else' }],
    }).service.evaluate(facts);

    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('changes when the proposed price changes', async () => {
    const band = { ...BAND, requiresApproval: true, deviationPercent: 3 };
    const a = await makeService({ band }).service.evaluate({ ...BASE, proposedRentPerSqm: 873_000 });
    const b = await makeService({ band }).service.evaluate({ ...BASE, proposedRentPerSqm: 860_000 });

    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe('PricingDecision — snapshot', () => {
  it('persists evidence, not only the sentence shown to the user', async () => {
    const { service } = makeService({ band: { ...BAND, requiresApproval: true, deviationPercent: 4 } });
    const d = await service.evaluate({ ...BASE, proposedRentPerSqm: 864_000 });

    const snapshot: any = service.snapshotOf(d);

    expect(snapshot).toMatchObject({
      status: 'ROUTED',
      basis: 'CATEGORY_BAND',
      proposedRentPerSqm: 864_000,
      minRentPerSqm: 900_000,
      maxRentPerSqm: 1_500_000,
      categoryPricingId: 'band-1',
      policyRuleCodes: ['PRICE_BELOW_MIN_5'],
      policyApproverIds: ['user-manager'],
      approvalRequired: true,
    });
    expect(snapshot.fingerprint).toBe(d.fingerprint);
    expect(typeof snapshot.evaluatedAt).toBe('string');
  });
});
