import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService hardening', () => {
  const prisma: any = {
    category: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    categoryMallPricing: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    mall: { findUnique: jest.fn() },
    floor: { findUnique: jest.fn() },
    zone: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new CategoriesService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.categoryMallPricing.findMany.mockResolvedValue([]);
  });

  it('rejects moving a category below one of its descendants', async () => {
    prisma.category.findUnique
      .mockResolvedValueOnce({ id: 'parent', code: 'P' })
      .mockResolvedValueOnce({ parentId: 'child' });

    await expect(service.updateCategory('child', { parentId: 'parent' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('rejects a missing parent on update', async () => {
    prisma.category.findUnique
      .mockResolvedValueOnce({ id: 'child', code: 'C' })
      .mockResolvedValueOnce(null);

    await expect(service.updateCategory('child', { parentId: 'missing' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects invalid pricing bounds and suggested rent', async () => {
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall' });
    prisma.category.findUnique.mockResolvedValue({ id: 'category' });

    await expect(
      service.createCategoryPricing({
        mallId: 'mall', categoryId: 'category', minRentPerSqm: 200, maxRentPerSqm: 300,
        suggestedRent: 350,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an effective-to date before effective-from', async () => {
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall' });
    prisma.category.findUnique.mockResolvedValue({ id: 'category' });

    await expect(
      service.createCategoryPricing({
        mallId: 'mall', categoryId: 'category', minRentPerSqm: 100, maxRentPerSqm: 200,
        effectiveFrom: '2026-02-01', effectiveTo: '2026-01-31',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects overlapping active rules in the exact same scope', async () => {
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall' });
    prisma.category.findUnique.mockResolvedValue({ id: 'category' });
    prisma.floor.findUnique.mockResolvedValue({ id: 'floor', mallId: 'mall' });
    prisma.categoryMallPricing.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createCategoryPricing({
        mallId: 'mall', categoryId: 'category', floorId: 'floor', minRentPerSqm: 100,
        maxRentPerSqm: 200, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.categoryMallPricing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ floorId: 'floor', zoneId: null }) }),
    );
  });

  it('allows updating an inactive rule without overlap ambiguity', async () => {
    prisma.categoryMallPricing.findUnique.mockResolvedValue({
      id: 'pricing', mallId: 'mall', categoryId: 'category', floorId: null, zoneId: null,
      minRentPerSqm: 100, maxRentPerSqm: 200, suggestedRent: 150,
      effectiveFrom: new Date('2026-01-01'), effectiveTo: null,
    });
    prisma.categoryMallPricing.update.mockResolvedValue({ id: 'pricing', isActive: false });

    await service.updateCategoryPricing('pricing', { isActive: false });
    expect(prisma.categoryMallPricing.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a zone that belongs to another selected floor', async () => {
    prisma.mall.findUnique.mockResolvedValue({ id: 'mall' });
    prisma.category.findUnique.mockResolvedValue({ id: 'category' });
    prisma.floor.findUnique.mockResolvedValue({ id: 'floor-a', mallId: 'mall' });
    prisma.zone.findUnique.mockResolvedValue({ id: 'zone', mallId: 'mall', floorId: 'floor-b' });

    await expect(service.createCategoryPricing({
      mallId: 'mall', categoryId: 'category', floorId: 'floor-a', zoneId: 'zone',
      minRentPerSqm: 100,
    })).rejects.toThrow('Zone does not belong to the specified floor');
    expect(prisma.categoryMallPricing.create).not.toHaveBeenCalled();
  });

  it('rejects null required prices on a mall-wide base rule before Prisma update', async () => {
    prisma.categoryMallPricing.findUnique.mockResolvedValue({
      id: 'base', mallId: 'mall', categoryId: 'category', floorId: null, zoneId: null,
      minRentPerSqm: 100, maxRentPerSqm: 200, suggestedRent: 150, camPerSqm: 20,
      effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true,
    });

    await expect(service.updateCategoryPricing('base', {
      minRentPerSqm: null,
      maxRentPerSqm: null,
      camPerSqm: null,
    })).rejects.toThrow('Mall-wide base pricing cannot inherit');
    expect(prisma.categoryMallPricing.update).not.toHaveBeenCalled();
  });

  it('creates a new version instead of overwriting an active price rule', async () => {
    const current = {
      id: 'base', mallId: 'mall', categoryId: 'category', floorId: null, zoneId: null,
      minRentPerSqm: 100, maxRentPerSqm: 200, suggestedRent: 150, camPerSqm: 20,
      effectiveFrom: new Date('2026-01-01'), effectiveTo: null, isActive: true,
      notes: 'old', createdById: 'user',
    };
    const tx = {
      categoryMallPricing: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'new-version' }),
      },
    };
    prisma.categoryMallPricing.findUnique.mockResolvedValue(current);
    prisma.categoryMallPricing.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await expect(service.updateCategoryPricing('base', { minRentPerSqm: 120 }))
      .resolves.toEqual({ id: 'new-version' });
    expect(prisma.categoryMallPricing.update).not.toHaveBeenCalled();
    expect(tx.categoryMallPricing.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'base' },
      data: expect.objectContaining({ isActive: false }),
    }));
    expect(tx.categoryMallPricing.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ minRentPerSqm: 120, maxRentPerSqm: 200, isActive: true }),
    }));
  });

  it('resolves per-field inheritance with zone before floor and parent category last', async () => {
    prisma.category.findUnique
      .mockResolvedValueOnce({ parentId: 'parent' })
      .mockResolvedValueOnce({ parentId: null });
    prisma.categoryMallPricing.findMany.mockResolvedValue([
      { id: 'zone', categoryId: 'child', floorId: null, zoneId: 'zone', minRentPerSqm: null, maxRentPerSqm: null, suggestedRent: 450, camPerSqm: null, effectiveFrom: new Date('2026-01-04') },
      { id: 'floor', categoryId: 'child', floorId: 'floor', zoneId: null, minRentPerSqm: 200, maxRentPerSqm: null, suggestedRent: null, camPerSqm: null, effectiveFrom: new Date('2026-01-03') },
      { id: 'mall', categoryId: 'child', floorId: null, zoneId: null, minRentPerSqm: 100, maxRentPerSqm: 500, suggestedRent: 300, camPerSqm: null, effectiveFrom: new Date('2026-01-02') },
      { id: 'parent-mall', categoryId: 'parent', floorId: null, zoneId: null, minRentPerSqm: 50, maxRentPerSqm: 600, suggestedRent: 250, camPerSqm: 70, effectiveFrom: new Date('2026-01-01') },
    ]);

    const result = await service.getApplicablePricing({
      mallId: 'mall', categoryId: 'child', floorId: 'floor', zoneId: 'zone',
    });

    expect(result).toMatchObject({
      minRentPerSqm: 200,
      maxRentPerSqm: 500,
      suggestedRent: 450,
      camPerSqm: 70,
      sources: {
        suggestedRent: { ruleId: 'zone', scope: 'ZONE' },
        minRentPerSqm: { ruleId: 'floor', scope: 'FLOOR' },
        maxRentPerSqm: { ruleId: 'mall', scope: 'MALL' },
        camPerSqm: { ruleId: 'parent-mall', categoryId: 'parent' },
      },
    });
  });

  it('requires approval when no pricing configuration can be inherited', async () => {
    prisma.category.findUnique.mockResolvedValue({ parentId: null });
    prisma.categoryMallPricing.findMany.mockResolvedValue([]);

    const result = await service.validateProposedPrice({
      mallId: 'mall', categoryId: 'category', proposedRentPerSqm: 100,
    });

    expect(result).toMatchObject({ isValid: false, requiresApproval: true, approvalLevel: 'CEO' });
  });

  it('requires approval for a proposed rent above the configured ceiling', async () => {
    prisma.category.findUnique.mockResolvedValue({ parentId: null });
    prisma.categoryMallPricing.findMany.mockResolvedValue([
      { id: 'base', categoryId: 'category', floorId: null, zoneId: null, minRentPerSqm: 100, maxRentPerSqm: 200, suggestedRent: 150, camPerSqm: 20, effectiveFrom: new Date() },
    ]);

    const result = await service.validateProposedPrice({
      mallId: 'mall', categoryId: 'category', proposedRentPerSqm: 220,
    });

    expect(result).toMatchObject({ isValid: false, requiresApproval: true, approvalLevel: 'DIRECTOR', deviationPercent: 10 });
  });
});
