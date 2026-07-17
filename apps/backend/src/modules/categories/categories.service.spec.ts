import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService hardening', () => {
  const prisma: any = {
    category: { findUnique: jest.fn(), update: jest.fn() },
    categoryMallPricing: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    mall: { findUnique: jest.fn() },
    floor: { findUnique: jest.fn() },
    zone: { findUnique: jest.fn() },
  };
  const service = new CategoriesService(prisma);

  beforeEach(() => jest.clearAllMocks());

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
});
