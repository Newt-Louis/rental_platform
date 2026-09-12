/**
 * CR-BOOK-PRICE-APPROVAL-001 — Pricing Policy Evaluation.
 *
 * The thresholds that decide who signs off a price used to be hard-coded
 * (5% / 10%) and the resulting level was discarded, so nothing was ever routed
 * to anyone. Routing now comes from the Mall's own ApprovalPolicyRule rows.
 */
import { Role } from '@prisma/client';
import { PriceApprovalPolicyService } from './price-approval-policy.service';

const RULES = [
  {
    code: 'PRICE_BELOW_MIN_5',
    stepName: 'Leasing Manager Price Review',
    stepOrder: 15,
    approverRole: Role.LEASING_MANAGER,
    approverId: 'user-manager',
    conditionType: 'PRICE_DEVIATION_PCT',
    operator: 'BETWEEN',
    threshold: 0,
    matchValue: '5',
    isRequired: false,
  },
  {
    code: 'PRICE_BELOW_MIN_10',
    stepName: 'Mall Director Price Review',
    stepOrder: 25,
    approverRole: Role.MALL_DIRECTOR,
    approverId: 'user-director',
    conditionType: 'PRICE_DEVIATION_PCT',
    operator: 'BETWEEN',
    threshold: 5,
    matchValue: '10',
    isRequired: false,
  },
  {
    code: 'PRICE_BELOW_MIN_OVER_10',
    stepName: 'CEO Price Review',
    stepOrder: 35,
    approverRole: Role.CEO,
    approverId: 'user-ceo',
    conditionType: 'PRICE_DEVIATION_PCT',
    operator: '>',
    threshold: 10,
    matchValue: null,
    isRequired: false,
  },
];

function makeService(rules = RULES, validation?: any) {
  const prisma: any = {
    approvalPolicyRule: { findMany: jest.fn().mockResolvedValue(rules) },
  };
  const categories: any = {
    validateProposedPrice: jest.fn().mockResolvedValue(
      validation ?? {
        isValid: false,
        categoryPricing: { id: 'rule-1', suggestedRent: 900_000, camPerSqm: 100_000, sources: null },
        proposedRentPerSqm: 700_000,
        minRentPerSqm: 900_000,
        maxRentPerSqm: 1_500_000,
        deviationPercent: 22.2,
        requiresApproval: true,
        approvalLevel: 'CEO',
        message: 'below',
      },
    ),
  };
  return { service: new PriceApprovalPolicyService(prisma, categories), prisma, categories };
}

describe('PriceApprovalPolicyService', () => {
  it('routes a >10% deviation to the CEO rule the Mall configured', async () => {
    const { service } = makeService();

    const result = await service.evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-1',
      proposedRentPerSqm: 700_000,
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.unrouted).toBe(false);
    expect(result.steps).toEqual([
      expect.objectContaining({
        stepOrder: 1,
        approverRole: Role.CEO,
        approverId: 'user-ceo',
        policyRuleCode: 'PRICE_BELOW_MIN_OVER_10',
      }),
    ]);
  });

  it('routes a 3% deviation to the Leasing Manager, not the CEO', async () => {
    const { service } = makeService(RULES, {
      isValid: false,
      categoryPricing: { id: 'rule-1' },
      minRentPerSqm: 900_000,
      maxRentPerSqm: 1_500_000,
      deviationPercent: 3,
      requiresApproval: true,
      approvalLevel: 'MANAGER',
      message: 'below',
    });

    const result = await service.evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-1',
      proposedRentPerSqm: 873_000,
    });

    expect(result.steps.map((s) => s.approverId)).toEqual(['user-manager']);
  });

  it('never pulls the proposal workflow mandatory steps into a price decision', async () => {
    // Finance/Legal/base-manager rules carry isRequired, which the shared matcher
    // treats as "always matches". They review a deal, not a rate, so the price
    // path must not see them at all.
    const { service, prisma } = makeService();
    await service.evaluate({ mallId: 'mall-1', categoryId: 'cat-1', proposedRentPerSqm: 700_000 });

    expect(prisma.approvalPolicyRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mallId: 'mall-1',
          isActive: true,
          conditionType: { in: ['PRICE_DEVIATION_PCT', 'PRICE_BELOW_MIN'] },
        }),
      }),
    );
  });

  it('reports unrouted when approval is needed but no rule matches', async () => {
    const { service } = makeService([]);

    const result = await service.evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-1',
      proposedRentPerSqm: 700_000,
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.unrouted).toBe(true);
    expect(result.steps).toEqual([]);
  });

  it('returns NOT evaluated when the unit has no category, never a silent pass', async () => {
    const { service, categories } = makeService();

    const result = await service.evaluate({
      mallId: 'mall-1',
      categoryId: null,
      proposedRentPerSqm: 700_000,
    });

    expect(result.evaluated).toBe(false);
    expect(result.requiresApproval).toBe(false);
    expect(categories.validateProposedPrice).not.toHaveBeenCalled();
  });

  it('requires no approval and no steps when the price sits inside the band', async () => {
    const { service } = makeService(RULES, {
      isValid: true,
      categoryPricing: { id: 'rule-1' },
      minRentPerSqm: 900_000,
      maxRentPerSqm: 1_500_000,
      deviationPercent: 0,
      requiresApproval: false,
      approvalLevel: 'NONE',
      message: 'ok',
    });

    const result = await service.evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-1',
      proposedRentPerSqm: 1_000_000,
    });

    expect(result.evaluated).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.steps).toEqual([]);
  });

  it('keeps two different approvers on the same step as two real sign-offs', async () => {
    const { service } = makeService([
      { ...RULES[2], code: 'A', approverId: 'user-ceo' },
      { ...RULES[2], code: 'B', approverId: 'user-chairman' },
    ]);

    const result = await service.evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-1',
      proposedRentPerSqm: 700_000,
    });

    expect(result.steps.map((s) => s.approverId)).toEqual(['user-ceo', 'user-chairman']);
    expect(result.steps.map((s) => s.stepOrder)).toEqual([1, 2]);
  });
});

