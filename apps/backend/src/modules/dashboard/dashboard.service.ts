import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import {
  ContractStatus,
  InvoiceStatus,
  TicketStatus,
  WorkflowStatus,
} from '@prisma/client';

const LEASING_ROLES = new Set([
  'LEASING_EXECUTIVE',
  'LEASING_MANAGER',
  'MALL_DIRECTOR',
  'CEO',
]);

const FINANCE_ROLES = new Set(['FINANCE', 'ADMIN']);

const OPERATION_ROLES = new Set(['OPERATION', 'ADMIN']);

const DASHBOARD_CACHE_TTL = 60;

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private mallUnitFilter(mallId?: string) {
    return mallId ? { floor: { mallId } } : {};
  }

  private focusAreasForRole(role?: string): string[] {
    if (!role) return ['overview'];
    if (FINANCE_ROLES.has(role)) return ['billing', 'sales', 'contracts'];
    if (OPERATION_ROLES.has(role)) return ['tickets', 'fitout'];
    if (LEASING_ROLES.has(role)) return ['occupancy', 'booking', 'approvals', 'pipeline'];
    if (role === 'LEGAL') return ['contracts', 'approvals'];
    return ['overview'];
  }

  async getDashboard(mallId?: string, role?: string) {
    const cacheKey = `dashboard:v1:${mallId ?? 'all'}:${role ?? 'all'}`;
    const cached = await this.redis.getJson<Awaited<ReturnType<DashboardService['buildDashboard']>>>(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    const result = await this.buildDashboard(mallId, role);
    await this.redis.setJson(cacheKey, result, DASHBOARD_CACHE_TTL);
    return result;
  }

  private async buildDashboard(mallId?: string, role?: string) {
    const today = new Date();
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const in90 = new Date(today);
    in90.setDate(in90.getDate() + 90);

    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const unitWhere = { isActive: true, ...this.mallUnitFilter(mallId) };
    const contractMallWhere = mallId
      ? { unit: { floor: { mallId } } }
      : {};

    const [
      units,
      expiringIn30,
      expiringIn90,
      pendingApprovals,
      openTickets,
      monthInvoices,
      overdueInvoices,
      tenantCount,
    ] = await Promise.all([
      this.prisma.unit.findMany({
        where: unitWhere,
        select: { status: true, areaNLA: true },
      }),
      this.prisma.contract.count({
        where: {
          isActive: true,
          status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
          endDate: { lte: in30 },
          ...contractMallWhere,
        },
      }),
      this.prisma.contract.count({
        where: {
          isActive: true,
          status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
          endDate: { lte: in90 },
          ...contractMallWhere,
        },
      }),
      this.prisma.approvalWorkflow.count({
        where: {
          status: WorkflowStatus.IN_PROGRESS,
          ...(mallId
            ? { proposal: { unit: { floor: { mallId } } } }
            : {}),
        },
      }),
      this.prisma.ticket.count({
        where: {
          isActive: true,
          status: { notIn: [TicketStatus.CLOSED, TicketStatus.RESOLVED] },
          ...(mallId ? { unit: { floor: { mallId } } } : {}),
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          isActive: true,
          period: currentMonth,
          ...(mallId
            ? { contract: { unit: { floor: { mallId } } } }
            : {}),
        },
        select: { totalAmount: true, status: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          isActive: true,
          status: InvoiceStatus.OVERDUE,
          ...(mallId
            ? { contract: { unit: { floor: { mallId } } } }
            : {}),
        },
        select: { totalAmount: true },
      }),
      mallId
        ? this.prisma.tenant.count({
            where: {
              isActive: true,
              deletedAt: null,
              contracts: {
                some: {
                  isActive: true,
                  status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
                  unit: { floor: { mallId } },
                },
              },
            },
          })
        : this.prisma.tenant.count({ where: { isActive: true, deletedAt: null } }),
    ]);

    const totalArea = units.reduce((s, u) => s + u.areaNLA, 0);
    const vacantArea = units.filter((u) => u.status === 'VACANT').reduce((s, u) => s + u.areaNLA, 0);
    const leasedArea = units.filter((u) => u.status === 'OCCUPIED').reduce((s, u) => s + u.areaNLA, 0);
    const occupancyRate = totalArea > 0 ? (leasedArea / totalArea) * 100 : 0;

    const monthlyRevenue = monthInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const collectedRevenue = monthInvoices
      .filter((i) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID')
      .reduce((s, i) => s + i.totalAmount, 0);
    const overdueAmount = overdueInvoices.reduce((s, i) => s + i.totalAmount, 0);

    return {
      mallId: mallId ?? null,
      focusAreas: this.focusAreasForRole(role),
      occupancyRate: +occupancyRate.toFixed(1),
      totalArea,
      vacantArea,
      leasedArea,
      totalTenants: tenantCount,
      monthlyRevenue,
      collectedRevenue,
      overdueAmount,
      overdueCount: overdueInvoices.length,
      expiringIn30,
      expiringIn90,
      pendingApprovals,
      openTickets,
    };
  }

  async getCrossMallDashboard() {
    const malls = await this.prisma.mall.findMany({
      where: { isActive: true },
      include: {
        floors: {
          include: {
            units: {
              select: { status: true, areaNLA: true },
            },
          },
        },
      },
    });

    const currentMonth = new Date().toISOString().slice(0, 7);

    const mallData = await Promise.all(
      malls.map(async (mall) => {
        const units = mall.floors.flatMap((f) => f.units);
        const totalArea = units.reduce((s, u) => s + u.areaNLA, 0);
        const leasedArea = units.filter((u) => u.status === 'OCCUPIED').reduce((s, u) => s + u.areaNLA, 0);
        const vacantArea = units.filter((u) => u.status === 'VACANT').reduce((s, u) => s + u.areaNLA, 0);
        const occupancyRate = totalArea > 0 ? (leasedArea / totalArea) * 100 : 0;

        const [invoices, overdueCount, openTickets, expiringIn30] = await Promise.all([
          this.prisma.invoice.findMany({
            where: {
              isActive: true,
              period: { startsWith: currentMonth },
              contract: { unit: { floor: { mallId: mall.id } } },
            },
            select: { totalAmount: true, status: true },
          }),
          this.prisma.invoice.count({
            where: {
              isActive: true,
              status: InvoiceStatus.OVERDUE,
              contract: { unit: { floor: { mallId: mall.id } } },
            },
          }),
          this.prisma.ticket.count({
            where: {
              isActive: true,
              status: { notIn: [TicketStatus.CLOSED, TicketStatus.RESOLVED] },
              unit: { floor: { mallId: mall.id } },
            },
          }),
          this.prisma.contract.count({
            where: {
              isActive: true,
              status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
              endDate: { lte: new Date(Date.now() + 30 * 86400000) },
              unit: { floor: { mallId: mall.id } },
            },
          }),
        ]);

        const monthlyRevenue = invoices.reduce((s, i) => s + i.totalAmount, 0);
        const collectedRevenue = invoices
          .filter((i) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID')
          .reduce((s, i) => s + i.totalAmount, 0);

        return {
          mall: { id: mall.id, name: mall.name, code: mall.code, city: mall.city },
          occupancyRate: +occupancyRate.toFixed(1),
          totalArea,
          leasedArea,
          vacantArea,
          unitCount: units.length,
          monthlyRevenue,
          collectedRevenue,
          collectionRate: monthlyRevenue > 0 ? +((collectedRevenue / monthlyRevenue) * 100).toFixed(1) : 0,
          overdueCount,
          openTickets,
          expiringIn30,
        };
      }),
    );

    const totals = mallData.reduce(
      (acc, m) => ({
        totalArea: acc.totalArea + m.totalArea,
        leasedArea: acc.leasedArea + m.leasedArea,
        monthlyRevenue: acc.monthlyRevenue + m.monthlyRevenue,
        collectedRevenue: acc.collectedRevenue + m.collectedRevenue,
        overdueCount: acc.overdueCount + m.overdueCount,
        openTickets: acc.openTickets + m.openTickets,
        expiringIn30: acc.expiringIn30 + m.expiringIn30,
      }),
      { totalArea: 0, leasedArea: 0, monthlyRevenue: 0, collectedRevenue: 0, overdueCount: 0, openTickets: 0, expiringIn30: 0 },
    );

    return {
      malls: mallData,
      totals: {
        ...totals,
        occupancyRate: totals.totalArea > 0 ? +((totals.leasedArea / totals.totalArea) * 100).toFixed(1) : 0,
        collectionRate: totals.monthlyRevenue > 0 ? +((totals.collectedRevenue / totals.monthlyRevenue) * 100).toFixed(1) : 0,
      },
    };
  }
}
