import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CurrencyCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CONTRACT_PERIOD_SELECT,
  contractPeriodCandidateWhere,
  isContractResolutionFailure,
  resolveContractForPeriod,
} from '../../common/finance/contract-period-resolver';

interface CurrentUser {
  id: string;
  role: string;
  tenantId?: string | null;
}

/**
 * MALL-001 / BC-007 -- how a Mall scope is applied to SalesTurnover.
 *
 * `null` means "no Mall restriction" and is reachable ONLY for the roles
 * MallAccessService lets bypass the check (ADMIN, and TENANT which is bounded by
 * tenantId instead). `[]` means "this user reaches no Mall", and must return
 * nothing rather than everything -- so it is applied as a filter like any other
 * list, never treated as an absent filter.
 *
 * SalesTurnover has no mallId of its own; the owning Mall is the Unit's, and
 * `Unit.mallId` is NOT NULL (verified against schema.prisma), so no row can
 * escape the filter by having a null Mall.
 */
function unitMallScope(mallIds?: string[] | null) {
  return mallIds ? { unit: { mallId: { in: mallIds } } } : {};
}

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async getSubmissionUnits(currentUser: CurrentUser) {
    if (currentUser.role !== 'TENANT' || !currentUser.tenantId) {
      throw new ForbiddenException('Chỉ tài khoản khách thuê được sử dụng danh sách mặt bằng báo cáo');
    }
    const units = await this.prisma.unit.findMany({
      where: { tenantId: currentUser.tenantId },
      select: { id: true, code: true, name: true, areaNLA: true },
      orderBy: { code: 'asc' },
    });

    // CUR-001 — turnover must be reported in the Contract's currency, so the
    // submission form needs to know and display that currency per unit rather
    // than leaving the tenant to guess (or the backend to assume VND).
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId: currentUser.tenantId,
        unitId: { in: units.map((u) => u.id) },
        isActive: true,
        status: { in: ['ACTIVE', 'EXPIRING'] },
      },
      select: { unitId: true, currencyCode: true },
    });
    const currencyByUnit = new Map(contracts.map((c) => [c.unitId, c.currencyCode]));

    return units.map((unit) => ({
      ...unit,
      // null when the unit has no live contract — the UI must then ask the user
      // to choose explicitly instead of defaulting.
      contractCurrencyCode: currencyByUnit.get(unit.id) ?? null,
    }));
  }

  async findAll(
    query: { tenantId?: string; period?: string; page?: number; limit?: number },
    currentUser?: CurrentUser,
    mallIds?: string[] | null,
  ) {
    const { page = 1, limit = 20, tenantId, period } = query;
    const skip = (page - 1) * +limit;

    const where: any = { ...unitMallScope(mallIds) };
    if (currentUser?.role === 'TENANT') {
      // Không tin tưởng tenantId client gửi lên — luôn ép theo tenant của người đăng nhập.
      where.tenantId = currentUser.tenantId ?? '__none__';
    } else if (tenantId) {
      where.tenantId = tenantId;
    }
    if (period) where.period = period;

    const [data, total] = await Promise.all([
      this.prisma.salesTurnover.findMany({
        where,
        skip,
        take: +limit,
        include: {
          tenant: { select: { id: true, brandName: true } },
          unit: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ period: 'desc' }, { tenant: { brandName: 'asc' } }],
      }),
      this.prisma.salesTurnover.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  /**
   * CUR-001 — turnover must be reported in the Contract's currency.
   *
   * Business policy (confirmed 2026-09-06): no FX conversion exists in this
   * platform, so revenue-share cannot mix units. Rather than converting or
   * assuming, a mismatch is rejected at the point of entry — the earliest place
   * a human can still correct it — and again at billing time.
   *
   * When no live contract exists for the tenant/unit there is nothing to
   * validate against; the turnover is still recorded with its explicit
   * currency, and revenue-share generation will re-check before it bills.
   */
  private async assertTurnoverCurrencyMatchesContract(
    tenantId: string,
    unitId: string,
    period: string,
    currencyCode: CurrencyCode,
  ) {
    // REVSHARE-01 — resolve the SAME contract billing will resolve. Sales
    // submission and revenue-share generation must never disagree about which
    // contract governs a turnover row; both go through
    // `resolveContractForPeriod` over `contractPeriodCandidateWhere`.
    const candidates = await this.prisma.contract.findMany({
      where: contractPeriodCandidateWhere({ tenantId, unitId }),
      select: CONTRACT_PERIOD_SELECT,
    });
    const resolution = resolveContractForPeriod(candidates, { period, tenantId, unitId });

    // No single governing contract (none, ambiguous, or a split period) means
    // there is nothing to validate the currency against. The turnover is still
    // recorded with its explicit currency; revenue-share generation fails
    // closed on the same condition, so nothing is mis-billed in the meantime.
    if (isContractResolutionFailure(resolution)) return;

    const contract = resolution.contract;
    if (contract.currencyCode !== currencyCode) {
      throw new BadRequestException({
        code: 'TURNOVER_CURRENCY_MISMATCH',
        message:
          `Doanh thu khai báo bằng ${currencyCode} nhưng hợp đồng ${contract.contractNumber} ` +
          `dùng ${contract.currencyCode}. Hệ thống không quy đổi ngoại tệ — vui lòng khai báo ` +
          `doanh thu theo đúng đơn vị tiền tệ của hợp đồng.`,
        contractId: contract.id,
        contractCurrency: contract.currencyCode,
        turnoverCurrency: currencyCode,
      });
    }
  }

  async create(dto: { tenantId: string; unitId: string; date: string; period: string; grossSales: number; netSales: number; currencyCode: CurrencyCode; transactions?: number; notes?: string }, userId: string, currentUser?: CurrentUser) {
    if (currentUser?.role === 'TENANT') {
      if (!currentUser.tenantId) throw new ForbiddenException('Tài khoản của bạn chưa được liên kết với khách thuê nào');
      dto = { ...dto, tenantId: currentUser.tenantId };
    }

    await this.assertTurnoverCurrencyMatchesContract(dto.tenantId, dto.unitId, dto.period, dto.currencyCode);

    const existing = await this.prisma.salesTurnover.findUnique({
      where: { tenantId_unitId_period: { tenantId: dto.tenantId, unitId: dto.unitId, period: dto.period } },
    });

    if (existing) {
      const revised = await this.prisma.salesTurnover.update({
        where: { id: existing.id },
        data: {
          grossSales: dto.grossSales,
          netSales: dto.netSales,
          currencyCode: dto.currencyCode,
          transactions: dto.transactions ?? 0,
          notes: dto.notes,
          recordedById: userId,
          // Số liệu thay đổi — duyệt cũ không còn áp dụng, phải soát lại từ đầu.
          status: 'PENDING',
        },
      });
      await this.prisma.salesAuditTrail.create({
        data: { salesId: existing.id, action: 'REVISED', oldValue: existing.grossSales, newValue: dto.grossSales, reason: dto.notes, performedById: userId },
      });
      return revised;
    }

    const submitted = await this.prisma.salesTurnover.create({
      data: {
        tenantId: dto.tenantId,
        unitId: dto.unitId,
        date: new Date(dto.date),
        period: dto.period,
        grossSales: dto.grossSales,
        netSales: dto.netSales,
        currencyCode: dto.currencyCode,
        transactions: dto.transactions ?? 0,
        notes: dto.notes,
        recordedById: userId,
      },
    });
    await this.prisma.salesAuditTrail.create({
      data: { salesId: submitted.id, action: 'SUBMITTED', oldValue: null, newValue: dto.grossSales, reason: dto.notes, performedById: userId },
    });
    return submitted;
  }

  async getSummary(period: string, currentUser?: CurrentUser, mallIds?: string[] | null) {
    const where: any = { period, ...unitMallScope(mallIds) };
    if (currentUser?.role === 'TENANT') {
      where.tenantId = currentUser.tenantId ?? '__none__';
    }

    const data = await this.prisma.salesTurnover.findMany({
      where,
      include: {
        tenant: { select: { id: true, brandName: true } },
        unit: { select: { id: true, code: true, areaNLA: true } },
      },
    });

    const totalGross = data.reduce((s, r) => s + r.grossSales, 0);
    const totalNet = data.reduce((s, r) => s + r.netSales, 0);
    const totalTxn = data.reduce((s, r) => s + r.transactions, 0);

    return { period, totalGross, totalNet, totalTxn, count: data.length, records: data };
  }

  async getTopTenants(period: string, limit = 10, mallIds?: string[] | null) {
    const data = await this.prisma.salesTurnover.findMany({
      where: { period, ...unitMallScope(mallIds) },
      include: {
        tenant: { select: { id: true, brandName: true } },
        unit: { select: { id: true, code: true, areaNLA: true } },
      },
      orderBy: { grossSales: 'desc' },
      take: +limit || 10,
    });

    return data.map((r, i) => ({
      id: r.id,
      rank: i + 1,
      tenant: r.tenant,
      unit: r.unit,
      grossSales: r.grossSales,
      netSales: r.netSales,
      status: r.status,
      salesPerSqm: r.unit.areaNLA > 0 ? r.netSales / r.unit.areaNLA : 0,
    }));
  }

  // ── Audit Trail ─────────────────────────────────────────────────────────────

  async getAuditTrail(salesId: string) {
    // Mall ownership of `salesId` is validated by the caller through
    // MallAccessService's `salesTurnoverId` resolver before this runs.
    return this.prisma.salesAuditTrail.findMany({
      where: { salesId },
      include: { performedBy: { select: { id: true, fullName: true, role: true } } },
      orderBy: { performedAt: 'desc' },
    });
  }

  async addAuditEntry(salesId: string, action: 'SUBMITTED' | 'REVISED' | 'APPROVED' | 'DISPUTED', oldValue: number | null, newValue: number, reason: string | undefined, performedById: string) {
    const sales = await this.prisma.salesTurnover.findUnique({ where: { id: salesId } });
    if (!sales) throw new NotFoundException('SalesTurnover not found');

    return this.prisma.salesAuditTrail.create({
      data: { salesId, action, oldValue, newValue, reason, performedById },
    });
  }

  async approveSales(salesId: string, userId: string) {
    const sales = await this.prisma.salesTurnover.findUnique({ where: { id: salesId } });
    if (!sales) throw new NotFoundException('SalesTurnover not found');

    await this.prisma.salesTurnover.update({ where: { id: salesId }, data: { status: 'APPROVED' } });

    await this.prisma.salesAuditTrail.create({
      data: { salesId, action: 'APPROVED', oldValue: null, newValue: sales.grossSales, performedById: userId },
    });

    return { salesId, status: 'APPROVED' };
  }

  async disputeSales(salesId: string, reason: string, userId: string) {
    const sales = await this.prisma.salesTurnover.findUnique({ where: { id: salesId } });
    if (!sales) throw new NotFoundException('SalesTurnover not found');

    await this.prisma.salesTurnover.update({ where: { id: salesId }, data: { status: 'DISPUTED' } });

    await this.prisma.salesAuditTrail.create({
      data: { salesId, action: 'DISPUTED', oldValue: null, newValue: sales.grossSales, reason, performedById: userId },
    });

    return { salesId, status: 'DISPUTED' };
  }

  // ── Deadline Enforcement ─────────────────────────────────────────────────────

  async getDeadlineStatus(period: string, mallIds?: string[] | null) {
    // Deadline: 10th of the month following the period
    const [year, month] = period.split('-').map(Number);
    const deadlineMonth = month === 12 ? 1 : month + 1;
    const deadlineYear = month === 12 ? year + 1 : year;
    const deadline = new Date(deadlineYear, deadlineMonth - 1, 10, 23, 59, 59);

    const isOverdue = new Date() > deadline;

    // Find active contracts for this period
    const activeContracts = await this.prisma.contract.findMany({
      where: {
        ...unitMallScope(mallIds),
        isActive: true,
        status: { in: ['ACTIVE', 'EXPIRING'] },
        startDate: { lte: new Date(`${period}-28`) },
        endDate: { gte: new Date(`${period}-01`) },
        proposal: { revenueSharePercent: { gt: 0 } },
      },
      include: {
        tenant: { select: { id: true, brandName: true } },
        unit: { select: { id: true, code: true } },
      },
    });

    // Find submitted records for this period
    const submitted = await this.prisma.salesTurnover.findMany({
      where: { period, ...unitMallScope(mallIds) },
      select: { tenantId: true, unitId: true, grossSales: true, createdAt: true },
    });

    const submittedKeys = new Set(submitted.map((s) => `${s.tenantId}:${s.unitId}`));

    const missing = activeContracts
      .filter((c) => !submittedKeys.has(`${c.tenantId}:${c.unitId}`))
      .map((c) => ({ tenant: c.tenant, unit: c.unit, contractId: c.id }));

    return {
      period,
      deadline: deadline.toISOString(),
      isOverdue,
      totalRequired: activeContracts.length,
      submitted: submitted.length,
      missing,
      complianceRate: activeContracts.length > 0 ? Math.round((submitted.length / activeContracts.length) * 100) : 100,
    };
  }
}
