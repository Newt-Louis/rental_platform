import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { CreateUnitSlotDto, UpdateUnitSlotDto, CreateSlotBookingDto, CreateSlotPricingRuleDto, SlotBookingType } from './dto/slots.dto';

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

  async createSlot(unitId: string, dto: CreateUnitSlotDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');

    return this.prisma.unitSlot.create({
      data: { ...dto, unitId },
    });
  }

  async updateSlot(id: string, dto: UpdateUnitSlotDto) {
    await this.findSlot(id);
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
    return { baseAmount, discountPct, totalAmount };
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

  private async findBookingConflict(slotId: string, occupiedFrom: Date, occupiedTo: Date, excludeId?: string) {
    const activeBookings = await this.prisma.slotBooking.findMany({
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

    // The slot is occupied from installation start until dismantling finishes.
    const conflict = await this.findBookingConflict(slotId, installationStart, dismantlingEnd);
    if (conflict) throw new BadRequestException(`Slot đã có booking xung đột: ${conflict.bookingRef}`);

    // Generate ref
    const count = await this.prisma.slotBooking.count();
    const bookingRef = `SB-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Calculate price
    const { baseAmount, discountPct, totalAmount } = await this.calculatePrice(
      slotId,
      dto.type as SlotBookingType,
      start,
      end,
    );

    const finalDiscount = dto.discountPct ?? discountPct;
    const finalTotal = baseAmount * (1 - finalDiscount / 100);

    return this.prisma.slotBooking.create({
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
      },
      orderBy: { startDatetime: 'asc' },
    });
  }

  async confirmBooking(id: string) {
    return this.prisma.slotBooking.update({
      where: { id },
      data: { status: 'CONFIRMED' },
    });
  }

  async cancelBooking(id: string, reason?: string) {
    return this.prisma.slotBooking.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
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
    const booking = await this.prisma.slotBooking.findUnique({ where: { id } });
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
      const conflict = await this.findBookingConflict(booking.slotId, installationStart, dismantlingEnd, id);
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
      data.baseAmount = priceData.baseAmount;
      data.discountPct = disc;
      data.totalAmount = priceData.baseAmount * (1 - disc / 100);
    } else if (dto.discountPct !== undefined) {
      data.discountPct = dto.discountPct;
      data.totalAmount = (booking.baseAmount ?? 0) * (1 - dto.discountPct / 100);
    }

    return this.prisma.slotBooking.update({
      where: { id },
      data,
      include: {
        slot: { select: { id: true, code: true, name: true, area: true, unit: { select: { id: true, code: true, mallId: true } } } },
        lead: { select: { id: true, brandName: true, contactName: true } },
        customer: { select: { id: true, companyName: true, brandName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
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
