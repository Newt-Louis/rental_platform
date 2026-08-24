import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PeriodicChargeStatus, PeriodicChargeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ChargeComputation,
  computeAfterHoursCoolingCharge,
  computeManagementFeeSurcharge,
  computeUtilityCharge,
  currentPeriod,
  periodBounds,
} from './billing-addin.util';

const REQUIRED_INPUT_KEYS: Record<PeriodicChargeType, string[]> = {
  MANAGEMENT_FEE_SURCHARGE: ['headcount'],
  UTILITY: ['elecStart', 'elecEnd', 'waterStart', 'waterEnd'],
  AFTER_HOURS_COOLING: ['hours'],
};

const REQUIRED_RATE_KEYS: Record<PeriodicChargeType, string[]> = {
  MANAGEMENT_FEE_SURCHARGE: ['normAreaPerPerson', 'surchargePerPerson'],
  UTILITY: ['electricityUnitPrice', 'waterUnitPrice'],
  AFTER_HOURS_COOLING: ['hourlyRate'],
};

@Injectable()
export class BillingAddInService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: { mallId?: string; chargeType?: PeriodicChargeType; status?: PeriodicChargeStatus; period?: string; search?: string },
    mallIds?: string[],
  ) {
    return this.prisma.periodicChargeEntry.findMany({
      where: {
        ...(query.chargeType ? { chargeType: query.chargeType } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.period ? { period: query.period } : {}),
        contract: {
          ...(query.mallId
            ? { unit: { mallId: query.mallId } }
            : mallIds
              ? { unit: { mallId: { in: mallIds } } }
              : {}),
          ...(query.search
            ? {
                OR: [
                  { contractNumber: { contains: query.search, mode: 'insensitive' } },
                  { tenant: { brandName: { contains: query.search, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
      },
      include: {
        contract: {
          include: {
            tenant: { select: { id: true, brandName: true } },
            unit: { include: { mall: { select: { id: true, name: true, leaseCategory: true } } } },
          },
        },
        assignedTo: { select: { id: true, fullName: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async getOne(id: string, mallIds?: string[]) {
    return this.findEntryOrThrow(id, mallIds);
  }

  async saveDraft(id: string, inputData: Record<string, number>, notes: string | undefined, userId: string, mallIds?: string[]) {
    const entry = await this.findEntryOrThrow(id, mallIds);
    if (entry.status === PeriodicChargeStatus.CONFIRMED || entry.status === PeriodicChargeStatus.INVOICED) {
      throw new BadRequestException(
        'Kỳ đã chốt hoặc đã lập hoá đơn, không thể sửa trực tiếp. Cần "Mở lại" trước khi lập hoá đơn, hoặc tạo Phụ lục điều chỉnh nếu đã lập hoá đơn.',
      );
    }

    const requiredKeys = REQUIRED_INPUT_KEYS[entry.chargeType];
    const missing = requiredKeys.filter((key) => inputData[key] === undefined || inputData[key] === null || Number.isNaN(Number(inputData[key])));
    if (missing.length) {
      throw new BadRequestException(`Thiếu hoặc sai giá trị nhập liệu: ${missing.join(', ')}`);
    }

    // PeriodicChargeRateConfig.ratesJson is authored in VND only (matches the source CSKT
    // requirement — PQL surcharge/electricity/water/after-hours rates are all quoted in VND terms,
    // never a contract's billing currency). Applying a VND-authored number as-is onto a non-VND
    // Invoice would bill the raw VND figure as if it were USD/MMK — a ~24,000x-scale defect for a
    // USD contract. Block it explicitly rather than silently mis-billing until multi-currency rate
    // configs (and an FX policy) are an approved business requirement.
    if (entry.contract.currencyCode !== 'VND') {
      throw new BadRequestException(
        `Billing Add-in hiện chỉ hỗ trợ hợp đồng tính bằng VND — hợp đồng này tính bằng ${entry.contract.currencyCode}. Đơn giá cấu hình (PeriodicChargeRateConfig) luôn tính bằng VND, chưa có quy đổi ngoại tệ.`,
      );
    }

    const rates = await this.getActiveRates(entry.contract.unit.mallId, entry.chargeType, entry.periodStart);
    const { lines, subtotal } = this.computeLines(entry.chargeType, inputData, rates, entry.contract, entry.period);

    return this.prisma.periodicChargeEntry.update({
      where: { id },
      data: {
        inputData,
        lines: lines as unknown as Prisma.InputJsonValue,
        subtotal,
        notes,
        status: PeriodicChargeStatus.DRAFT,
        draftedAt: new Date(),
        draftedById: userId,
      },
    });
  }

  async confirmNoCharge(id: string, userId: string, mallIds?: string[]) {
    const entry = await this.findEntryOrThrow(id, mallIds);
    if (!([PeriodicChargeStatus.PENDING, PeriodicChargeStatus.DRAFT] as PeriodicChargeStatus[]).includes(entry.status)) {
      throw new BadRequestException('Chỉ có thể xác nhận "Không phát sinh" khi kỳ đang ở trạng thái Chưa nhập hoặc Chờ chốt');
    }
    return this.prisma.periodicChargeEntry.update({
      where: { id },
      data: {
        status: PeriodicChargeStatus.NO_CHARGE,
        lines: [] as unknown as Prisma.InputJsonValue,
        subtotal: 0,
        noChargeAt: new Date(),
        noChargeById: userId,
      },
    });
  }

  async confirm(id: string, userId: string, mallIds?: string[]) {
    const entry = await this.findEntryOrThrow(id, mallIds);
    if (entry.status !== PeriodicChargeStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể chốt số liệu khi kỳ đang ở trạng thái Chờ chốt');
    }
    return this.prisma.periodicChargeEntry.update({
      where: { id },
      data: { status: PeriodicChargeStatus.CONFIRMED, confirmedAt: new Date(), confirmedById: userId },
    });
  }

  async reopen(id: string, userId: string, mallIds?: string[]) {
    const entry = await this.findEntryOrThrow(id, mallIds);
    if (entry.status !== PeriodicChargeStatus.CONFIRMED) {
      throw new BadRequestException('Chỉ có thể mở lại kỳ đang ở trạng thái Đã chốt');
    }
    return this.prisma.periodicChargeEntry.update({
      where: { id },
      data: { status: PeriodicChargeStatus.DRAFT, confirmedAt: null, confirmedById: null },
    });
  }

  /** Sinh entry PENDING cho mỗi hợp đồng ACTIVE/EXPIRING có bật loại phí add-in — gọi từ scheduler, idempotent qua unique [contractId, chargeType, period]. */
  async generatePendingForPeriod(period?: string, asOf: Date = new Date()) {
    const targetPeriod = period ?? currentPeriod(asOf);
    const { periodStart, periodEnd } = periodBounds(targetPeriod);
    const dueDate = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), periodEnd.getUTCDate() + 5));

    const contracts = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: ['ACTIVE', 'EXPIRING'] },
        periodicChargeTypes: { isEmpty: false },
      },
      select: {
        id: true,
        contractNumber: true,
        periodicChargeTypes: true,
        unit: { select: { mallId: true } },
      },
    });

    let created = 0;
    // Chi tiết entry vừa sinh, gộp theo mall — dùng để scheduler thông báo cho vận hành theo mall,
    // không cần BillingAddInService biết gì về NotificationsService (giữ service thuần/dễ test).
    const createdEntries: { id: string; mallId: string; contractNumber: string; chargeType: PeriodicChargeType }[] = [];
    for (const contract of contracts) {
      for (const chargeType of contract.periodicChargeTypes) {
        const existing = await this.prisma.periodicChargeEntry.findUnique({
          where: { contractId_chargeType_period: { contractId: contract.id, chargeType, period: targetPeriod } },
        });
        if (existing) continue;
        const entry = await this.prisma.periodicChargeEntry.create({
          data: { contractId: contract.id, chargeType, period: targetPeriod, periodStart, periodEnd, dueDate },
        });
        createdEntries.push({ id: entry.id, mallId: contract.unit.mallId, contractNumber: contract.contractNumber, chargeType });
        created++;
      }
    }
    return { period: targetPeriod, created, entries: createdEntries };
  }

  /** Danh sách entry PENDING/DRAFT sắp/đã quá hạn — dùng cho nhắc nhở vận hành theo mall. */
  async listDueSoonOrOverdue(withinDays: number, asOf: Date = new Date()) {
    const threshold = new Date(asOf.getTime() + withinDays * 24 * 60 * 60 * 1000);
    return this.prisma.periodicChargeEntry.findMany({
      where: {
        status: { in: [PeriodicChargeStatus.PENDING, PeriodicChargeStatus.DRAFT] },
        dueDate: { lte: threshold },
      },
      select: {
        id: true, period: true, chargeType: true, dueDate: true,
        contract: { select: { contractNumber: true, unit: { select: { mallId: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /** Danh sách đơn giá đã cấu hình — dùng cho màn hình quản trị rate config. */
  async listRates(mallId?: string, chargeType?: PeriodicChargeType) {
    return this.prisma.periodicChargeRateConfig.findMany({
      where: {
        ...(mallId ? { mallId } : {}),
        ...(chargeType ? { chargeType } : {}),
      },
      include: { mall: { select: { id: true, name: true, leaseCategory: true } } },
      orderBy: [{ mallId: 'asc' }, { chargeType: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  /** Thiết lập đơn giá mới cho 1 mall + loại phí — chặn chồng lấn khoảng hiệu lực với rate đang active (theo đúng pattern ensurePricingDoesNotOverlap của CategoryMallPricing). ADMIN-only ở tầng controller vì đây là dữ liệu tài chính nhạy cảm. */
  async createRate(dto: {
    mallId: string;
    chargeType: PeriodicChargeType;
    ratesJson: Record<string, number>;
    effectiveFrom: string;
    effectiveTo?: string;
  }) {
    const requiredKeys = REQUIRED_RATE_KEYS[dto.chargeType];
    const missing = requiredKeys.filter((key) => dto.ratesJson[key] === undefined || dto.ratesJson[key] === null || Number.isNaN(Number(dto.ratesJson[key])));
    if (missing.length) {
      throw new BadRequestException(`ratesJson thiếu hoặc sai giá trị cho loại phí ${dto.chargeType}: ${missing.join(', ')}`);
    }
    const extraKeys = Object.keys(dto.ratesJson).filter((key) => !requiredKeys.includes(key));
    if (extraKeys.length) {
      throw new BadRequestException(`ratesJson có field không thuộc loại phí ${dto.chargeType}: ${extraKeys.join(', ')}`);
    }

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo phải sau effectiveFrom');
    }

    await this.ensureRateDoesNotOverlap({ mallId: dto.mallId, chargeType: dto.chargeType, effectiveFrom, effectiveTo });

    return this.prisma.periodicChargeRateConfig.create({
      data: { mallId: dto.mallId, chargeType: dto.chargeType, ratesJson: dto.ratesJson, effectiveFrom, effectiveTo },
    });
  }

  async deactivateRate(id: string) {
    const rate = await this.prisma.periodicChargeRateConfig.findUnique({ where: { id } });
    if (!rate) throw new NotFoundException('Không tìm thấy cấu hình đơn giá');
    return this.prisma.periodicChargeRateConfig.update({ where: { id }, data: { isActive: false } });
  }

  private async ensureRateDoesNotOverlap(params: {
    mallId: string;
    chargeType: PeriodicChargeType;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    excludeId?: string;
  }) {
    const conflict = await this.prisma.periodicChargeRateConfig.findFirst({
      where: {
        mallId: params.mallId,
        chargeType: params.chargeType,
        isActive: true,
        ...(params.excludeId && { id: { not: params.excludeId } }),
        effectiveFrom: { lte: params.effectiveTo ?? new Date('9999-12-31T23:59:59.999Z') },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: params.effectiveFrom } }],
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException('Đã có đơn giá đang active cho mall + loại phí này trong khoảng thời gian chồng lấn');
    }
  }

  private computeLines(
    chargeType: PeriodicChargeType,
    inputData: Record<string, number>,
    rates: Record<string, number>,
    contract: { contractedArea: number | null; actualArea: number | null; unit: { mall: { leaseCategory: string } } },
    period: string,
  ): ChargeComputation {
    switch (chargeType) {
      case PeriodicChargeType.MANAGEMENT_FEE_SURCHARGE: {
        // Đề phòng thứ hai: đường chính đã chặn ở ContractsService.update khi bật
        // periodicChargeTypes, nhưng dữ liệu có thể lệch (mall đổi leaseCategory sau khi bật) —
        // không âm thầm tính phụ thu cho hợp đồng ngoài Office.
        if (contract.unit.mall.leaseCategory !== 'OFFICE') {
          throw new BadRequestException('Phụ thu Phí Quản Lý chỉ áp dụng cho hợp đồng thuộc Mall có leaseCategory = OFFICE');
        }
        const area = contract.contractedArea ?? contract.actualArea ?? 0;
        if (!area) throw new BadRequestException('Hợp đồng chưa có diện tích thuê để tính Phụ thu Phí Quản Lý');
        return computeManagementFeeSurcharge(
          { headcount: inputData.headcount },
          { normAreaPerPerson: rates.normAreaPerPerson, surchargePerPerson: rates.surchargePerPerson },
          area,
          period,
        );
      }
      case PeriodicChargeType.UTILITY:
        return computeUtilityCharge(
          {
            elecStart: inputData.elecStart,
            elecEnd: inputData.elecEnd,
            waterStart: inputData.waterStart,
            waterEnd: inputData.waterEnd,
          },
          { electricityUnitPrice: rates.electricityUnitPrice, waterUnitPrice: rates.waterUnitPrice },
          period,
        );
      case PeriodicChargeType.AFTER_HOURS_COOLING:
        return computeAfterHoursCoolingCharge({ hours: inputData.hours }, { hourlyRate: rates.hourlyRate }, period);
    }
  }

  private async getActiveRates(mallId: string, chargeType: PeriodicChargeType, atDate: Date): Promise<Record<string, number>> {
    const rate = await this.prisma.periodicChargeRateConfig.findFirst({
      where: {
        mallId,
        chargeType,
        isActive: true,
        effectiveFrom: { lte: atDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: atDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!rate) {
      throw new BadRequestException(`Chưa cấu hình đơn giá cho loại phí ${chargeType} tại mall này — liên hệ Admin để thiết lập trước khi nhập liệu`);
    }
    return rate.ratesJson as Record<string, number>;
  }

  private async findEntryOrThrow(id: string, mallIds?: string[]) {
    const entry = await this.prisma.periodicChargeEntry.findFirst({
      where: { id, ...(mallIds ? { contract: { unit: { mallId: { in: mallIds } } } } : {}) },
      include: {
        contract: {
          include: {
            tenant: { select: { id: true, brandName: true } },
            unit: { include: { mall: { select: { id: true, name: true, leaseCategory: true } } } },
          },
        },
      },
    });
    if (!entry) throw new NotFoundException('Không tìm thấy kỳ add-in');
    return entry;
  }
}