describe('PriceApprovalPolicyService — ambiguity is resolved deterministically', () => {
  // Two rules that both match the same deviation at the SAME stepOrder. The
  // order they come back from Postgres is unspecified, so the resolved chain
  // must not inherit it.
  const AMBIGUOUS = [
    {
      code: 'ZZ_SECOND',
      stepName: 'Price Review',
      stepOrder: 20,
      approverRole: Role.MALL_DIRECTOR,
      approverId: 'user-director',
      conditionType: 'PRICE_DEVIATION_PCT',
      operator: '>',
      threshold: 10,
      matchValue: null,
      isRequired: false,
    },
    {
      code: 'AA_FIRST',
      stepName: 'Price Review',
      stepOrder: 20,
      approverRole: Role.CEO,
      approverId: 'user-ceo',
      conditionType: 'PRICE_BELOW_MIN',
      operator: null,
      threshold: null,
      matchValue: null,
      isRequired: false,
    },
  ];

  async function resolveWith(rows: any[]) {
    const prisma: any = { approvalPolicyRule: { findMany: jest.fn().mockResolvedValue(rows) } };
    const categories: any = {
      validateProposedPrice: jest.fn().mockResolvedValue({
        isValid: false,
        categoryPricing: { id: 'r' },
        minRentPerSqm: 900_000,
        maxRentPerSqm: 1_500_000,
        deviationPercent: 22.2,
        requiresApproval: true,
        approvalLevel: 'CEO',
        message: 'below',
      }),
    };
    const service = new PriceApprovalPolicyService(prisma, categories);
    const r = await service.evaluate({ mallId: 'mall-1', categoryId: 'cat-1', proposedRentPerSqm: 700_000 });
    return r.steps.map((s) => s.policyRuleCode);
  }

  it('produces the same chain whichever order Postgres returns the rows in', async () => {
    const forwards = await resolveWith(AMBIGUOUS);
    const backwards = await resolveWith([...AMBIGUOUS].reverse());

    expect(forwards).toEqual(backwards);
    // And the tie-break is a stable property of the data, not of the query plan.
    expect(forwards).toEqual(['AA_FIRST', 'ZZ_SECOND']);
  });

  it('keeps both matching rules as separate sign-offs rather than silently picking one', async () => {
    const codes = await resolveWith(AMBIGUOUS);
    expect(codes).toHaveLength(2);
  });
});

/**
 * Base-rent fallback: what happens when a category carries no CategoryMallPricing.
 *
 * Before this, any price on such a category produced a meaningless 100%
 * deviation and went to the CEO, however reasonable the number was. The unit's
 * own asking rent is the only other figure the Mall has declared for that
 * space, so it is used as a floor -- but ONLY here, never alongside a band.
 */
