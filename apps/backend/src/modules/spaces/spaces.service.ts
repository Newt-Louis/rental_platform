import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMallDto } from './dto/create-mall.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UnitStatus, UnitHistoryType, Prisma } from '@prisma/client';
import { UnitStatusService } from '../../common/services/unit-status.service';
import * as path from 'path';
import * as fs from 'fs';
import * as sharp from 'sharp';

// Relation fields and read-only fields that must never be written directly to Prisma
const UNIT_RELATION_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt',
  'mall', 'building', 'floor', 'zone', 'tenant',
  'categoryRef', 'contracts', 'media', 'bookings', 'proposals',
  'unitHistory',
]);

function sanitizeUnitDto(dto: any): any {
  const out: any = {};
  for (const key of Object.keys(dto)) {
    if (!UNIT_RELATION_FIELDS.has(key)) {
      out[key] = dto[key];
    }
  }
  return out;
}

export interface MergeUnitDto {
  code: string;
  name?: string;
  baseRentPerSqm?: number;
  camPerSqm?: number;
}

export interface MergeResult {
  combinedUnit: any;
  mergedUnitIds: string[];
}

export interface SplitResult {
  restoredUnits: any[];
  deactivatedCombinedId: string;
}

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);
  constructor(
    private prisma: PrismaService,
    private unitStatus: UnitStatusService,
  ) {}

  // MALLS
  async getMalls() {
    return this.prisma.mall.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { units: true, buildings: true, floors: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createMall(dto: CreateMallDto) {
    return this.prisma.mall.create({ data: dto });
  }

  async setupMall(data: {
    mall: CreateMallDto;
    floors?: Array<{ name: string; level: string; sortOrder?: number; zones?: Array<{ name: string; code?: string }> }>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const mall = await tx.mall.create({ data: data.mall });
      for (const floorInput of data.floors ?? []) {
        const { zones, ...floorData } = floorInput;
        const floor = await tx.floor.create({
          data: { mallId: mall.id, sortOrder: 0, ...floorData },
        });
        for (const zone of zones ?? []) {
          await tx.zone.create({ data: { mallId: mall.id, floorId: floor.id, ...zone } });
        }
      }
      return mall;
    });
  }

  async getMall(id: string) {
    const mall = await this.prisma.mall.findUnique({
      where: { id },
      include: {
        buildings: { where: { isActive: true } },
        floors: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        zones: { where: { isActive: true } },
        _count: { select: { units: true } },
      },
    });
    if (!mall) throw new NotFoundException('Mall not found');
    return mall;
  }

  async updateMall(id: string, dto: Partial<CreateMallDto>) {
    return this.prisma.mall.update({ where: { id }, data: dto });
  }

  async deleteMall(id: string) {
    const activeUnits = await this.prisma.unit.count({ where: { mallId: id, isActive: true } });
    if (activeUnits > 0) {
      throw new BadRequestException(
        `Không thể xoá mall vì còn ${activeUnits} mặt bằng đang hoạt động.`,
      );
    }
    await this.prisma.mall.update({ where: { id }, data: { isActive: false } });
    return { message: 'Mall deactivated' };
  }

  // FLOORS
  async getFloors(mallId?: string) {
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;

    return this.prisma.floor.findMany({
      where,
      include: {
        mall: { select: { id: true, name: true, code: true } },
        _count: { select: { units: { where: { isActive: true } }, zones: { where: { isActive: true } } } },
      },
      orderBy: [{ mallId: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async createFloor(data: { mallId: string; name: string; level: string; sortOrder?: number; buildingId?: string }) {
    return this.prisma.floor.create({ data: { ...data, sortOrder: data.sortOrder ?? 0 } });
  }

  async updateFloor(id: string, data: { name?: string; level?: string; sortOrder?: number }) {
    return this.prisma.floor.update({ where: { id }, data });
  }

  async deleteFloor(id: string) {
    const activeUnits = await this.prisma.unit.count({ where: { floorId: id, isActive: true } });
    if (activeUnits > 0) {
      throw new BadRequestException(
        `Không thể xoá tầng vì còn ${activeUnits} mặt bằng đang hoạt động. Vui lòng chuyển hoặc xoá các mặt bằng này trước.`,
      );
    }
    await this.prisma.floor.update({ where: { id }, data: { isActive: false } });
    return { message: 'Floor deactivated' };
  }

  // ZONES
  async getZones(floorId?: string, mallId?: string) {
    const where: any = { isActive: true };
    if (floorId) where.floorId = floorId;
    if (mallId) where.mallId = mallId;

    return this.prisma.zone.findMany({
      where,
      include: {
        floor: { select: { id: true, name: true, level: true } },
        _count: { select: { units: { where: { isActive: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createZone(data: { mallId: string; floorId?: string; name: string; code?: string }) {
    return this.prisma.zone.create({ data });
  }

  async updateZone(id: string, data: { name?: string; code?: string; floorId?: string }) {
    return this.prisma.zone.update({ where: { id }, data });
  }

  async deleteZone(id: string) {
    const activeUnits = await this.prisma.unit.count({ where: { zoneId: id, isActive: true } });
    if (activeUnits > 0) {
      throw new BadRequestException(
        `Không thể xoá khu vực vì còn ${activeUnits} mặt bằng đang hoạt động. Vui lòng chuyển hoặc xoá các mặt bằng này trước.`,
      );
    }
    await this.prisma.zone.update({ where: { id }, data: { isActive: false } });
    return { message: 'Zone deactivated' };
  }

  // UNITS
  async getUnits(query: {
    floorId?: string;
    zoneId?: string;
    mallId?: string;
    status?: UnitStatus;
    category?: string;
    tenantId?: string;
    search?: string;
    minArea?: number;
    maxArea?: number;
    minRent?: number;
    maxRent?: number;
    spaceType?: string;
    tier?: string;
    leaseTermType?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, ...filters } = query;
    const page = Math.max(1, +query.page || 1);
    const limit = Math.max(1, +query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (filters.floorId) where.floorId = filters.floorId;
    if (filters.zoneId) where.zoneId = filters.zoneId;
    if (filters.mallId) where.mallId = filters.mallId;
    if (filters.status) where.status = filters.status;
    if (filters.category) where.category = filters.category;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    // GAP #3 / #4 / #6
    if (filters.spaceType) where.spaceType = filters.spaceType;
    if (filters.tier) where.tier = filters.tier;
    if (filters.leaseTermType) where.leaseTermType = filters.leaseTermType;

    if (filters.minArea !== undefined || filters.maxArea !== undefined) {
      where.areaNLA = {};
      if (filters.minArea !== undefined) where.areaNLA.gte = +filters.minArea;
      if (filters.maxArea !== undefined) where.areaNLA.lte = +filters.maxArea;
    }
    if (filters.minRent !== undefined || filters.maxRent !== undefined) {
      where.baseRentPerSqm = {};
      if (filters.minRent !== undefined) where.baseRentPerSqm.gte = +filters.minRent;
      if (filters.maxRent !== undefined) where.baseRentPerSqm.lte = +filters.maxRent;
    }

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [units, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        skip,
        take: +limit,
        include: {
          floor: { select: { id: true, name: true, level: true } },
          zone: { select: { id: true, name: true, code: true } },
          tenant: {
            select: {
              id: true,
              brandName: true,
              companyName: true,
              contactName: true,
            },
          },
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.unit.count({ where }),
    ]);

    return {
      data: units,
      total,
      page: +page,
      limit: +limit,
      totalPages: Math.ceil(total / +limit),
    };
  }

  async getUnit(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        building: { select: { id: true, name: true, code: true } },
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
        tenant: true,
        contracts: {
          where: { isActive: true, status: { in: ['ACTIVE', 'EXPIRING'] } },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        media: {
          orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
        },
        bookings: {
          where: { isActive: true },
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
          take: 10,
          include: {
            lead: { select: { id: true, brandName: true, contactName: true } },
            customer: { select: { id: true, customerCode: true, companyName: true } },
            assignedTo: { select: { id: true, fullName: true } },
            proposal: { select: { id: true, proposalNumber: true, status: true } },
          },
        },
        proposals: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            proposalNumber: true,
            status: true,
            monthlyRent: true,
            monthlyCAM: true,
            totalContractValue: true,
            startDate: true,
            endDate: true,
            term: true,
            rentFree: true,
            discount: true,
            escalationPercent: true,
            area: true,
            rentPerSqm: true,
            camPerSqm: true,
            serviceFeeSqm: true,
            businessSupportFeeSqm: true,
            deposit: true,
            notes: true,
            tenant: { select: { id: true, brandName: true, companyName: true } },
            lead: { select: { id: true, brandName: true, contactName: true } },
            approvalWorkflow: {
              select: {
                id: true,
                status: true,
                steps: {
                  select: {
                    id: true,
                    stepOrder: true,
                    stepName: true,
                    approverRole: true,
                    status: true,
                    comment: true,
                    approver: { select: { id: true, fullName: true } },
                  },
                  orderBy: { stepOrder: 'asc' },
                },
              },
            },
            contract: { select: { id: true, contractNumber: true, status: true } },
          },
        },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async createUnit(dto: CreateUnitDto) {
    const existing = await this.prisma.unit.findUnique({
      where: { mallId_code: { mallId: dto.mallId, code: dto.code } },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`Mã mặt bằng "${dto.code}" đã tồn tại trong mall này`);

    return this.prisma.unit.create({
      data: dto,
      include: {
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateUnit(id: string, dto: any) {
    await this.getUnit(id);
    return this.prisma.unit.update({
      where: { id },
      data: sanitizeUnitDto(dto),
      include: {
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
        tenant: { select: { id: true, brandName: true, companyName: true } },
      },
    });
  }

  async updateUnitStatus(id: string, status: UnitStatus, userId?: string) {
    await this.getUnit(id);
    return this.unitStatus.transition(id, status, { force: true, userId, reason: 'Manual status update' });
  }

  async deleteUnit(id: string) {
    await this.getUnit(id);
    await this.prisma.unit.update({ where: { id }, data: { isActive: false } });
    return { message: 'Unit deactivated' };
  }

  async getOccupancySummary(mallId?: string) {
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;

    const [total, vacant, booking, negotiating, contracted, underFitout, occupied] =
      await Promise.all([
        this.prisma.unit.count({ where }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.VACANT } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.BOOKING } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.NEGOTIATING } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.CONTRACTED } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.UNDER_FITOUT } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.OCCUPIED } }),
      ]);

    const units = await this.prisma.unit.findMany({
      where,
      select: { status: true, areaNLA: true },
    });

    const totalArea = units.reduce((sum, u) => sum + u.areaNLA, 0);
    const vacantArea = units
      .filter((u) => u.status === UnitStatus.VACANT)
      .reduce((sum, u) => sum + u.areaNLA, 0);
    const leasedArea = units
      .filter((u) => u.status === UnitStatus.OCCUPIED)
      .reduce((sum, u) => sum + u.areaNLA, 0);

    return {
      total,
      vacant,
      booking,
      negotiating,
      contracted,
      underFitout,
      occupied,
      occupancyRate: total > 0 ? ((occupied / total) * 100).toFixed(1) : '0',
      totalArea,
      vacantArea,
      leasedArea,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Stale Vacant Units
  // ═══════════════════════════════════════════════════════════════════════════

  async getStaleVacantUnits(mallId?: string, days: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const where: Prisma.UnitWhereInput = {
      isActive: true,
      status: UnitStatus.VACANT,
      OR: [
        { vacantSince: { lte: cutoffDate } },
        {
          vacantSince: null,
          updatedAt: { lte: cutoffDate },
        },
      ],
    };
    if (mallId) where.mallId = mallId;

    const units = await this.prisma.unit.findMany({
      where,
      include: {
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true } },
        mall: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ vacantSince: 'asc' }, { updatedAt: 'asc' }],
    });

    return {
      data: units.map((u) => ({
        ...u,
        daysVacant: u.vacantSince
          ? Math.floor((Date.now() - u.vacantSince.getTime()) / 86400000)
          : Math.floor((Date.now() - u.updatedAt.getTime()) / 86400000),
      })),
      total: units.length,
      threshold: days,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Unit History Tracking
  // ═══════════════════════════════════════════════════════════════════════════

  async recordUnitHistory(
    unitId: string,
    changeType: UnitHistoryType,
    fieldName: string | null,
    oldValue: any,
    newValue: any,
    changedById?: string,
    notes?: string,
  ) {
    return this.prisma.unitHistory.create({
      data: {
        unitId,
        changeType,
        fieldName,
        oldValue: oldValue !== undefined ? oldValue : Prisma.JsonNull,
        newValue: newValue !== undefined ? newValue : Prisma.JsonNull,
        changedById,
        notes,
      },
    });
  }

  async getUnitHistory(unitId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');

    return this.prisma.unitHistory.findMany({
      where: { unitId },
      include: {
        changedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateUnitWithHistory(id: string, dto: any, userId?: string) {
    const current = await this.getUnit(id);
    const changes: { field: string; oldVal: any; newVal: any; type: UnitHistoryType }[] = [];

    // Track status changes
    if (dto.status && dto.status !== current.status) {
      changes.push({
        field: 'status',
        oldVal: current.status,
        newVal: dto.status,
        type: UnitHistoryType.STATUS_CHANGE,
      });
      // Auto-set vacantSince when status changes to VACANT
      if (dto.status === UnitStatus.VACANT && current.status !== UnitStatus.VACANT) {
        dto.vacantSince = new Date();
      }
      // Clear vacantSince when no longer vacant
      if (dto.status !== UnitStatus.VACANT && current.status === UnitStatus.VACANT) {
        dto.vacantSince = null;
      }
    }

    // Track rent changes
    const rentFields = ['baseRentPerSqm', 'marketRentPerSqm', 'askingRentPerSqm', 'camPerSqm', 'escalationRate'];
    for (const field of rentFields) {
      if (dto[field] !== undefined && dto[field] !== (current as any)[field]) {
        changes.push({
          field,
          oldVal: (current as any)[field],
          newVal: dto[field],
          type: UnitHistoryType.RENT_CHANGE,
        });
      }
    }

    // Track tenant changes
    if (dto.tenantId !== undefined && dto.tenantId !== current.tenantId) {
      changes.push({
        field: 'tenantId',
        oldVal: current.tenantId,
        newVal: dto.tenantId,
        type: UnitHistoryType.TENANT_CHANGE,
      });
    }

    // Track condition changes
    if (dto.condition !== undefined && dto.condition !== (current as any).condition) {
      changes.push({
        field: 'condition',
        oldVal: (current as any).condition,
        newVal: dto.condition,
        type: UnitHistoryType.CONDITION_CHANGE,
      });
    }

    // Perform update
    const updated = await this.prisma.unit.update({
      where: { id },
      data: sanitizeUnitDto(dto),
      include: {
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
        tenant: { select: { id: true, brandName: true, companyName: true } },
      },
    });

    // Record history for each change
    for (const change of changes) {
      await this.recordUnitHistory(id, change.type, change.field, change.oldVal, change.newVal, userId);
    }

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Compare Units
  // ═══════════════════════════════════════════════════════════════════════════

  async compareUnits(unitIds: string[]) {
    if (unitIds.length < 2 || unitIds.length > 5) {
      throw new BadRequestException('Please select 2-5 units to compare');
    }

    const units = await this.prisma.unit.findMany({
      where: { id: { in: unitIds }, isActive: true },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true } },
        tenant: { select: { id: true, brandName: true, companyName: true } },
        media: { where: { isCover: true }, take: 1 },
        _count: { select: { bookings: true, contracts: true } },
      },
    });

    if (units.length !== unitIds.length) {
      throw new NotFoundException('One or more units not found');
    }

    // Calculate comparison metrics
    const avgRent = units.reduce((sum, u) => sum + u.baseRentPerSqm, 0) / units.length;
    const avgArea = units.reduce((sum, u) => sum + u.areaNLA, 0) / units.length;

    return {
      units: units.map((u) => ({
        ...u,
        totalMonthlyRent: (u.baseRentPerSqm + u.camPerSqm) * u.areaNLA,
        rentVsAvg: avgRent > 0 ? ((u.baseRentPerSqm - avgRent) / avgRent * 100).toFixed(1) : '0',
        areaVsAvg: avgArea > 0 ? ((u.areaNLA - avgArea) / avgArea * 100).toFixed(1) : '0',
      })),
      summary: {
        avgRent: avgRent.toFixed(0),
        avgArea: avgArea.toFixed(1),
        minRent: Math.min(...units.map((u) => u.baseRentPerSqm)),
        maxRent: Math.max(...units.map((u) => u.baseRentPerSqm)),
        minArea: Math.min(...units.map((u) => u.areaNLA)),
        maxArea: Math.max(...units.map((u) => u.areaNLA)),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Expiring Leases
  // ═══════════════════════════════════════════════════════════════════════════

  async getExpiringLeases(mallId?: string, days: number = 90) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const where: Prisma.UnitWhereInput = {
      isActive: true,
      status: UnitStatus.OCCUPIED,
      leaseEndDate: {
        gte: new Date(),
        lte: futureDate,
      },
    };
    if (mallId) where.mallId = mallId;

    const units = await this.prisma.unit.findMany({
      where,
      include: {
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true } },
        mall: { select: { id: true, name: true, code: true } },
        tenant: {
          select: {
            id: true,
            brandName: true,
            companyName: true,
            contactName: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
        contracts: {
          where: { isActive: true, status: { in: ['ACTIVE', 'EXPIRING'] } },
          take: 1,
          orderBy: { endDate: 'desc' },
        },
      },
      orderBy: { leaseEndDate: 'asc' },
    });

    // Group by urgency
    const now = Date.now();
    const critical = units.filter((u) => {
      const days = Math.ceil((u.leaseEndDate!.getTime() - now) / 86400000);
      return days <= 30;
    });
    const warning = units.filter((u) => {
      const days = Math.ceil((u.leaseEndDate!.getTime() - now) / 86400000);
      return days > 30 && days <= 60;
    });
    const upcoming = units.filter((u) => {
      const days = Math.ceil((u.leaseEndDate!.getTime() - now) / 86400000);
      return days > 60;
    });

    return {
      data: units.map((u) => ({
        ...u,
        daysUntilExpiry: Math.ceil((u.leaseEndDate!.getTime() - now) / 86400000),
        monthlyRent: (u.baseRentPerSqm + u.camPerSqm) * u.areaNLA,
      })),
      summary: {
        total: units.length,
        critical: critical.length,
        warning: warning.length,
        upcoming: upcoming.length,
        totalAreaAtRisk: units.reduce((sum, u) => sum + u.areaNLA, 0),
        totalRevenueAtRisk: units.reduce((sum, u) => sum + (u.baseRentPerSqm + u.camPerSqm) * u.areaNLA, 0),
      },
      threshold: days,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Advanced Filtering (extended getUnits)
  // ═══════════════════════════════════════════════════════════════════════════

  async getUnitsAdvanced(query: {
    floorId?: string;
    zoneId?: string;
    mallId?: string;
    status?: UnitStatus | UnitStatus[];
    category?: string | string[];
    search?: string;
    minArea?: number;
    maxArea?: number;
    minRent?: number;
    maxRent?: number;
    minLeaseTerm?: number;
    maxLeaseTerm?: number;
    condition?: string | string[];
    expiringWithin?: number;
    vacantDays?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { search, sortBy = 'code', sortOrder = 'asc', ...filters } = query;
    const page = Math.max(1, +query.page || 1);
    const limit = Math.max(1, +query.limit || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.UnitWhereInput = { isActive: true };

    // Basic filters
    if (filters.floorId) where.floorId = filters.floorId;
    if (filters.zoneId) where.zoneId = filters.zoneId;
    if (filters.mallId) where.mallId = filters.mallId;

    // Status filter (single or array)
    if (filters.status) {
      where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
    }

    // Category filter (single or array)
    if (filters.category) {
      where.category = Array.isArray(filters.category) ? { in: filters.category } : filters.category;
    }

    // Condition filter
    if (filters.condition) {
      where.condition = Array.isArray(filters.condition) ? { in: filters.condition } : filters.condition;
    }

    // Area range
    if (filters.minArea !== undefined || filters.maxArea !== undefined) {
      where.areaNLA = {};
      if (filters.minArea !== undefined) where.areaNLA.gte = +filters.minArea;
      if (filters.maxArea !== undefined) where.areaNLA.lte = +filters.maxArea;
    }

    // Rent range
    if (filters.minRent !== undefined || filters.maxRent !== undefined) {
      where.baseRentPerSqm = {};
      if (filters.minRent !== undefined) where.baseRentPerSqm.gte = +filters.minRent;
      if (filters.maxRent !== undefined) where.baseRentPerSqm.lte = +filters.maxRent;
    }

    // Các điều kiện OR bên dưới được gom vào where.AND thay vì gán trực tiếp where.OR,
    // để tránh phần sau ghi đè mất phần trước (bug cũ: minLeaseTerm/vacantDays/search cùng dùng where.OR).
    const andConditions: Prisma.UnitWhereInput[] = [];

    // Lease term preference
    if (filters.minLeaseTerm !== undefined) {
      andConditions.push({
        OR: [
          { minLeaseTerm: null },
          { minLeaseTerm: { lte: +filters.minLeaseTerm } },
        ],
      });
    }

    // Expiring within X days (chỉ áp status=OCCUPIED nếu người dùng chưa tự chọn status khác)
    if (filters.expiringWithin !== undefined) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + +filters.expiringWithin);
      if (!filters.status) where.status = UnitStatus.OCCUPIED;
      where.leaseEndDate = { gte: new Date(), lte: futureDate };
    }

    // Vacant for X days (chỉ áp status=VACANT nếu người dùng chưa tự chọn status khác)
    if (filters.vacantDays !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - +filters.vacantDays);
      if (!filters.status) where.status = UnitStatus.VACANT;
      andConditions.push({
        OR: [
          { vacantSince: { lte: cutoff } },
          { vacantSince: null, updatedAt: { lte: cutoff } },
        ],
      });
    }

    // Search
    if (search) {
      andConditions.push({
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
          { tenant: { brandName: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    if (andConditions.length > 0) where.AND = andConditions;

    // Sorting
    const orderBy: Prisma.UnitOrderByWithRelationInput = {};
    if (sortBy === 'rent') orderBy.baseRentPerSqm = sortOrder;
    else if (sortBy === 'area') orderBy.areaNLA = sortOrder;
    else if (sortBy === 'leaseEnd') orderBy.leaseEndDate = sortOrder;
    else if (sortBy === 'updated') orderBy.updatedAt = sortOrder;
    else orderBy.code = sortOrder;

    const [units, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        skip,
        take: +limit,
        include: {
          floor: { select: { id: true, name: true, level: true } },
          zone: { select: { id: true, name: true, code: true } },
          tenant: { select: { id: true, brandName: true, companyName: true } },
          media: { where: { isCover: true }, take: 1 },
        },
        orderBy,
      }),
      this.prisma.unit.count({ where }),
    ]);

    return {
      data: units,
      total,
      page: +page,
      limit: +limit,
      totalPages: Math.ceil(total / +limit),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Rent Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  async getRentAnalytics(mallId?: string) {
    const where: Prisma.UnitWhereInput = { isActive: true };
    if (mallId) where.mallId = mallId;

    // Get all units with grouping data
    const units = await this.prisma.unit.findMany({
      where,
      select: {
        id: true,
        areaNLA: true,
        baseRentPerSqm: true,
        marketRentPerSqm: true,
        askingRentPerSqm: true,
        camPerSqm: true,
        status: true,
        category: true,
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true } },
      },
    });

    // Calculate overall stats
    const occupiedUnits = units.filter((u) => u.status === UnitStatus.OCCUPIED);
    const avgRent = occupiedUnits.length > 0
      ? occupiedUnits.reduce((sum, u) => sum + u.baseRentPerSqm, 0) / occupiedUnits.length
      : 0;

    // Group by floor
    const byFloor = new Map<string, { name: string; units: typeof units; totalArea: number; totalRent: number }>();
    for (const u of units) {
      const key = u.floor?.id ?? 'no-floor';
      if (!byFloor.has(key)) {
        byFloor.set(key, { name: u.floor?.name ?? 'No Floor', units: [], totalArea: 0, totalRent: 0 });
      }
      const group = byFloor.get(key)!;
      group.units.push(u);
      group.totalArea += u.areaNLA;
      if (u.status === UnitStatus.OCCUPIED) {
        group.totalRent += u.baseRentPerSqm * u.areaNLA;
      }
    }

    // Group by category
    const byCategory = new Map<string, { units: typeof units; totalArea: number; avgRent: number }>();
    for (const u of units) {
      const key = u.category ?? 'Uncategorized';
      if (!byCategory.has(key)) {
        byCategory.set(key, { units: [], totalArea: 0, avgRent: 0 });
      }
      const group = byCategory.get(key)!;
      group.units.push(u);
      group.totalArea += u.areaNLA;
    }

    // Calculate category averages
    const categoryStats = Array.from(byCategory.entries()).map(([category, data]) => {
      const occupied = data.units.filter((u) => u.status === UnitStatus.OCCUPIED);
      return {
        category,
        unitCount: data.units.length,
        occupiedCount: occupied.length,
        totalArea: data.totalArea,
        avgRent: occupied.length > 0
          ? occupied.reduce((sum, u) => sum + u.baseRentPerSqm, 0) / occupied.length
          : 0,
        occupancyRate: ((occupied.length / data.units.length) * 100).toFixed(1),
      };
    }).sort((a, b) => b.totalArea - a.totalArea);

    // Floor stats
    const floorStats = Array.from(byFloor.entries()).map(([floorId, data]) => {
      const occupied = data.units.filter((u) => u.status === UnitStatus.OCCUPIED);
      return {
        floorId,
        floorName: data.name,
        unitCount: data.units.length,
        occupiedCount: occupied.length,
        totalArea: data.totalArea,
        avgRent: occupied.length > 0
          ? occupied.reduce((sum, u) => sum + u.baseRentPerSqm, 0) / occupied.length
          : 0,
        totalMonthlyRevenue: data.totalRent,
        occupancyRate: ((occupied.length / data.units.length) * 100).toFixed(1),
      };
    });

    return {
      summary: {
        totalUnits: units.length,
        occupiedUnits: occupiedUnits.length,
        avgRentPerSqm: avgRent.toFixed(0),
        totalArea: units.reduce((sum, u) => sum + u.areaNLA, 0),
        leasedArea: occupiedUnits.reduce((sum, u) => sum + u.areaNLA, 0),
        totalMonthlyRevenue: occupiedUnits.reduce((sum, u) => sum + (u.baseRentPerSqm + u.camPerSqm) * u.areaNLA, 0),
      },
      byFloor: floorStats,
      byCategory: categoryStats,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Occupancy Trend
  // ═══════════════════════════════════════════════════════════════════════════

  async getOccupancyTrend(mallId?: string, months: number = 12) {
    const where: Prisma.OccupancySnapshotWhereInput = {};
    if (mallId) where.mallId = mallId;

    // Get historical snapshots if available
    const snapshots = await this.prisma.occupancySnapshot.findMany({
      where,
      orderBy: { snapshotDate: 'desc' },
      take: months,
    });

    if (snapshots.length > 0) {
      return {
        data: snapshots.map((s) => ({
          date: s.snapshotDate,
          totalUnits: s.totalUnits,
          occupiedUnits: s.occupiedUnits,
          vacantUnits: s.vacantUnits,
          occupancyRate: s.occupancyRate,
          totalArea: s.totalAreaSqm,
          leasedArea: s.occupiedAreaSqm,
        })).reverse(),
        hasHistoricalData: true,
      };
    }

    // If no snapshots, return current data as single point
    const current = await this.getOccupancySummary(mallId);
    return {
      data: [{
        date: new Date(),
        totalUnits: current.total,
        occupiedUnits: current.occupied,
        vacantUnits: current.vacant,
        occupancyRate: parseFloat(current.occupancyRate),
        totalArea: current.totalArea,
        leasedArea: current.leasedArea,
      }],
      hasHistoricalData: false,
      message: 'No historical data available. Enable OccupancySnapshot recording for trend analysis.',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Availability Calendar
  // ═══════════════════════════════════════════════════════════════════════════

  async getAvailabilityCalendar(mallId?: string, months: number = 6) {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + months);

    const where: Prisma.UnitWhereInput = {
      isActive: true,
      status: UnitStatus.OCCUPIED,
      leaseEndDate: { gte: new Date(), lte: futureDate },
    };
    if (mallId) where.mallId = mallId;

    // Units becoming available (lease ending)
    const expiringUnits = await this.prisma.unit.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        areaNLA: true,
        baseRentPerSqm: true,
        leaseEndDate: true,
        category: true,
        floor: { select: { id: true, name: true, level: true } },
        tenant: { select: { id: true, brandName: true } },
      },
      orderBy: { leaseEndDate: 'asc' },
    });

    // Already vacant units
    const vacantUnits = await this.prisma.unit.findMany({
      where: {
        isActive: true,
        status: UnitStatus.VACANT,
        ...(mallId ? { mallId } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        areaNLA: true,
        baseRentPerSqm: true,
        category: true,
        vacantSince: true,
        floor: { select: { id: true, name: true, level: true } },
      },
      orderBy: { vacantSince: 'asc' },
    });

    // Group expiring by month
    const byMonth = new Map<string, typeof expiringUnits>();
    for (const u of expiringUnits) {
      const key = u.leaseEndDate!.toISOString().slice(0, 7); // YYYY-MM
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(u);
    }

    return {
      currentlyVacant: {
        count: vacantUnits.length,
        totalArea: vacantUnits.reduce((sum, u) => sum + u.areaNLA, 0),
        units: vacantUnits,
      },
      upcomingAvailability: Array.from(byMonth.entries()).map(([month, units]) => ({
        month,
        count: units.length,
        totalArea: units.reduce((sum, u) => sum + u.areaNLA, 0),
        units,
      })),
      summary: {
        totalUpcoming: expiringUnits.length,
        totalUpcomingArea: expiringUnits.reduce((sum, u) => sum + u.areaNLA, 0),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Bulk Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async bulkUpdateUnits(
    unitIds: string[],
    updates: {
      status?: UnitStatus;
      category?: string;
      baseRentPerSqm?: number;
      camPerSqm?: number;
      condition?: string;
    },
    userId?: string,
  ) {
    if (unitIds.length === 0) {
      throw new BadRequestException('No units selected');
    }
    if (unitIds.length > 100) {
      throw new BadRequestException('Cannot update more than 100 units at once');
    }

    // Verify all units exist
    const existingUnits = await this.prisma.unit.findMany({
      where: { id: { in: unitIds }, isActive: true },
      select: { id: true, status: true, baseRentPerSqm: true, camPerSqm: true, category: true, condition: true },
    });

    if (existingUnits.length !== unitIds.length) {
      throw new NotFoundException('One or more units not found');
    }

    // Prepare update data
    const updateData: any = {};
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.baseRentPerSqm !== undefined) updateData.baseRentPerSqm = updates.baseRentPerSqm;
    if (updates.camPerSqm !== undefined) updateData.camPerSqm = updates.camPerSqm;
    if (updates.condition !== undefined) updateData.condition = updates.condition;

    // Handle vacantSince for status changes
    if (updates.status !== undefined) {
      if (updates.status === UnitStatus.VACANT) {
        updateData.vacantSince = new Date();
      } else {
        updateData.vacantSince = null;
      }
    }

    // Perform bulk update
    const result = await this.prisma.unit.updateMany({
      where: { id: { in: unitIds } },
      data: updateData,
    });

    // Record history for each unit
    for (const unit of existingUnits) {
      const changes: { field: string; oldVal: any; newVal: any; type: UnitHistoryType }[] = [];

      if (updates.status !== undefined && updates.status !== unit.status) {
        changes.push({ field: 'status', oldVal: unit.status, newVal: updates.status, type: UnitHistoryType.STATUS_CHANGE });
      }
      if (updates.baseRentPerSqm !== undefined && updates.baseRentPerSqm !== unit.baseRentPerSqm) {
        changes.push({ field: 'baseRentPerSqm', oldVal: unit.baseRentPerSqm, newVal: updates.baseRentPerSqm, type: UnitHistoryType.RENT_CHANGE });
      }
      if (updates.camPerSqm !== undefined && updates.camPerSqm !== unit.camPerSqm) {
        changes.push({ field: 'camPerSqm', oldVal: unit.camPerSqm, newVal: updates.camPerSqm, type: UnitHistoryType.RENT_CHANGE });
      }
      if (updates.category !== undefined && updates.category !== unit.category) {
        changes.push({ field: 'category', oldVal: unit.category, newVal: updates.category, type: UnitHistoryType.INFO_UPDATE });
      }
      if (updates.condition !== undefined && updates.condition !== unit.condition) {
        changes.push({ field: 'condition', oldVal: unit.condition, newVal: updates.condition, type: UnitHistoryType.CONDITION_CHANGE });
      }

      for (const change of changes) {
        await this.recordUnitHistory(unit.id, change.type, change.field, change.oldVal, change.newVal, userId, 'Bulk update');
      }
    }

    return {
      updated: result.count,
      unitIds,
      changes: Object.keys(updateData),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL MAP — Floor Plan Upload & Unit Positioning
  // ═══════════════════════════════════════════════════════════════════════════

  // Root thư mục uploads được main.ts serve tĩnh tại '/uploads' — mọi file phải nằm TRONG thư mục này,
  // trước đây floorPlanDir dùng path.join(UPLOAD_DIR, '..', 'floor-plans') thoát RA NGOÀI root nên ảnh sơ đồ tầng
  // không bao giờ truy cập được qua URL /uploads/... (không tìm thấy file khi serve tĩnh).
  private readonly uploadRoot = (process.env.UPLOAD_DIR ?? 'uploads').replace(/[\\/]unit-media$/, '');
  private readonly floorPlanDir = path.join(this.uploadRoot, 'floor-plans');

  private resolvePhysicalPath(fileUrl: string): string {
    return fileUrl.startsWith('/uploads/')
      ? path.join(this.uploadRoot, fileUrl.slice('/uploads/'.length))
      : fileUrl; // dữ liệu cũ: fileUrl từng được lưu trực tiếp là đường dẫn vật lý
  }

  async getFloorMapData(floorId: string) {
    const floor = await this.prisma.floor.findUnique({
      where: { id: floorId },
      include: {
        mall: { select: { id: true, name: true, code: true } },
        units: {
          where: { isActive: true },
          include: {
            zone: { select: { id: true, name: true, code: true } },
            tenant: { select: { id: true, brandName: true, companyName: true, logo: true } },
            media: {
              where: { isCover: true },
              take: 1,
              select: { fileUrl: true, mimeType: true },
            },
          },
          orderBy: { code: 'asc' },
        },
      },
    });
    if (!floor) throw new NotFoundException('Floor không tồn tại');
    return floor;
  }

  async uploadFloorPlan(floorId: string, file: Express.Multer.File) {
    const floor = await this.prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundException('Floor không tồn tại');

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ hỗ trợ JPG, PNG hoặc WebP');
    }

    // Delete old file if exists
    if (floor.floorPlanUrl) {
      const oldPath = this.resolvePhysicalPath(floor.floorPlanUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const dir = path.join(this.floorPlanDir, floorId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Enhance floor plan image: sharpen + normalise + save as high-quality PNG
    let fileBuffer = file.buffer;
    let floorPlanRatio: number | null = null;

    try {
      const sharpInst = sharp(file.buffer);
      const meta = await sharpInst.metadata();
      const srcW = meta.width ?? 0;
      const srcH = meta.height ?? 0;

      fileBuffer = await sharp(file.buffer)
        // Limit max dimension to 4000px while preserving aspect ratio
        .resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true })
        // Stretch histogram to use full 0-255 range (improves faded/low-contrast scans)
        .normalise({ lower: 1, upper: 99 })
        // Unsharp mask: strong edge sharpening, gentle flat-area sharpening
        .sharpen({ sigma: 1.3, m1: 0.4, m2: 2.5 })
        // Lossless PNG — ideal for architectural drawings with thin lines
        .png({ compressionLevel: 8 })
        .toBuffer();

      if (srcW && srcH) floorPlanRatio = srcW / srcH;
      this.logger.log(`Floor plan enhanced: ${srcW}×${srcH} → PNG (floor ${floorId})`);
    } catch (err: any) {
      this.logger.warn(`Image enhancement failed, saving original: ${err?.message}`);
      fileBuffer = file.buffer;
    }

    const filename = `floor-plan-${Date.now()}.png`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, fileBuffer);

    return this.prisma.floor.update({
      where: { id: floorId },
      data: {
        floorPlanUrl: `/uploads/floor-plans/${floorId}/${filename}`,
        ...(floorPlanRatio != null ? { floorPlanRatio } : {}),
      },
    });
  }

  async deleteFloorPlan(floorId: string) {
    const floor = await this.prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundException('Floor không tồn tại');

    if (floor.floorPlanUrl) {
      const oldPath = this.resolvePhysicalPath(floor.floorPlanUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    return this.prisma.floor.update({
      where: { id: floorId },
      data: { floorPlanUrl: null, floorPlanRatio: null },
    });
  }

  async saveMapPositions(
    floorId: string,
    positions: Array<{ unitId: string; polygon?: number[][]; x?: number; y?: number; w?: number; h?: number }>,
  ) {
    const floor = await this.prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundException('Floor không tồn tại');

    await this.prisma.$transaction(
      positions.map((p) =>
        this.prisma.unit.update({
          where: { id: p.unitId },
          data: p.polygon !== undefined
            ? { mapPolygon: p.polygon, mapPosX: null, mapPosY: null, mapPosW: null, mapPosH: null }
            : { mapPolygon: null, mapPosX: p.x, mapPosY: p.y, mapPosW: p.w, mapPosH: p.h },
        }),
      ),
    );

    return { updated: positions.length };
  }

  async updateUnitMapPosition(
    unitId: string,
    pos: { polygon?: number[][] | null; x?: number | null; y?: number | null; w?: number | null; h?: number | null },
  ) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit không tồn tại');

    return this.prisma.unit.update({
      where: { id: unitId },
      data: pos.polygon !== undefined
        ? { mapPolygon: pos.polygon, mapPosX: null, mapPosY: null, mapPosW: null, mapPosH: null }
        : { mapPolygon: null, mapPosX: pos.x, mapPosY: pos.y, mapPosW: pos.w, mapPosH: pos.h },
    });
  }

  async clearUnitMapPosition(unitId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit không tồn tại');

    return this.prisma.unit.update({
      where: { id: unitId },
      data: { mapPosX: null, mapPosY: null, mapPosW: null, mapPosH: null, mapPolygon: null },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP #2 — Merge / Split Units
  // ═══════════════════════════════════════════════════════════════════════════

  async mergeUnits(unitIds: string[], dto: MergeUnitDto, userId?: string): Promise<MergeResult> {
    if (unitIds.length < 2) {
      throw new BadRequestException('Cần ít nhất 2 mặt bằng để gộp');
    }

    const sourceUnits = await this.prisma.unit.findMany({
      where: { id: { in: unitIds }, isActive: true },
    });

    if (sourceUnits.length !== unitIds.length) {
      throw new NotFoundException('Một hoặc nhiều mặt bằng không tồn tại');
    }

    const mallIds = new Set(sourceUnits.map((u) => u.mallId));
    if (mallIds.size > 1) {
      throw new BadRequestException('Tất cả mặt bằng phải thuộc cùng một mall');
    }

    const nonVacant = sourceUnits.filter((u) => u.status !== UnitStatus.VACANT);
    if (nonVacant.length > 0) {
      throw new BadRequestException(
        `Không thể gộp: mặt bằng ${nonVacant.map((u) => u.code).join(', ')} chưa trống (status: ${nonVacant.map((u) => u.status).join(', ')})`,
      );
    }

    const totalGFA = sourceUnits.reduce((s, u) => s + u.areaGFA, 0);
    const totalNLA = sourceUnits.reduce((s, u) => s + u.areaNLA, 0);
    const avgRent = dto.baseRentPerSqm
      ?? sourceUnits.reduce((s, u) => s + u.baseRentPerSqm, 0) / sourceUnits.length;
    const avgCam = dto.camPerSqm
      ?? sourceUnits.reduce((s, u) => s + u.camPerSqm, 0) / sourceUnits.length;

    const ref = sourceUnits[0];

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the combined unit
      const combined = await tx.unit.create({
        data: {
          mallId: ref.mallId,
          buildingId: ref.buildingId,
          floorId: ref.floorId,
          zoneId: ref.zoneId,
          code: dto.code,
          name: dto.name ?? dto.code,
          areaGFA: totalGFA,
          areaNLA: totalNLA,
          baseRentPerSqm: avgRent,
          camPerSqm: avgCam,
          status: UnitStatus.VACANT,
          isCombined: true,
          mergedFromIds: unitIds,
          categoryId: ref.categoryId,
          category: ref.category,
          leaseTermType: (ref as any).leaseTermType,
          spaceType: (ref as any).spaceType,
          tier: (ref as any).tier,
        },
        include: {
          floor: { select: { id: true, name: true, level: true } },
          zone: { select: { id: true, name: true, code: true } },
        },
      });

      // 2. Mark source units as MERGED
      for (const unit of sourceUnits) {
        await tx.unit.update({
          where: { id: unit.id },
          data: { status: UnitStatus.MERGED, mergedIntoId: combined.id },
        });

        await tx.unitHistory.create({
          data: {
            unitId: unit.id,
            changeType: UnitHistoryType.STATUS_CHANGE,
            fieldName: 'status',
            oldValue: unit.status,
            newValue: UnitStatus.MERGED,
            changedById: userId,
            notes: `Gộp vào mặt bằng ${combined.code} (${combined.id})`,
          },
        });
      }

      // 3. Record history on combined unit
      await tx.unitHistory.create({
        data: {
          unitId: combined.id,
          changeType: UnitHistoryType.INFO_UPDATE,
          fieldName: 'mergedFromIds',
          oldValue: null,
          newValue: unitIds,
          changedById: userId,
          notes: `Gộp từ: ${sourceUnits.map((u) => u.code).join(', ')}`,
        },
      });

      return {
        combinedUnit: combined,
        mergedUnitIds: unitIds,
      };
    });
  }

  async splitUnit(unitId: string, userId?: string): Promise<SplitResult> {
    const combined = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!combined) throw new NotFoundException('Mặt bằng không tồn tại');
    if (!(combined as any).isCombined) {
      throw new BadRequestException('Mặt bằng này không phải là mặt bằng gộp');
    }
    if (([UnitStatus.OCCUPIED, UnitStatus.CONTRACTED, UnitStatus.UNDER_FITOUT] as UnitStatus[]).includes(combined.status)) {
      throw new BadRequestException('Không thể tách khi mặt bằng gộp đang có khách thuê hoặc đang thi công');
    }

    const mergedFromIds = (combined as any).mergedFromIds as string[] | null;
    if (!mergedFromIds || mergedFromIds.length === 0) {
      throw new BadRequestException('Không có thông tin mặt bằng gốc để phục hồi');
    }

    const sourceUnits = await this.prisma.unit.findMany({
      where: { id: { in: mergedFromIds } },
    });

    if (sourceUnits.length !== mergedFromIds.length) {
      throw new NotFoundException('Không tìm thấy đủ mặt bằng gốc để phục hồi');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Restore source units to VACANT
      const restored: any[] = [];
      for (const unit of sourceUnits) {
        const u = await tx.unit.update({
          where: { id: unit.id },
          data: { status: UnitStatus.VACANT, mergedIntoId: null, isActive: true },
        });
        restored.push(u);

        await tx.unitHistory.create({
          data: {
            unitId: unit.id,
            changeType: UnitHistoryType.STATUS_CHANGE,
            fieldName: 'status',
            oldValue: unit.status,
            newValue: UnitStatus.VACANT,
            changedById: userId,
            notes: `Phục hồi từ mặt bằng gộp ${combined.code} (${combined.id})`,
          },
        });
      }

      // 2. Deactivate combined unit
      await tx.unit.update({
        where: { id: unitId },
        data: { isActive: false },
      });

      await tx.unitHistory.create({
        data: {
          unitId,
          changeType: UnitHistoryType.STATUS_CHANGE,
          fieldName: 'isActive',
          oldValue: true,
          newValue: false,
          changedById: userId,
          notes: `Tách mặt bằng gộp, phục hồi: ${sourceUnits.map((u) => u.code).join(', ')}`,
        },
      });

      return {
        restoredUnits: restored,
        deactivatedCombinedId: unitId,
      };
    });
  }
}
