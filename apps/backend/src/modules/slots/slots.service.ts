import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CreateUnitSlotDto, UpdateUnitSlotDto, CreateSlotBookingDto, CreateSlotPricingRuleDto, ConvertSlotBookingToProposalDto, SlotBookingType } from './dto/slots.dto';

@Injectable()
export class SlotsService {
  constructor(
    private prisma: PrismaService,
    private unitStatus: UnitStatusService,
  ) {}

  // ── Slot CRUD ─────────────────────────────────────────────────────────────

  async listSlots(unitId: string) {
    return this.prisma.unitSlot.findMany({
      where: { unitId, isActive: true },
      include: {
        pricingRules: { where: { isActive: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * MON-CUR-SLOT-02 -- slot pricing may not be persisted without a unit of
   * account. Checked against the MERGED state, so an existing slot stays
   * editable and only a write that introduces or changes a price is blocked.
   *
   * The currency is NOT inherited from Unit.currencyCode: that column is scoped
   * by its own schema comment to the Unit's long-term rent fields, and nothing
   * ties slot pricing to it. Inheriting would be an assumption, not a rule.
   */
  private assertSlotPricingCurrency(
    incoming: { pricePerDaySqm?: number | null; pricePerHour?: number | null; pricePerSqmMonth?: number | null; currencyCode?: CurrencyCode | null },
    existing?: { currencyCode?: CurrencyCode | null },
  ) {
    const writesPrice =
      (incoming.pricePerDaySqm !== undefined && incoming.pricePerDaySqm !== null) ||
      (incoming.pricePerHour !== undefined && incoming.pricePerHour !== null) ||
      (incoming.pricePerSqmMonth !== undefined && incoming.pricePerSqmMonth !== null);
    if (!writesPrice) return;

    const resulting = incoming.currencyCode ?? existing?.currencyCode ?? null;
    if (!resulting) {
      throw new BadRequestException(
        'Vui lòng chọn đơn vị tiền tệ cho giá thuê ô nhỏ. ' +
          'Hệ thống không mặc định VND và không quy đổi tỷ giá.',
      );
    }
  }

  async createSlot(unitId: string, dto: CreateUnitSlotDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');

    this.assertSlotPricingCurrency(dto as any);

    return this.prisma.unitSlot.create({
      data: { ...dto, unitId },
    });
  }

  async updateSlot(id: string, dto: UpdateUnitSlotDto) {
    const existing = await this.findSlot(id);
    this.assertSlotPricingCurrency(dto as any, existing as any);
    return this.prisma.unitSlot.update({ where: { id }, data: dto });
  }

  async deleteSlot(id: string) {
    await this.findSlot(id);
    // Soft delete — keep booking history
    return this.prisma.unitSlot.update({ where: { id }, data: { isActive: false } });
  }

  async findSlot(id: string) {
    const slot = await this.prisma.unitSlot.findUnique({
      where: { id },
      include: { pricingRules: { where: { isActive: true } } },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    return slot;
  }

  // ── Pricing rules ─────────────────────────────────────────────────────────

  async addPricingRule(slotId: string, dto: CreateSlotPricingRuleDto) {
    await this.findSlot(slotId);
    return this.prisma.slotPricingRule.create({
      data: {
        ...dto,
        slotId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async deletePricingRule(ruleId: string) {
    return this.prisma.slotPricingRule.update({ where: { id: ruleId }, data: { isActive: false } });
  }

  // ── Availability & Calendar ───────────────────────────────────────────────

  async getAvailability(slotId: string, year: number, month: number) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);
    const bookings = await this.prisma.slotBooking.findMany({
      where: {
        slotId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        AND: [
          {
            OR: [
              { installationStartDatetime: { lte: monthEnd } },
              { installationStartDatetime: null, startDatetime: { lte: monthEnd } },
            ],
          },
          {
            OR: [
              { dismantlingEndDatetime: { gte: monthStart } },
              { dismantlingEndDatetime: null, endDatetime: { gte: monthStart } },
            ],
          },
        ],
      },
      select: {
        installationStartDatetime: true,
        installationEndDatetime: true,
        startDatetime: true,
        endDatetime: true,
        dismantlingStartDatetime: true,
        dismantlingEndDatetime: true,
        type: true,
        status: true,
        bookingRef: true,
      },
    });

    // Build day-by-day availability map
    const days: Record<string, { available: boolean; bookings: any[] }> = {};
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayStart = new Date(year, month - 1, d, 0, 0, 0);
      const dayEnd = new Date(year, month - 1, d, 23, 59, 59);

      const dayBookings = bookings.filter(
        (b) => (b.installationStartDatetime ?? b.startDatetime) <= dayEnd
          && (b.dismantlingEndDatetime ?? b.endDatetime) >= dayStart,
      );

      days[dateStr] = {
        available: dayBookings.length === 0,
        bookings: dayBookings.map((b) => ({
          ref: b.bookingRef,
          type: b.type,
          status: b.status,
          start: b.startDatetime.toISOString(),
          end: b.endDatetime.toISOString(),
          occupiedFrom: (b.installationStartDatetime ?? b.startDatetime).toISOString(),
          occupiedTo: (b.dismantlingEndDatetime ?? b.endDatetime).toISOString(),
        })),
      };
    }

    return { year, month, days };
  }

  // ── Price calculation ─────────────────────────────────────────────────────

  async calculatePrice(slotId: string, type: SlotBookingType, start: Date, end: Date) {
    const slot = await this.findSlot(slotId);
    const rules = slot.pricingRules;

    let baseAmount = 0;
    let discountPct = 0;

    if (type === SlotBookingType.DAILY) {
      const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
      const pricePerDaySqm = slot.pricePerDaySqm ?? 0;
      baseAmount = pricePerDaySqm * slot.area * days;

      // Apply weekend multiplier
      const weekendRule = rules.find((r) => r.ruleType === 'WEEKEND' && r.multiplier);
      if (weekendRule?.multiplier) {
        const weekendDays = this.countWeekendDays(start, end);
        if (weekendDays > 0) {
          const weekdayDays = days - weekendDays;
          baseAmount =
            weekdayDays * pricePerDaySqm * slot.area +
            weekendDays * pricePerDaySqm * slot.area * weekendRule.multiplier;
        }
      }

      // Apply peak season multiplier
      const peakRule = rules.find(
        (r) =>
          r.ruleType === 'PEAK_SEASON' &&
          r.multiplier &&
          r.startDate &&
          r.endDate &&
          start <= r.endDate &&
          end >= r.startDate,
      );
      if (peakRule?.multiplier) baseAmount *= peakRule.multiplier;

      // Apply volume discount
      const volRule = rules
        .filter((r) => r.ruleType === 'VOLUME_DISCOUNT' && r.minDays && r.discountPct && days >= r.minDays)
        .sort((a, b) => (b.minDays ?? 0) - (a.minDays ?? 0))[0];
      if (volRule?.discountPct) discountPct = volRule.discountPct;
    } else if (type === SlotBookingType.HOURLY) {
      const hours = Math.ceil((end.getTime() - start.getTime()) / 3600000);
      baseAmount = (slot.pricePerHour ?? 0) * hours;
    } else if (type === SlotBookingType.MONTHLY) {
      const months = Math.ceil((end.getTime() - start.getTime()) / (30 * 86400000));
      const pricePerSqmMonth = slot.pricePerSqmMonth ?? 0;
      baseAmount = pricePerSqmMonth * slot.area * months;
    }

    const totalAmount = baseAmount * (1 - discountPct / 100);
    // MON-CUR-SLOT-03: every operand above is either the ONE slot price field
    // for this booking type (monetary) or dimensionless -- area in m2, a day/
    // hour/month count, a multiplier, a discount percentage. There is no second
    // monetary operand anywhere in this formula (no tax, fee or deposit), so the
    // result is denominated in exactly the slot's pricing currency.
    return { baseAmount, discountPct, totalAmount, currencyCode: slot.currencyCode ?? null };
  }

  private countWeekendDays(start: Date, end: Date): number {
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow === 0 || dow === 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        const retryable = error?.code === 'P2034' || error?.code === 'P2002';
        if (!retryable || attempt === maxAttempts) throw error;
      }
    }
    throw new Error('Serializable transaction retry exhausted');
  }

  // ── Slot Bookings ─────────────────────────────────────────────────────────

  private validateBookingTimeline(timeline: {
    installationStart: Date;
    installationEnd: Date;
    rentalStart: Date;
    rentalEnd: Date;
    dismantlingStart: Date;
    dismantlingEnd: Date;
  }) {
    if (Object.values(timeline).some((value) => Number.isNaN(value.getTime()))) {
      throw new BadRequestException('Thời gian booking không hợp lệ');
    }
    const { installationStart, installationEnd, rentalStart, rentalEnd, dismantlingStart, dismantlingEnd } = timeline;
    if (installationEnd <= installationStart) {
      throw new BadRequestException('Thời gian kết thúc lắp đặt phải sau thời gian bắt đầu lắp đặt');
    }
    if (rentalStart < installationEnd) {
      throw new BadRequestException('Thời gian thuê phải bắt đầu sau khi hoàn tất lắp đặt');
    }
    if (rentalEnd <= rentalStart) {
      throw new BadRequestException('Thời gian kết thúc thuê phải sau thời gian bắt đầu thuê');
    }
    if (dismantlingStart < rentalEnd) {
      throw new BadRequestException('Thời gian tháo dỡ phải bắt đầu sau khi kết thúc thuê');
    }
    if (dismantlingEnd <= dismantlingStart) {
      throw new BadRequestException('Thời gian kết thúc tháo dỡ phải sau thời gian bắt đầu tháo dỡ');
    }
  }

  private async findBookingConflict(
    slotId: string,
    occupiedFrom: Date,
    occupiedTo: Date,
    excludeId?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const activeBookings = await db.slotBooking.findMany({
      where: {
        slotId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        bookingRef: true,
        startDatetime: true,
        endDatetime: true,
        installationStartDatetime: true,
        dismantlingEndDatetime: true,
      },
    });
    return activeBookings.find((booking) => {
      const existingFrom = booking.installationStartDatetime ?? booking.startDatetime;
      const existingTo = booking.dismantlingEndDatetime ?? booking.endDatetime;
      return existingFrom < occupiedTo && existingTo > occupiedFrom;
    });
  }

  async createBooking(slotId: string, dto: CreateSlotBookingDto, userId?: string) {
    const slot = await this.findSlot(slotId);
    const unit = await this.prisma.unit.findUnique({
      where: { id: slot.unitId },
      select: { status: true, leaseTermType: true },
    });
    if (unit?.leaseTermType !== 'SHORT') {
      throw new BadRequestException('Chỉ có thể tạo booking ngắn hạn trên mặt bằng thuộc khu cho thuê ngắn hạn');
    }
    if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: dto.leadId },
        select: { leaseTermType: true },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      if (lead.leaseTermType !== 'SHORT') {
        throw new BadRequestException('Short-term slot booking requires a short-term lead');
      }
    }
    if (unit && this.unitStatus.isCommittedToTenant(unit.status)) {
      throw new BadRequestException(
        `Không thể tạo booking ô nhỏ: mặt bằng hiện đã có khách thuê chính thức (trạng thái ${unit.status}).`,
      );
    }

    const installationStart = new Date(dto.installationStartDatetime);
    const installationEnd = new Date(dto.installationEndDatetime);
    const start = new Date(dto.startDatetime);
    const end = new Date(dto.endDatetime);
    const dismantlingStart = new Date(dto.dismantlingStartDatetime);
    const dismantlingEnd = new Date(dto.dismantlingEndDatetime);

    this.validateBookingTimeline({
      installationStart,
      installationEnd,
      rentalStart: start,
      rentalEnd: end,
      dismantlingStart,
      dismantlingEnd,
    });

    // Calculate price
    const { baseAmount, discountPct, currencyCode } = await this.calculatePrice(
      slotId,
      dto.type as SlotBookingType,
      start,
      end,
    );

    const finalDiscount = dto.discountPct ?? discountPct;
    const finalTotal = baseAmount * (1 - finalDiscount / 100);

    // MON-CUR-SLOT-01 -- the booking SNAPSHOTS the currency that governed its
    // amount. It is never read back from the slot: updateSlot edits prices
    // freely and deleteSlot is a soft delete that keeps booking history, so a
    // later pricing change would otherwise relabel every historical booking.
    //
    // A zero amount has no unit of account to lose, so only a priced booking
    // requires one.
    if (finalTotal !== 0 && !currencyCode) {
      throw new BadRequestException(
        'Ô nhỏ này chưa có đơn vị tiền tệ cho giá thuê. ' +
          'Vui lòng bổ sung đơn vị tiền tệ cho ô nhỏ trước khi tạo booking — ' +
          'hệ thống không mặc định VND.',
      );
    }

    return this.serializable(async (tx) => {
      const conflict = await this.findBookingConflict(
        slotId,
        installationStart,
        dismantlingEnd,
        undefined,
        tx,
      );
      if (conflict) throw new BadRequestException(`Slot đã có booking xung đột: ${conflict.bookingRef}`);

      const count = await tx.slotBooking.count();
      const bookingRef = `SB-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      return tx.slotBooking.create({
        data: {
          bookingRef,
          slotId,
          leadId: dto.leadId,
          customerId: dto.customerId,
          type: dto.type,
          installationStartDatetime: installationStart,
          installationEndDatetime: installationEnd,
          startDatetime: start,
          endDatetime: end,
          dismantlingStartDatetime: dismantlingStart,
          dismantlingEndDatetime: dismantlingEnd,
          totalArea: slot.area,
          baseAmount,
          discountPct: finalDiscount,
          totalAmount: finalTotal,
          currencyCode,
          notes: dto.notes,
          createdById: userId,
          status: 'PENDING',
        },
        include: {
          slot: { select: { id: true, code: true, name: true, area: true } },
          lead: { select: { id: true, brandName: true, contactName: true } },
          customer: { select: { id: true, companyName: true, brandName: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      });
    });
  }

  async listBookings(slotId: string, status?: string) {
    return this.prisma.slotBooking.findMany({
      where: {
        slotId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        lead: { select: { id: true, brandName: true, contactName: true } },
        customer: { select: { id: true, companyName: true, brandName: true } },
        createdBy: { select: { id: true, fullName: true } },
        proposal: { select: { id: true, proposalNumber: true, status: true } },
      },
      orderBy: { startDatetime: 'asc' },
    });
  }

  /**
   * MON-CUR-SLOT-06 — a positive-value booking may not enter a
   * revenue-recognised or invoice-eligible state without an explicit currency.
   *
   * CONFIRMED is exactly that boundary: `summarizeShortBookingPipeline` counts
   * CONFIRMED and COMPLETED into Dashboard SHORT revenue, and
   * `createDueInvoiceFromSource` only accepts those two statuses. Before this
   * gate a legacy PENDING booking with a positive amount and a NULL currency
   * could be confirmed by a blind status update and become billable.
   *
   * Legacy rows stay readable and editable — only the transition is blocked, and
   * the currency may be supplied as part of it.
   */
  async confirmBooking(id: string, currencyCode?: CurrencyCode) {
    const booking = await this.prisma.slotBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');

    const resulting = currencyCode ?? booking.currencyCode ?? null;
    // A zero-value booking recognises no revenue and cannot be invoiced for an
    // amount, so it has no unit of account to be missing. Documented rule, not
    // an oversight: see T18.
    if (booking.totalAmount !== 0 && !resulting) {
      throw new BadRequestException(
        'Booking này chưa có đơn vị tiền tệ nên không thể xác nhận: ' +
          'trạng thái CONFIRMED được tính vào doanh thu và cho phép xuất hóa đơn. ' +
          'Vui lòng bổ sung đơn vị tiền tệ — hệ thống không mặc định VND.',
      );
    }

    return this.prisma.slotBooking.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        ...(currencyCode ? { currencyCode } : {}),
      },
    });
  }

  async cancelBooking(id: string, reason?: string) {
    return this.prisma.slotBooking.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
  }

  // ─── Chuyển đổi booking ngắn hạn → Proposal ────────────────────────────────
  //
  // Trước đây quy trình booking ngắn hạn dừng lại ở CONFIRMED — không đi qua
  // phê duyệt Proposal và không có hợp đồng lưu trữ. Method này mở phễu
  // CONFIRMED → Proposal (rồi Proposal tự đi tiếp qua ApprovalWorkflow và
  // Contract như một Proposal bình thường, xem ProposalsController#submit).
  //
  // Proposal được thiết kế cho thuê dài hạn (rentPerSqm/tháng, escalation,
  // cọc theo tháng...) trong khi SlotBooking là một khoản phí trọn gói cho một
  // khoảng thời gian ngắn (giờ/ngày). Mapping dưới đây là gần đúng có chủ đích:
  // term=1 và rentPerSqm chỉ mang tính tham khảo — totalContractValue mới là
  // giá trị thật (= totalAmount của booking, KHÔNG chạy qua computeContractValue
  // vì đó là công thức cho thuê tháng lặp lại). Nguồn gốc booking được lưu lại
  // trong pricingSnapshot để tra soát.
  async convertToProposal(id: string, dto: ConvertSlotBookingToProposalDto, userId: string) {
    const booking = await this.prisma.slotBooking.findUnique({
      where: { id },
      include: { slot: { include: { unit: true } }, lead: true, customer: true, proposal: true },
    });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');
    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException('Chỉ booking đã CONFIRMED mới có thể chuyển thành Proposal');
    }
    if (booking.proposal) {
      throw new ConflictException('Booking này đã được chuyển thành Proposal');
    }

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

    const area = booking.totalArea ?? booking.slot.area;
    const totalAmount = booking.totalAmount;

    const proposal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.proposal.create({
        data: {
          proposalNumber,
          slotBookingId: id,
          unitId: booking.slot.unitId,
          leadId: booking.leadId ?? undefined,
          tenantId: resolvedTenantId,
          area,
          term: 1,
          startDate: booking.startDatetime,
          endDate: booking.endDatetime,
          rentPerSqm: area > 0 ? totalAmount / area : totalAmount,
          camPerSqm: 0,
          deposit: 0,
          depositAmount: 0,
          rentFree: 0,
          escalationPercent: 0,
          monthlyRent: totalAmount,
          monthlyCAM: 0,
          totalContractValue: totalAmount,
          discount: booking.discountPct ?? 0,
          rentCurrency: booking.currencyCode ?? 'VND',
          notes: dto.notes ?? booking.notes ?? undefined,
          businessModel: dto.businessModel,
          pricingSnapshot: {
            sourceType: 'SLOT_BOOKING',
            slotBookingId: id,
            bookingRef: booking.bookingRef,
            slotId: booking.slotId,
            slotCode: booking.slot.code,
            baseAmount: booking.baseAmount,
            discountPct: booking.discountPct,
            installationStartDatetime: booking.installationStartDatetime,
            dismantlingEndDatetime: booking.dismantlingEndDatetime,
          },
          createdById: userId,
        },
      });

      await tx.slotBooking.update({
        where: { id },
        data: { status: 'CONVERTED' },
      });

      return created;
    });

    return {
      booking: await this.prisma.slotBooking.findUnique({
        where: { id },
        include: {
          slot: { select: { id: true, code: true, name: true, area: true, unit: { select: { id: true, code: true } } } },
          lead: { select: { id: true, brandName: true, contactName: true } },
          customer: { select: { id: true, companyName: true, brandName: true } },
          proposal: { select: { id: true, proposalNumber: true, status: true } },
        },
      }),
      proposal,
    };
  }

  async listAllBookings(params: {
    unitId?: string;
    mallIds?: string[];
    status?: string;
    type?: string;
    from?: string;
    to?: string;
  }) {
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.from || params.to) {
      where.startDatetime = {};
      if (params.from) where.startDatetime.gte = new Date(params.from);
      if (params.to) where.startDatetime.lte = new Date(params.to);
    }
    if (params.unitId) where.slot = { unitId: params.unitId };
    else if (params.mallIds) where.slot = {
      unit: {
        OR: [
          { mallId: { in: params.mallIds } },
          { floor: { mallId: { in: params.mallIds } } },
        ],
      },
    };

    return this.prisma.slotBooking.findMany({
      where,
      include: {
        slot: {
          select: {
            id: true, code: true, name: true, area: true,
            unit: {
              select: {
                id: true,
                code: true,
                mallId: true,
                floor: { select: { id: true, name: true, level: true } },
              },
            },
          },
        },
        lead: { select: { id: true, brandName: true } },
        customer: { select: { id: true, companyName: true } },
        proposal: { select: { id: true, proposalNumber: true, status: true } },
      },
      orderBy: [
        { slot: { unit: { code: 'asc' } } },
        { slot: { code: 'asc' } },
        { startDatetime: 'asc' },
      ],
      take: 200,
    });
  }

  async getSlotSummaries(unitIds: string[]) {
    if (!unitIds.length) return {};

    const slots = await this.prisma.unitSlot.findMany({
      where: { unitId: { in: unitIds }, isActive: true },
      include: {
        bookings: {
          where: { status: { in: ['PENDING', 'CONFIRMED'] } },
          select: { id: true, status: true },
        },
      },
    });

    const summaries: Record<string, {
      unitId: string;
      totalSlots: number;
      vacantSlots: number;
      pendingSlots: number;
      confirmedSlots: number;
      totalSlotArea: number;
      bookedArea: number;
      pendingArea: number;
      vacantArea: number;
    }> = {};

    for (const unitId of unitIds) {
      summaries[unitId] = {
        unitId,
        totalSlots: 0,
        vacantSlots: 0,
        pendingSlots: 0,
        confirmedSlots: 0,
        totalSlotArea: 0,
        bookedArea: 0,
        pendingArea: 0,
        vacantArea: 0,
      };
    }

    for (const slot of slots) {
      const summary = summaries[slot.unitId];
      if (!summary) continue;

      summary.totalSlots += 1;
      summary.totalSlotArea += slot.area;

      const hasConfirmed = slot.bookings.some((b) => b.status === 'CONFIRMED');
      const hasPending = slot.bookings.some((b) => b.status === 'PENDING');

      if (hasConfirmed) {
        summary.confirmedSlots += 1;
        summary.bookedArea += slot.area;
      } else if (hasPending) {
        summary.pendingSlots += 1;
        summary.pendingArea += slot.area;
      } else {
        summary.vacantSlots += 1;
        summary.vacantArea += slot.area;
      }
    }

    return summaries;
  }

  async createSlotGrid(
    unitId: string,
    dto: { rows: number; cols: number; slotType?: string },
  ) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');

    const existingCount = await this.prisma.unitSlot.count({
      where: { unitId, isActive: true },
    });
    if (existingCount > 0) {
      throw new BadRequestException('Mặt bằng đã có ô slot. Xóa các ô hiện tại trước khi chia lưới.');
    }

    const rows = dto.rows;
    const cols = dto.cols;
    const cellW = 100 / cols;
    const cellH = 100 / rows;
    const areaPerSlot = Math.round((unit.areaNLA / (rows * cols)) * 10) / 10;
    const slotType = (dto.slotType as any) ?? 'FLEXIBLE';

    const data = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const code = `S${r + 1}-${c + 1}`;
        data.push({
          unitId,
          code,
          name: `Ô ${r + 1}-${c + 1}`,
          area: areaPerSlot,
          slotType,
          posX: c * cellW + 1,
          posY: r * cellH + 1,
          posW: cellW - 2,
          posH: cellH - 2,
          fillColor: '#3B82F6',
        });
      }
    }

    await this.prisma.unitSlot.createMany({ data });
    return this.listSlots(unitId);
  }

  async updateSlotBooking(id: string, dto: {
    installationStartDatetime?: string;
    installationEndDatetime?: string;
    startDatetime?: string;
    endDatetime?: string;
    dismantlingStartDatetime?: string;
    dismantlingEndDatetime?: string;
    discountPct?: number;
    notes?: string;
  }) {
    return this.serializable(async (tx) => {
      const booking = await tx.slotBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');
    if (['CANCELLED', 'COMPLETED'].includes(booking.status)) {
      throw new BadRequestException('Không thể sửa booking đã hủy hoặc hoàn thành');
    }

    const installationStart = dto.installationStartDatetime
      ? new Date(dto.installationStartDatetime)
      : booking.installationStartDatetime ?? booking.startDatetime;
    const installationEnd = dto.installationEndDatetime
      ? new Date(dto.installationEndDatetime)
      : booking.installationEndDatetime ?? booking.startDatetime;
    const start = dto.startDatetime ? new Date(dto.startDatetime) : booking.startDatetime;
    const end = dto.endDatetime ? new Date(dto.endDatetime) : booking.endDatetime;
    const dismantlingStart = dto.dismantlingStartDatetime
      ? new Date(dto.dismantlingStartDatetime)
      : booking.dismantlingStartDatetime ?? booking.endDatetime;
    const dismantlingEnd = dto.dismantlingEndDatetime
      ? new Date(dto.dismantlingEndDatetime)
      : booking.dismantlingEndDatetime ?? booking.endDatetime;

    const timelineChanged = !!(
      dto.installationStartDatetime || dto.installationEndDatetime || dto.startDatetime || dto.endDatetime
      || dto.dismantlingStartDatetime || dto.dismantlingEndDatetime
    );
    if (timelineChanged) {
      this.validateBookingTimeline({
        installationStart,
        installationEnd,
        rentalStart: start,
        rentalEnd: end,
        dismantlingStart,
        dismantlingEnd,
      });
      const conflict = await this.findBookingConflict(booking.slotId, installationStart, dismantlingEnd, id, tx);
      if (conflict) throw new BadRequestException(`Slot đã có booking xung đột: ${conflict.bookingRef}`);
    }

    const data: any = {};
    if (dto.installationStartDatetime) data.installationStartDatetime = installationStart;
    if (dto.installationEndDatetime) data.installationEndDatetime = installationEnd;
    if (dto.startDatetime) data.startDatetime = start;
    if (dto.endDatetime) data.endDatetime = end;
    if (dto.dismantlingStartDatetime) data.dismantlingStartDatetime = dismantlingStart;
    if (dto.dismantlingEndDatetime) data.dismantlingEndDatetime = dismantlingEnd;
    if (dto.notes !== undefined) data.notes = dto.notes;

    if (dto.startDatetime || dto.endDatetime) {
      const priceData = await this.calculatePrice(booking.slotId, booking.type as SlotBookingType, start, end);
      const disc = dto.discountPct ?? (booking.discountPct ?? 0);
      const recalculatedTotal = priceData.baseAmount * (1 - disc / 100);

      // MON-CUR-SLOT-01 -- the amount and the currency are ONE snapshot. A
      // re-price from the slot's current price is governed by that slot's
      // current currency, so the two move together; refreshing the amount while
      // leaving a stale currency label is exactly the mislabelling this wave
      // exists to prevent.
      if (recalculatedTotal !== 0 && !priceData.currencyCode) {
        throw new BadRequestException(
          'Ô nhỏ này chưa có đơn vị tiền tệ cho giá thuê, không thể tính lại số tiền booking. ' +
            'Hệ thống không mặc định VND.',
        );
      }
      // A re-price that would move an existing booking to a different unit of
      // account is refused rather than performed silently.
      if (
        booking.currencyCode &&
        priceData.currencyCode &&
        booking.currencyCode !== priceData.currencyCode
      ) {
        throw new ConflictException({
          code: 'SLOT_BOOKING_CURRENCY_CONFLICT',
          message:
            'Không thể tính lại: đơn vị tiền tệ của ô nhỏ đã thay đổi so với thời điểm đặt booking. ' +
            'Hệ thống không quy đổi tỷ giá — vui lòng tạo booking mới thay vì đổi đơn vị tiền tệ của booking cũ.',
          bookingId: id,
          slotId: booking.slotId,
          bookingCurrency: booking.currencyCode,
          slotCurrency: priceData.currencyCode,
        });
      }

      data.baseAmount = priceData.baseAmount;
      data.discountPct = disc;
      data.totalAmount = recalculatedTotal;
      data.currencyCode = priceData.currencyCode;
    } else if (dto.discountPct !== undefined) {
      data.discountPct = dto.discountPct;
      data.totalAmount = (booking.baseAmount ?? 0) * (1 - dto.discountPct / 100);
    }

      return tx.slotBooking.update({
      where: { id },
      data,
      include: {
        slot: { select: { id: true, code: true, name: true, area: true, unit: { select: { id: true, code: true, mallId: true } } } },
        lead: { select: { id: true, brandName: true, contactName: true } },
        customer: { select: { id: true, companyName: true, brandName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      });
    });
  }

  async deleteSlotBooking(id: string) {
    const booking = await this.prisma.slotBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');
    if (booking.status !== 'CANCELLED') {
      throw new BadRequestException('Chỉ có thể xóa slot booking đã hủy');
    }
    await this.prisma.slotBooking.delete({ where: { id } });
    return { message: 'Slot booking đã được xóa' };
  }
}
