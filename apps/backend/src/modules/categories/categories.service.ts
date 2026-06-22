import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateCategoryPricingDto, UpdateCategoryPricingDto } from './dto/category-pricing.dto';
import { Prisma } from '@prisma/client';

export interface PriceValidationResult {
  isValid: boolean;
  categoryPricing: any | null;
  proposedRentPerSqm: number;
  minRentPerSqm: number;
  maxRentPerSqm: number;
  deviationPercent: number;
  requiresApproval: boolean;
  approvalLevel: 'NONE' | 'MANAGER' | 'DIRECTOR' | 'CEO';
  message: string;
}

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async getCategories(includeInactive = false) {
    const where: Prisma.CategoryWhereInput = includeInactive ? {} : { isActive: true };

    const categories = await this.prisma.category.findMany({
      where,
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: {
          where: includeInactive ? {} : { isActive: true },
          select: { id: true, code: true, name: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { units: true, categoryPricings: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return categories;
  }

  async getCategoriesTree(includeInactive = false) {
    const allCategories = await this.getCategories(includeInactive);

    const rootCategories = allCategories.filter((c) => !c.parentId);

    const buildTree = (parent: any): any => ({
      ...parent,
      children: allCategories
        .filter((c) => c.parentId === parent.id)
        .map(buildTree)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    });

    return rootCategories.map(buildTree);
  }

  async getCategory(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        categoryPricings: {
          where: { isActive: true },
          include: {
            mall: { select: { id: true, name: true, code: true } },
            floor: { select: { id: true, name: true, level: true } },
            zone: { select: { id: true, name: true } },
          },
          orderBy: { effectiveFrom: 'desc' },
        },
        _count: {
          select: { units: true, tenants: true, leads: true },
        },
      },
    });

    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async createCategory(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Category with code "${dto.code}" already exists`);
    }

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    return this.prisma.category.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.code && dto.code !== category.code) {
      const existing = await this.prisma.category.findUnique({
        where: { code: dto.code.toUpperCase() },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Category with code "${dto.code}" already exists`);
      }
    }

    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.code && { code: dto.code.toUpperCase() }),
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { units: true, children: true } },
      },
    });

    if (!category) throw new NotFoundException('Category not found');

    if (category._count.units > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${category._count.units} associated units. Deactivate instead.`
      );
    }

    if (category._count.children > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${category._count.children} sub-categories. Delete children first.`
      );
    }

    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Category deactivated successfully' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY PRICING CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async getCategoryPricings(params: {
    mallId?: string;
    categoryId?: string;
    includeInactive?: boolean;
  }) {
    const where: Prisma.CategoryMallPricingWhereInput = {};

    if (params.mallId) where.mallId = params.mallId;
    if (params.categoryId) where.categoryId = params.categoryId;
    if (!params.includeInactive) where.isActive = true;

    return this.prisma.categoryMallPricing.findMany({
      where,
      include: {
        mall: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, code: true, name: true } },
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: [
        { mall: { name: 'asc' } },
        { category: { name: 'asc' } },
        { effectiveFrom: 'desc' },
      ],
    });
  }

  async getCategoryPricing(id: string) {
    const pricing = await this.prisma.categoryMallPricing.findUnique({
      where: { id },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, code: true, name: true } },
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    if (!pricing) throw new NotFoundException('Category pricing not found');
    return pricing;
  }

  async createCategoryPricing(dto: CreateCategoryPricingDto, userId?: string) {
    // Validate mall exists
    const mall = await this.prisma.mall.findUnique({ where: { id: dto.mallId } });
    if (!mall) throw new NotFoundException('Mall not found');

    // Validate category exists
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    // Validate floor if provided
    if (dto.floorId) {
      const floor = await this.prisma.floor.findUnique({ where: { id: dto.floorId } });
      if (!floor || floor.mallId !== dto.mallId) {
        throw new BadRequestException('Floor not found or does not belong to the specified mall');
      }
    }

    // Validate zone if provided
    if (dto.zoneId) {
      const zone = await this.prisma.zone.findUnique({ where: { id: dto.zoneId } });
      if (!zone || zone.mallId !== dto.mallId) {
        throw new BadRequestException('Zone not found or does not belong to the specified mall');
      }
    }

    // Validate min <= max
    if (dto.minRentPerSqm > dto.maxRentPerSqm) {
      throw new BadRequestException('Minimum rent cannot be greater than maximum rent');
    }

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    return this.prisma.categoryMallPricing.create({
      data: {
        mallId: dto.mallId,
        categoryId: dto.categoryId,
        floorId: dto.floorId || null,
        zoneId: dto.zoneId || null,
        minRentPerSqm: dto.minRentPerSqm,
        maxRentPerSqm: dto.maxRentPerSqm,
        suggestedRent: dto.suggestedRent,
        camPerSqm: dto.camPerSqm ?? 0,
        effectiveFrom,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        notes: dto.notes,
        createdById: userId,
      },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, code: true, name: true } },
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateCategoryPricing(id: string, dto: UpdateCategoryPricingDto) {
    const pricing = await this.prisma.categoryMallPricing.findUnique({ where: { id } });
    if (!pricing) throw new NotFoundException('Category pricing not found');

    // Validate min <= max if both are being updated
    const newMin = dto.minRentPerSqm ?? pricing.minRentPerSqm;
    const newMax = dto.maxRentPerSqm ?? pricing.maxRentPerSqm;
    if (newMin > newMax) {
      throw new BadRequestException('Minimum rent cannot be greater than maximum rent');
    }

    return this.prisma.categoryMallPricing.update({
      where: { id },
      data: {
        ...(dto.minRentPerSqm !== undefined && { minRentPerSqm: dto.minRentPerSqm }),
        ...(dto.maxRentPerSqm !== undefined && { maxRentPerSqm: dto.maxRentPerSqm }),
        ...(dto.suggestedRent !== undefined && { suggestedRent: dto.suggestedRent }),
        ...(dto.camPerSqm !== undefined && { camPerSqm: dto.camPerSqm }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, code: true, name: true } },
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async deleteCategoryPricing(id: string) {
    const pricing = await this.prisma.categoryMallPricing.findUnique({ where: { id } });
    if (!pricing) throw new NotFoundException('Category pricing not found');

    await this.prisma.categoryMallPricing.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Category pricing deactivated successfully' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICE LOOKUP & VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the applicable pricing for a specific mall/category/floor/zone combination.
   * Uses fallback logic: zone > floor > mall-wide
   */
  async getApplicablePricing(params: {
    mallId: string;
    categoryId: string;
    floorId?: string;
    zoneId?: string;
  }) {
    const now = new Date();

    // Build queries in order of specificity (most specific first)
    const queries: Prisma.CategoryMallPricingWhereInput[] = [];

    // 1. Most specific: mall + category + floor + zone
    if (params.floorId && params.zoneId) {
      queries.push({
        mallId: params.mallId,
        categoryId: params.categoryId,
        floorId: params.floorId,
        zoneId: params.zoneId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      });
    }

    // 2. Mall + category + floor (no zone)
    if (params.floorId) {
      queries.push({
        mallId: params.mallId,
        categoryId: params.categoryId,
        floorId: params.floorId,
        zoneId: null,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      });
    }

    // 3. Mall + category + zone (no floor)
    if (params.zoneId) {
      queries.push({
        mallId: params.mallId,
        categoryId: params.categoryId,
        floorId: null,
        zoneId: params.zoneId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      });
    }

    // 4. Mall-wide: mall + category only
    queries.push({
      mallId: params.mallId,
      categoryId: params.categoryId,
      floorId: null,
      zoneId: null,
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    });

    // Find the first matching pricing (most specific)
    for (const where of queries) {
      const pricing = await this.prisma.categoryMallPricing.findFirst({
        where,
        include: {
          mall: { select: { id: true, name: true, code: true } },
          category: { select: { id: true, code: true, name: true } },
          floor: { select: { id: true, name: true, level: true } },
          zone: { select: { id: true, name: true, code: true } },
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (pricing) return pricing;
    }

    return null;
  }

  /**
   * Validate a proposed price against category pricing rules.
   * Returns validation result including approval requirements.
   */
  async validateProposedPrice(params: {
    mallId: string;
    categoryId: string;
    floorId?: string;
    zoneId?: string;
    proposedRentPerSqm: number;
  }): Promise<PriceValidationResult> {
    const pricing = await this.getApplicablePricing(params);

    if (!pricing) {
      return {
        isValid: true,
        categoryPricing: null,
        proposedRentPerSqm: params.proposedRentPerSqm,
        minRentPerSqm: 0,
        maxRentPerSqm: 0,
        deviationPercent: 0,
        requiresApproval: false,
        approvalLevel: 'NONE',
        message: 'No pricing rules found for this category/mall combination. Price accepted.',
      };
    }

    const { minRentPerSqm, maxRentPerSqm } = pricing;
    const proposed = params.proposedRentPerSqm;

    // Calculate deviation from minimum price
    const deviationPercent =
      minRentPerSqm > 0 ? ((minRentPerSqm - proposed) / minRentPerSqm) * 100 : 0;

    // Price is valid if >= minimum
    const isValid = proposed >= minRentPerSqm;

    // Determine approval level based on deviation
    let approvalLevel: 'NONE' | 'MANAGER' | 'DIRECTOR' | 'CEO' = 'NONE';
    let message = '';

    if (isValid) {
      message = 'Price is within acceptable range.';
    } else if (deviationPercent <= 5) {
      approvalLevel = 'MANAGER';
      message = `Price is ${deviationPercent.toFixed(1)}% below minimum. Requires Leasing Manager approval.`;
    } else if (deviationPercent <= 10) {
      approvalLevel = 'DIRECTOR';
      message = `Price is ${deviationPercent.toFixed(1)}% below minimum. Requires Mall Director approval.`;
    } else {
      approvalLevel = 'CEO';
      message = `Price is ${deviationPercent.toFixed(1)}% below minimum. Requires CEO approval.`;
    }

    return {
      isValid,
      categoryPricing: pricing,
      proposedRentPerSqm: proposed,
      minRentPerSqm,
      maxRentPerSqm,
      deviationPercent: Math.max(0, deviationPercent),
      requiresApproval: !isValid,
      approvalLevel,
      message,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get category by code (for migration/lookup purposes)
   */
  async getCategoryByCode(code: string) {
    return this.prisma.category.findUnique({
      where: { code: code.toUpperCase() },
    });
  }

  /**
   * Get all categories as a simple list for dropdowns
   */
  async getCategoryOptions() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get pricing summary for a mall (all categories)
   */
  async getMallPricingSummary(mallId: string) {
    const pricings = await this.prisma.categoryMallPricing.findMany({
      where: {
        mallId,
        isActive: true,
        floorId: null,
        zoneId: null,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: {
        category: { select: { id: true, code: true, name: true } },
      },
      orderBy: { category: { sortOrder: 'asc' } },
    });

    return pricings.map((p) => ({
      categoryId: p.category.id,
      categoryCode: p.category.code,
      categoryName: p.category.name,
      minRentPerSqm: p.minRentPerSqm,
      maxRentPerSqm: p.maxRentPerSqm,
      suggestedRent: p.suggestedRent,
      camPerSqm: p.camPerSqm,
    }));
  }
}
