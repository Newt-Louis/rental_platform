/**
 * CR-CRM-CATEGORY-MASTER-001 — CRM category identity.
 *
 * Before this CR the CRM only ever wrote the free-text `Lead.category` /
 * `Customer.preferredCategory`, driven by three incompatible hard-coded lists,
 * so `Lead.categoryId` was null on every row in the database and the edit
 * dialog rendered an empty "Ngành hàng" for every lead.
 *
 * These tests pin the invariants that make Category master authoritative:
 * identity is written and validated against the master, the display snapshot is
 * derived server-side rather than trusted from the client, and an edit to an
 * unrelated field can never erase a category.
 *
 * Covers CRM-CAT-001..008, 011..013, 023, 024.
 */
import { BadRequestException } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CustomersService } from './customers.service';
import { CategoryResolverService } from '../../common/services/category-resolver.service';

const FNB = { id: 'cat-fnb', code: 'FNB', name: 'F&B', isActive: true };
const FASHION = { id: 'cat-fashion', code: 'FASHION', name: 'Fashion', isActive: true };
const RETIRED = { id: 'cat-old', code: 'OLD', name: 'Ngành cũ', isActive: false };
const MASTER = [FNB, FASHION, RETIRED];

function categoryFindUnique() {
  return jest.fn(async ({ where }: any) => MASTER.find((c) => c.id === where.id) ?? null);
}

// ── Lead ──────────────────────────────────────────────────────────────────────

describe('CrmService — Lead category identity', () => {
  let prisma: any;
  let service: CrmService;

  beforeEach(() => {
    prisma = {
      category: { findUnique: categoryFindUnique() },
      lead: {
        create: jest.fn(async ({ data }: any) => ({ id: 'lead-1', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'lead-1', ...data })),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new CrmService(prisma, {} as any, new CategoryResolverService(prisma));
  });

  // CRM-CAT-001 / CRM-CAT-002
  it('CRM-CAT-001/002 persists categoryId and derives the name from the master', async () => {
    await service.create({ brandName: 'Highlands', contactName: 'A', categoryId: FNB.id } as any);

    const data = prisma.lead.create.mock.calls[0][0].data;
    expect(data.categoryId).toBe(FNB.id);
    expect(data.category).toBe('F&B');
  });

  // CRM-CAT-002 — the client's text never wins over the master.
  it('CRM-CAT-002 ignores mismatching text sent alongside a categoryId', async () => {
    await service.create({
      brandName: 'Highlands',
      contactName: 'A',
      categoryId: FNB.id,
      category: 'Ẩm thực (client bịa)',
    } as any);

    const data = prisma.lead.create.mock.calls[0][0].data;
    expect(data.category).toBe('F&B');
  });

  // CRM-CAT-006
  it('CRM-CAT-006 rejects an unknown categoryId with zero mutation', async () => {
    await expect(
      service.create({ brandName: 'X', contactName: 'A', categoryId: 'does-not-exist' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('CRM-CAT-006 rejects an inactive category with zero mutation', async () => {
    await expect(
      service.create({ brandName: 'X', contactName: 'A', categoryId: RETIRED.id } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  // CRM-CAT-004 — the regression that motivated the CR: a lead's category must
  // survive an edit that never mentions it.
  it('CRM-CAT-004 leaves the category untouched when categoryId is omitted', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lead-1',
      status: 'NEW',
      categoryId: FNB.id,
      category: 'F&B',
    } as any);

    await service.update('lead-1', { phone: '0912345678' } as any);

    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('categoryId');
    expect(data).not.toHaveProperty('category');
  });

  // CRM-CAT-005
  it('CRM-CAT-005 updates id and snapshot together when the category changes', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lead-1',
      status: 'NEW',
      categoryId: FNB.id,
      category: 'F&B',
    } as any);

    await service.update('lead-1', { categoryId: FASHION.id } as any);

    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data.categoryId).toBe(FASHION.id);
    expect(data.category).toBe('Fashion');
  });

  // CRM-CAT-010 — a mapped lead cannot be dragged back onto free text by an
  // old client still sending `category`.
  it('CRM-CAT-010 ignores legacy text on a lead that already has a categoryId', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lead-1',
      status: 'NEW',
      categoryId: FNB.id,
      category: 'F&B',
    } as any);

    await service.update('lead-1', { category: 'Thời trang' } as any);

    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('category');
    expect(data).not.toHaveProperty('categoryId');
  });

  // CRM-CAT-009 — an un-backfilled lead is still correctable by a legacy client.
  it('CRM-CAT-009 still accepts legacy text while the lead has no categoryId', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lead-1',
      status: 'NEW',
      categoryId: null,
      category: 'F&B',
    } as any);

    await service.update('lead-1', { category: 'Giá trị cũ khác' } as any);

    expect(prisma.lead.update.mock.calls[0][0].data.category).toBe('Giá trị cũ khác');
  });

  // CRM-CAT-005 (clear branch) — null means clear, and only null.
  it('CRM-CAT-005 clears both fields on an explicit null', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lead-1',
      status: 'NEW',
      categoryId: FNB.id,
      category: 'F&B',
    } as any);

    await service.update('lead-1', { categoryId: null } as any);

    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data.categoryId).toBeNull();
    expect(data.category).toBeNull();
  });

  // CRM-CAT-007
  it('CRM-CAT-007 filters the lead list by categoryId, not by name', async () => {
    await service.findAll({ categoryId: FNB.id });

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.categoryId).toBe(FNB.id);
    expect(where).not.toHaveProperty('category');
  });

  // CRM-CAT-008 — identity is an id, so a rename cannot invalidate a filter or
  // a stored link. Renaming only changes what the master resolves to.
  it('CRM-CAT-008 keeps identity stable across a Category rename', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lead-1',
      status: 'NEW',
      categoryId: FNB.id,
      category: 'F&B',
    } as any);

    prisma.category.findUnique = jest.fn(async () => ({ ...FNB, name: 'Ẩm thực & Đồ uống' }));
    await service.update('lead-1', { categoryId: FNB.id } as any);

    const data = prisma.lead.update.mock.calls[0][0].data;
    expect(data.categoryId).toBe(FNB.id);
    expect(data.category).toBe('Ẩm thực & Đồ uống');
  });

  // CRM-CAT-003 — the edit screen can only show the right category if the read
  // exposes the authoritative relation.
  it('CRM-CAT-003 exposes the Category relation on the lead list', async () => {
    await service.findAll({});
    expect(prisma.lead.findMany.mock.calls[0][0].include).toHaveProperty('categoryRef');
  });
});