describe('PriceApprovalPolicyService — base-rent fallback', () => {
  const NO_BAND = {
    isValid: false,
    categoryPricing: null,
    proposedRentPerSqm: 0,
    minRentPerSqm: 0,
    maxRentPerSqm: 0,
    deviationPercent: 100,
    requiresApproval: true,
    approvalLevel: 'CEO',
    message: 'No pricing rule is configured.',
  };

  function svc(rules = RULES, validation: any = NO_BAND) {
    const prisma: any = { approvalPolicyRule: { findMany: jest.fn().mockResolvedValue(rules) } };
    const categories: any = { validateProposedPrice: jest.fn().mockResolvedValue(validation) };
    return new PriceApprovalPolicyService(prisma, categories);
  }

  it('passes a price at or above the unit base rent without approval', async () => {
    const result = await svc().evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-new',
      proposedRentPerSqm: 1_000_000,
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    expect(result.basis).toBe('UNIT_BASE_RENT');
    expect(result.requiresApproval).toBe(false);
    expect(result.deviationPercent).toBe(0);
  });

  it('routes a price below the base rent through the same policy ladder', async () => {
    // 700k against a 1,000,000 base is 30% below -> the CEO rule.
    const result = await svc().evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-new',
      proposedRentPerSqm: 700_000,
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    expect(result.basis).toBe('UNIT_BASE_RENT');
    expect(result.requiresApproval).toBe(true);
    expect(result.deviationPercent).toBeCloseTo(30, 5);
    expect(result.steps.map((s) => s.approverId)).toEqual(['user-ceo']);
  });

  it('measures the deviation against the base rent, not against the band', async () => {
    const result = await svc().evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-new',
      proposedRentPerSqm: 960_000,
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    // 4% below base -> Leasing Manager, not the blanket CEO escalation.
    expect(result.deviationPercent).toBeCloseTo(4, 5);
    expect(result.steps.map((s) => s.approverId)).toEqual(['user-manager']);
  });

  it('never applies the fallback when a band exists', async () => {
    const withBand = {
      isValid: false,
      categoryPricing: { id: 'rule-1' },
      minRentPerSqm: 900_000,
      maxRentPerSqm: 1_500_000,
      deviationPercent: 22.2,
      requiresApproval: true,
      approvalLevel: 'CEO',
      message: 'below',
    };

    const result = await svc(RULES, withBand).evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-1',
      proposedRentPerSqm: 700_000,
      // A base rent that would have said "fine" is deliberately ignored.
      unitBaseRentPerSqm: 500_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    expect(result.basis).toBe('CATEGORY_BAND');
    expect(result.deviationPercent).toBeCloseTo(22.2, 5);
  });

  it('falls back to the CEO escalation when the unit has no base rent either', async () => {
    for (const base of [null, 0, undefined]) {
      const result = await svc().evaluate({
        mallId: 'mall-1',
        categoryId: 'cat-new',
        proposedRentPerSqm: 700_000,
        unitBaseRentPerSqm: base as any,
        unitCurrencyCode: 'VND',
        currencyCode: 'VND',
      });

      expect(result.basis).toBe('CATEGORY_BAND');
      expect(result.deviationPercent).toBe(100);
      expect(result.steps.map((s) => s.approverId)).toEqual(['user-ceo']);
    }
  });

  it('refuses to compare across currencies rather than inventing a rate', async () => {
    const result = await svc().evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-new',
      proposedRentPerSqm: 25,
      currencyCode: 'USD',
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
    });

    // No FX engine: the base rent is not usable, so the safe escalation stands.
    expect(result.basis).toBe('CATEGORY_BAND');
    expect(result.deviationPercent).toBe(100);
  });

  it('holds the booking when the fallback needs approval but no rule matches', async () => {
    const result = await svc([]).evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-new',
      proposedRentPerSqm: 700_000,
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.unrouted).toBe(true);
    expect(result.steps).toEqual([]);
  });

  it('records the basis in the snapshot so the decision stays explainable', async () => {
    const result = await svc().evaluate({
      mallId: 'mall-1',
      categoryId: 'cat-new',
      proposedRentPerSqm: 700_000,
      unitBaseRentPerSqm: 1_000_000,
      unitCurrencyCode: 'VND',
      currencyCode: 'VND',
    });

    expect(result.pricingSnapshot).toMatchObject({
      basis: 'UNIT_BASE_RENT',
      unitBaseRentPerSqm: 1_000_000,
      proposedRentPerSqm: 700_000,
    });
  });
});
