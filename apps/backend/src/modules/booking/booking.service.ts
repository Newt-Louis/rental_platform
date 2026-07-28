import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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

@Injectable()
export class BookingService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
    private unitStatus: UnitStatusService,
  ) {}

  // ─── Tạo booking mới với priority tự động ────────────────────────────────

  async create(dto: CreateBookingDto, createdById: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
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
      if (!lead) throw new NotFoundException('Lead không tồn tại');
    }
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer) throw new NotFoundException('Customer không tồn tại');
    }

    // Kiểm tra lead/customer chưa có booking ACTIVE cho unit này
    const existingActive = await this.prisma.unitBooking.findFirst({
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
    const maxPriority = await this.prisma.unitBooking.aggregate({
      where: {
        unitId: dto.unitId,
        status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
        isActive: true,
      },
      _max: { priority: true },
    });
    const priority = (maxPriority._max.priority ?? 0) + 1;

    const holdDays = dto.holdDays ?? 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + holdDays);

    // Auto-generate booking number: BK-YYYY-NNNNN
    const year = new Date().getFullYear();
    const count = await this.prisma.unitBooking.count({
      where: { bookingNumber: { startsWith: `BK-${year}-` } },
    });
    const bookingNumber = `BK-${year}-${String(count + 1).padStart(5, '0')}`;

    // Validate proposed price if provided
    let priceApprovalStatus: PriceApprovalStatus | null = null;
    let priceDeviationPercent: number | null = null;
    let pricingRuleId: string | null = null;
    let pricingSnapshot: Prisma.InputJsonValue | undefined;

    if (dto.proposedRentPerSqm !== undefined && unit.categoryId) {
      const validation = await this.categoriesService.validateProposedPrice({
        mallId: unit.mallId,
        categoryId: unit.categoryId,
        floorId: unit.floorId ?? undefined,
        zoneId: unit.zoneId ?? undefined,
        proposedRentPerSqm: dto.proposedRentPerSqm,
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

    const booking = await this.prisma.unitBooking.create({
      data: {
        bookingNumber,
        unitId: dto.unitId,
        leadId: dto.leadId,
        customerId: dto.customerId,
        priority,
        status: priority === 1 ? BookingStatus.ACTIVE : BookingStatus.PENDING,
        requestedArea: dto.requestedArea,
        requestedTerm: dto.requestedTerm,
        expectedRent: dto.expectedRent,
        proposedRentPerSqm: dto.proposedRentPerSqm,
        proposedCamPerSqm: dto.proposedCamPerSqm,
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
      });
    }

    // Cập nhật lead status → PROPOSAL nếu booking ACTIVE
    if (dto.leadId && priority === 1) {
      await this.prisma.lead.update({
        where: { id: dto.leadId },
        data: { status: LeadStatus.PROPOSAL },
      });
    }

    // Ghi activity log
    await this.logActivity(booking.id, BookingActivityType.CREATED, createdById, {
      note: `Booking ${bookingNumber} tạo thành công. Priority: ${priority}`,
    });
    if (priority === 1) {
      await this.logActivity(booking.id, BookingActivityType.ACTIVATED, createdById, {
        note: 'Booking được kích hoạt ngay (priority 1)',
      });
    }

    return booking;
  }

  // ─── Danh sách bookings ───────────────────────────────────────────────────

  async findAll(query: {
    unitId?: string;
    floorId?: string;
    leadId?: string;
    customerId?: string;
    status?: BookingStatus;
    assignedToId?: string;
    mallId?: string;
    mallIds?: string[];
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

  async update(id: string, dto: UpdateBookingDto, userId: string) {
    const booking = await this.requireBooking(id, [BookingStatus.ACTIVE, BookingStatus.PENDING]);

    // ── Đổi lead ──────────────────────────────────────────────────────────────
    if (dto.leadId !== undefined && dto.leadId !== booking.leadId) {
      if (dto.leadId) {
        const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId } });
        if (!lead) throw new NotFoundException('Lead không tồn tại');
      }
    }

    // ── Đổi unit ──────────────────────────────────────────────────────────────
    let newUnitId: string | undefined;
    let newPriority: number | undefined;
    let newStatus: BookingStatus | undefined;

    if (dto.unitId !== undefined && dto.unitId !== booking.unitId) {
      const newUnit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
      if (!newUnit || !newUnit.isActive) throw new NotFoundException('Mặt bằng không tồn tại');
      if (this.unitStatus.isLockedForBooking(newUnit.status)) {
        throw new BadRequestException(`Không thể chuyển sang mặt bằng này (trạng thái ${newUnit.status})`);
      }

      // Đếm vị trí trong queue của unit mới
      const queueCount = await this.prisma.unitBooking.count({
        where: { unitId: dto.unitId, status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] }, isActive: true },
      });
      newUnitId = dto.unitId;
      newPriority = queueCount + 1;
      newStatus = queueCount === 0 ? BookingStatus.ACTIVE : BookingStatus.PENDING;
    }

    // ── Validate giá đề xuất (dùng unit hiện tại hoặc unit mới) ──────────────
    const targetUnitId = newUnitId ?? booking.unitId;
    const unit = await this.prisma.unit.findUnique({ where: { id: targetUnitId } });

    let priceApprovalStatus: PriceApprovalStatus | null | undefined = undefined;
    let priceDeviationPercent: number | null | undefined = undefined;
    let pricingRuleId: string | null | undefined = undefined;
    let pricingSnapshot: Prisma.InputJsonValue | undefined;

    if (dto.proposedRentPerSqm !== undefined && unit?.categoryId) {
      if (dto.proposedRentPerSqm !== booking.proposedRentPerSqm || !!newUnitId) {
        const validation = await this.categoriesService.validateProposedPrice({
          mallId: unit.mallId,
          categoryId: unit.categoryId,
          floorId: unit.floorId ?? undefined,
          zoneId: unit.zoneId ?? undefined,
          proposedRentPerSqm: dto.proposedRentPerSqm,
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

    const updated = await this.prisma.unitBooking.update({
      where: { id },
      data: {
        ...(dto.leadId !== undefined && { leadId: dto.leadId || null }),
        ...(newUnitId && { unitId: newUnitId, priority: newPriority, status: newStatus, activatedAt: newStatus === BookingStatus.ACTIVE ? new Date() : undefined }),
        assignedToId: dto.assignedToId,
        requestedArea: dto.requestedArea,
        requestedTerm: dto.requestedTerm,
        expectedRent: dto.expectedRent,
        proposedRentPerSqm: dto.proposedRentPerSqm,
        proposedCamPerSqm: dto.proposedCamPerSqm,
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
      await this.promoteNextInQueue(booking.unitId, userId);
      if (newStatus === BookingStatus.ACTIVE) {
        await this.unitStatus.transition(newUnitId, UnitStatus.BOOKING, {
          userId,
          reason: `Booking ${id} chuyển sang unit này`,
        });
      }
    }

    await this.logActivity(id, BookingActivityType.NOTE_ADDED, userId, { note: 'Cập nhật thông tin booking' });
    return updated;
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
      note: `Giá đề xuất ${booking.proposedRentPerSqm?.toLocaleString()} VND/m² được phê duyệt${dto.note ? '. ' + dto.note : ''}`,
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
      note: `Giá đề xuất ${booking.proposedRentPerSqm?.toLocaleString()} VND/m² bị từ chối. Lý do: ${dto.reason}`,
    });

    return updated;
  }

  // ─── Lấy danh sách booking cần phê duyệt giá ──────────────────────────────

  async getBookingsPendingPriceApproval(query: {
    mallId?: string;
    mallIds?: string[];
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
    };
    if (mallIds) where.unit = {
      OR: [
        { mallId: { in: mallIds } },
        { floor: { mallId: { in: mallIds } } },
      ],
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
              categoryId: true,
              categoryRef: { select: { id: true, code: true, name: true } },
              baseRentPerSqm: true,
              floor: { select: { id: true, name: true, level: true } },
              zone: { select: { id: true, name: true } },
              mall: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
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

    const maxPriority = await this.prisma.unitBooking.aggregate({
      where: {
        unitId: booking.unitId,
        status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
        isActive: true,
      },
      _max: { priority: true },
    });
    const newPriority = (maxPriority._max.priority ?? 0) + 1;
    const newStatus = newPriority === 1 ? BookingStatus.ACTIVE : BookingStatus.PENDING;

    const holdDays = booking.holdDays ?? 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + holdDays);

    await this.prisma.unitBooking.update({
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
      });
    }

    await this.logActivity(id, BookingActivityType.ACTIVATED, userId, {
      note: `Booking được khôi phục. Priority: ${newPriority}`,
    });

    return this.findOne(id);
  }

  // ─── Hủy booking ──────────────────────────────────────────────────────────

  async cancel(id: string, dto: CancelBookingDto, userId: string) {
    const booking = await this.requireBooking(id, [BookingStatus.ACTIVE, BookingStatus.PENDING]);

    await this.prisma.unitBooking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      },
    });

    await this.logActivity(id, BookingActivityType.CANCELLED, userId, {
      note: dto.reason ? `Hủy booking. Lý do: ${dto.reason}` : 'Hủy booking',
    });

    // Promote next in queue
    await this.promoteNextInQueue(booking.unitId, userId);

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
          monthlyRent,
          monthlyCAM,
          depositAmount,
          totalContractValue,
          notes: dto.notes,
          businessModel: dto.businessModel,
          serviceFeeSqm: dto.serviceFeeSqm ?? 0,
          businessSupportFeeSqm: dto.businessSupportFeeSqm ?? 0,
          rentCurrency: dto.rentCurrency ?? 'VND',
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

  async expireOverdueBookings() {
    const now = new Date();
    const expired = await this.prisma.unitBooking.findMany({
      where: {
        status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
        expiresAt: { lt: now },
        isActive: true,
      },
    });

    for (const booking of expired) {
      await this.prisma.unitBooking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.EXPIRED },
      });
      await this.logActivity(booking.id, BookingActivityType.EXPIRED, booking.createdById, {
        note: 'Booking tự động hết hạn',
      });
      // Promote next
      await this.promoteNextInQueue(booking.unitId, booking.createdById);
    }

    return { expiredCount: expired.length };
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

  private async logActivity(
    bookingId: string,
    type: BookingActivityType,
    performedById: string,
    opts: { note: string; metadata?: any },
  ) {
    await this.prisma.bookingActivity.create({
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
  private async promoteNextInQueue(unitId: string, promotedById: string) {
    const next = await this.prisma.unitBooking.findFirst({
      where: {
        unitId,
        status: BookingStatus.PENDING,
        isActive: true,
      },
      orderBy: { priority: 'asc' },
    });

    if (next) {
      await this.prisma.unitBooking.update({
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
      });
      await this.logActivity(next.id, BookingActivityType.ACTIVATED, promotedById, {
        note: 'Tự động kích hoạt do booking ưu tiên cao hơn bị hủy/hết hạn',
      });
      await this.logActivity(next.id, BookingActivityType.PRIORITY_CHANGED, promotedById, {
        note: 'Lên ưu tiên #1',
        metadata: { newPriority: 1 },
      });
    } else {
      // Không còn ai trong queue → unit trở lại VACANT
      await this.unitStatus.transition(unitId, UnitStatus.VACANT, {
        userId: promotedById,
        reason: 'Booking queue empty',
      });
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
          floor: { select: { id: true, name: true, level: true } },
          mall: { select: { id: true, name: true, code: true } },
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
