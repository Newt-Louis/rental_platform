import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMallDto } from './dto/create-mall.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UnitStatus, UnitHistoryType, Prisma } from '@prisma/client';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { MallAccessService } from '../../common/services/mall-access.service';
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { summarizeOccupancyByLeaseTerm } from '../../common/utils/lease-term-analytics';

// Relation fields and read-only fields that must never be written directly to Prisma
const UNIT_RELATION_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt',
  'mall', 'building', 'floor', 'zone', 'tenant',
  'categoryRef', 'contracts', 'media', 'bookings', 'proposals',
  'unitHistory',
]);

// Scalar fields that are non-nullable in schema.prisma -- sending `null` for these
// makes Prisma throw a misleading "Unknown argument `floorId`" error instead of the
// real "Argument `x` must not be null", because the query engine mis-reports the
// first field it can't reconcile once any field in the payload fails validation.
const UNIT_REQUIRED_FIELDS = new Set([
  'mallId', 'code', 'areaGFA', 'areaNLA', 'baseRentPerSqm', 'camPerSqm',
  'status', 'isActive', 'isFlexibleArea', 'isCombined',
]);

// These fields are owned by the leasing lifecycle. Generic Spaces edits must
// never overwrite them, otherwise a live contract can be shown as BOOKING/VACANT.
const UNIT_LIFECYCLE_FIELDS = new Set([
  'mallId', 'status', 'tenantId', 'leaseStartDate', 'leaseEndDate',
  'vacantSince', 'isActive', 'isCombined', 'mergedFromIds', 'mergedIntoId',
]);
function sanitizeUnitDto(dto: any): any {
  const out: any = {};
  for (const key of Object.keys(dto)) {
    if (UNIT_RELATION_FIELDS.has(key)) continue;
    if (UNIT_LIFECYCLE_FIELDS.has(key)) {
      throw new BadRequestException(`Trường "${key}" được quản lý bởi quy trình trạng thái và không thể sửa trực tiếp`);
    }
    if (dto[key] === null && UNIT_REQUIRED_FIELDS.has(key)) {
      throw new BadRequestException(`Trường "${key}" không được để trống`);
    }
    out[key] = dto[key];
  }
  return out;
}

