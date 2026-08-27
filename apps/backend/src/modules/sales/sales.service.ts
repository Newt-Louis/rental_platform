import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CurrentUser {
  id: string;
  role: string;
  tenantId?: string | null;
}

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async getSubmissionUnits(currentUser: CurrentUser) {
    if (currentUser.role !== 'TENANT' || !currentUser.tenantId) {
      throw new ForbiddenException('Chỉ tài khoản khách thuê được sử dụng danh sách mặt bằng báo cáo');
    }
    return this.prisma.unit.findMany({
      where: { tenantId: currentUser.tenantId },
      select: { id: true, code: true, name: true, areaNLA: true },
      orderBy: { code: 'asc' },
    });
  }

  async findAll(query: { tenantId?: string; period?: string; page?: number; limit?: number }, currentUser?: CurrentUser) {
    const { page = 1, limit = 20, tenantId, period } = query;
    const skip = (page - 1) * +limit;

    const where: any = {};
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

  async create(dto: { tenantId: string; unitId: string; date: string; period: string; grossSales: number; netSales: number; transactions?: number; notes?: string }, userId: string, currentUser?: CurrentUser) {
    if (currentUser?.role === 'TENANT') {
      if (!currentUser.tenantId) throw new ForbiddenException('Tài khoản của bạn chưa được liên kết với khách thuê nào');
      dto = { ...dto, tenantId: currentUser.tenantId };
    }

    const existing = await this.prisma.salesTurnover.findUnique({
      where: { tenantId_unitId_period: { tenantId: dto.tenantId, unitId: dto.unitId, period: dto.period } },
    });

    if (existing) {
      const revised = await this.prisma.salesTurnover.update({
        where: { id: existing.id },
        data: {
          grossSales: dto.grossSales,
          netSales: dto.netSales,
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

  async getSummary(period: string, currentUser?: CurrentUser) {
    const where: any = { period };
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

  async getTopTenants(period: string, limit = 10) {
    const data = await this.prisma.salesTurnover.findMany({
      where: { period },
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

  async getDeadlineStatus(period: string) {
    // Deadline: 10th of the month following the period
    const [year, month] = period.split('-').map(Number);
    const deadlineMonth = month === 12 ? 1 : month + 1;
    const deadlineYear = month === 12 ? year + 1 : year;
    const deadline = new Date(deadlineYear, deadlineMonth - 1, 10, 23, 59, 59);

    const isOverdue = new Date() > deadline;

    // Find active contracts for this period
    const activeContracts = await this.prisma.contract.findMany({
      where: {
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
      where: { period },
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
