import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { notifySlotApprovers } from './slot-booking-release';
import {
  SLOT_HARD_HOLD_STATUSES, SLOT_SOFT_HOLD_STATUSES, fitsCapacity, resolvePricingRange,
  dailyAmountWithWeekendHoliday,
} from './slot-allocation';
import { CreateUnitSlotDto, UpdateUnitSlotDto, CreateSlotBookingDto, CreateSlotPricingRuleDto, ConvertSlotBookingToProposalDto, SlotBookingType } from './dto/slots.dto';

// Mọi trạng thái booking còn "sống" trên lịch slot (để hiển thị lịch/tổng hợp).
// Chỉ nhóm HARD (đã duyệt trở đi) mới thật sự chặn booking khác -- xem slot-allocation.ts.
const SLOT_HOLDING_STATUSES = [
  ...SLOT_SOFT_HOLD_STATUSES,
  ...SLOT_HARD_HOLD_STATUSES,
] as Array<'PENDING' | 'SUBMITTED' | 'APPROVED' | 'CONFIRMED' | 'CONVERTED' | 'CONTRACTED'>;
const HARD_HOLD = [...SLOT_HARD_HOLD_STATUSES] as Array<'APPROVED' | 'CONFIRMED' | 'CONVERTED' | 'CONTRACTED'>;
const SOFT_HOLD = [...SLOT_SOFT_HOLD_STATUSES] as Array<'PENDING' | 'SUBMITTED'>;

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
    await this.assertSlotAreaWithinUnit(unit, dto.area);

    return this.prisma.unitSlot.create({
      data: { ...dto, unitId },
    });
  }

  async updateSlot(id: string, dto: UpdateUnitSlotDto) {
    const existing = await this.findSlot(id);
    this.assertSlotPricingCurrency(dto as any, existing as any);
    if (dto.area !== undefined && dto.area !== existing.area) {
      const unit = await this.prisma.unit.findUnique({ where: { id: existing.unitId } });
      if (unit) await this.assertSlotAreaWithinUnit(unit, dto.area, id);
    }
    return this.prisma.unitSlot.update({ where: { id }, data: dto });
  }

  /**
   * Tong dien tich cac slot dang hoat dong trong mot mat bang khong duoc vuot dien tich
   * mat bang (areaNLA, neu chua khai bao thi areaGFA).
   */
  private async assertSlotAreaWithinUnit(
    unit: { id: string; code?: string; areaNLA?: number | null; areaGFA?: number | null },
    area: number,
    excludeSlotId?: string,
  ) {
    if (!(area > 0)) throw new BadRequestException('Dien tich slot phai lon hon 0');
    const capacity = unit.areaNLA || unit.areaGFA || 0;
    if (!capacity) return;
    const agg = await this.prisma.unitSlot.aggregate({
      where: { unitId: unit.id, isActive: true, ...(excludeSlotId ? { id: { not: excludeSlotId } } : {}) },
      _sum: { area: true },
    });
    const others = agg._sum.area ?? 0;
    if (others + area > capacity + 1e-6) {
      throw new BadRequestException(
        `Tong dien tich slot (${others + area} m2) vuot dien tich mat bang ${unit.code ?? ''} (${capacity} m2). Con lai: ${Math.max(0, capacity - others)} m2.`,
      );
    }
  }

  async deleteSlot(id: string) {
    await this.findSlot(id);
    const holding = await this.prisma.slotBooking.count({
      where: {
        status: { in: SLOT_HOLDING_STATUSES },
        OR: [{ slotId: id }, { lines: { some: { slotId: id } } }],
      },
    });
    if (holding > 0) {
      throw new BadRequestException('Slot dang co booking chua hoan tat, khong the xoa. Hay huy hoac hoan tat booking truoc.');
    }
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
        status: { in: SLOT_HOLDING_STATUSES },
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

  async calculatePrice(
    slotId: string,
    type: SlotBookingType,
    start: Date,
    end: Date,
    opts?: { area?: number },
  ) {
    const slot = await this.findSlot(slotId);
    const rules = slot.pricingRules;
    // Thuê một phần: tính trên diện tích thực thuê, không phải diện tích cả slot.
    const area = opts?.area ?? slot.area;

    let baseAmount = 0;
    let discountPct = 0;

    if (type === SlotBookingType.DAILY) {
      const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
      const pricePerDaySqm = slot.pricePerDaySqm ?? 0;
      const hasSplitPrices =
        slot.priceWeekdayPerDaySqm != null || slot.priceWeekendHolidayPerDaySqm != null;

      if (hasSplitPrices) {
        // Giá ngày thường / cuối tuần-lễ khai báo riêng trên slot; ngày lễ lấy theo Mall.
        const weekday = slot.priceWeekdayPerDaySqm ?? pricePerDaySqm;
        const weekendHoliday = slot.priceWeekendHolidayPerDaySqm ?? weekday;
        baseAmount = dailyAmountWithWeekendHoliday({
          from: start,
          to: end,
          area,
          weekdayPrice: weekday,
          weekendHolidayPrice: weekendHoliday,
          holidayKeys: await this.loadHolidayKeys(slot.unitId, start, end),
        });
      } else {
        baseAmount = pricePerDaySqm * area * days;

        // Apply weekend multiplier
        const weekendRule = rules.find((r) => r.ruleType === 'WEEKEND' && r.multiplier);
        if (weekendRule?.multiplier) {
          const weekendDays = this.countWeekendDays(start, end);
          if (weekendDays > 0) {
            const weekdayDays = days - weekendDays;
            baseAmount =
              weekdayDays * pricePerDaySqm * area +
              weekendDays * pricePerDaySqm * area * weekendRule.multiplier;
          }
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
      const share = slot.area > 0 ? area / slot.area : 1;
      baseAmount = (slot.pricePerHour ?? 0) * hours * share;
    } else if (type === SlotBookingType.MONTHLY) {
      const months = Math.ceil((end.getTime() - start.getTime()) / (30 * 86400000));
      const pricePerSqmMonth = slot.pricePerSqmMonth ?? 0;
      baseAmount = pricePerSqmMonth * area * months;
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

  /** Ngày lễ của Mall chứa slot, dạng yyyy-mm-dd, trong khoảng [start-1d, end+1d]. */
  private async loadHolidayKeys(unitId: string, start: Date, end: Date): Promise<Set<string>> {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId }, select: { mallId: true } });
    if (!unit?.mallId) return new Set();
    const holidays = await this.prisma.mallHoliday.findMany({
      where: {
        mallId: unit.mallId,
        date: { gte: new Date(start.getTime() - 86400000), lte: new Date(end.getTime() + 86400000) },
      },
      select: { date: true },
    });
    return new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
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

  /**
   * Booking ĐÃ DUYỆT (nhóm HARD) chồng lên cửa sổ [occupiedFrom, occupiedTo) của slot.
   * - Không có `req`: bất kỳ chồng lấn nào cũng là xung đột (hành vi cũ).
   * - Có `req`: chỉ xung đột khi diện tích đã bị chiếm đồng thời + diện tích yêu cầu
   *   vượt sức chứa của slot (thuê một phần diện tích).
   * Booking PENDING/SUBMITTED không chặn nhau -- không áp dụng FIFS.
   */
  private async findBookingConflict(
    slotId: string,
    occupiedFrom: Date,
    occupiedTo: Date,
    excludeId?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
    req?: { area: number; capacity: number },
  ) {
    const activeBookings = await db.slotBooking.findMany({
      where: {
        OR: [{ lines: { some: { slotId } } }, { slotId }],
        status: { in: HARD_HOLD },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        bookingRef: true,
        startDatetime: true,
        endDatetime: true,
        installationStartDatetime: true,
        dismantlingEndDatetime: true,
        lines: { where: { slotId }, select: { areaRented: true } },
      },
    });
    const overlapping = activeBookings.filter((booking) => {
      const existingFrom = booking.installationStartDatetime ?? booking.startDatetime;
      const existingTo = booking.dismantlingEndDatetime ?? booking.endDatetime;
      return existingFrom < occupiedTo && existingTo > occupiedFrom;
    });
    if (!overlapping.length) return undefined;
    if (!req) return overlapping[0];

    // Booking cũ không có dòng chi tiết = chiếm toàn bộ slot.
    const intervals = overlapping.map((booking) => ({
      from: booking.installationStartDatetime ?? booking.startDatetime,
      to: booking.dismantlingEndDatetime ?? booking.endDatetime,
      area: booking.lines?.length
        ? booking.lines.reduce((sum, l) => sum + l.areaRented, 0)
        : req.capacity,
    }));
    return fitsCapacity(intervals, occupiedFrom, occupiedTo, req.area, req.capacity)
      ? undefined
      : overlapping[0];
  }

  async createBooking(slotId: string, dto: CreateSlotBookingDto, userId?: string) {
    const primarySlot = await this.findSlot(slotId);

    // Một booking có thể gồm nhiều slot (mặt bằng A + B). Bỏ trống `lines` = thuê toàn bộ slot trên đường dẫn.
    const lineDtos = dto.lines?.length ? dto.lines : [{ slotId, areaRented: undefined as number | undefined }];
    if (!lineDtos.some((l) => l.slotId === slotId)) {
      throw new BadRequestException('Danh sách slot của booking phải bao gồm slot đang đặt');
    }
    if (new Set(lineDtos.map((l) => l.slotId)).size !== lineDtos.length) {
      throw new BadRequestException('Mỗi slot chỉ được xuất hiện một lần trong booking');
    }

    // Kiểm tra từng slot/mặt bằng: khu ngắn hạn, chưa có khách thuê chính thức, cùng Mall.
    const lines: Array<{ slot: typeof primarySlot; area: number }> = [];
    let mallId: string | null | undefined;
    for (const l of lineDtos) {
      const slot = l.slotId === slotId ? primarySlot : await this.findSlot(l.slotId);
      const unit = await this.prisma.unit.findUnique({
        where: { id: slot.unitId },
        select: { status: true, leaseTermType: true, mallId: true },
      });
      if (unit?.leaseTermType !== 'SHORT') {
        throw new BadRequestException('Chỉ có thể tạo booking ngắn hạn trên mặt bằng thuộc khu cho thuê ngắn hạn');
      }
      if (unit && this.unitStatus.isCommittedToTenant(unit.status)) {
        throw new BadRequestException(
          `Không thể tạo booking ô nhỏ: mặt bằng hiện đã có khách thuê chính thức (trạng thái ${unit.status}).`,
        );
      }
      if (mallId === undefined) mallId = unit?.mallId;
      else if (unit?.mallId !== mallId) {
        throw new BadRequestException('Tất cả slot trong một booking phải thuộc cùng một Mall');
      }
      const area = l.areaRented ?? slot.area;
      if (!(area > 0) || area > slot.area + 1e-6) {
        throw new BadRequestException(
          `Diện tích thuê của slot ${slot.code} phải lớn hơn 0 và không vượt quá diện tích slot (${slot.area} m²)`,
        );
      }
      lines.push({ slot, area });
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

    // Khoảng thời gian tính tiền: chọn theo từng giao dịch (không hard-code một công thức).
    const pricingTimeBasis = dto.pricingTimeBasis ?? 'PROGRAM_ONLY';
    const pricingRange = resolvePricingRange({
      basis: pricingTimeBasis,
      installationStart,
      start,
      end,
      dismantlingEnd,
      pricingStart: dto.pricingStart ? new Date(dto.pricingStart) : null,
      pricingEnd: dto.pricingEnd ? new Date(dto.pricingEnd) : null,
    });

    // Tính giá từng dòng, rồi gộp.
    const priced = [] as Array<{ slotId: string; area: number; baseAmount: number; discountPct: number; amount: number }>;
    const currencies = new Set<CurrencyCode>();
    for (const l of lines) {
      const price = await this.calculatePrice(
        l.slot.id,
        dto.type as SlotBookingType,
        pricingRange.from,
        pricingRange.to,
        lines.length > 1 || l.area !== l.slot.area ? { area: l.area } : undefined,
      );
      if (price.currencyCode) currencies.add(price.currencyCode);
      priced.push({
        slotId: l.slot.id,
        area: l.area,
        baseAmount: price.baseAmount,
        discountPct: price.discountPct,
        amount: price.baseAmount * (1 - price.discountPct / 100),
      });
    }
    if (currencies.size > 1) {
      throw new BadRequestException(
        'Các slot trong cùng một booking đang dùng đơn vị tiền tệ khác nhau; hệ thống không quy đổi tỷ giá. Vui lòng tách booking.',
      );
    }
    const currencyCode = currencies.size === 1 ? [...currencies][0] : null;

    const baseAmount = priced.reduce((sum, l) => sum + l.baseAmount, 0);
    const ruleDiscounts = new Set(priced.map((l) => l.discountPct));
    const ruleDiscount =
      ruleDiscounts.size === 1
        ? priced[0].discountPct
        : baseAmount > 0
          ? Math.round((1 - priced.reduce((sum, l) => sum + l.amount, 0) / baseAmount) * 10000) / 100
          : 0;
    const finalDiscount = dto.discountPct ?? ruleDiscount;
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

    const totalArea = lines.reduce((sum, l) => sum + l.area, 0);

    return this.serializable(async (tx) => {
      // Kiểm tra khả dụng của TOÀN BỘ slot trong cùng booking, theo diện tích + thời gian chiếm dụng.
      for (const l of lines) {
        const conflict = await this.findBookingConflict(
          l.slot.id,
          installationStart,
          dismantlingEnd,
          undefined,
          tx,
          { area: l.area, capacity: l.slot.area },
        );
        if (conflict) {
          throw new BadRequestException(
            `Slot ${l.slot.code} đã có booking xung đột: ${conflict.bookingRef}`,
          );
        }
      }

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
          pricingTimeBasis,
          pricingStart: pricingTimeBasis === 'CUSTOM_RANGE' ? pricingRange.from : null,
          pricingEnd: pricingTimeBasis === 'CUSTOM_RANGE' ? pricingRange.to : null,
          totalArea,
          baseAmount,
          discountPct: finalDiscount,
          totalAmount: finalTotal,
          currencyCode,
          notes: dto.notes,
          createdById: userId,
          status: 'PENDING',
          lines: {
            create: priced.map((l) => ({
              slotId: l.slotId,
              areaRented: l.area,
              baseAmount: l.baseAmount,
              amount: l.amount,
            })),
          },
        },
        include: {
          slot: { select: { id: true, code: true, name: true, area: true } },
          lines: { include: { slot: { select: { id: true, code: true, name: true, area: true } } } },
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
        OR: [{ slotId }, { lines: { some: { slotId } } }],
        ...(status ? { status: status as any } : {}),
      },
      include: {
        lines: { include: { slot: { select: { id: true, code: true, name: true, area: true } } } },
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

  // ─── Phê duyệt booking ngắn hạn (một cấp) ──────────────────────────────────
  //
  // Các booking PENDING/SUBMITTED bình đẳng, cùng tồn tại trên một slot; không
  // có FIFS. Booking nào được cấp có thẩm quyền duyệt trước thì thắng slot
  // (APPROVED) -> đi tiếp thành Proposal/Hợp đồng. Booking trùng bị ĐÁNH DẤU xung
  // đột, và chỉ bị khóa (LOCKED) khi người có quyền xác nhận.

  /** Các dòng (slot + diện tích thuê + sức chứa) của booking; booking cũ không có dòng = toàn bộ slot chính. */
  private async bookingLinesWithCapacity(
    db: Prisma.TransactionClient | PrismaService,
    booking: { id: string; slotId: string; totalArea: number | null },
  ) {
    const lines = await db.slotBookingLine.findMany({
      where: { bookingId: booking.id },
      include: { slot: { select: { area: true, code: true } } },
    });
    if (lines.length) {
      return lines.map((l) => ({ slotId: l.slotId, code: l.slot.code, area: l.areaRented, capacity: l.slot.area }));
    }
    const slot = await db.unitSlot.findUnique({ where: { id: booking.slotId }, select: { area: true, code: true } });
    return slot
      ? [{ slotId: booking.slotId, code: slot.code, area: booking.totalArea ?? slot.area, capacity: slot.area }]
      : [];
  }

  /** Booking ĐÃ DUYỆT nào đang chặn booking này (nếu có), kèm mã slot bị chặn. */
  private async findHardConflictForBooking(
    db: Prisma.TransactionClient | PrismaService,
    booking: {
      id: string;
      slotId: string;
      totalArea: number | null;
      startDatetime: Date;
      endDatetime: Date;
      installationStartDatetime: Date | null;
      dismantlingEndDatetime: Date | null;
    },
  ) {
    const from = booking.installationStartDatetime ?? booking.startDatetime;
    const to = booking.dismantlingEndDatetime ?? booking.endDatetime;
    for (const l of await this.bookingLinesWithCapacity(db, booking)) {
      const conflict = await this.findBookingConflict(l.slotId, from, to, booking.id, db, {
        area: l.area,
        capacity: l.capacity,
      });
      if (conflict) return { conflict, slotCode: l.code };
    }
    return undefined;
  }

  /** Gửi duyệt: PENDING -> SUBMITTED. */
  async submitBooking(id: string) {
    const booking = await this.prisma.slotBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');
    if (booking.status !== 'PENDING') {
      throw new BadRequestException('Chỉ booking ở trạng thái PENDING mới có thể gửi duyệt');
    }
    if (booking.totalAmount !== 0 && !booking.currencyCode) {
      throw new BadRequestException(
        'Booking này chưa có đơn vị tiền tệ nên không thể gửi duyệt. Hệ thống không mặc định VND.',
      );
    }
    return this.prisma.slotBooking.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
  }

  /**
   * Duyệt: SUBMITTED -> APPROVED. Chỉ thành công nếu chưa có booking nào được duyệt
   * trước đó chiếm cùng slot/thời gian (theo diện tích). Sau khi duyệt, các booking
   * PENDING/SUBMITTED bị chồng lấn được đánh dấu xung đột để người có quyền xác nhận khóa.
   */
  async approveBooking(id: string, userId: string) {
    return this.serializable(async (tx) => {
      const booking = await tx.slotBooking.findUnique({ where: { id } });
      if (!booking) throw new NotFoundException('Slot booking không tồn tại');
      if (booking.status !== 'SUBMITTED') {
        throw new BadRequestException('Chỉ booking đã gửi duyệt (SUBMITTED) mới có thể được duyệt');
      }
      const blocked = await this.findHardConflictForBooking(tx, booking);
      if (blocked) {
        throw new ConflictException(
          `Không thể duyệt: slot ${blocked.slotCode} đã được duyệt cho booking ${blocked.conflict.bookingRef} trước đó`,
        );
      }

      const approved = await tx.slotBooking.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: userId,
          conflictWithBookingId: null,
          conflictFlaggedAt: null,
        },
      });

      // Tìm các booking chưa duyệt bị ảnh hưởng (cùng slot, chồng thời gian, vượt diện tích còn lại).
      const myLines = await this.bookingLinesWithCapacity(tx, booking);
      const slotIds = myLines.map((l) => l.slotId);
      const candidates = await tx.slotBooking.findMany({
        where: {
          id: { not: id },
          status: { in: SOFT_HOLD },
          OR: [{ slotId: { in: slotIds } }, { lines: { some: { slotId: { in: slotIds } } } }],
        },
      });
      const flagged: string[] = [];
      for (const candidate of candidates) {
        const blocked2 = await this.findHardConflictForBooking(tx, candidate);
        if (blocked2) {
          await tx.slotBooking.update({
            where: { id: candidate.id },
            data: { conflictWithBookingId: blocked2.conflict.id, conflictFlaggedAt: new Date() },
          });
          flagged.push(candidate.id);
        }
      }
      return { booking: approved, conflictedBookingIds: flagged };
    }).then(async (result) => {
      // Bao nguoi co tham quyen: co booking trung lich can xac nhan khoa / bo qua.
      for (const conflictedId of result.conflictedBookingIds) {
        await notifySlotApprovers(this.prisma, conflictedId, {
          title: 'Booking ngan han trung lich can xu ly',
          body: 'Mot booking vua duoc duyet chiem slot/thoi gian cua booking nay. Hay xac nhan khoa hoac bo qua.',
          type: 'SLOT_BOOKING_CONFLICT',
        });
      }
      return result;
    });
  }

  /** Từ chối (chưa duyệt): PENDING/SUBMITTED -> CANCELLED kèm lý do. */
  async rejectBooking(id: string, reason?: string) {
    const booking = await this.prisma.slotBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');
    if (!['PENDING', 'SUBMITTED'].includes(booking.status)) {
      throw new BadRequestException('Chỉ có thể từ chối booking chưa được duyệt');
    }
    return this.prisma.slotBooking.update({
      where: { id },
      data: { status: 'CANCELLED', rejectedReason: reason, cancelReason: reason },
    });
  }

  /**
   * Hủy booking. Nếu booking này đang chiếm slot (đã duyệt/đã thành Proposal/hợp đồng),
   * phần diện tích + thời gian được giải phóng: các cờ xung đột trỏ tới nó được gỡ, còn
   * booking đã LOCKED thì hiện trong danh sách "cần xử lý" để người có quyền mở lại.
   */
  async cancelBooking(id: string, reason?: string) {
    const updated = await this.prisma.slotBooking.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason },
    });
    const released = await this.releaseHeldBy(id);
    if (released.reopenableBookings > 0) {
      await notifySlotApprovers(this.prisma, id, {
        title: 'Booking ngan han da bi khoa co the mo lai',
        body: `Booking vua huy da giai phong slot; ${released.reopenableBookings} booking dang bi khoa co the duoc mo lai.`,
        type: 'SLOT_BOOKING_REOPENABLE',
      });
    }
    return updated;
  }

  /** Gỡ cờ xung đột của các booking chưa bị khóa vì `bookingId` (booking đó không còn chiếm chỗ). */
  async releaseHeldBy(bookingId: string) {
    const cleared = await this.prisma.slotBooking.updateMany({
      where: { conflictWithBookingId: bookingId, status: { in: SOFT_HOLD } },
      data: { conflictWithBookingId: null, conflictFlaggedAt: null },
    });
    const reopenable = await this.prisma.slotBooking.count({
      where: { lockedByBookingId: bookingId, status: 'LOCKED' },
    });
    return { clearedConflicts: cleared.count, reopenableBookings: reopenable };
  }

  /** Xác nhận khóa: booking đang bị đánh dấu xung đột -> LOCKED (do người có quyền xác nhận). */
  async confirmConflictLock(id: string, reason?: string) {
    const booking = await this.prisma.slotBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');
    if (!SOFT_HOLD.includes(booking.status as any) || !booking.conflictWithBookingId) {
      throw new BadRequestException('Booking này không có xung đột đang chờ xử lý');
    }
    const blocker = await this.prisma.slotBooking.findUnique({
      where: { id: booking.conflictWithBookingId },
      select: { id: true, bookingRef: true, status: true },
    });
    if (!blocker || !HARD_HOLD.includes(blocker.status as any)) {
      // Booking chiếm chỗ đã được giải phóng -> không còn lý do khóa.
      await this.prisma.slotBooking.update({
        where: { id },
        data: { conflictWithBookingId: null, conflictFlaggedAt: null },
      });
      throw new ConflictException('Booking chiếm chỗ đã được giải phóng, xung đột không còn nữa');
    }
    return this.prisma.slotBooking.update({
      where: { id },
      data: {
        status: 'LOCKED',
        lockedByBookingId: blocker.id,
        lockedAt: new Date(),
        lockReason: reason ?? `Xung đột với booking ${blocker.bookingRef} đã được duyệt`,
        conflictWithBookingId: null,
        conflictFlaggedAt: null,
      },
    });
  }

  /** Bỏ qua cảnh báo xung đột (giữ booking như cũ). */
  async dismissConflict(id: string) {
    const booking = await this.prisma.slotBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');
    return this.prisma.slotBooking.update({
      where: { id },
      data: { conflictWithBookingId: null, conflictFlaggedAt: null },
    });
  }

  /** Mở lại booking đã bị khóa khi booking chiếm chỗ không còn hiệu lực (hợp đồng thất bại/hủy). */
  async reopenBooking(id: string) {
    return this.serializable(async (tx) => {
      const booking = await tx.slotBooking.findUnique({ where: { id } });
      if (!booking) throw new NotFoundException('Slot booking không tồn tại');
      if (booking.status !== 'LOCKED') {
        throw new BadRequestException('Chỉ booking đang bị khóa (LOCKED) mới có thể mở lại');
      }
      if (booking.lockedByBookingId) {
        const blocker = await tx.slotBooking.findUnique({
          where: { id: booking.lockedByBookingId },
          select: { bookingRef: true, status: true },
        });
        if (blocker && HARD_HOLD.includes(blocker.status as any)) {
          throw new ConflictException(
            `Không thể mở lại: booking ${blocker.bookingRef} vẫn đang chiếm slot (${blocker.status})`,
          );
        }
      }
      // Có thể đã có booking khác được duyệt vào phần chỗ vừa trống.
      const blocked = await this.findHardConflictForBooking(tx, booking);
      if (blocked) {
        throw new ConflictException(
          `Không thể mở lại: slot ${blocked.slotCode} đã được duyệt cho booking ${blocked.conflict.bookingRef}`,
        );
      }
      return tx.slotBooking.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          lockedByBookingId: null,
          lockedAt: null,
          lockReason: null,
        },
      });
    });
  }

  /** Booking cần người có quyền xử lý: có xung đột chờ khóa, hoặc đã khóa nhưng booking chiếm chỗ đã được giải phóng. */
  async listNeedsAttention(mallIds?: string[]) {
    const mallFilter = mallIds
      ? { slot: { unit: { OR: [{ mallId: { in: mallIds } }, { floor: { mallId: { in: mallIds } } }] } } }
      : {};
    const include = {
      slot: { select: { id: true, code: true, name: true, unit: { select: { id: true, code: true, mallId: true } } } },
      lines: { include: { slot: { select: { id: true, code: true } } } },
      lead: { select: { id: true, brandName: true } },
      customer: { select: { id: true, companyName: true } },
    };
    const conflicts = await this.prisma.slotBooking.findMany({
      where: { ...mallFilter, status: { in: SOFT_HOLD }, conflictWithBookingId: { not: null } },
      include,
      orderBy: { conflictFlaggedAt: 'asc' },
    });
    const locked = await this.prisma.slotBooking.findMany({
      where: { ...mallFilter, status: 'LOCKED' },
      include,
      orderBy: { lockedAt: 'asc' },
    });
    const refIds = [
      ...conflicts.map((b) => b.conflictWithBookingId),
      ...locked.map((b) => b.lockedByBookingId),
    ].filter((v): v is string => !!v);
    const refs = refIds.length
      ? await this.prisma.slotBooking.findMany({
          where: { id: { in: refIds } },
          select: { id: true, bookingRef: true, status: true },
        })
      : [];
    const refById = new Map(refs.map((r) => [r.id, r]));

    return [
      ...conflicts.map((b) => ({
        kind: 'CONFLICT' as const,
        booking: b,
        blockedBy: refById.get(b.conflictWithBookingId as string) ?? null,
      })),
      ...locked.map((b) => {
        const blockedBy = b.lockedByBookingId ? refById.get(b.lockedByBookingId) ?? null : null;
        return {
          kind: 'LOCKED' as const,
          booking: b,
          blockedBy,
          // Booking chiếm chỗ không còn hiệu lực -> có thể mở lại.
          canReopen: !blockedBy || !HARD_HOLD.includes(blockedBy.status as any),
        };
      }),
    ];
  }

  // ─── Ngày lễ theo Mall (dùng tính giá cuối tuần/lễ) ─────────────────────────

  listHolidays(mallId: string) {
    return this.prisma.mallHoliday.findMany({ where: { mallId }, orderBy: { date: 'asc' } });
  }

  async addHoliday(mallId: string, dto: { date: string; name: string }) {
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Ngày lễ không hợp lệ');
    return this.prisma.mallHoliday.upsert({
      where: { mallId_date: { mallId, date } },
      update: { name: dto.name },
      create: { mallId, date, name: dto.name },
    });
  }

  async findHoliday(id: string) {
    const h = await this.prisma.mallHoliday.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('Ngay le khong ton tai');
    return h;
  }

  async deleteHoliday(id: string) {
    await this.prisma.mallHoliday.delete({ where: { id } });
    return { message: 'Đã xóa ngày lễ' };
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
      include: {
        slot: { include: { unit: true } },
        lines: { include: { slot: { select: { id: true, code: true, unitId: true } } } },
        lead: true,
        customer: true,
        proposal: true,
      },
    });
    if (!booking) throw new NotFoundException('Slot booking không tồn tại');
    if (booking.status !== 'CONFIRMED' && booking.status !== 'APPROVED') {
      throw new BadRequestException('Chỉ booking đã được duyệt (APPROVED/CONFIRMED) mới có thể chuyển thành Proposal');
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
    // Thời gian trên Proposal/Hợp đồng theo ĐÚNG cách đã chọn ở Booking.
    const pricingRange = resolvePricingRange({
      basis: booking.pricingTimeBasis,
      installationStart: booking.installationStartDatetime ?? booking.startDatetime,
      start: booking.startDatetime,
      end: booking.endDatetime,
      dismantlingEnd: booking.dismantlingEndDatetime ?? booking.endDatetime,
      pricingStart: booking.pricingStart,
      pricingEnd: booking.pricingEnd,
    });

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
          startDate: pricingRange.from,
          endDate: pricingRange.to,
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
            programStartDatetime: booking.startDatetime,
            programEndDatetime: booking.endDatetime,
            pricingTimeBasis: booking.pricingTimeBasis,
            // Giữ nguyên toàn bộ phạm vi thuê như một yêu cầu thống nhất.
            lines: (booking.lines ?? []).map((l) => ({
              slotId: l.slotId,
              slotCode: l.slot?.code,
              unitId: l.slot?.unitId,
              areaRented: l.areaRented,
              amount: l.amount,
            })),
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
        lines: { include: { slot: { select: { id: true, code: true, name: true, area: true } } } },
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
          where: { status: { in: SLOT_HOLDING_STATUSES } },
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

      const hasConfirmed = slot.bookings.some((b) => (HARD_HOLD as string[]).includes(b.status));
      const hasPending = slot.bookings.some((b) => (SOFT_HOLD as string[]).includes(b.status));

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
      const booking = await tx.slotBooking.findUnique({
        where: { id },
        include: { lines: { include: { slot: { select: { area: true } } } } },
      });
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
      const bookingLines = booking.lines?.length
        ? booking.lines.map((l) => ({ slotId: l.slotId, req: { area: l.areaRented, capacity: l.slot.area } }))
        : [{ slotId: booking.slotId, req: undefined }];
      for (const l of bookingLines) {
        const conflict = await this.findBookingConflict(l.slotId, installationStart, dismantlingEnd, id, tx, l.req);
        if (conflict) throw new BadRequestException(`Slot đã có booking xung đột: ${conflict.bookingRef}`);
      }
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
