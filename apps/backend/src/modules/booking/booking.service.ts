import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BookingStatus, BookingActivityType, LeadStatus, UnitStatus, PriceApprovalStatus,
  StepStatus, Role, CurrencyCode, Prisma, CrmEventSourceModule,
} from '@prisma/client';
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
import { computeContractValue } from '../../common/finance/rent-calculation.util';
import { PriceApprovalPolicyService } from '../approvals/price-approval-policy.service';
import type { PricingDecision } from '../approvals/pricing-decision.types';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { LeadLifecycleService } from '../crm/lead-lifecycle.service';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private unitStatus: UnitStatusService,
    private priceApprovalPolicy: PriceApprovalPolicyService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private leadLifecycle: LeadLifecycleService,
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
    // CR-BOOK-PRICE-APPROVAL-001 -- Pricing Policy Evaluation. One call now
    // answers the deviation, whether approval is required, which pricing rule
    // decided it, and WHICH APPROVERS the Mall's policy names. Previously the
    // approver chain did not exist at all: the level was computed inside
    // validateProposedPrice and discarded, leaving a flat PENDING flag nobody
    // was routed to.
    //
    // CategoryPricing carries its own currencyCode, so a USD/MMK booking is
    // checked against a same-currency band where one exists and otherwise falls
    // through to the "no pricing rule configured" escalation path.
    const priceEvaluation = dto.proposedRentPerSqm !== undefined
      ? await this.priceApprovalPolicy.evaluate({
          mallId: unit.mallId,
          categoryId: unit.categoryId,
          floorId: unit.floorId,
          zoneId: unit.zoneId,
          proposedRentPerSqm: dto.proposedRentPerSqm,
          currencyCode: dto.currencyCode,
          // Fallback reference when the category has no band of its own.
          unitBaseRentPerSqm: unit.baseRentPerSqm,
          unitCurrencyCode: unit.currencyCode,
        })
      : null;

    // CR-...-ALWAYS-WARN-004: a blocking decision is refused outright. Nothing
    // can be routed safely, so no acknowledgement makes the write acceptable.
    this.assertDecisionIsWritable(priceEvaluation);
    this.assertAcknowledgedDecisionStillHolds(priceEvaluation, (dto as any).acknowledgedPricingFingerprint);

    const priceApprovalStatus = this.statusFromDecision(priceEvaluation);
    const priceDeviationPercent = priceEvaluation?.deviationPercent ?? null;
    const pricingRuleId = priceEvaluation?.categoryPricingId ?? null;
    const pricingSnapshot = priceEvaluation
      ? this.priceApprovalPolicy.snapshotOf(priceEvaluation)
      : undefined;

    const created = await this.runSerializable(async (tx) => {
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
          // Separation of duties: remember who put this number on the booking.
          ...(priceEvaluation ? { priceProposedById: createdById, priceProposedAt: new Date() } : {}),
          ...(priceEvaluation?.approval.steps.length
            ? { priceApprovalSteps: { create: priceEvaluation.approval.steps.map((step) => ({
                stepOrder: step.stepOrder,
                stepName: step.stepName,
                approverRole: step.approverRole,
                approverId: step.approverId,
                policyRuleCode: step.policyRuleCode,
              })) } }
            : {}),
          holdDays,
          expiresAt,
          activatedAt: priority === 1 ? new Date() : null,
          notes: dto.notes,
          createdById,
          assignedToId: dto.assignedToId ?? createdById,
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
        await this.leadLifecycle.transition({
          leadId: dto.leadId,
          targetStatus: LeadStatus.PROPOSAL,
          actor: LeadLifecycleService.userActor(createdById),
          sourceModule: CrmEventSourceModule.BOOKING,
          sourceEntityType: 'UNIT_BOOKING',
          sourceEntityId: booking.id,
          occurredAt: booking.createdAt,
          idempotencyKey: `booking-created:${booking.id}:lead:${dto.leadId}`,
        }, tx);
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

    // CR-BOOK-PRICE-APPROVAL-001 — tell the approver, after the commit. Until
    // now nothing was sent at all: a price could sit PENDING indefinitely and
    // the only way to find out was to open the queue and look.
    if (created.priceApprovalStatus === PriceApprovalStatus.PENDING) {
      await this.notifyPriceApprovalPending(created.id);
    }

    return created;
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
  async update(id: string, dto: UpdateBookingDto, userId: string, userRole?: string) {
    const booking = await this.requireBooking(id, [BookingStatus.ACTIVE, BookingStatus.PENDING]);

    // Chỉ người tạo hoặc ADMIN được sửa — người khác dù có quyền truy cập mall
    // cũng không được thao tác trên booking không phải của mình.
    if (userRole !== 'ADMIN' && booking.createdById !== userId) {
      throw new ForbiddenException('Chỉ người tạo booking hoặc Admin mới được chỉnh sửa');
    }

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

    // CR-BOOK-PRICE-APPROVAL-001 — re-evaluate through the same policy service
    // as create(). A changed price invalidates any decision already made on the
    // old figure, so the chain is rebuilt from scratch below.
    let priceEvaluation: PricingDecision | null = null;
    let priceApprovalTouched = false;

    if (dto.proposedRentPerSqm !== undefined && unit) {
      if (dto.proposedRentPerSqm !== booking.proposedRentPerSqm || !!targetNewUnitId) {
        priceEvaluation = await this.priceApprovalPolicy.evaluate({
          mallId: unit.mallId,
          categoryId: unit.categoryId,
          floorId: unit.floorId,
          zoneId: unit.zoneId,
          proposedRentPerSqm: dto.proposedRentPerSqm,
          currencyCode: booking.currencyCode,
          unitBaseRentPerSqm: unit.baseRentPerSqm,
          unitCurrencyCode: unit.currencyCode,
        });
        priceApprovalTouched = true;
      }
    }

    this.assertDecisionIsWritable(priceEvaluation);
    this.assertAcknowledgedDecisionStillHolds(priceEvaluation, (dto as any).acknowledgedPricingFingerprint);

    const priceApprovalStatus = priceApprovalTouched
      ? this.statusFromDecision(priceEvaluation)
      : undefined;
    const priceDeviationPercent = priceApprovalTouched
      ? (priceEvaluation?.deviationPercent ?? null)
      : undefined;
    const pricingRuleId = priceApprovalTouched ? (priceEvaluation?.categoryPricingId ?? null) : undefined;
    const pricingSnapshot = priceApprovalTouched && priceEvaluation
      ? this.priceApprovalPolicy.snapshotOf(priceEvaluation)
      : undefined;

    const result = await this.runSerializable(async (tx) => {
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
          // A re-priced booking carries a NEW decision. The previous approver,
          // note and timestamp described a figure that no longer exists and are
          // cleared rather than left to look like a sign-off on the new one.
          ...(priceApprovalTouched && {
            priceProposedById: userId,
            priceProposedAt: new Date(),
            priceApprovedById: null,
            priceApprovedAt: null,
            priceApprovalNote: null,
          }),
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

      if (priceApprovalTouched) {
        await this.replacePriceApproval(tx, id, priceEvaluation);
      }

      await this.logActivity(id, BookingActivityType.NOTE_ADDED, userId, { note: 'Cập nhật thông tin booking' }, tx);
      return updated;
    });

    // A re-priced booking starts a NEW chain, so its first approver has to hear
    // about it the same way a freshly created one does.
    if (priceApprovalTouched && result.priceApprovalStatus === PriceApprovalStatus.PENDING) {
      await this.notifyPriceApprovalPending(id);
    }

    return result;
  }

  /**
   * CR-...-ALWAYS-WARN-004: evaluate a price WITHOUT writing anything, so the
   * user reads the decision before they commit to it rather than discovering it
   * from the state of a booking that already exists.
   *
   * The unit is read live, so a preview cannot be taken against a unit the
   * caller merely remembers.
   */
  async previewPricingDecision(
    input: { unitId: string; proposedRentPerSqm: number; currencyCode?: CurrencyCode },
    viewer: { role: Role },
  ): Promise<PricingDecision> {
    const unit = await this.prisma.unit.findUnique({ where: { id: input.unitId } });
    if (!unit) throw new NotFoundException('Unit không tồn tại');

    return this.priceApprovalPolicy.evaluate({
      mallId: unit.mallId,
      categoryId: unit.categoryId,
      floorId: unit.floorId,
      zoneId: unit.zoneId,
      proposedRentPerSqm: input.proposedRentPerSqm,
      currencyCode: input.currencyCode,
      unitBaseRentPerSqm: unit.baseRentPerSqm,
      unitCurrencyCode: unit.currencyCode,
      // Only roles that can act on the queue are shown who signs.
      includeApproverNames: ([Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.CEO] as Role[]).includes(
        viewer.role,
      ),
    });
  }

  /**
   * Conversion is allowed only on a price that was measured and cleared.
   *
   * The stored status alone cannot distinguish "no reference existed" from
   * "reference was in another currency" -- both are NULL -- so the reason comes
   * from the persisted decision snapshot, which is the same evidence the user
   * was shown at creation time.
   */
  private assertPriceCleared(booking: {
    priceApprovalStatus: PriceApprovalStatus | null;
    proposedRentPerSqm: number | null;
    pricingSnapshot: Prisma.JsonValue | null;
  }) {
    if (booking.priceApprovalStatus === PriceApprovalStatus.APPROVED) return;
    if (booking.priceApprovalStatus === PriceApprovalStatus.NOT_REQUIRED) return;

    if (booking.priceApprovalStatus === PriceApprovalStatus.REJECTED) {
      throw new BadRequestException(
        'Giá đề xuất đã bị từ chối. Vui lòng điều chỉnh giá trước khi chuyển thành Proposal.',
      );
    }

    const snapshotStatus =
      booking.pricingSnapshot && typeof booking.pricingSnapshot === 'object'
        ? (booking.pricingSnapshot as Record<string, unknown>).status
        : null;

    if (booking.priceApprovalStatus === PriceApprovalStatus.PENDING) {
      if (snapshotStatus === 'POLICY_NOT_CONFIGURED') {
        throw new BadRequestException(
          'Chưa cấu hình quy trình duyệt giá cho Booking này. Booking đã được lưu, nhưng chưa thể ' +
            'hoàn tất phê duyệt để tiếp tục sang Proposal cho đến khi quy trình được cấu hình.',
        );
      }
      throw new BadRequestException(
        'Giá đề xuất chưa được phê duyệt. Vui lòng chờ phê duyệt hoặc điều chỉnh giá.',
      );
    }

    // No verdict at all. A booking that never proposed a rate is fine: the
    // Proposal carries its own rentPerSqm and runs its own check at submit.
    if (booking.proposedRentPerSqm == null) return;

    if (snapshotStatus === 'CURRENCY_MISMATCH') {
      throw new BadRequestException(
        'Không thể đối chiếu giá: đơn vị tiền tệ của Booking không khớp với nguồn giá tham chiếu. ' +
          'Hệ thống không quy đổi tự động, nên giá chưa được thẩm định để chuyển thành Proposal.',
      );
    }
    if (snapshotStatus === 'POLICY_AMBIGUOUS') {
      throw new BadRequestException(
        'Cấu hình quy trình duyệt giá chưa hợp lệ nên giá chưa được thẩm định. ' +
          'Vui lòng kiểm tra cấu hình quy trình phê duyệt.',
      );
    }
    throw new BadRequestException(
      'Chưa có giá tham chiếu để thẩm định mức giá đề xuất — ngành hàng chưa khai báo khung giá và ' +
        'mặt bằng chưa có giá thuê cơ bản. Vui lòng bổ sung một trong hai trước khi chuyển thành Proposal.',
    );
  }

  // ─── CR-BOOK-PRICE-APPROVAL-001 — price approval workflow ─────────────────

  /**
   * Map a policy evaluation onto the stored status.
   *
   * NULL is reserved for "not evaluated": no price was proposed, or the unit
   * carries no category so no band exists. NOT_REQUIRED means the policy ran
   * and the price is inside the band. Conversion accepts APPROVED and
   * NOT_REQUIRED — never NULL, which would be an unchecked price.
   */
  /**
   * Map a pricing decision onto the stored approval status.
   *
   * NULL is reserved for "no verdict": the price could not be measured at all
   * (no reference, or a currency the reference is not quoted in). It is NOT the
   * same as NOT_REQUIRED, and the conversion gate treats them differently --
   * conflating them is what previously let an unchecked price through.
   */
  private statusFromDecision(decision: PricingDecision | null): PriceApprovalStatus | null {
    if (!decision) return null;
    switch (decision.status) {
      case 'NOT_REQUIRED':
        return PriceApprovalStatus.NOT_REQUIRED;
      case 'ROUTED':
      // Held with no approver rather than waved through. The booking is saved;
      // it simply cannot complete approval until the Mall configures a rule.
      case 'POLICY_NOT_CONFIGURED':
        return PriceApprovalStatus.PENDING;
      case 'PRICING_REFERENCE_MISSING':
      case 'CURRENCY_MISMATCH':
      case 'POLICY_AMBIGUOUS':
        return null;
    }
  }

  /** A blocking decision may not be written under any acknowledgement. */
  private assertDecisionIsWritable(decision: PricingDecision | null) {
    if (decision?.blocking) {
      throw new BadRequestException(decision.message);
    }
  }

  /**
   * CR-...-ALWAYS-WARN-004 (TOCTOU). A preview is not authorization. The server
   * re-evaluates on every write; if the decision the client acknowledged is no
   * longer the one that applies -- the band moved, a policy rule was edited,
   * the unit changed -- the write is refused and the new decision is handed
   * back so the user re-reads it rather than submitting under a workflow they
   * never saw.
   */
  private assertAcknowledgedDecisionStillHolds(
    decision: PricingDecision | null,
    acknowledgedFingerprint: string | undefined,
  ) {
    if (!acknowledgedFingerprint || !decision) return;
    if (acknowledgedFingerprint === decision.fingerprint) return;
    throw new ConflictException({
      message:
        'Thông tin giá hoặc quy trình phê duyệt đã thay đổi. Vui lòng kiểm tra lại trước khi xác nhận.',
      code: 'PRICING_DECISION_CHANGED',
      pricingDecision: decision,
    });
  }

  /** The step awaiting a decision: lowest order still PENDING. Steps are sequential. */
  private currentPriceStep<T extends { stepOrder: number; status: StepStatus }>(steps: T[]): T | undefined {
    return [...steps]
      .filter((step) => step.status === StepStatus.PENDING)
      .sort((a, b) => a.stepOrder - b.stepOrder)[0];
  }

  /**
   * Separation of duties. The person who proposed the rate cannot sign it off,
   * and neither can the person who opened the booking.
   *
   * This holds for ADMIN too. An ADMIN bypass would defeat the control on the
   * exact account most likely to hold both roles in a small team; the fix for a
   * one-person mall is a second approver account, not a weaker rule.
   */
  private assertSeparationOfDuties(
    booking: { priceProposedById: string | null; createdById: string },
    approverId: string,
  ) {
    if (booking.priceProposedById === approverId) {
      throw new ForbiddenException(
        'Bạn là người đề xuất mức giá này nên không thể tự phê duyệt (phân tách trách nhiệm).',
      );
    }
    if (booking.createdById === approverId) {
      throw new ForbiddenException(
        'Bạn là người tạo booking này nên không thể tự phê duyệt giá (phân tách trách nhiệm).',
      );
    }
  }

  /**
   * Re-run the policy for a price that changed, replacing any chain still in
   * flight. A new number is a new decision: earlier sign-offs approved a figure
   * that no longer exists, so they are discarded rather than carried over.
   */
  private async replacePriceApproval(
    tx: Prisma.TransactionClient,
    bookingId: string,
    decision: PricingDecision | null,
  ) {
    await tx.bookingPriceApprovalStep.deleteMany({ where: { bookingId } });
    if (decision?.approval.required && decision.approval.steps.length > 0) {
      await tx.bookingPriceApprovalStep.createMany({
        data: decision.approval.steps.map((step) => ({
          bookingId,
          stepOrder: step.stepOrder,
          stepName: step.stepName,
          approverRole: step.approverRole,
          approverId: step.approverId,
          policyRuleCode: step.policyRuleCode,
        })),
      });
    }
  }

  /**
   * Tell the approver a price is waiting, in-app and by email.
   *
   * Runs AFTER the transaction commits: a notification for a booking that was
   * rolled back is worse than a late one. Failures are logged, never rethrown —
   * a mail outage must not fail the booking write that already succeeded.
   */
  private async notifyPriceApprovalPending(bookingId: string) {
    const booking = await this.prisma.unitBooking.findUnique({
      where: { id: bookingId },
      include: {
        unit: { select: { code: true, mallId: true, mall: { select: { name: true } } } },
        lead: { select: { brandName: true } },
        customer: { select: { companyName: true } },
        priceProposedBy: { select: { fullName: true } },
        priceApprovalSteps: {
          where: { status: StepStatus.PENDING },
          orderBy: { stepOrder: 'asc' },
          include: { approver: { select: { id: true, email: true, fullName: true } } },
        },
      },
    });
    if (!booking) return;

    const step = booking.priceApprovalSteps?.[0];
    if (!step) return; // unrouted — nobody to tell; the queue surfaces it instead

    const party = booking.lead?.brandName ?? booking.customer?.companyName ?? '—';
    const amount = formatMoneyWithCode(booking.proposedRentPerSqm ?? 0, booking.currencyCode);
    const deviation = booking.priceDeviationPercent ?? 0;

    try {
      await this.notifications.create({
        userId: step.approver.id,
        title: `Duyệt giá: ${booking.bookingNumber}`,
        body: `${step.stepName} — ${party} / ${booking.unit.code}: ${amount}/m² (lệch ${deviation.toFixed(1)}% so với khung giá)`,
        type: 'PRICE_APPROVAL_PENDING',
        entityType: 'BOOKING',
        entityId: booking.id,
      });
    } catch (e: any) {
      this.logger.warn(`Price approval notification failed for ${step.approverId}: ${e.message}`);
    }

    if (!step.approver?.email) return;
    try {
      await this.emailService.sendMail({
        to: step.approver.email,
        delivery: {
          // Keyed on the step and its approver, so a retry cannot double-send
          // while a new chain (new price) or a new position holder gets its own key.
          eventKey: `booking-price-approval:${booking.id}:${step.id}:${step.approverId}`,
          eventType: 'BOOKING_PRICE_APPROVAL',
          entityType: 'UnitBooking',
          entityId: booking.id,
          mallId: booking.unit.mallId,
        },
        subject: `[THISO] Booking ${booking.bookingNumber} chờ duyệt giá`,
        html: this.emailService.bookingPriceApprovalHtml({
          approverName: step.approver.fullName,
          stepName: step.stepName,
          bookingNumber: booking.bookingNumber,
          bookingId: booking.id,
          partyName: party,
          unitCode: booking.unit.code,
          mallName: booking.unit.mall?.name ?? '—',
          proposedRentPerSqm: booking.proposedRentPerSqm ?? 0,
          deviationPercent: deviation,
          currencyCode: booking.currencyCode,
          proposedBy: booking.priceProposedBy?.fullName ?? 'Leasing',
          snapshot: booking.pricingSnapshot as Record<string, unknown> | null,
        }),
      });
    } catch (e: any) {
      this.logger.warn(`Price approval email failed for ${step.approverId}: ${e.message}`);
    }
  }

  /**
   * The approval position holder changed and the current price step moved to
   * the new holder (ApprovalPositionService.assignHolder, via the outbox).
   */
  @OnEvent('booking.price-approval.reassigned', { suppressErrors: false })
  async onPriceApprovalReassigned(payload: { bookingId: string }) {
    await this.notifyPriceApprovalPending(payload.bookingId);
  }

  /** Tell the proposer what happened to the price they submitted. */
  private async notifyPriceDecision(bookingId: string, approved: boolean, note?: string) {
    const booking = await this.prisma.unitBooking.findUnique({
      where: { id: bookingId },
      include: { unit: { select: { code: true } } },
    });
    if (!booking?.priceProposedById) return;

    const amount = formatMoneyWithCode(booking.proposedRentPerSqm ?? 0, booking.currencyCode);
    try {
      await this.notifications.create({
        userId: booking.priceProposedById,
        title: approved
          ? `Giá đã được duyệt: ${booking.bookingNumber}`
          : `Giá bị từ chối: ${booking.bookingNumber}`,
        body: `${booking.unit.code} — ${amount}/m²${note ? '. ' + note : ''}`,
        type: approved ? 'PRICE_APPROVAL_APPROVED' : 'PRICE_APPROVAL_REJECTED',
        entityType: 'BOOKING',
        entityId: booking.id,
      });
    } catch (e: any) {
      this.logger.warn(`Price decision notification failed: ${e.message}`);
    }
  }

  // ─── Phê duyệt giá đề xuất ─────────────────────────────────────────────────

  /**
   * Resolve the booking and the step this user is allowed to decide.
   *
   * Authority comes from the policy-resolved step, not from the caller's role
   * alone: a Mall Director cannot sign off a deviation the policy routed to the
   * CEO. Before this, approve/reject carried no role restriction whatsoever, so
   * the Leasing Executive who created the booking could approve their own
   * price, while the CEO the rules kept naming was not even a member of the
   * bookings module and got a 403.
   */
  private async loadPriceDecisionContext(bookingId: string, approver: { id: string; role: Role }) {
    const booking = await this.prisma.unitBooking.findUnique({
      where: { id: bookingId },
      include: {
        unit: true,
        priceApprovalSteps: { orderBy: { stepOrder: 'asc' } },
      },
    });
    if (!booking) throw new NotFoundException('Booking không tồn tại');

    if (booking.priceApprovalStatus !== PriceApprovalStatus.PENDING) {
      throw new BadRequestException('Booking không cần phê duyệt giá hoặc đã được xử lý');
    }

    this.assertSeparationOfDuties(booking, approver.id);

    const step = this.currentPriceStep(booking.priceApprovalSteps);

    if (!step) {
      // Unrouted: the deviation needed approval but the Mall has no matching
      // active price policy rule. The booking is still held. Only an ADMIN can
      // clear it, and the right fix is to configure the policy.
      if (approver.role !== Role.ADMIN) {
        throw new ForbiddenException(
          'Mall chưa cấu hình quy tắc duyệt giá (ApprovalPolicyRule) cho mức lệch này. ' +
            'Vui lòng khai báo chính sách trong Quản trị › Chính sách duyệt, hoặc nhờ Admin xử lý.',
        );
      }
      return { booking, step: null };
    }

    if (step.approverId !== approver.id && approver.role !== Role.ADMIN) {
      throw new ForbiddenException(
        `Bước duyệt hiện tại là "${step.stepName}" và đã được chỉ định cho người khác.`,
      );
    }

    return { booking, step };
  }

  async approvePrice(id: string, dto: ApprovePriceDto, approver: { id: string; role: Role }) {
    const { booking, step } = await this.loadPriceDecisionContext(id, approver);

    const remaining = booking.priceApprovalSteps.filter(
      (candidate) => candidate.status === StepStatus.PENDING && candidate.id !== step?.id,
    );
    const isFinal = remaining.length === 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (step) {
        // Claim the step with a CONDITIONAL write. An unconditional update lets
        // two concurrent decisions on the same step both succeed: the second
        // overwrites the first, the requester gets two notifications, and an
        // approve racing a reject leaves the booking verdict contradicting the
        // step that produced it.
        const claimed = await tx.bookingPriceApprovalStep.updateMany({
          where: { id: step.id, status: StepStatus.PENDING },
          data: {
            status: StepStatus.APPROVED,
            comment: dto.note,
            decidedAt: new Date(),
            decidedById: approver.id,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Bước duyệt này vừa được xử lý bởi một thao tác khác. Vui lòng tải lại và kiểm tra kết quả.',
          );
        }
      } else {
        // Unrouted ADMIN remediation has no step to claim, so the booking row
        // itself is the guard.
        const claimedBooking = await tx.unitBooking.updateMany({
          where: { id, priceApprovalStatus: PriceApprovalStatus.PENDING },
          data: { priceApprovalNote: dto.note ?? null },
        });
        if (claimedBooking.count !== 1) {
          throw new ConflictException('Giá của booking này vừa được xử lý bởi một thao tác khác.');
        }
      }

      // Only the LAST step flips the booking. An intermediate sign-off leaves
      // the price PENDING so the chain cannot be short-circuited.
      return tx.unitBooking.update({
        where: { id },
        data: isFinal
          ? {
              priceApprovalStatus: PriceApprovalStatus.APPROVED,
              priceApprovalNote: dto.note,
              priceApprovedById: approver.id,
              priceApprovedAt: new Date(),
            }
          : { priceApprovalNote: dto.note },
        include: this.defaultInclude(),
      });
    });

    const stepLabel = step ? `${step.stepName} (bước ${step.stepOrder})` : 'Admin (chưa có chính sách)';
    await this.logActivity(id, BookingActivityType.NOTE_ADDED, approver.id, {
      note:
        `Giá đề xuất ${formatMoneyWithCode(booking.proposedRentPerSqm ?? 0, booking.currencyCode)}/m² ` +
        `được duyệt tại ${stepLabel}` +
        (isFinal ? ' — hoàn tất phê duyệt giá' : ` — còn ${remaining.length} bước`) +
        (dto.note ? '. ' + dto.note : ''),
    });

    if (isFinal) {
      await this.notifyPriceDecision(id, true, dto.note);
    } else {
      // Hand the baton to the next approver in the chain.
      await this.notifyPriceApprovalPending(id);
    }

    return updated;
  }

  async rejectPrice(id: string, dto: RejectPriceDto, approver: { id: string; role: Role }) {
    const { booking, step } = await this.loadPriceDecisionContext(id, approver);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (step) {
        const claimed = await tx.bookingPriceApprovalStep.updateMany({
          where: { id: step.id, status: StepStatus.PENDING },
          data: {
            status: StepStatus.REJECTED,
            comment: dto.reason,
            decidedAt: new Date(),
            decidedById: approver.id,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Bước duyệt này vừa được xử lý bởi một thao tác khác. Vui lòng tải lại và kiểm tra kết quả.',
          );
        }
      } else {
        const claimedBooking = await tx.unitBooking.updateMany({
          where: { id, priceApprovalStatus: PriceApprovalStatus.PENDING },
          data: { priceApprovalNote: dto.reason },
        });
        if (claimedBooking.count !== 1) {
          throw new ConflictException('Giá của booking này vừa được xử lý bởi một thao tác khác.');
        }
      }
      // A rejection ends the chain: later steps never get to review a price
      // that has already been refused.
      await tx.bookingPriceApprovalStep.updateMany({
        where: { bookingId: id, status: StepStatus.PENDING },
        data: { status: StepStatus.SKIPPED },
      });

      return tx.unitBooking.update({
        where: { id },
        data: {
          priceApprovalStatus: PriceApprovalStatus.REJECTED,
          priceApprovalNote: dto.reason,
          priceApprovedById: approver.id,
          priceApprovedAt: new Date(),
        },
        include: this.defaultInclude(),
      });
    });

    const stepLabel = step ? `${step.stepName} (bước ${step.stepOrder})` : 'Admin (chưa có chính sách)';
    await this.logActivity(id, BookingActivityType.NOTE_ADDED, approver.id, {
      note:
        `Giá đề xuất ${formatMoneyWithCode(booking.proposedRentPerSqm ?? 0, booking.currencyCode)}/m² ` +
        `bị từ chối tại ${stepLabel}. Lý do: ${dto.reason}`,
    });

    await this.notifyPriceDecision(id, false, dto.reason);

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

    // Duyệt giá độc lập với trạng thái booking — một booking đã bị hủy trong lúc
    // giá đề xuất còn PENDING vẫn cần được duyệt/từ chối, nên không lọc theo status.
    const where: any = {
      isActive: true,
      priceApprovalStatus: PriceApprovalStatus.PENDING,
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
          // CR-BOOK-PRICE-APPROVAL-001 — the queue used to show a deviation and
          // two action buttons with no indication of WHOSE decision it was.
          priceApprovalSteps: {
            orderBy: { stepOrder: 'asc' },
            include: { approver: { select: { id: true, fullName: true, email: true, role: true } } },
          },
          priceProposedBy: { select: { id: true, fullName: true } },
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
        // Surface the actionable step so the UI can name the approver and
        // disable the buttons for everyone else, instead of letting the click
        // fail on the server.
        const currentStep = this.currentPriceStep(booking.priceApprovalSteps) ?? null;
        return {
          ...booking,
          categoryPricing,
          currentPriceStep: currentStep,
          // No step on a PENDING price means the Mall has no policy rule for
          // this deviation. Shown as a warning rather than an empty column.
          priceApprovalUnrouted: booking.priceApprovalSteps.length === 0,
        };
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

    // CR-BOOK-PRICE-APPROVAL-001 — conversion is allowed ONLY on APPROVED or
    // NOT_REQUIRED. The previous check listed the two blocking states, which
    // meant NULL fell through as "fine" — and NULL is precisely an unevaluated
    // price: no rate proposed, or a unit with no category so no band existed.
    // Allow-listing the two safe states closes that.
    // CR-...-ALWAYS-WARN-004: the gate names the actual reason. Reducing every
    // case to "booking not approved" left the user with no idea whether to wait
    // for a signature, fix a price, configure a policy, or set a base rent.
    this.assertPriceCleared(booking);

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
    // FIN-CALC-01 — canonical calculator. This used to be `monthlyRent * dto.term`,
    // which ignored rentFree and CAM entirely, so the headline value of a proposal
    // disagreed with both the scenario comparison screen and the invoices the
    // contract would go on to produce. Do not reintroduce a local formula.
    const totalContractValue = computeContractValue({
      termMonths: dto.term,
      // SEM-001 — months, never days.
      rentFreeMonths: dto.rentFree ?? 0,
      monthlyBaseRent: monthlyRent,
      monthlyCAM,
      escalationPercent: dto.escalationPercent ?? 0,
    }).totalContractValue;

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
        await this.leadLifecycle.transition({
          leadId: booking.leadId,
          targetStatus: LeadStatus.PROPOSAL,
          actor: LeadLifecycleService.userActor(userId),
          sourceModule: CrmEventSourceModule.BOOKING,
          sourceEntityType: 'UNIT_BOOKING',
          sourceEntityId: booking.id,
          occurredAt: proposal.createdAt,
          idempotencyKey: `booking-converted:${booking.id}:lead:${booking.leadId}`,
        }, tx);
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
          zone: { select: { id: true, name: true } },
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
