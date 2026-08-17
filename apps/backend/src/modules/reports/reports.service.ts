import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStatus } from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { summarizeOccupancyByLeaseTerm, summarizeShortBookingPipeline } from '../../common/utils/lease-term-analytics';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private billingService: BillingService,
    private auditLogService: AuditLogService,
  ) {}

  async occupancyReport(mallId?: string) {
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;

    const units = await this.prisma.unit.findMany({
      where,
      include: {
        floor: { select: { name: true } },
        tenant: { select: { brandName: true } },
      },
    });

    const slotBookings = await this.prisma.slotBooking.findMany({
      where: { slot: { unit: { ...where, leaseTermType: 'SHORT' } } },
      select: {
        status: true,
        installationStartDatetime: true,
        dismantlingEndDatetime: true,
        startDatetime: true,
        endDatetime: true,
        totalAmount: true,
        slot: { select: { id: true, unitId: true, area: true } },
      },
    });
    const occupancyByLeaseTerm = summarizeOccupancyByLeaseTerm(units, slotBookings);

    const byStatus = units.reduce((acc, u) => {
      acc[u.status] = (acc[u.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byFloor = units.reduce((acc, u) => {
      const floor = u.floor?.name ?? 'Unknown';
      if (!acc[floor]) acc[floor] = { total: 0, occupied: 0, area: 0 };
      acc[floor].total++;
      acc[floor].area += u.areaNLA;
      if (u.status === 'OCCUPIED') acc[floor].occupied++;
      return acc;
    }, {} as Record<string, any>);

    const buildSegment = (leaseTermType: 'LONG' | 'SHORT') => ({
      ...occupancyByLeaseTerm[leaseTermType],
      byStatus: units.filter((unit) => unit.leaseTermType === leaseTermType).reduce((acc, unit) => {
        acc[unit.status] = (acc[unit.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byFloor: units.filter((unit) => unit.leaseTermType === leaseTermType).reduce((acc, unit) => {
        const floor = unit.floor?.name ?? 'Unknown';
        if (!acc[floor]) acc[floor] = { total: 0, occupied: 0, area: 0 };
        acc[floor].total++;
        acc[floor].area += unit.areaNLA;
        if (unit.status === 'OCCUPIED') acc[floor].occupied++;
        return acc;
      }, {} as Record<string, { total: number; occupied: number; area: number }>),
    });

    return {
      byStatus,
      byFloor,
      total: units.length,
      byLeaseTerm: {
        LONG: buildSegment('LONG'),
        SHORT: { ...buildSegment('SHORT'), bookingStats: summarizeShortBookingPipeline(slotBookings) },
      },
    };
  }

  async pipelineReport() {
    const leads = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { isActive: true },
      _count: true,
    });

    const proposals = await this.prisma.proposal.groupBy({
      by: ['status'],
      where: { isActive: true },
      _count: true,
      _sum: { totalContractValue: true },
    });

    const leadRows = await this.prisma.lead.findMany({
      where: { isActive: true },
      select: { status: true, leaseTermType: true },
    });
    const groupLeads = (leaseTermType: 'LONG' | 'SHORT') => Object.entries(
      leadRows.filter((lead) => lead.leaseTermType === leaseTermType).reduce((acc, lead) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    ).map(([status, count]) => ({ status, _count: count }));

    return {
      leads,
      proposals,
      byLeaseTerm: {
        LONG: { leads: groupLeads('LONG'), proposals },
        SHORT: { leads: groupLeads('SHORT'), proposals: [] },
      },
    };
  }

  async revenueReport(params: { year?: number; month?: number }) {
    const year = params.year ?? new Date().getFullYear();
    const periods: string[] = [];

    if (params.month) {
      periods.push(`${year}-${String(params.month).padStart(2, '0')}`);
    } else {
      for (let m = 1; m <= 12; m++) {
        periods.push(`${year}-${String(m).padStart(2, '0')}`);
      }
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { isActive: true, period: { in: periods } },
      select: { period: true, totalAmount: true, status: true, vatAmount: true },
    });

    const byPeriod = periods.map((period) => {
      const periodInvs = invoices.filter((i) => i.period === period);
      return {
        period,
        total: periodInvs.reduce((s, i) => s + i.totalAmount, 0),
        paid: periodInvs.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.totalAmount, 0),
        count: periodInvs.length,
      };
    });

    return { year, byPeriod };
  }

  async contractExpiryReport(params: { days?: number }) {
    const days = params.days ?? 180;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const contracts = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        endDate: { lte: cutoff },
      },
      include: {
        tenant: { select: { brandName: true, contactEmail: true, contactPhone: true } },
        unit: { select: { code: true, name: true, floor: { select: { name: true } } } },
      },
      orderBy: { endDate: 'asc' },
    });

    return contracts.map((c) => ({
      ...c,
      daysRemaining: Math.floor((new Date(c.endDate).getTime() - Date.now()) / 86400000),
    }));
  }

  async tenantSalesReport(params: { period: string }) {
    const sales = await this.prisma.salesTurnover.findMany({
      where: { period: params.period },
      include: {
        tenant: { select: { brandName: true, category: true } },
        unit: { select: { code: true, areaNLA: true } },
      },
      orderBy: { grossSales: 'desc' },
    });

    return sales.map((s) => ({
      ...s,
      salesPerSqm: s.unit.areaNLA > 0 ? s.netSales / s.unit.areaNLA : 0,
    }));
  }

  /**
   * Doanh thu & Công nợ chi tiết — thay cho "P&L" vì hệ thống không có bảng chi phí/OPEX nào,
   * không thể tính lãi/lỗ thật mà không bịa số liệu. Đây là nửa doanh thu của P&L: phát hành vs
   * đã thu (loại trừ bút toán đã đảo) vs còn phải thu, theo loại hoá đơn và theo tháng.
   */
  async revenueReceivablesReport(params: { year?: number }) {
    const year = params.year ?? new Date().getFullYear();

    const invoices = await this.prisma.invoice.findMany({
      where: { isActive: true, period: { startsWith: `${year}-` } },
      select: {
        period: true,
        type: true,
        totalAmount: true,
        status: true,
        payments: { select: { amount: true, reversedAt: true } },
      },
    });

    const collected = (inv: (typeof invoices)[number]) =>
      inv.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0);

    const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalCollected = invoices.reduce((s, i) => s + collected(i), 0);
    const totalOutstanding = totalBilled - totalCollected;
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 1000) / 10 : 0;

    const byType: Record<string, { billed: number; collected: number }> = {};
    for (const inv of invoices) {
      if (!byType[inv.type]) byType[inv.type] = { billed: 0, collected: 0 };
      byType[inv.type].billed += inv.totalAmount;
      byType[inv.type].collected += collected(inv);
    }

    const byPeriod: Record<string, { billed: number; collected: number }> = {};
    for (const inv of invoices) {
      if (!byPeriod[inv.period]) byPeriod[inv.period] = { billed: 0, collected: 0 };
      byPeriod[inv.period].billed += inv.totalAmount;
      byPeriod[inv.period].collected += collected(inv);
    }

    return {
      year,
      totalBilled,
      totalCollected,
      totalOutstanding,
      collectionRate,
      byType: Object.entries(byType).map(([type, v]) => ({ type, ...v })),
      byPeriod: Object.entries(byPeriod).sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, ...v })),
    };
  }

  /** Công nợ theo tuổi nợ — dùng lại đúng logic đối soát của Billing, không viết lại. */
  async arAgingReport() {
    return this.billingService.getArAging();
  }

  /** Báo cáo tuân thủ tổng hợp từ Nhật ký hệ thống — ai sửa gì, tỷ lệ lỗi, theo loại đối tượng. */
  async complianceReport(params: { dateFrom?: string }) {
    const dateFrom = params.dateFrom ?? new Date(Date.now() - 30 * 86400000).toISOString();
    const [stats, entityTypes] = await Promise.all([
      this.auditLogService.getStats(dateFrom),
      this.auditLogService.listEntityTypes(),
    ]);

    const recentErrors = await this.auditLogService.findAll({
      status: 'ERROR',
      dateFrom,
      limit: 20,
    });

    return {
      dateFrom,
      totalActions: stats.total,
      errorCount: stats.errorCount,
      errorRate: stats.total > 0 ? Math.round((stats.errorCount / stats.total) * 1000) / 10 : 0,
      byAction: stats.byAction,
      entityTypesTracked: entityTypes.length,
      recentErrors: recentErrors.data,
    };
  }

  async exportCsv(type: string, from?: string, to?: string): Promise<string> {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 86400000);
    const toDate = to ? new Date(to) : new Date();

    if (type === 'revenue') {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          isActive: true,
          createdAt: { gte: fromDate, lte: toDate },
        },
        include: {
          tenant: { select: { brandName: true } },
          contract: { select: { contractNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      const header = ['Số HĐ', 'Khách thuê', 'Kỳ', 'Loại', 'Tổng tiền', 'Trạng thái', 'Ngày tạo'];
      const rows = invoices.map((i) => [
        i.contract?.contractNumber ?? '',
        i.tenant?.brandName ?? '',
        i.period,
        i.type,
        i.totalAmount.toFixed(0),
        i.status,
        new Date(i.createdAt).toLocaleDateString('vi-VN'),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`));
      return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    if (type === 'occupancy') {
      const units = await this.prisma.unit.findMany({
        where: { isActive: true },
        include: {
          floor: { include: { mall: { select: { name: true } } } },
          zone: { select: { name: true } },
        },
      });
      const header = ['Mall', 'Tầng', 'Zone', 'Mã lô', 'Tên lô', 'Diện tích NLA', 'Trạng thái'];
      const rows = units.map((u) => [
        u.floor?.mall?.name ?? '',
        u.floor?.name ?? '',
        u.zone?.name ?? '',
        u.code,
        u.name,
        u.areaNLA.toFixed(0),
        u.status,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`));
      return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    if (type === 'expiry') {
      const contracts = await this.prisma.contract.findMany({
        where: {
          isActive: true,
          status: { in: ['ACTIVE', 'EXPIRING'] },
          endDate: { gte: fromDate, lte: toDate },
        },
        include: {
          tenant: { select: { brandName: true } },
          unit: { select: { code: true } },
        },
        orderBy: { endDate: 'asc' },
      });
      const header = ['Số HĐ', 'Khách thuê', 'Lô', 'Trạng thái', 'Ngày BĐ', 'Ngày KT', 'Số ngày còn lại'];
      const rows = contracts.map((c) => [
        c.contractNumber,
        c.tenant?.brandName ?? '',
        c.unit?.code ?? '',
        c.status,
        new Date(c.startDate).toLocaleDateString('vi-VN'),
        new Date(c.endDate).toLocaleDateString('vi-VN'),
        Math.floor((new Date(c.endDate).getTime() - Date.now()) / 86400000).toString(),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`));
      return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    throw new BadRequestException(`Loại báo cáo '${type}' không được hỗ trợ (chỉ hỗ trợ: revenue, occupancy, expiry)`);
  }
}
