import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingStatus, BookingActivityType, LeadStatus, UnitStatus, PriceApprovalStatus, Prisma } from '@prisma/client';
import {
  CreateBookingDto,
  UpdateBookingDto,
  ExtendBookingDto,
  CancelBookingDto,
  ConvertToProposalDto,
  ApprovePriceDto,
  RejectPriceDto,
} from './dto/create-booking.dto';
import { CategoriesService } from '../categories/categories.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { UnitFinderQueryDto } from './dto/unit-finder-query.dto';
import { formatMoneyWithCode } from '../../common/utils/format-money';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private unitStatus: UnitStatusService,
  ) {}

  // ─── Tạo booking mới với priority tự động ────────────────────────────────

  /**
   * Phase 6 hardening (docs/program/RELIABILITY_BACKLOG.md item 1): used to run the
   * priority-slot computation (aggregate MAX + 1) and the booking-number counter as reads
   * followed by unwrapped writes (booking create → unit-status transition → lead update →
   * activity logs) — a crash partway could commit the Booking row while the Unit/Lead status
   * updates never ran, and two concurrent creates for the *same unit* could both read the
   * same MAX(priority) before either committed, producing two ACTIVE bookings for one unit
   * (violates the "at most one ACTIVE booking per unit" queue invariant). All of it now runs
   * inside one Serializable transaction; Postgres's own serialization-conflict detection
   * (P2034) catches the concurrent-same-unit race, and `runSerializable` retries the whole
   * decision fresh (so the loser correctly becomes priority 2/queued instead of erroring).
   */
  async create(dto: CreateBookingDto, createdById: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
    if (unit?.leaseTermType && unit.leaseTermType !== 'LONG') {
      throw new BadRequestException('Booking dai han chi ap dung cho mat bang thuoc khu cho thue dai han');
    }
    if (!unit || !unit.isActive) throw new NotFoundException('Unit không tồn tại');

    // GAP #20: Chặn booking khi unit đang bị khoá hoàn toàn —
    // bao gồm OCCUPIED/CONTRACTED/UNDER_FITOUT (đã có khách chính thức) và
    // NEGOTIATING (đang thương thảo nghiêm túc, không cho xếp hàng thêm) và MERGED.
    if (this.unitStatus.isLockedForBooking(unit.status)) {
      throw new BadRequestException(
        `Không thể tạo booking: mặt bằng đang bị khoá (trạng thái ${unit.status}).`,
      );
    }

    if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId } });
      if (lead?.leaseTermType && lead.leaseTermType !== 'LONG') {
        throw new BadRequestException('Lead ngan han phai su dung booking o ngan han');
      }
      if (!lead) throw new NotFoundException('Lead không tồn tại');
      if (!lead.mallId || lead.mallId !== unit.mallId) {
        throw new ForbiddenException(
          'Lead must belong to the same mall as the selected Unit',
        );
      }
    }
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer) throw new NotFoundException('Customer không tồn tại');
    }

    const holdDays = dto.holdDays ?? 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + holdDays);

    // Validate proposed price if provided — read-only external validation, safe to run once
    // ahead of the transaction/retry loop rather than re-running it on every attempt.
    let priceApprovalStatus: PriceApprovalStatus | null = null;
    let priceDeviationPercent: number | null = null;
    let pricingRuleId: string | null = null;
    let pricingSnapshot: Prisma.InputJsonValue | undefined;

    // CategoryPricing now carries its own currencyCode (previously a plain VND-denominated
    // Float with no currency field at all -- docs/program/MULTI_CURRENCY_ARCHITECTURE.md).
    // validateProposedPrice() only matches a pricing rule in the SAME currency as the
    // booking, so a USD/MMK booking is checked against a same-currency band where one
    // exists, and otherwise falls through to the "no pricing rule configured" CEO-escalation
    // path, same as a VND booking would. (The frontend's "not checked for {currency}"
    // disclaimer predates this and should be dropped/updated to match.)
    if (dto.proposedRentPerSqm !== undefined && unit.categoryId) {
      const validation = await this.categoriesService.validateProposedPrice({
        mallId: unit.mallId,
        categoryId: unit.categoryId,
        floorId: unit.floorId ?? undefined,
        zoneId: unit.zoneId ?? undefined,
        proposedRentPerSqm: dto.proposedRentPerSqm,
        currencyCode: dto.currencyCode,
      });

      if (validation.requiresApproval) {
        priceApprovalStatus = PriceApprovalStatus.PENDING;
        priceDeviationPercent = validation.deviationPercent;
      }
      pricingRuleId = validation.categoryPricing?.id ?? null;
      pricingSnapshot = {
        evaluatedAt: new Date().toISOString(),
        proposedRentPerSqm: dto.proposedRentPerSqm,
        minRentPerSqm: validation.minRentPerSqm,
        maxRentPerSqm: validation.maxRentPerSqm,
        suggestedRent: validation.categoryPricing?.suggestedRent ?? null,
        camPerSqm: validation.categoryPricing?.camPerSqm ?? null,
        sources: validation.categoryPricing?.sources ?? null,
      };
    }

    return this.runSerializable(async (tx) => {
      // Finder eligibility is advisory. Re-read the Unit and Lead inside every
      // serializable attempt so a status/Mall change between search and submit
      // cannot create a queued Booking against stale eligibility.
      const currentUnit = await tx.unit.findUnique({ where: { id: dto.unitId } });
      if (!currentUnit || !currentUnit.isActive) {
        throw new NotFoundException('Unit không tồn tại');
      }
      if ((currentUnit.leaseTermType && currentUnit.leaseTermType !== 'LONG') || this.unitStatus.isLockedForBooking(currentUnit.status)) {
        throw new BadRequestException(
          `Không thể tạo booking: mặt bằng không còn đủ điều kiện (trạng thái ${currentUnit.status}).`,
        );
      }
      if (dto.leadId) {
        const currentLead = await tx.lead.findUnique({ where: { id: dto.leadId } });
        if (!currentLead) throw new NotFoundException('Lead không tồn tại');
        if (currentLead.leaseTermType && currentLead.leaseTermType !== 'LONG') {
          throw new BadRequestException('Lead ngắn hạn phải sử dụng booking ô ngắn hạn');
        }
        if (!currentLead.mallId || currentLead.mallId !== currentUnit.mallId) {
          throw new ForbiddenException('Lead must belong to the same mall as the selected Unit');
        }
      }

      // Re-checked on every attempt (including retries after a losing race) so the decision
      // is always made against current data, not a stale pre-transaction read.
      const existingActive = await tx.unitBooking.findFirst({
        where: {
          unitId: dto.unitId,
          status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
          ...(dto.leadId ? { leadId: dto.leadId } : {}),
          ...(dto.customerId ? { customerId: dto.customerId } : {}),
          isActive: true,
        },
      });
      if (existingActive) {
        throw new ConflictException('Khách hàng này đã có booking đang chờ hoặc đang giữ cho unit này');
      }

      // Tính priority: lấy max hiện tại + 1
      const maxPriority = await tx.unitBooking.aggregate({
        where: {
          unitId: dto.unitId,
          status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
          isActive: true,
        },
        _max: { priority: true },
      });
      const priority = (maxPriority._max.priority ?? 0) + 1;

      // Auto-generate booking number: BK-YYYY-NNNNN
      const year = new Date().getFullYear();
      const count = await tx.unitBooking.count({
        where: { bookingNumber: { startsWith: `BK-${year}-` } },
      });
      const bookingNumber = `BK-${year}-${String(count + 1).padStart(5, '0')}`;

      const booking = await tx.unitBooking.create({
        data: {
          bookingNumber,
          unitId: dto.unitId,
          leadId: dto.leadId,
          customerId: dto.customerId,
          priority,
          status: priority === 1 ? BookingStatus.ACTIVE : BookingStatus.PENDING,
          requestedArea: dto.requestedArea,
          requestedTerm: dto.requestedTerm,
          budgetRentMin: dto.budgetRentMin,
          budgetRentMax: dto.budgetRentMax,
          expectedRent: dto.expectedRent,
          currencyCode: dto.currencyCode ?? 'VND',
          exchangeRate: dto.exchangeRate,
          proposedRentPerSqm: dto.proposedRentPerSqm,
          proposedCamPerSqm: dto.proposedCamPerSqm,
          serviceFeeSqm: dto.serviceFeeSqm,
          businessSupportFeeSqm: dto.businessSupportFeeSqm,
          priceApprovalStatus,
          priceDeviationPercent,
          pricingRuleId,
          pricingSnapshot,
          holdDays,
          expiresAt,
          activatedAt: priority === 1 ? new Date() : null,
          notes: dto.notes,
          createdById,
          assignedToId: dto.assignedToId,
        },
        include: this.defaultInclude(),
      });

      // Khi priority 1 → unit chuyển sang BOOKING
      if (priority === 1) {
        await this.unitStatus.transition(dto.unitId, UnitStatus.BOOKING, {
          userId: createdById,
          reason: `Booking ${bookingNumber} activated`,
        }, tx);
      }

      // Cập nhật lead status → PROPOSAL nếu booking ACTIVE
      if (dto.leadId && priority === 1) {
        await tx.lead.update({
          where: { id: dto.leadId },
          data: { status: LeadStatus.PROPOSAL },
        });
      }

      // Ghi activity log
      await this.logActivity(booking.id, BookingActivityType.CREATED, createdById, {
        note: `Booking ${bookingNumber} tạo thành công. Priority: ${priority}`,
      }, tx);
      if (priority === 1) {
        await this.logActivity(booking.id, BookingActivityType.ACTIVATED, createdById, {
          note: 'Booking được kích hoạt ngay (priority 1)',
        }, tx);
      }

      return booking;
    });
  }

  // ─── Danh sách bookings ───────────────────────────────────────────────────

  /**
   * CR-BOOKING-UX Wave 1: read-only Booking projection over Unit master data.
   * The same UnitStatusService predicate used by create() derives eligibility.
   * Results are advisory; POST /bookings always revalidates current state.
   */
  async findUnits(query: UnitFinderQueryDto & { mallIds?: string[] }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (query.minArea !== undefined && query.maxArea !== undefined && query.minArea > query.maxArea) {
      throw new BadRequestException('minArea must be less than or equal to maxArea');
    }

    const where: Prisma.UnitWhereInput = {
      isActive: true,
      leaseTermType: 'LONG',
    };
    if (query.mallId) where.mallId = query.mallId;
    else if (query.mallIds) where.mallId = { in: query.mallIds };
    if (query.unitId) where.id = query.unitId;
    if (query.floorId) where.floorId = query.floorId;
    if (query.zoneId) where.zoneId = query.zoneId;
    if (query.status) where.status = query.status;
    if (query.minArea !== undefined || query.maxArea !== undefined) {
      where.areaNLA = {
        ...(query.minArea !== undefined ? { gte: query.minArea } : {}),
        ...(query.maxArea !== undefined ? { lte: query.maxArea } : {}),
      };
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [units, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          code: true,
          name: true,
          mallId: true,
          floorId: true,
          zoneId: true,
          areaNLA: true,
          areaGFA: true,
          category: true,
          status: true,
          leaseTermType: true,
          mall: { select: { id: true, name: true, code: true } },
          floor: { select: { id: true, name: true, level: true } },
          zone: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.unit.count({ where }),
    ]);

    const unitIds = units.map((unit) => unit.id);
    const queueCounts = unitIds.length
      ? await this.prisma.unitBooking.groupBy({
          by: ['unitId'],
          where: {
            unitId: { in: unitIds },
            isActive: true,
            status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
          },
          _count: { _all: true },
        })
      : [];
    const queueCountByUnit = new Map(queueCounts.map((row) => [row.unitId, row._count._all]));

    return {
      data: units.map((unit) => {
        const locked = this.unitStatus.isLockedForBooking(unit.status);
        // Mirrors UnitStatusService.isLockedForBooking's notion of "available": VACANT and
        // OFFERING both have no active/live contract and no existing hold, so both go straight
        // to IMMEDIATE — only BOOKING (already has a queue) is QUEUE.
        const mode = locked
          ? 'BLOCKED'
          : unit.status === UnitStatus.BOOKING
            ? 'QUEUE'
            : unit.status === UnitStatus.VACANT || unit.status === UnitStatus.OFFERING
              ? 'IMMEDIATE'
              : 'BLOCKED';
        return {
          ...unit,
          currentEligibility: {
            selectable: mode !== 'BLOCKED',
            mode,
            reasonCode: locked
              ? `UNIT_STATUS_${unit.status}`
              : mode === 'BLOCKED'
                ? 'UNIT_STATUS_NOT_BOOKABLE'
                : null,
            queueCount: mode === 'QUEUE' ? (queueCountByUnit.get(unit.id) ?? 0) : 0,
          },
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findAll(query: {
    unitId?: string;
    floorId?: string;
    leadId?: string;
    customerId?: string;
    status?: BookingStatus;
    assignedToId?: string;
    mallId?: string;
    mallIds?: string[];
    leaseTermType?: string;
    expiringSoon?: boolean;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
    page?: number;
    limit?: number;
  }) {
    const { expiringSoon, search, createdFrom, createdTo, ...filters } = query;
    const p = Math.max(1, parseInt(String(query.page)) || 1);
    const l = Math.max(1, parseInt(String(query.limit)) || 20);
    const skip = (p - 1) * l;

    const where: any = { isActive: true };
    if (filters.unitId) where.unitId = filters.unitId;
    if (filters.leadId) where.leadId = filters.leadId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    const scopedMallIds = filters.mallId ? [filters.mallId] : filters.mallIds;
    if (scopedMallIds || filters.floorId) {
      where.unit = {
        ...(scopedMallIds ? {
          OR: [
            { mallId: { in: scopedMallIds } },
            { floor: { mallId: { in: scopedMallIds } } },
          ],
        } : {}),
        ...(filters.floorId ? { floorId: filters.floorId } : {}),
      };
    }
    if (expiringSoon) {
      const in7days = new Date();
      in7days.setDate(in7days.getDate() + 7);
      where.status = BookingStatus.ACTIVE;
      where.expiresAt = { lte: in7days, gte: new Date() };
    }
    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) where.createdAt.gte = new Date(createdFrom);
      if (createdTo) {
        const to = new Date(createdTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
    if (search) {
      where.OR = [
        { bookingNumber: { contains: search, mode: 'insensitive' } },
        { unit: { code: { contains: search, mode: 'insensitive' } } },
        { unit: { floor: { name: { contains: search, mode: 'insensitive' } } } },
        { lead: { brandName: { contains: search, mode: 'insensitive' } } },
        { lead: { contactName: { contains: search, mode: 'insensitive' } } },
        { customer: { companyName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.unitBooking.findMany({
        where,
        skip,
        take: l,
        include: this.defaultInclude(),
        // Keep each unit queue together and make its priority order explicit.
        orderBy: [
          { unit: { code: 'asc' } },
          { priority: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.unitBooking.count({ where }),
    ]);

    return { data, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  // ─── Queue của một unit ───────────────────────────────────────────────────

  async getUnitQueue(unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, code: true, name: true, status: true, floor: { select: { name: true } } },
    });
    if (!unit) throw new NotFoundException('Unit không tồn tại');

    const queue = await this.prisma.unitBooking.findMany({
      where: {
        unitId,
        status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
        isActive: true,
      },
      include: this.defaultInclude(),
      orderBy: { priority: 'asc' },
    });

    return { unit, queue, totalInQueue: queue.length };
  }

  // ─── Chi tiết booking ─────────────────────────────────────────────────────

  async findOne(id: string) {
    const booking = await this.prisma.unitBooking.findUnique({
      where: { id },
      include: {
        ...this.defaultInclude(),
        activities: {
          include: { performedBy: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        proposal: { select: { id: true, proposalNumber: true, status: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking không tồn tại');
    return booking;
  }

  // ─── Cập nhật thông tin booking ───────────────────────────────────────────

  /**
   * Phase 6 hardening (docs/program/RELIABILITY_BACKLOG.md item 2): the unit-change path
   * used to count the new unit's queue position, then commit the booking update, the old
   * unit's queue promotion, and the new unit's status transition as separate unwrapped
   * writes — the exact "release Unit A, reserve Unit B fails" partial-state risk section 14
   * warns about, plus the same same-unit queue-position race as create(). The queue-position
   * count and every write now happen inside one Serializable transaction via the same
   * `runSerializable` retry helper.
   */
  async update(id: string, dto: UpdateBookingDto, userId: string) {
    const booking = await this.requireBooking(id, [BookingStatus.ACTIVE, BookingStatus.PENDING]);

    // ── Đổi lead ──────────────────────────────────────────────────────────────
    if (dto.leadId !== undefined && dto.leadId !== booking.leadId) {
      if (dto.leadId) {
        const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId } });
        if (!lead) throw new NotFoundException('Lead không tồn tại');
      }
    }

    // ── Đổi unit — chỉ validate sự tồn tại/khoá ở đây; vị trí queue được tính lại
    // bên trong transaction bên dưới để tránh đọc dữ liệu cũ. ───────────────────
    let targetNewUnitId: string | undefined;
    let originalUnitMallId: string | undefined;
    if (dto.unitId !== undefined && dto.unitId !== booking.unitId) {
      const newUnit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
      if (newUnit?.leaseTermType && newUnit.leaseTermType !== 'LONG') {
        throw new BadRequestException('Booking dai han chi ap dung cho mat bang thuoc khu cho thue dai han');
      }
      if (!newUnit || !newUnit.isActive) throw new NotFoundException('Mặt bằng không tồn tại');
      if (this.unitStatus.isLockedForBooking(newUnit.status)) {
        throw new BadRequestException(`Không thể chuyển sang mặt bằng này (trạng thái ${newUnit.status})`);
      }
      // INV-AUTH-006 (CR-101 Phase 3E) — a booking's target unit may be swapped
      // for another unit in the same Mall (e.g. correcting the picked unit),
      // but never silently transplanted to a different Mall than the one it
      // was created under. The MallAccessGuard only proves the caller can
      // access the *new* unit's Mall (which a staff member with grants to
      // multiple Malls legitimately can) — it says nothing about whether that
      // Mall matches this booking's own. That consistency check belongs here.
      const originalUnit = await this.prisma.unit.findUnique({
        where: { id: booking.unitId },
        select: { mallId: true },
      });
      originalUnitMallId = originalUnit?.mallId;
      if (originalUnitMallId && newUnit.mallId !== originalUnitMallId) {
        throw new ForbiddenException(
          'Không thể chuyển booking sang mặt bằng thuộc mall khác',
        );
      }
      targetNewUnitId = dto.unitId;
    }

    // ── Validate giá đề xuất (dùng unit hiện tại hoặc unit mới) — read-only external
    // validation, safe ahead of the transaction/retry loop. ─────────────────────
    const targetUnitId = targetNewUnitId ?? booking.unitId;
    const unit = await this.prisma.unit.findUnique({ where: { id: targetUnitId } });

    let priceApprovalStatus: PriceApprovalStatus | null | undefined = undefined;
    let priceDeviationPercent: number | null | undefined = undefined;
    let pricingRuleId: string | null | undefined = undefined;
    let pricingSnapshot: Prisma.InputJsonValue | undefined;

    // See the currency note on the same guard in create() above -- CategoryPricing now has
    // its own currencyCode; UpdateBookingDto has no currencyCode of its own, so the
    // booking's existing currency is authoritative here.
    if (dto.proposedRentPerSqm !== undefined && unit?.categoryId) {
      if (dto.proposedRentPerSqm !== booking.proposedRentPerSqm || !!targetNewUnitId) {
        const validation = await this.categoriesService.validateProposedPrice({
          mallId: unit.mallId,
          categoryId: unit.categoryId,
          floorId: unit.floorId ?? undefined,
          zoneId: unit.zoneId ?? undefined,
          proposedRentPerSqm: dto.proposedRentPerSqm,
          currencyCode: booking.currencyCode,
        });

        if (validation.requiresApproval) {
          priceApprovalStatus = PriceApprovalStatus.PENDING;
          priceDeviationPercent = validation.deviationPercent;
        } else {
          priceApprovalStatus = null;
          priceDeviationPercent = null;
        }
        pricingRuleId = validation.categoryPricing?.id ?? null;
        pricingSnapshot = {
          evaluatedAt: new Date().toISOString(),
          proposedRentPerSqm: dto.proposedRentPerSqm,
          minRentPerSqm: validation.minRentPerSqm,
          maxRentPerSqm: validation.maxRentPerSqm,
          suggestedRent: validation.categoryPricing?.suggestedRent ?? null,
          camPerSqm: validation.categoryPricing?.camPerSqm ?? null,
          sources: validation.categoryPricing?.sources ?? null,
        };
      }
    }

    return this.runSerializable(async (tx) => {
      let newUnitId: string | undefined;
      let newPriority: number | undefined;
      let newStatus: BookingStatus | undefined;

      if (targetNewUnitId) {
        // Đếm vị trí trong queue của unit mới — tính lại trong transaction, không dùng số
        // đã đọc trước đó, để đóng race giữa 2 request đổi unit cùng lúc.
        const queueCount = await tx.unitBooking.count({
          where: { unitId: targetNewUnitId, status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] }, isActive: true },
        });
        newUnitId = targetNewUnitId;
        newPriority = queueCount + 1;
        newStatus = queueCount === 0 ? BookingStatus.ACTIVE : BookingStatus.PENDING;
      }

      const updated = await tx.unitBooking.update({
        where: { id },
        data: {
          ...(dto.leadId !== undefined && { leadId: dto.leadId || null }),
          ...(newUnitId && { unitId: newUnitId, priority: newPriority, status: newStatus, activatedAt: newStatus === BookingStatus.ACTIVE ? new Date() : undefined }),
          assignedToId: dto.assignedToId,
          requestedArea: dto.requestedArea,
          requestedTerm: dto.requestedTerm,
          budgetRentMin: dto.budgetRentMin,
          budgetRentMax: dto.budgetRentMax,
          expectedRent: dto.expectedRent,
          exchangeRate: dto.exchangeRate,
          proposedRentPerSqm: dto.proposedRentPerSqm,
          proposedCamPerSqm: dto.proposedCamPerSqm,
          serviceFeeSqm: dto.serviceFeeSqm,
          businessSupportFeeSqm: dto.businessSupportFeeSqm,
          ...(priceApprovalStatus !== undefined && { priceApprovalStatus }),
          ...(priceDeviationPercent !== undefined && { priceDeviationPercent }),
          ...(pricingRuleId !== undefined && { pricingRuleId }),
          ...(pricingSnapshot !== undefined && { pricingSnapshot }),
          notes: dto.notes,
        },
        include: this.defaultInclude(),
      });

      // ── Sau khi đổi unit: dọn queue cũ + cập nhật status unit mới ────────────
      if (newUnitId) {
        await this.promoteNextInQueue(booking.unitId, userId, tx);
        if (newStatus === BookingStatus.ACTIVE) {
          await this.unitStatus.transition(newUnitId, UnitStatus.BOOKING, {
            userId,
            reason: `Booking ${id} chuyển sang unit này`,
            expectedMallId: originalUnitMallId,
          }, tx);
        }
      }

      await this.logActivity(id, BookingActivityType.NOTE_ADDED, userId, { note: 'Cập nhật thông tin booking' }, tx);
      return updated;
    });
  }

  // ─── Phê duyệt giá đề xuất ─────────────────────────────────────────────────

  async approvePrice(id: string, dto: ApprovePriceDto, approverId: string) {
    const booking = await this.prisma.unitBooking.findUnique({
      where: { id },
      include: { unit: true },
    });
    if (!booking) throw new NotFoundException('Booking không tồn tại');

    if (booking.priceApprovalStatus !== PriceApprovalStatus.PENDING) {
      throw new BadRequestException('Booking không cần phê duyệt giá hoặc đã được xử lý');
    }

    const updated = await this.prisma.unitBooking.update({
      where: { id },
      data: {
        priceApprovalStatus: PriceApprovalStatus.APPROVED,
        priceApprovalNote: dto.note,
        priceApprovedById: approverId,
        priceApprovedAt: new Date(),
      },
      include: this.defaultInclude(),
    });

    await this.logActivity(id, BookingActivityType.NOTE_ADDED, approverId, {
      note: `Giá đề xuất ${formatMoneyWithCode(booking.proposedRentPerSqm ?? 0, booking.currencyCode)}/m² được phê duyệt${dto.note ? '. ' + dto.note : ''}`,
    });

    return updated;
  }

  async rejectPrice(id: string, dto: RejectPriceDto, approverId: string) {
    const booking = await this.prisma.unitBooking.findUnique({
      where: { id },
      include: { unit: true },
    });
    if (!booking) throw new NotFoundException('Booking không tồn tại');

    if (booking.priceApprovalStatus !== PriceApprovalStatus.PENDING) {
      throw new BadRequestException('Booking không cần phê duyệt giá hoặc đã được xử lý');
    }

    const updated = await this.prisma.unitBooking.update({
      where: { id },
      data: {
        priceApprovalStatus: PriceApprovalStatus.REJECTED,
        priceApprovalNote: dto.reason,
        priceApprovedById: approverId,
        priceApprovedAt: new Date(),
      },
      include: this.defaultInclude(),
    });

    await this.logActivity(id, BookingActivityType.NOTE_ADDED, approverId, {
      note: `Giá đề xuất ${formatMoneyWithCode(booking.proposedRentPerSqm ?? 0, booking.currencyCode)}/m² bị từ chối. Lý do: ${dto.reason}`,
    });

    return updated;
  }

  // ─── Lấy danh sách booking cần phê duyệt giá ──────────────────────────────

  async getBookingsPendingPriceApproval(query: {
    mallId?: string;
    mallIds?: string[];
    leaseTermType?: string;
    page?: number;
    limit?: number;
  }) {
    const mallIds = query.mallId ? [query.mallId] : query.mallIds;
    const p = Math.max(1, parseInt(String(query.page)) || 1);
    const l = Math.max(1, parseInt(String(query.limit)) || 20);
    const skip = (p - 1) * l;

    const where: any = {
      isActive: true,
      priceApprovalStatus: PriceApprovalStatus.PENDING,
      status: { in: [BookingStatus.PENDING, BookingStatus.ACTIVE] },
    };
    if (mallIds || query.leaseTermType) where.unit = {
      ...(mallIds ? { OR: [
        { mallId: { in: mallIds } },
        { floor: { mallId: { in: mallIds } } },
      ] } : {}),
      ...(query.leaseTermType ? { leaseTermType: query.leaseTermType } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.unitBooking.findMany({
        where,
        skip,
        take: l,
        include: {
          ...this.defaultInclude(),
          unit: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              areaGFA: true,
              areaNLA: true,
              category: true,
              leaseTermType: true,
              categoryId: true,
              categoryRef: { select: { id: true, code: true, name: true } },
              baseRentPerSqm: true,
              floor: { select: { id: true, name: true, level: true } },
              zone: { select: { id: true, name: true } },
              mall: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.unitBooking.count({ where }),
    ]);

    // Add pricing info for each booking
    const dataWithPricing = await Promise.all(
      data.map(async (booking) => {
        let categoryPricing = null;
        if (booking.unit.categoryId) {
          categoryPricing = await this.categoriesService.getApplicablePricing({
            mallId: booking.unit.mall.id,
            categoryId: booking.unit.categoryId,
            floorId: booking.unit.floor?.id,
            zoneId: booking.unit.zone?.id,
          });
        }
        return { ...booking, categoryPricing };
      }),
    );

    return { data: dataWithPricing, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  // ─── Gia hạn booking ──────────────────────────────────────────────────────

  async extend(id: string, dto: ExtendBookingDto, userId: string) {
    const booking = await this.requireBooking(id, [BookingStatus.ACTIVE, BookingStatus.PENDING]);

    const currentExpiry = booking.expiresAt ?? new Date();
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + dto.additionalDays);

    const updated = await this.prisma.unitBooking.update({
      where: { id },
      data: { expiresAt: newExpiry, holdDays: booking.holdDays + dto.additionalDays },
      include: this.defaultInclude(),
    });

    await this.logActivity(id, BookingActivityType.EXTENDED, userId, {
      note: dto.reason
        ? `Gia hạn thêm ${dto.additionalDays} ngày. Lý do: ${dto.reason}`
        : `Gia hạn thêm ${dto.additionalDays} ngày`,
      metadata: { additionalDays: dto.additionalDays, newExpiry },
    });
    return updated;
  }

  // ─── Thay đổi priority (kéo thả trong queue) ─────────────────────────────

  async updatePriority(id: string, newPriority: number, userId: string) {
    const booking = await this.requireBooking(id, [BookingStatus.ACTIVE, BookingStatus.PENDING]);
    const oldPriority = booking.priority;
    if (oldPriority === newPriority) return booking;

    // Dịch chuyển các booking khác trong queue
    await this.prisma.$transaction(async (tx) => {
      if (newPriority < oldPriority) {
        // Đẩy lên trên: tăng priority của các booking ở khoảng [newPriority, oldPriority-1]
        await tx.unitBooking.updateMany({
          where: {
            unitId: booking.unitId,
            isActive: true,
            status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
            priority: { gte: newPriority, lt: oldPriority },
            id: { not: id },
          },
          data: { priority: { increment: 1 } },
        });
      } else {
        // Đẩy xuống dưới: giảm priority của các booking ở khoảng [oldPriority+1, newPriority]
        await tx.unitBooking.updateMany({
          where: {
            unitId: booking.unitId,
            isActive: true,
            status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
            priority: { gt: oldPriority, lte: newPriority },
            id: { not: id },
          },
          data: { priority: { decrement: 1 } },
        });
      }

      await tx.unitBooking.update({ where: { id }, data: { priority: newPriority } });
    });

    // Sync trạng thái ACTIVE/PENDING dựa trên priority
    await this.syncQueueStatus(booking.unitId, userId);

    await this.logActivity(id, BookingActivityType.PRIORITY_CHANGED, userId, {
      note: `Thay đổi ưu tiên từ #${oldPriority} → #${newPriority}`,
      metadata: { oldPriority, newPriority },
    });

    return this.findOne(id);
  }

  // ─── Khôi phục booking đã hủy ────────────────────────────────────────────

  /**
   * Phase 6 hardening (docs/program/RELIABILITY_BACKLOG.md item 19): same priority-race and
   * multi-write-atomicity risk as create()/update() — the max-priority read and the update/
   * unit-status/activity writes were unwrapped. Now goes through the same
   * `runSerializable` retry helper.
   */
  async reinstate(id: string, userId: string) {
    const booking = await this.prisma.unitBooking.findUnique({ where: { id } });
    if (!booking || !booking.isActive) throw new NotFoundException('Booking không tồn tại');
    if (booking.status !== BookingStatus.CANCELLED) {
      throw new BadRequestException('Chỉ booking đã hủy mới có thể khôi phục');
    }

    const unit = await this.prisma.unit.findUnique({ where: { id: booking.unitId } });
    if (!unit || !unit.isActive) throw new BadRequestException('Mặt bằng không còn khả dụng');
    if (this.unitStatus.isLockedForBooking(unit.status)) {
      throw new BadRequestException(
        `Không thể khôi phục: mặt bằng đang bị khoá (trạng thái ${unit.status}).`,
      );
    }

    const holdDays = booking.holdDays ?? 30;

    await this.runSerializable(async (tx) => {
      const maxPriority = await tx.unitBooking.aggregate({
        where: {
          unitId: booking.unitId,
          status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
          isActive: true,
        },
        _max: { priority: true },
      });
      const newPriority = (maxPriority._max.priority ?? 0) + 1;
      const newStatus = newPriority === 1 ? BookingStatus.ACTIVE : BookingStatus.PENDING;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + holdDays);

      await tx.unitBooking.update({
        where: { id },
        data: {
          status: newStatus,
          priority: newPriority,
          cancelledAt: null,
          cancelReason: null,
          expiresAt,
          activatedAt: newStatus === BookingStatus.ACTIVE ? new Date() : null,
        },
      });

      if (newStatus === BookingStatus.ACTIVE) {
        await this.unitStatus.transition(booking.unitId, UnitStatus.BOOKING, {
          userId,
          reason: `Booking ${booking.bookingNumber} được khôi phục`,
        }, tx);
      }

      await this.logActivity(id, BookingActivityType.ACTIVATED, userId, {
        note: `Booking được khôi phục. Priority: ${newPriority}`,
      }, tx);
    });

    return this.findOne(id);
  }

  // ─── Hủy booking ──────────────────────────────────────────────────────────

  /**
   * Phase 6 hardening (docs/program/RELIABILITY_BACKLOG.md item 3): status update, activity
   * log, and queue promotion used to be three unwrapped writes — a crash after the status
   * update but before promotion left a CANCELLED booking whose unit stayed reserved with no
   * one promoted to take its place (blocking inventory for no active booking, the exact
   * invariant section 16 names). Also idempotent now: a retry against an already-CANCELLED
   * booking returns the same success message instead of throwing, since requireBooking's
   * allowed-status guard would otherwise reject a network-timeout retry of a cancel that
   * actually succeeded.
   */
  async cancel(id: string, dto: CancelBookingDto, userId: string) {
    const existing = await this.prisma.unitBooking.findUnique({ where: { id } });
    if (!existing || !existing.isActive) throw new NotFoundException('Booking không tồn tại');
    if (existing.status === BookingStatus.CANCELLED) {
      return { message: 'Booking đã được hủy' }; // idempotent replay — safe retry after success
    }
    if (existing.status !== BookingStatus.ACTIVE && existing.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Booking đang ở trạng thái ${existing.status}, không thể thực hiện hành động này`,
      );
    }

    await this.runSerializable(async (tx) => {
      const current = await tx.unitBooking.findUniqueOrThrow({ where: { id } });
      if (current.status === BookingStatus.CANCELLED) return; // idempotent replay (lost race)

      await tx.unitBooking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason,
        },
      });

      await this.logActivity(id, BookingActivityType.CANCELLED, userId, {
        note: dto.reason ? `Hủy booking. Lý do: ${dto.reason}` : 'Hủy booking',
      }, tx);

      // Promote next in queue — only meaningful if this booking held priority 1; harmless
      // no-op otherwise (promoteNextInQueue only acts on the unit's current PENDING queue).
      await this.promoteNextInQueue(existing.unitId, userId, tx);
    });

    return { message: 'Booking đã được hủy' };
  }

  // ─── Chuyển đổi booking → Proposal ───────────────────────────────────────

  async convertToProposal(id: string, dto: ConvertToProposalDto, userId: string) {
    const booking = await this.findOne(id);
    if (booking.status !== BookingStatus.ACTIVE) {
      throw new BadRequestException('Chỉ booking đang ACTIVE mới có thể chuyển thành Proposal');
    }
    if (booking.proposal) {
      throw new ConflictException('Booking này đã được convert thành Proposal');
    }

    // Check if price approval is pending
    if (booking.priceApprovalStatus === PriceApprovalStatus.PENDING) {
      throw new BadRequestException('Giá đề xuất chưa được phê duyệt. Vui lòng chờ phê duyệt hoặc điều chỉnh giá.');
    }
    if (booking.priceApprovalStatus === PriceApprovalStatus.REJECTED) {
      throw new BadRequestException('Giá đề xuất đã bị từ chối. Vui lòng điều chỉnh giá trước khi chuyển thành Proposal.');
    }

    // Trước đây tenantId luôn bị bỏ trống khi convert — nếu booking đến từ Customer (không phải Lead),
    // Proposal tạo ra không gắn được với Tenant/Customer nào, dễ trở thành bản ghi mồ côi. Tenant có
    // thể đã được gán sẵn cho Lead hoặc Customer từ trước (cột tenantId trên cả 2 model) — resolve ra
    // đây, giống cách ProposalsService.create() đang tự suy ra tenantId từ leadId.
    let resolvedTenantId: string | undefined;
    if (booking.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: booking.leadId }, select: { tenantId: true } });
      resolvedTenantId = lead?.tenantId ?? undefined;
    } else if (booking.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: booking.customerId }, select: { tenantId: true } });
      resolvedTenantId = customer?.tenantId ?? undefined;
    }

    const year = new Date().getFullYear();
    const count = await this.prisma.proposal.count({
      where: { proposalNumber: { startsWith: `PROP-${year}-` } },
    });
    const proposalNumber = `PROP-${year}-${String(count + 1).padStart(5, '0')}`;

    const startDate = new Date(dto.startDate);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + dto.term);

    const rentPerSqm = dto.rentPerSqm;
    const camPerSqm = dto.camPerSqm ?? 0;
    const area = dto.area;
    const monthlyRent = rentPerSqm * area;
    const monthlyCAM = camPerSqm * area;
    const depositMonths = dto.deposit ?? 3;
    const depositAmount = monthlyRent * depositMonths;
    const totalContractValue = monthlyRent * dto.term;

    const proposal = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          proposalNumber,
          bookingId: id,
          unitId: booking.unitId,
          leadId: booking.leadId ?? undefined,
          tenantId: resolvedTenantId,
          area,
          term: dto.term,
          startDate,
          endDate,
          rentPerSqm,
          camPerSqm,
          deposit: depositMonths,
          rentFree: dto.rentFree ?? 0,
          escalationPercent: dto.escalationPercent ?? 0,
          pricingRuleId: booking.pricingRuleId ?? undefined,
          pricingSnapshot: booking.pricingSnapshot ?? undefined,
          monthlyRent,
          monthlyCAM,
          depositAmount,
          totalContractValue,
          notes: dto.notes ?? booking.notes ?? undefined,
          businessModel: dto.businessModel,
          // Kế thừa Phí Dịch vụ/Phí HTKD đã đàm phán ở bước Booking nếu người chuyển đổi
          // không ghi đè giá trị khác tại đây.
          serviceFeeSqm: dto.serviceFeeSqm ?? booking.serviceFeeSqm ?? 0,
          businessSupportFeeSqm: dto.businessSupportFeeSqm ?? booking.businessSupportFeeSqm ?? 0,
          // Currency propagation (docs/program/MULTI_CURRENCY_ARCHITECTURE.md): the
          // caller may pick a different currency at conversion time (SNAPSHOT), but
          // absent that, inherit the currency the Booking itself was created with
          // rather than silently resetting to VND.
          rentCurrency: dto.rentCurrency ?? booking.currencyCode ?? 'VND',
          // Tỷ giá tham khảo — tiếp tục mang từ Booking sang Proposal nếu không ghi đè,
          // giữ liên tục cho P.CT TTTM theo dõi xuyên suốt phễu Booking → Proposal.
          exchangeRate: dto.exchangeRate ?? booking.exchangeRate ?? undefined,
          fitoutDays: dto.fitoutDays ?? 90,
          handoverDate: dto.handoverDate ? new Date(dto.handoverDate) : undefined,
          openingDate: dto.openingDate ? new Date(dto.openingDate) : undefined,
          specialConditions: dto.specialConditions,
          // GAP #91–94
          utilityFee: dto.utilityFee ?? 0,
          operatingHours: dto.operatingHours,
          afterHoursFee: dto.afterHoursFee ?? 0,
          paymentTermDays: dto.paymentTermDays ?? 30,
          // GAP #41
          depositLease: dto.depositLease,
          depositFitout: dto.depositFitout ?? 0,
          fitoutFee: dto.fitoutFee ?? 0,
          createdById: userId,
        },
      });

      await tx.unitBooking.update({
        where: { id },
        data: {
          status: BookingStatus.CONVERTED,
          convertedAt: new Date(),
        },
      });

      // Update lead status → PROPOSAL
      if (booking.leadId) {
        await tx.lead.update({
          where: { id: booking.leadId },
          data: { status: LeadStatus.PROPOSAL },
        });
      }

      return proposal;
    });

    await this.logActivity(id, BookingActivityType.CONVERTED, userId, {
      note: `Converted thành Proposal ${proposalNumber}`,
      metadata: { proposalId: proposal.id, proposalNumber },
    });

    // Notify others in queue
    await this.notifyQueueOnConversion(booking.unitId, id);

    return { booking: await this.findOne(id), proposal };
  }

  // ─── Expire bookings hết hạn (gọi từ cron job) ───────────────────────────

  /**
   * Phase 6 hardening (docs/program/RELIABILITY_BACKLOG.md item 20, section 37-38 of the
   * phase brief — the "expiry vs confirm" race). Runs from `BookingScheduler`'s hourly cron
   * (distributed lock already correct, unchanged). The per-booking loop used to do 3
   * unwrapped writes with no re-check — if a user confirmed/updated/cancelled the same
   * booking in the window between this job's initial fetch and its per-booking write, the
   * job could still force it to EXPIRED against now-stale assumptions. Each booking's expiry
   * now re-checks its current state inside a Serializable transaction before acting; if it's
   * no longer an eligible candidate (someone else already changed it), it's skipped rather
   * than blindly overwritten.
   */
  async expireOverdueBookings() {
    const now = new Date();
    const expired = await this.prisma.unitBooking.findMany({
      where: {
        status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
        expiresAt: { lt: now },
        isActive: true,
      },
    });

    let expiredCount = 0;
    for (const booking of expired) {
      try {
        await this.runSerializable(async (tx) => {
          const current = await tx.unitBooking.findUniqueOrThrow({ where: { id: booking.id } });
          if (
            (current.status !== BookingStatus.ACTIVE && current.status !== BookingStatus.PENDING) ||
            !current.expiresAt ||
            current.expiresAt >= now
          ) {
            return; // no longer eligible — someone else already acted on it
          }

          await tx.unitBooking.update({
            where: { id: booking.id },
            data: { status: BookingStatus.EXPIRED },
          });
          await this.logActivity(booking.id, BookingActivityType.EXPIRED, booking.createdById, {
            note: 'Booking tự động hết hạn',
          }, tx);
          await this.promoteNextInQueue(booking.unitId, booking.createdById, tx);
          expiredCount++;
        });
      } catch (error: any) {
        // One booking's failure must not abort the batch for every other overdue booking —
        // same batch-resilience principle as generateDueInvoices (Backbone Consolidation
        // Gate finding D).
        this.logger.warn(`expireOverdueBookings: skipping booking ${booking.id}: ${error?.message ?? error}`);
      }
    }

    return { expiredCount };
  }

  // ─── Stats tổng hợp ───────────────────────────────────────────────────────

  async getStats(mallId?: string, allowedMallIds?: string[]) {
    const where: any = { isActive: true };
    const mallIds = mallId ? [mallId] : allowedMallIds;
    if (mallIds) where.unit = {
      OR: [
        { mallId: { in: mallIds } },
        { floor: { mallId: { in: mallIds } } },
      ],
    };

    const [total, active, pending, expiringSoon, converted] = await Promise.all([
      this.prisma.unitBooking.count({ where }),
      this.prisma.unitBooking.count({ where: { ...where, status: BookingStatus.ACTIVE } }),
      this.prisma.unitBooking.count({ where: { ...where, status: BookingStatus.PENDING } }),
      this.prisma.unitBooking.count({
        where: {
          ...where,
          status: BookingStatus.ACTIVE,
          expiresAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.unitBooking.count({ where: { ...where, status: BookingStatus.CONVERTED } }),
    ]);

    return { total, active, pending, expiringSoon, converted };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async requireBooking(id: string, allowedStatuses: BookingStatus[]) {
    const booking = await this.prisma.unitBooking.findUnique({ where: { id } });
    if (!booking || !booking.isActive) throw new NotFoundException('Booking không tồn tại');
    if (!allowedStatuses.includes(booking.status)) {
      throw new BadRequestException(
        `Booking đang ở trạng thái ${booking.status}, không thể thực hiện hành động này`,
      );
    }
    return booking;
  }

  /**
   * Phase 6 (docs/program/RELIABILITY_BACKLOG.md items 1-3): shared Serializable-transaction
   * + retry helper for Booking's queue-position races (create, unit-change on update, cancel
   * promoting the next in queue). A losing transaction under Serializable isolation fails
   * with Postgres error P2034 ("could not serialize access") — retried up to `maxAttempts`
   * times so the loser's request re-evaluates against fresh data instead of erroring out for
   * what is, from the caller's point of view, a normal concurrent booking action, not a bug.
   */
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: any) {
        if (error?.code === 'P2034' && attempt < maxAttempts - 1) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async logActivity(
    bookingId: string,
    type: BookingActivityType,
    performedById: string,
    opts: { note: string; metadata?: any },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await db.bookingActivity.create({
      data: {
        bookingId,
        type,
        note: opts.note,
        metadata: opts.metadata ?? undefined,
        performedById,
      },
    });
  }

  // Khi priority 1 bị cancel/expire → promote booking priority 2 lên thành ACTIVE
  private async promoteNextInQueue(
    unitId: string,
    promotedById: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const next = await db.unitBooking.findFirst({
      where: {
        unitId,
        status: BookingStatus.PENDING,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    if (next) {
      await db.unitBooking.update({
        where: { id: next.id },
        data: {
          status: BookingStatus.ACTIVE,
          priority: 1,
          activatedAt: new Date(),
        },
      });
      // Đảm bảo unit vẫn BOOKING
      await this.unitStatus.transition(unitId, UnitStatus.BOOKING, {
        userId: promotedById,
        reason: 'Next booking promoted to priority 1',
      }, db);
      await this.logActivity(next.id, BookingActivityType.ACTIVATED, promotedById, {
        note: 'Tự động kích hoạt do booking ưu tiên cao hơn bị hủy/hết hạn',
      }, db);
      await this.logActivity(next.id, BookingActivityType.PRIORITY_CHANGED, promotedById, {
        note: 'Lên ưu tiên #1',
        metadata: { newPriority: 1 },
      }, db);
    } else {
      // Không còn ai trong queue → unit trở lại VACANT
      await this.unitStatus.transition(unitId, UnitStatus.VACANT, {
        userId: promotedById,
        reason: 'Booking queue empty',
      }, db);
    }
  }

  private async syncQueueStatus(unitId: string, userId: string) {
    const queue = await this.prisma.unitBooking.findMany({
      where: {
        unitId,
        status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    for (const [index, booking] of queue.entries()) {
      const expectedStatus = index === 0 ? BookingStatus.ACTIVE : BookingStatus.PENDING;
      if (booking.status !== expectedStatus) {
        await this.prisma.unitBooking.update({
          where: { id: booking.id },
          data: {
            status: expectedStatus,
            activatedAt: expectedStatus === BookingStatus.ACTIVE ? new Date() : undefined,
          },
        });
      }
    }
  }

  private async notifyQueueOnConversion(unitId: string, convertedBookingId: string) {
    // Placeholder: khi có notification service thì gửi thông báo cho các booking còn lại trong queue
    const remaining = await this.prisma.unitBooking.findMany({
      where: {
        unitId,
        isActive: true,
        status: { in: [BookingStatus.PENDING] },
        id: { not: convertedBookingId },
      },
    });
    // TODO: gửi notification cho assignedTo của từng booking còn lại
    return remaining;
  }

  private defaultInclude() {
    return {
      unit: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          areaGFA: true,
          areaNLA: true,
          category: true,
          baseRentPerSqm: true,
          camPerSqm: true,
          // Without this the Unit's own rent figures reach the UI stripped of
          // their currency, so a USD-quoted unit renders as VND.
          currencyCode: true,
          askingRentPerSqm: true,
          escalationRate: true,
          minLeaseTerm: true,
          maxLeaseTerm: true,
          spaceType: true,
          floor: { select: { id: true, name: true, level: true } },
          mall: { select: { id: true, name: true, code: true, leaseCategory: true } },
        },
      },
      lead: { select: { id: true, brandName: true, contactName: true, company: true, phone: true, email: true, category: true, notes: true, status: true, priority: true, source: true, assignedToId: true, expectedArea: true, expectedRent: true } },
      customer: { select: { id: true, customerCode: true, companyName: true, brandName: true, status: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      assignedTo: { select: { id: true, fullName: true, email: true } },
    };
  }

  // ─── Soft delete booking (Admin có thể xóa bất kỳ, người khác chỉ xóa CANCELLED/EXPIRED) ────

  async softDelete(id: string, user?: any) {
    const booking = await this.prisma.unitBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking không tồn tại');

    // Admin có thể xóa bất kỳ booking nào, người khác chỉ xóa CANCELLED hoặc EXPIRED
    const isAdmin = user?.role === 'ADMIN';
    if (!isAdmin && booking.status !== BookingStatus.CANCELLED && booking.status !== BookingStatus.EXPIRED) {
      throw new BadRequestException('Chỉ có thể xóa booking đã hủy hoặc hết hạn');
    }

    await this.prisma.unitBooking.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Booking đã được xóa' };
  }
}
