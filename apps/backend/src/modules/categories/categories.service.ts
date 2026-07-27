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
  sources?: Record<string, { ruleId: string; categoryId: string; scope: string } | null>;
}

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private async validateCategoryParent(categoryId: string, parentId: string) {
    if (parentId === categoryId) {
      throw new BadRequestException('Category cannot be its own parent');
    }

    const visited = new Set<string>();
    let currentId: string | null = parentId;
    while (currentId) {
      if (currentId === categoryId) {
        throw new BadRequestException('Parent category cannot be a descendant of this category');
      }
      if (visited.has(currentId)) {
        throw new BadRequestException('Category hierarchy already contains a cycle');
      }
      visited.add(currentId);
      const current = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      if (!current) throw new NotFoundException('Parent category not found');
      currentId = current.parentId;
    }
  }

  private validatePricingValues(
    min: number | null | undefined,
    max: number | null | undefined,
    suggested: number | null | undefined,
    cam: number | null | undefined,
    effectiveFrom: Date,
    effectiveTo: Date | null,
  ) {
    if (min == null || max == null) {
      throw new BadRequestException('Pricing must resolve to both a minimum and maximum rent');
    }
    for (const [label, value] of [['minimum', min], ['maximum', max], ['suggested', suggested], ['CAM', cam]] as const) {
      if (value != null && (!Number.isFinite(value) || value < 0)) {
        throw new BadRequestException(`${label} rent must be a finite non-negative number`);
      }
    }
    if (min > max) throw new BadRequestException('Minimum rent cannot be greater than maximum rent');
    if (suggested != null && (suggested < min || suggested > max)) {
      throw new BadRequestException('Suggested rent must be between minimum and maximum rent');
    }
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && Number.isNaN(effectiveTo.getTime()))) {
      throw new BadRequestException('Pricing effective dates must be valid dates');
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('Effective-to date cannot be earlier than effective-from date');
    }
  }

  private async getCategoryLineage(categoryId: string): Promise<string[]> {
    const lineage: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = categoryId;
    while (currentId) {
      if (visited.has(currentId)) throw new BadRequestException('Category hierarchy contains a cycle');
      visited.add(currentId);
      lineage.push(currentId);
      const category = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      if (!category) throw new NotFoundException('Category not found');
      currentId = category.parentId;
    }
    return lineage;
  }

  private scopeOf(rule: { floorId: string | null; zoneId: string | null }) {
    if (rule.floorId && rule.zoneId) return 'FLOOR_ZONE';
    if (rule.zoneId) return 'ZONE';
    if (rule.floorId) return 'FLOOR';
    return 'MALL';
  }

  private async resolvePricing(params: {
    mallId: string;
    categoryId: string;
    floorId?: string;
    zoneId?: string;
    excludeId?: string;
  }) {
    const now = new Date();
    const lineage = await this.getCategoryLineage(params.categoryId);
    const rules = await this.prisma.categoryMallPricing.findMany({
      where: {
        mallId: params.mallId,
        categoryId: { in: lineage },
        isActive: true,
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, code: true, name: true } },
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const ordered: typeof rules = [];
    for (const categoryId of lineage) {
      const categoryRules = rules.filter((rule) => rule.categoryId === categoryId);
      const take = (floorId: string | null, zoneId: string | null) => {
        const rule = categoryRules.find((candidate) => candidate.floorId === floorId && candidate.zoneId === zoneId);
        if (rule && !ordered.some((item) => item.id === rule.id)) ordered.push(rule);
      };
      if (params.floorId && params.zoneId) take(params.floorId, params.zoneId);
      // A zone is more specific than its floor, including zone-only overrides.
      if (params.zoneId) take(null, params.zoneId);
      if (params.floorId) take(params.floorId, null);
      take(null, null);
    }
    if (!ordered.length) return null;

    const sources: Record<string, { ruleId: string; categoryId: string; scope: string } | null> = {};
    const resolveField = (field: 'minRentPerSqm' | 'maxRentPerSqm' | 'suggestedRent' | 'camPerSqm') => {
      const rule = ordered.find((candidate) => candidate[field] != null);
      sources[field] = rule
        ? { ruleId: rule.id, categoryId: rule.categoryId, scope: this.scopeOf(rule) }
        : null;
      return rule?.[field] ?? null;
    };
    const primary = ordered[0];
    return {
      ...primary,
      minRentPerSqm: resolveField('minRentPerSqm'),
      maxRentPerSqm: resolveField('maxRentPerSqm'),
      suggestedRent: resolveField('suggestedRent'),
      camPerSqm: resolveField('camPerSqm') ?? 0,
      sources,
      inherited: Object.values(sources).some((source) => source && source.ruleId !== primary.id),
      matchedRuleIds: ordered.map((rule) => rule.id),
    };
  }

  private async ensurePricingDoesNotOverlap(params: {
    mallId: string;
    categoryId: string;
    floorId: string | null;
    zoneId: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    excludeId?: string;
  }) {
    const conflict = await this.prisma.categoryMallPricing.findFirst({
      where: {
        mallId: params.mallId,
        categoryId: params.categoryId,
        floorId: params.floorId,
        zoneId: params.zoneId,
        isActive: true,
        ...(params.excludeId && { id: { not: params.excludeId } }),
        effectiveFrom: { lte: params.effectiveTo ?? new Date('9999-12-31T23:59:59.999Z') },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: params.effectiveFrom } }],
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException('An active pricing rule already covers this scope and date range');
    }
  }

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

    if (dto.parentId) await this.validateCategoryParent(id, dto.parentId);

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
    mallIds?: string[];
    categoryId?: string;
    includeInactive?: boolean;
  }) {
    const where: Prisma.CategoryMallPricingWhereInput = {};

    if (params.mallId) where.mallId = params.mallId;
    else if (params.mallIds) where.mallId = { in: params.mallIds };
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
      if (dto.floorId && zone.floorId && zone.floorId !== dto.floorId) {
        throw new BadRequestException('Zone does not belong to the specified floor');
      }
    }

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    const isMallBase = !dto.floorId && !dto.zoneId;
    if (isMallBase && (dto.minRentPerSqm == null || dto.maxRentPerSqm == null)) {
      throw new BadRequestException('Mall-wide base pricing requires minimum and maximum rent');
    }
    if (!isMallBase && [dto.minRentPerSqm, dto.maxRentPerSqm, dto.suggestedRent, dto.camPerSqm].every((value) => value == null)) {
      throw new BadRequestException('An override must define at least one pricing value');
    }
    const inherited = isMallBase
      ? null
      : await this.resolvePricing({
          mallId: dto.mallId,
          categoryId: dto.categoryId,
          floorId: dto.floorId,
          zoneId: dto.zoneId,
        });
    this.validatePricingValues(
      dto.minRentPerSqm ?? inherited?.minRentPerSqm,
      dto.maxRentPerSqm ?? inherited?.maxRentPerSqm,
      dto.suggestedRent ?? inherited?.suggestedRent,
      dto.camPerSqm ?? inherited?.camPerSqm,
      effectiveFrom,
      effectiveTo,
    );
    await this.ensurePricingDoesNotOverlap({
      mallId: dto.mallId,
      categoryId: dto.categoryId,
      floorId: dto.floorId ?? null,
      zoneId: dto.zoneId ?? null,
      effectiveFrom,
      effectiveTo,
    });

    return this.prisma.categoryMallPricing.create({
      data: {
        mallId: dto.mallId,
        categoryId: dto.categoryId,
        floorId: dto.floorId || null,
        zoneId: dto.zoneId || null,
        minRentPerSqm: dto.minRentPerSqm,
        maxRentPerSqm: dto.maxRentPerSqm,
        suggestedRent: dto.suggestedRent,
        camPerSqm: dto.camPerSqm ?? null,
        effectiveFrom,
        effectiveTo,
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

    const rawMin = dto.minRentPerSqm !== undefined ? dto.minRentPerSqm : pricing.minRentPerSqm;
    const rawMax = dto.maxRentPerSqm !== undefined ? dto.maxRentPerSqm : pricing.maxRentPerSqm;
    const rawSuggested = dto.suggestedRent !== undefined ? dto.suggestedRent : pricing.suggestedRent;
    const rawCam = dto.camPerSqm !== undefined ? dto.camPerSqm : pricing.camPerSqm;
    const isMallBase = !pricing.floorId && !pricing.zoneId;
    if (isMallBase && (rawMin == null || rawMax == null)) {
      throw new BadRequestException('Mall-wide base pricing cannot inherit minimum or maximum rent');
    }
    const fallback = isMallBase
      ? null
      : await this.resolvePricing({
          mallId: pricing.mallId,
          categoryId: pricing.categoryId,
          floorId: pricing.floorId ?? undefined,
          zoneId: pricing.zoneId ?? undefined,
          excludeId: id,
        });
    const newMin = rawMin ?? fallback?.minRentPerSqm;
    const newMax = rawMax ?? fallback?.maxRentPerSqm;
    const newSuggested = rawSuggested ?? fallback?.suggestedRent;
    const newEffectiveTo =
      dto.effectiveTo !== undefined
        ? dto.effectiveTo
          ? new Date(dto.effectiveTo)
          : null
        : pricing.effectiveTo;
    this.validatePricingValues(
      newMin,
      newMax,
      newSuggested,
      rawCam ?? fallback?.camPerSqm,
      pricing.effectiveFrom,
      newEffectiveTo,
    );
    const targetActive = dto.isActive ?? pricing.isActive;
    if (targetActive) {
      await this.ensurePricingDoesNotOverlap({
        mallId: pricing.mallId,
        categoryId: pricing.categoryId,
        floorId: pricing.floorId,
        zoneId: pricing.zoneId,
        effectiveFrom: pricing.effectiveFrom,
        effectiveTo: newEffectiveTo,
        excludeId: id,
      });
    }

    const priceChanged =
      rawMin !== pricing.minRentPerSqm ||
      rawMax !== pricing.maxRentPerSqm ||
      rawSuggested !== pricing.suggestedRent ||
      rawCam !== pricing.camPerSqm;

    // Preserve historical pricing: changing an active rule closes it and creates
    // a new effective version instead of rewriting decisions made in the past.
    if (pricing.isActive && targetActive && priceChanged) {
      const versionStart = new Date(Math.max(Date.now(), pricing.effectiveFrom.getTime()));
      if (newEffectiveTo && newEffectiveTo < versionStart) {
        throw new BadRequestException('Effective end date must be after the new pricing version starts');
      }
      return this.prisma.$transaction(async (tx) => {
        await tx.categoryMallPricing.update({
          where: { id },
          data: { isActive: false, effectiveTo: versionStart },
        });
        return tx.categoryMallPricing.create({
          data: {
            mallId: pricing.mallId,
            categoryId: pricing.categoryId,
            floorId: pricing.floorId,
            zoneId: pricing.zoneId,
            minRentPerSqm: rawMin,
            maxRentPerSqm: rawMax,
            suggestedRent: rawSuggested,
            camPerSqm: rawCam,
            effectiveFrom: versionStart,
            effectiveTo: newEffectiveTo,
            notes: dto.notes !== undefined ? dto.notes : pricing.notes,
            isActive: true,
            createdById: pricing.createdById,
          },
          include: {
            mall: { select: { id: true, name: true, code: true } },
            category: { select: { id: true, code: true, name: true } },
            floor: { select: { id: true, name: true, level: true } },
            zone: { select: { id: true, name: true, code: true } },
          },
        });
      });
    }

    return this.prisma.categoryMallPricing.update({
      where: { id },
      data: {
        ...(dto.minRentPerSqm !== undefined && { minRentPerSqm: rawMin }),
        ...(dto.maxRentPerSqm !== undefined && { maxRentPerSqm: rawMax }),
        ...(dto.suggestedRent !== undefined && { suggestedRent: rawSuggested }),
        ...(dto.camPerSqm !== undefined && { camPerSqm: rawCam }),
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
    return this.resolvePricing(params);
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
    if (!Number.isFinite(params.proposedRentPerSqm) || params.proposedRentPerSqm < 0) {
      throw new BadRequestException('Proposed rent must be a finite, non-negative number');
    }
    const pricing = await this.getApplicablePricing(params);

    if (!pricing) {
      return {
        isValid: false,
        categoryPricing: null,
        proposedRentPerSqm: params.proposedRentPerSqm,
        minRentPerSqm: 0,
        maxRentPerSqm: 0,
        deviationPercent: 100,
        requiresApproval: true,
        approvalLevel: 'CEO',
        message: 'No pricing rule is configured for this category/mall combination. CEO approval is required.',
      };
    }

    const { minRentPerSqm, maxRentPerSqm } = pricing;
    const proposed = params.proposedRentPerSqm;
    if (minRentPerSqm == null || maxRentPerSqm == null) {
      throw new BadRequestException('Applicable pricing is incomplete: minimum and maximum rent are required');
    }

    const belowMinimum = proposed < minRentPerSqm;
    const aboveMaximum = proposed > maxRentPerSqm;
    const deviationPercent = belowMinimum
      ? (minRentPerSqm > 0 ? ((minRentPerSqm - proposed) / minRentPerSqm) * 100 : 0)
      : aboveMaximum
        ? (maxRentPerSqm > 0 ? ((proposed - maxRentPerSqm) / maxRentPerSqm) * 100 : 0)
        : 0;
    const isValid = !belowMinimum && !aboveMaximum;

    // Determine approval level based on deviation
    let approvalLevel: 'NONE' | 'MANAGER' | 'DIRECTOR' | 'CEO' = 'NONE';
    let message = '';

    if (isValid) {
      message = 'Price is within acceptable range.';
    } else if (deviationPercent <= 5) {
      approvalLevel = 'MANAGER';
      message = `Price is ${deviationPercent.toFixed(1)}% ${belowMinimum ? 'below minimum' : 'above maximum'}. Requires Leasing Manager approval.`;
    } else if (deviationPercent <= 10) {
      approvalLevel = 'DIRECTOR';
      message = `Price is ${deviationPercent.toFixed(1)}% ${belowMinimum ? 'below minimum' : 'above maximum'}. Requires Mall Director approval.`;
    } else {
      approvalLevel = 'CEO';
      message = `Price is ${deviationPercent.toFixed(1)}% ${belowMinimum ? 'below minimum' : 'above maximum'}. Requires CEO approval.`;
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
      sources: pricing.sources,
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
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const resolved = await Promise.all(categories.map(async (category) => ({
      category,
      pricing: await this.resolvePricing({ mallId, categoryId: category.id }),
    })));
    return resolved.filter((item) => item.pricing).map(({ category, pricing }) => ({
      categoryId: category.id,
      categoryCode: category.code,
      categoryName: category.name,
      minRentPerSqm: pricing!.minRentPerSqm,
      maxRentPerSqm: pricing!.maxRentPerSqm,
      suggestedRent: pricing!.suggestedRent,
      camPerSqm: pricing!.camPerSqm,
      sources: pricing!.sources,
    }));
  }
}