// CR-101 Phase 3B (INV-AUTH-010 / INV-DATA-002): Floor and Zone's generic update
// routes previously accepted any field present in the request body -- including
// `mallId` -- straight through to Prisma, because their controller methods type
// the body as a plain object literal rather than a class-validator DTO, so the
// global ValidationPipe's `whitelist: true` never engages (it only strips
// properties for a real decorated class). Unlike Unit (protected via
// `sanitizeUnitDto`'s UNIT_LIFECYCLE_FIELDS + UpdateUnitDto's OmitType), Floor and
// Zone had no equivalent guard. Mirror the same rule here: a resource may not be
// relocated across Mall boundaries via its generic info-update route. No business
// operation for moving a Floor or Zone between Malls has been requested or
// designed -- if one is needed later, it requires its own authorized command
// (BC required), not silent acceptance of a client-supplied mallId.
const HIERARCHY_IMMUTABLE_FIELDS = new Set(['mallId']);
function sanitizeHierarchyDto(dto: any): any {
  const out: any = {};
  for (const key of Object.keys(dto)) {
    if (HIERARCHY_IMMUTABLE_FIELDS.has(key)) {
      throw new BadRequestException(`Trường "${key}" không thể thay đổi qua API cập nhật thông tin chung`);
    }
    out[key] = dto[key];
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
    private mallAccess: MallAccessService,
  ) {}

  private assertVacantForModification(unit: { code?: string; status: UnitStatus }) {
    if (unit.status !== UnitStatus.VACANT) {
      const unitLabel = unit.code ? ` "${unit.code}"` : '';
      throw new BadRequestException(
        `Chỉ có thể điều chỉnh thông tin mặt bằng${unitLabel} khi đang trống (VACANT). Trạng thái hiện tại: ${unit.status}.`,
      );
    }
  }

  private async validateUnitLocation(mallId: string, floorId?: string | null, zoneId?: string | null) {
    const mall = await this.prisma.mall.findFirst({ where: { id: mallId, isActive: true }, select: { id: true } });
    if (!mall) throw new BadRequestException('Mall không tồn tại hoặc đã ngừng hoạt động');
    if (floorId) {
      const floor = await this.prisma.floor.findFirst({ where: { id: floorId, mallId, isActive: true } });
      if (!floor) throw new BadRequestException('Tầng không thuộc mall đang chọn hoặc đã ngừng hoạt động');
    }
    if (zoneId) {
      const zone = await this.prisma.zone.findFirst({ where: { id: zoneId, mallId, isActive: true } });
      if (!zone) throw new BadRequestException('Zone không thuộc mall đang chọn hoặc đã ngừng hoạt động');
      if (floorId && zone.floorId && zone.floorId !== floorId) {
        throw new BadRequestException('Zone không thuộc tầng đã chọn');
      }
    }
  }

  // CR-101 Phase 3B (INV-AUTH-007 / INV-DATA-002): mirrors validateUnitLocation's
  // shape for Floor -- if a buildingId is supplied, it must belong to the same
  // Mall as the Floor itself. Building.mallId is the source of truth for a
  // Building's Mall; a Floor referencing a Building from a different Mall than its
  // own mallId would be exactly the kind of silent cross-Mall hierarchy drift the
  // read-only reconciliation this phase checked for (found clean in the current
  // dataset, but structurally unguarded before this fix).
  private async validateFloorLocation(mallId: string, buildingId?: string | null) {
    if (!buildingId) return;
    const building = await this.prisma.building.findFirst({ where: { id: buildingId, mallId, isActive: true } });
    if (!building) throw new BadRequestException('Tòa nhà không thuộc mall đang chọn hoặc đã ngừng hoạt động');
  }

  // CR-101 Phase 3B (INV-AUTH-008 / INV-DATA-002): mirrors validateUnitLocation's
  // Zone/Floor consistency check, applied at the Zone's own creation time (today
  // only Unit's placement into an existing Zone was validated -- the Zone's own
  // placement under a Floor was not).
  private async validateZoneLocation(mallId: string, floorId?: string | null, buildingId?: string | null) {
    if (floorId) {
      const floor = await this.prisma.floor.findFirst({ where: { id: floorId, mallId, isActive: true } });
      if (!floor) throw new BadRequestException('Tầng không thuộc mall đang chọn hoặc đã ngừng hoạt động');
    }
    if (buildingId) {
      const building = await this.prisma.building.findFirst({ where: { id: buildingId, mallId, isActive: true } });
      if (!building) throw new BadRequestException('Tòa nhà không thuộc mall đang chọn hoặc đã ngừng hoạt động');
    }
  }

  // MALLS
  async getMalls(mallIds?: string[]) {
    return this.prisma.mall.findMany({
      where: {
        isActive: true,
        ...(mallIds ? { id: { in: mallIds } } : {}),
      },
      include: {
        _count: {
          select: {
            units: { where: { isActive: true } },
            buildings: { where: { isActive: true } },
            floors: { where: { isActive: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // A "deleted" Mall is soft-deleted (isActive: false) -- its row, and its
  // unique `code`, stay in the table. Recreating a Mall with the same code
  // must therefore reactivate that row instead of hitting Prisma's raw P2002
  // (which previously surfaced as an opaque "Unique constraint failed" error
  // and left the code permanently unusable).
  private async resolveMallCodeConflict(code: string) {
    const existing = await this.prisma.mall.findUnique({ where: { code } });
    if (existing && existing.isActive) {
      throw new ConflictException(`Mã Mall "${code}" đã tồn tại`);
    }
    return existing;
  }

  async createMall(dto: CreateMallDto) {
    const existing = await this.resolveMallCodeConflict(dto.code);
    if (existing) {
      return this.prisma.mall.update({ where: { id: existing.id }, data: { ...dto, isActive: true } });
    }
    return this.prisma.mall.create({ data: dto });
  }

  async setupMall(data: {
    mall: CreateMallDto;
    floors?: Array<{ name: string; level: string; sortOrder?: number; zones?: Array<{ name: string; code?: string }> }>;
  }) {
    const existing = await this.resolveMallCodeConflict(data.mall.code);
    return this.prisma.$transaction(async (tx) => {
      const mall = existing
        ? await tx.mall.update({ where: { id: existing.id }, data: { ...data.mall, isActive: true } })
        : await tx.mall.create({ data: data.mall });
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
  // CR-101 Phase 3B (INV-AUTH-007, Section 17): when the caller doesn't supply an
  // explicit mallId, fall back to their accessible-Mall set instead of returning
  // every Floor platform-wide. `accessibleMallIds === null` means the caller
  // bypasses Mall restrictions entirely (ADMIN/CEO/TENANT, per MallAccessService)
  // -- same convention as getMalls above.
  async getFloors(mallId?: string, accessibleMallIds?: string[] | null) {
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;
    else if (accessibleMallIds) where.mallId = { in: accessibleMallIds };

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
    await this.validateFloorLocation(data.mallId, data.buildingId);
    return this.prisma.floor.create({ data: { ...data, sortOrder: data.sortOrder ?? 0 } });
  }

  async updateFloor(id: string, data: { name?: string; level?: string; sortOrder?: number }) {
    return this.prisma.floor.update({ where: { id }, data: sanitizeHierarchyDto(data) });
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
  async getZones(floorId?: string, mallId?: string, accessibleMallIds?: string[] | null) {
    const where: any = { isActive: true };
    if (floorId) where.floorId = floorId;
    if (mallId) where.mallId = mallId;
    else if (accessibleMallIds) where.mallId = { in: accessibleMallIds };

    return this.prisma.zone.findMany({
      where,
      include: {
        floor: { select: { id: true, name: true, level: true } },
        _count: { select: { units: { where: { isActive: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createZone(data: { mallId: string; floorId?: string; buildingId?: string; name: string; code?: string }) {
    await this.validateZoneLocation(data.mallId, data.floorId, data.buildingId);
    return this.prisma.zone.create({ data });
  }

  async updateZone(id: string, data: { name?: string; code?: string; floorId?: string }) {
    if (Object.prototype.hasOwnProperty.call(data, 'floorId')) {
      const current = await this.prisma.zone.findUnique({ where: { id }, select: { mallId: true } });
      if (!current) throw new NotFoundException('Zone không tồn tại');
      await this.validateZoneLocation(current.mallId, data.floorId ?? undefined);
    }
    return this.prisma.zone.update({ where: { id }, data: sanitizeHierarchyDto(data) });
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
  }, accessibleMallIds?: string[] | null) {
    const { search, ...filters } = query;
    const page = Math.max(1, +query.page || 1);
    const limit = Math.max(1, +query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (filters.floorId) where.floorId = filters.floorId;
    if (filters.zoneId) where.zoneId = filters.zoneId;
    if (filters.mallId) where.mallId = filters.mallId;
    else if (accessibleMallIds) where.mallId = { in: accessibleMallIds };
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
    const { mallId } = dto;
    if (!mallId) throw new BadRequestException('mallId is required to create a unit');
    await this.validateUnitLocation(mallId, dto.floorId, dto.zoneId);

    const existing = await this.prisma.unit.findUnique({
      where: { mallId_code: { mallId, code: dto.code } },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`Mã mặt bằng "${dto.code}" đã tồn tại trong mall này`);

    return this.prisma.unit.create({
      data: { ...dto, mallId: dto.mallId } as Prisma.UnitUncheckedCreateInput,
      include: {
        floor: { select: { id: true, name: true, level: true } },
        zone: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateUnit(id: string, dto: any) {
    const current = await this.getUnit(id);
    this.assertVacantForModification(current);
    const nextFloorId = Object.prototype.hasOwnProperty.call(dto, 'floorId') ? dto.floorId : current.floorId;
    const nextZoneId = Object.prototype.hasOwnProperty.call(dto, 'zoneId') ? dto.zoneId : current.zoneId;
    await this.validateUnitLocation(current.mallId, nextFloorId, nextZoneId);
    if (dto.code && dto.code !== current.code) {
      const duplicate = await this.prisma.unit.findUnique({
        where: { mallId_code: { mallId: current.mallId, code: dto.code } },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Mã mặt bằng "${dto.code}" đã tồn tại trong mall này`);
      }
    }
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
    // LIQUIDATED must stay paired with the linked Contract's TERMINATING state — setting it
    // here would move the Unit without ever touching the Contract, leaving them desynced with
    // no way back except another manual override. Only ContractTerminationService.initiate()
    // (and its cancel/complete counterparts) may drive this transition.
    if (status === UnitStatus.LIQUIDATED) {
      throw new BadRequestException(
        'LIQUIDATED chỉ được thiết lập tự động khi khởi tạo thanh lý hợp đồng (Contract Termination), không thể đổi thủ công.',
      );
    }
    await this.getUnit(id);
    return this.unitStatus.transition(id, status, { userId, reason: 'Manual status update' });
  }

  async deleteUnit(id: string, userId?: string) {
    const unit = await this.getUnit(id);
    const [activeBookings, liveContracts, liveProposals, activeSlots] = await Promise.all([
      this.prisma.unitBooking.count({
        where: { unitId: id, isActive: true, status: { in: ['ACTIVE', 'PENDING'] } },
      }),
      this.prisma.contract.count({
        where: { unitId: id, isActive: true, deletedAt: null, status: { notIn: ['EXPIRED', 'TERMINATED'] } },
      }),
      this.prisma.proposal.count({
        where: { unitId: id, status: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] } },
      }),
      this.prisma.unitSlot.count({ where: { unitId: id, isActive: true } }),
    ]);
    const blockers = [
      activeBookings && `${activeBookings} booking đang hiệu lực`,
      liveContracts && `${liveContracts} hợp đồng đang hiệu lực`,
      liveProposals && `${liveProposals} đề xuất đang xử lý`,
      activeSlots && `${activeSlots} slot đang hoạt động`,
    ].filter(Boolean);
    if (blockers.length > 0) {
      throw new BadRequestException(`Không thể xóa mặt bằng ${unit.code}: ${blockers.join(', ')}.`);
    }
    await this.prisma.$transaction([
      this.prisma.unit.update({ where: { id }, data: { isActive: false } }),
      this.prisma.unitHistory.create({
        data: {
          unitId: id,
          changeType: UnitHistoryType.INFO_UPDATE,
          fieldName: 'isActive',
          oldValue: true,
          newValue: false,
          changedById: userId,
          notes: 'Unit deactivated from Spaces',
        },
      }),
    ]);
    return { message: 'Unit deactivated' };
  }

  async getOccupancySummary(mallId?: string, accessibleMallIds?: string[] | null) {
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;
    else if (accessibleMallIds) where.mallId = { in: accessibleMallIds };

    const [total, vacant, offering, booking, negotiating, contracted, underFitout, occupied, liquidated] =
      await Promise.all([
        this.prisma.unit.count({ where }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.VACANT } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.OFFERING } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.BOOKING } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.NEGOTIATING } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.CONTRACTED } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.UNDER_FITOUT } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.OCCUPIED } }),
        this.prisma.unit.count({ where: { ...where, status: UnitStatus.LIQUIDATED } }),
      ]);

    const units = await this.prisma.unit.findMany({
      where,
      select: { id: true, status: true, areaNLA: true, leaseTermType: true },
    });
    const shortBookings = await this.prisma.slotBooking.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        slot: {
          unit: {
            isActive: true,
            leaseTermType: 'SHORT',
            ...(mallId ? { mallId } : accessibleMallIds ? { mallId: { in: accessibleMallIds } } : {}),
          },
        },
      },
      select: {
        status: true,
        installationStartDatetime: true,
        dismantlingEndDatetime: true,
        startDatetime: true,
        endDatetime: true,
        slot: { select: { id: true, unitId: true, area: true } },
      },
    });

    const byLeaseTerm = summarizeOccupancyByLeaseTerm(units, shortBookings);

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
      offering,
      booking,
      negotiating,
      contracted,
      underFitout,
      occupied,
      liquidated,
      occupancyRate: totalArea > 0 ? ((leasedArea / totalArea) * 100).toFixed(1) : '0',
      totalArea,
      vacantArea,
      leasedArea,
      byLeaseTerm,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Stale Vacant Units
  // ═══════════════════════════════════════════════════════════════════════════

  async getStaleVacantUnits(mallId?: string, days: number = 90, accessibleMallIds?: string[] | null) {
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
    else if (accessibleMallIds) where.mallId = { in: accessibleMallIds };

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
    const { status, ...infoDto } = dto;
    if (Object.keys(infoDto).length > 0) this.assertVacantForModification(current);
    const changes: { field: string; oldVal: any; newVal: any; type: UnitHistoryType }[] = [];

    if (status && status !== current.status) {
      await this.unitStatus.transition(id, status, { userId, reason: 'Status update from Spaces' });
    }

    // Track rent changes
    const rentFields = ['baseRentPerSqm', 'marketRentPerSqm', 'askingRentPerSqm', 'camPerSqm', 'escalationRate'];
    for (const field of rentFields) {
      if (infoDto[field] !== undefined && infoDto[field] !== (current as any)[field]) {
        changes.push({
          field,
          oldVal: (current as any)[field],
          newVal: infoDto[field],
          type: UnitHistoryType.RENT_CHANGE,
        });
      }
    }

    // Track condition changes
    if (infoDto.condition !== undefined && infoDto.condition !== (current as any).condition) {
      changes.push({
        field: 'condition',
        oldVal: (current as any).condition,
        newVal: infoDto.condition,
        type: UnitHistoryType.CONDITION_CHANGE,
      });
    }

    // Perform update
    let updated: any = status && status !== current.status ? await this.getUnit(id) : current;
    if (Object.keys(infoDto).length > 0) {
      const nextFloorId = Object.prototype.hasOwnProperty.call(infoDto, 'floorId') ? infoDto.floorId : current.floorId;
      const nextZoneId = Object.prototype.hasOwnProperty.call(infoDto, 'zoneId') ? infoDto.zoneId : current.zoneId;
      await this.validateUnitLocation(current.mallId, nextFloorId, nextZoneId);
      updated = await this.prisma.unit.update({
        where: { id },
        data: sanitizeUnitDto(infoDto),
        include: {
          floor: { select: { id: true, name: true, level: true } },
          zone: { select: { id: true, name: true, code: true } },
          tenant: { select: { id: true, brandName: true, companyName: true } },
        },
      });
    }

    // Record history for each change
    for (const change of changes) {
      await this.recordUnitHistory(id, change.type, change.field, change.oldVal, change.newVal, userId);
    }

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Compare Units
  // ═══════════════════════════════════════════════════════════════════════════

  // CR-101 Phase 3B (P0-002): read-only, but still exposes rent/area/tenant data
  // for units the caller may not have Mall access to -- same accessible-set check
  // as bulkUpdateUnits above.
  async compareUnits(unitIds: string[], user?: { id: string; role: string }) {
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

    if (user) {
      const accessibleMallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
      if (accessibleMallIds) {
        const unauthorized = units.some((u) => !accessibleMallIds.includes(u.mallId));
        if (unauthorized) throw new ForbiddenException('Bạn không có quyền so sánh một hoặc nhiều mặt bằng trong danh sách đã chọn');
      }
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

  async getExpiringLeases(mallId?: string, days: number = 90, accessibleMallIds?: string[] | null) {
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
    else if (accessibleMallIds) where.mallId = { in: accessibleMallIds };

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
  }, accessibleMallIds?: string[] | null) {
    const { search, sortBy = 'code', sortOrder = 'asc', ...filters } = query;
    const page = Math.max(1, +query.page || 1);
    const limit = Math.max(1, +query.limit || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.UnitWhereInput = { isActive: true };

    // Basic filters
    if (filters.floorId) where.floorId = filters.floorId;
    if (filters.zoneId) where.zoneId = filters.zoneId;
    if (filters.mallId) where.mallId = filters.mallId;
    else if (accessibleMallIds) where.mallId = { in: accessibleMallIds };

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

  // CR-101 Phase 3B (P0-002): unlike mergeUnits, bulk-update has no same-Mall
  // constraint on the selected units today -- so a caller could otherwise mix
  // unit ids from Malls they don't have access to into one request. Check every
  // distinct mallId among the selected units against the caller's accessible set
  // (bypass roles get `null` back from getAccessibleMallIds and skip the check
  // entirely, same convention as everywhere else in MallAccessService).
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
    user?: { id: string; role: string },
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
      select: { id: true, code: true, status: true, baseRentPerSqm: true, camPerSqm: true, category: true, condition: true, mallId: true },
    });

    if (existingUnits.length !== unitIds.length) {
      throw new NotFoundException('One or more units not found');
    }

    // CR-101 Phase 3G (BC-BULK-UNIT-CROSS-MALL: DENY) -- a single bulk-update
    // request must not span more than one Mall. Mirrors mergeUnits' existing
    // same-Mall guard below; any future enterprise cross-Mall bulk operation
    // requires its own explicitly designed workflow and authorization model,
    // not a widened accessible-set check on this route.
    const distinctMallIds = [...new Set(existingUnits.map((u) => u.mallId))];
    if (distinctMallIds.length > 1) {
      throw new BadRequestException('Không thể cập nhật hàng loạt các mặt bằng thuộc nhiều mall khác nhau trong một lần');
    }

    if (user) {
      const accessibleMallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
      if (accessibleMallIds) {
        const unauthorized = distinctMallIds.filter((m) => !accessibleMallIds.includes(m));
        if (unauthorized.length > 0) {
          throw new ForbiddenException('Bạn không có quyền cập nhật một hoặc nhiều mặt bằng trong danh sách đã chọn');
        }
      }
    }

    const unavailableUnits = existingUnits.filter((unit) => unit.status !== UnitStatus.VACANT);
    if (unavailableUnits.length > 0) {
      const codes = unavailableUnits.slice(0, 5).map((unit) => unit.code).join(', ');
      const remaining = unavailableUnits.length > 5 ? ` và ${unavailableUnits.length - 5} mặt bằng khác` : '';
      throw new BadRequestException(
        `Chỉ có thể cập nhật hàng loạt các mặt bằng đang trống (VACANT). Không thể điều chỉnh: ${codes}${remaining}.`,
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (updates.status !== undefined) {
      throw new BadRequestException('Trạng thái mặt bằng được cập nhật tự động theo Booking, Hợp đồng và Fit-out; không thể đổi hàng loạt.');
    }
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

  // CR-101 Phase 3B.1 (INV-SPACE-MAP-001/002): confirmed gap -- this method
  // authorized the Floor but then updated `p.unitId` for every entry in the
  // payload with no check that the unit actually belongs to that Floor (or even
  // that Mall). An authorized caller for Floor A could supply a unitId from
  // Floor B (same or different Mall) and silently move its map coordinates.
  // Fixed by resolving the full set of referenced units in one batch query and
  // validating floorId + mallId against the authoritative Floor record before
  // any write happens. The existing array-form `$transaction` below was already
  // atomic (all-or-nothing) -- this validation runs entirely before it, so a
  // rejected request never reaches a partial write.
  async saveMapPositions(
    floorId: string,
    positions: Array<{ unitId: string; polygon?: number[][]; x?: number; y?: number; w?: number; h?: number }>,
  ) {
    const floor = await this.prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundException('Floor không tồn tại');

    if (positions.length === 0) return { updated: 0 };

    const requestedIds = positions.map((p) => p.unitId);
    const uniqueIds = [...new Set(requestedIds)];
    if (uniqueIds.length !== requestedIds.length) {
      throw new BadRequestException('Danh sách vị trí chứa unitId trùng lặp -- vui lòng gửi mỗi mặt bằng một lần');
    }

    const units = await this.prisma.unit.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, floorId: true, mallId: true },
    });
    if (units.length !== uniqueIds.length) {
      throw new BadRequestException('Một hoặc nhiều mặt bằng trong danh sách không tồn tại');
    }
    const mismatched = units.filter((u) => u.floorId !== floorId || u.mallId !== floor.mallId);
    if (mismatched.length > 0) {
      throw new BadRequestException(
        `Mặt bằng ${mismatched.map((u) => u.id).join(', ')} không thuộc tầng đang chỉnh sửa`,
      );
    }

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

  // CR-101 Phase 3B (P0-002): mergeUnits spans multiple Unit ids supplied by the
  // client, so the Mall to check is only known after reading the units from the
  // DB -- unlike the single-entity routes, this can't be resolved at the
  // controller layer without a duplicate query. Checked here, right after the
  // existing same-Mall invariant is confirmed (mallIds.size > 1 already throws
  // above), against the one shared mallId all source units are guaranteed to have.
  async mergeUnits(unitIds: string[], dto: MergeUnitDto, userId?: string, user?: { id: string; role: string }): Promise<MergeResult> {
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
    if (user) await this.mallAccess.assertMallAccess(user.id, user.role, sourceUnits[0].mallId);

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