// ── Customer ──────────────────────────────────────────────────────────────────

describe('CustomersService — preferred category identity', () => {
  let prisma: any;
  let service: CustomersService;

  beforeEach(() => {
    prisma = {
      category: { findUnique: categoryFindUnique() },
      customer: {
        create: jest.fn(async ({ data }: any) => ({ id: 'cus-1', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'cus-1', ...data })),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      lead: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    };
    service = new CustomersService(prisma, new CategoryResolverService(prisma));
  });

  // CRM-CAT-012
  it('CRM-CAT-012 writes preferredCategoryId and derives the snapshot', async () => {
    await service.create(
      { companyName: 'Cty A', contactName: 'A', preferredCategoryId: FNB.id } as any,
      'user-1',
    );

    const data = prisma.customer.create.mock.calls[0][0].data;
    expect(data.preferredCategoryId).toBe(FNB.id);
    expect(data.preferredCategory).toBe('F&B');
  });

  // CRM-CAT-006 (customer side)
  it('CRM-CAT-006 rejects an unknown preferredCategoryId with zero mutation', async () => {
    await expect(
      service.create({ companyName: 'Cty A', contactName: 'A', preferredCategoryId: 'nope' } as any, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  // CRM-CAT-013
  it('CRM-CAT-013 leaves the preferred category untouched on an unrelated edit', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cus-1',
      status: 'PROSPECT',
      preferredCategoryId: FNB.id,
      preferredCategory: 'F&B',
    } as any);

    await service.update('cus-1', { rating: 5 } as any);

    const data = prisma.customer.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('preferredCategoryId');
    expect(data).not.toHaveProperty('preferredCategory');
  });

  it('CRM-CAT-012 changes the preferred category from the master', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'cus-1',
      status: 'PROSPECT',
      preferredCategoryId: FNB.id,
      preferredCategory: 'F&B',
    } as any);

    await service.update('cus-1', { preferredCategoryId: FASHION.id } as any);

    const data = prisma.customer.update.mock.calls[0][0].data;
    expect(data.preferredCategoryId).toBe(FASHION.id);
    expect(data.preferredCategory).toBe('Fashion');
  });

  // CRM-CAT-011 — conversion must carry the canonical id, not re-match by text.
  it('CRM-CAT-011 carries the canonical categoryId from Lead to Customer', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-1',
      isActive: true,
      deletedAt: null,
      customerId: null,
      customer: null,
      brandName: 'Highlands',
      company: 'Cty Highlands',
      contactName: 'A',
      status: 'WON',
      categoryId: FNB.id,
      category: 'F&B',
    });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cus-1' } as any);

    await service.createFromLead('lead-1', 'user-1');

    const data = prisma.customer.create.mock.calls[0][0].data;
    expect(data.preferredCategoryId).toBe(FNB.id);
    expect(data.preferredCategory).toBe('F&B');
  });

  // CRM-CAT-009 / CRM-CAT-010 — conversion of an un-backfilled lead keeps the
  // legacy text visible and does NOT invent an id for it.
  it('CRM-CAT-009 carries legacy text across conversion without inventing an id', async () => {
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-1',
      isActive: true,
      deletedAt: null,
      customerId: null,
      customer: null,
      brandName: 'Shop',
      contactName: 'A',
      status: 'WON',
      categoryId: null,
      category: 'Health & Beauty',
    });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'cus-1' } as any);

    await service.createFromLead('lead-1', 'user-1');

    const data = prisma.customer.create.mock.calls[0][0].data;
    expect(data.preferredCategory).toBe('Health & Beauty');
    expect(data.preferredCategoryId).toBeUndefined();
  });

  // CRM-CAT-007 (customer side)
  it('CRM-CAT-007 filters customers by preferredCategoryId', async () => {
    await service.findAll({ preferredCategoryId: FNB.id } as any);

    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(where.preferredCategoryId).toBe(FNB.id);
    expect(where).not.toHaveProperty('preferredCategory');
  });
});

// ── Pricing / approval boundary ───────────────────────────────────────────────

describe('CRM-CAT-023/024 — CategoryMallPricing boundary', () => {
  /**
   * These two cases document a NEGATIVE result rather than an integration.
   *
   * CategoryMallPricing is resolved exclusively from `Unit.categoryId`
   * (booking.service.ts: validateProposedPrice / getApplicablePricing). Nothing
   * in the pricing or approval path reads `Lead.category(Id)` or
   * `Customer.preferredCategory(Id)`, so populating the CRM FK neither fixes
   * nor breaks pricing. The test guards against someone later wiring pricing to
   * the CRM text column by mistake.
   */
  it('CRM-CAT-023 no pricing lookup is driven by Lead/Customer category', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../booking/booking.service.ts'),
      'utf8',
    ) as string;

    const pricingCalls = src
      .split('\n')
      .filter((l) => l.includes('validateProposedPrice(') || l.includes('getApplicablePricing('));
    expect(pricingCalls.length).toBeGreaterThan(0);

    // Every pricing call site must take its categoryId from a Unit. Prisma
    // `select: { categoryId: true }` lines are not arguments and are excluded.
    const categoryArgs = src
      .split('\n')
      .filter(
        (l) =>
          /categoryId:\s*\w/.test(l) &&
          !l.includes('//') &&
          !/categoryId:\s*(true|false)/.test(l),
      );
    expect(categoryArgs.length).toBeGreaterThan(0);
    for (const line of categoryArgs) {
      expect(line).toMatch(/categoryId:\s*(unit|booking\.unit)[.?]/);
    }

    // And nothing in the pricing path reads a CRM category column.
    expect(src).not.toMatch(/categoryId:\s*lead[.?]/);
    expect(src).not.toMatch(/preferredCategory/);
  });

  it('CRM-CAT-024 pricing never resolves a category from free text', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../categories/categories.service.ts'),
      'utf8',
    ) as string;

    // resolvePricing walks the Category lineage by id; no name/text lookup may
    // appear in the pricing resolution path.
    expect(src).toContain('private async resolvePricing');
    expect(src).not.toMatch(/categoryPricing\.findFirst\([^)]*name:/s);
  });
});
