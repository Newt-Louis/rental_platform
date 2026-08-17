import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { MallAccessService } from '../../common/services/mall-access.service';
import {
  ContractStatus,
  InvoiceStatus,
  TicketStatus,
  WorkflowStatus,
} from '@prisma/client';
import {
  summarizeOccupancyByLeaseTerm,
  summarizeShortBookingPipeline,
} from '../../common/utils/lease-term-analytics';

const LEASING_ROLES = new Set([
  'LEASING_EXECUTIVE',
  'LEASING_MANAGER',
  'MALL_DIRECTOR',
  'CEO',
]);

const FINANCE_ROLES = new Set(['FINANCE', 'ADMIN']);

const OPERATION_ROLES = new Set(['OPERATION', 'ADMIN']);
const OVERVIEW_ROLES = new Set(['ADMIN', 'CEO', 'MALL_DIRECTOR']);

const DASHBOARD_CACHE_TTL = 60;

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private mallAccess: MallAccessService,
  ) {}

  private unitMallFilter(mallIds: string[] | null) {
    if (mallIds === null) return {};
    return {
      OR: [
        { mallId: { in: mallIds } },
        { floor: { mallId: { in: mallIds } } },
      ],
    };
  }

  private focusAreasForRole(role?: string): string[] {
    if (!role) return ['overview'];
    if (OVERVIEW_ROLES.has(role)) return ['overview'];
    if (FINANCE_ROLES.has(role)) return ['billing', 'sales', 'contracts'];
    if (OPERATION_ROLES.has(role)) return ['tickets', 'fitout'];
    if (LEASING_ROLES.has(role)) return ['occupancy', 'booking', 'approvals', 'pipeline'];
    if (role === 'LEGAL') return ['contracts', 'approvals'];
    return ['overview'];
  }

  /**
   * healthScore chỉ được cộng từ các thành phần mà role đó thực sự nhận trong response
   * (occupancy cho Leasing/Overview, collection cho Finance/Overview) — tránh tình trạng
   * FE luôn áp công thức occupancy*0.55+collection*0.45 trong khi field bị shapeForRole lược bỏ.
   */
  private healthScoreForRole(role: string | undefined, occupancyRate: number, collectionRate: number): number | null {
    if (!role || OVERVIEW_ROLES.has(role)) {
      return Math.round(occupancyRate * 0.55 + collectionRate * 0.45);
    }
    if (role === 'FINANCE') return Math.round(collectionRate);
    if (LEASING_ROLES.has(role)) return Math.round(occupancyRate);
    return null;
  }

  private shapeForRole(data: Record<string, any>, role?: string) {
    if (!role || OVERVIEW_ROLES.has(role)) return data;
    const base = { mallId: data.mallId, focusAreas: data.focusAreas, healthScore: data.healthScore };
    if (role === 'FINANCE') return {
      ...base,
      totalTenants: data.totalTenants,
      monthlyRevenue: data.monthlyRevenue,
      collectedRevenue: data.collectedRevenue,
      collectionRate: data.collectionRate,
      overdueAmount: data.overdueAmount,
      overdueCount: data.overdueCount,
      expiringIn30: data.expiringIn30,
      expiringIn90: data.expiringIn90,
    };
    if (role === 'OPERATION') return { ...base, openTickets: data.openTickets };
    if (role === 'LEGAL') return {
      ...base,
      expiringIn30: data.expiringIn30,
      expiringIn90: data.expiringIn90,
      pendingApprovals: data.pendingApprovals,
    };
    return {
      ...base,
      occupancyRate: data.occupancyRate,
      totalArea: data.totalArea,
      vacantArea: data.vacantArea,
      leasedArea: data.leasedArea,
      totalTenants: data.totalTenants,
      expiringIn30: data.expiringIn30,
      expiringIn90: data.expiringIn90,
      pendingApprovals: data.pendingApprovals,
      bookingStats: data.bookingStats,
      byLeaseTerm: data.byLeaseTerm,
    };
  }

  async getDashboard(mallId?: string, user?: { id: string; role: string }, forceRefresh = false) {
    const role = user?.role;
    let mallIds: string[] | null = mallId ? [mallId] : null;
    if (user) {
      if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
      else mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    }

    const scopeKey = mallId ?? (mallIds === null ? 'all' : `user:${user?.id ?? 'none'}`);
    const cacheKey = `dashboard:v3:${scopeKey}:${role ?? 'all'}`;
    if (!forceRefresh) {
      const cached = await this.redis.getJson<Awaited<ReturnType<DashboardService['buildDashboard']>>>(cacheKey);
      if (cached) {
        return { ...cached, fromCache: true };
      }
    }

    const result = this.shapeForRole(await this.buildDashboard(mallIds, mallId, role), role);
    await this.redis.setJson(cacheKey, result, DASHBOARD_CACHE_TTL);
    return result;
  }

  private async buildDashboard(mallIds: string[] | null, mallId?: string, role?: string) {
    const today = new Date();
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const in90 = new Date(today);
    in90.setDate(in90.getDate() + 90);

    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const unitScope = this.unitMallFilter(mallIds);
    const unitWhere = { isActive: true, ...unitScope };
    const relationScope = mallIds === null ? {} : { unit: unitScope };

    const [
      units,
      expiringIn30,
      expiringIn90,
      pendingApprovals,
      openTickets,
      monthInvoices,
      overdueInvoices,
      tenantCount,
      activeBookings,
      pendingBookings,
      expiringBookings,
      slotBookings,
    ] = await Promise.all([
      this.prisma.unit.findMany({
        where: unitWhere,
        select: { id: true, status: true, areaNLA: true, leaseTermType: true },
      }),
      this.prisma.contract.count({
        where: {
          isActive: true,
          status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
          endDate: { gte: today, lte: in30 },
          ...relationScope,
        },
      }),
      this.prisma.contract.count({
        where: {
          isActive: true,
          status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
          endDate: { gte: today, lte: in90 },
          ...relationScope,
        },
      }),
      this.prisma.approvalWorkflow.count({
        where: {
          status: WorkflowStatus.IN_PROGRESS,
          ...(mallIds === null ? {} : { proposal: { unit: unitScope } }),
        },
      }),
      this.prisma.ticket.count({
        where: {
          isActive: true,
          status: { notIn: [TicketStatus.CLOSED, TicketStatus.RESOLVED] },
          ...relationScope,
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          isActive: true,
          period: currentMonth,
          ...(mallIds === null ? {} : { contract: { unit: unitScope } }),
        },
        select: {
          totalAmount: true,
          status: true,
          payments: { where: { reversedAt: null }, select: { amount: true } },
          contract: { select: { unit: { select: { leaseTermType: true } } } },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          isActive: true,
          status: InvoiceStatus.OVERDUE,
          ...(mallIds === null ? {} : { contract: { unit: unitScope } }),
        },
        select: {
          totalAmount: true,
          payments: { where: { reversedAt: null }, select: { amount: true } },
          contract: { select: { unit: { select: { leaseTermType: true } } } },
        },
      }),
      mallIds !== null
        ? this.prisma.tenant.count({
            where: {
              isActive: true,
              deletedAt: null,
              contracts: {
                some: {
                  isActive: true,
                  status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
                  unit: unitScope,
                },
              },
            },
          })
        : this.prisma.tenant.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.unitBooking.count({
        where: { isActive: true, status: 'ACTIVE', ...relationScope },
      }),
      this.prisma.unitBooking.count({
        where: { isActive: true, status: 'PENDING', ...relationScope },
      }),
      this.prisma.unitBooking.count({
        where: {
          isActive: true,
          status: 'ACTIVE',
          expiresAt: { gte: today, lte: new Date(today.getTime() + 7 * 86400000) },
          ...relationScope,
        },
      }),
      this.prisma.slotBooking.findMany({
        where: {
          ...(mallIds === null ? {} : { slot: { unit: unitScope } }),
        },
        select: {
          status: true,
          installationStartDatetime: true,
          dismantlingEndDatetime: true,
          startDatetime: true,
          endDatetime: true,
          totalAmount: true,
          slot: { select: { id: true, unitId: true, area: true } },
        },
      }),
    ]);

    const occupancyByLeaseTerm = summarizeOccupancyByLeaseTerm(units, slotBookings);
    const shortBookingStats = summarizeShortBookingPipeline(slotBookings);

    const totalArea = units.reduce((s, u) => s + u.areaNLA, 0);
    const vacantArea = units.filter((u) => u.status === 'VACANT').reduce((s, u) => s + u.areaNLA, 0);
    const leasedArea = units.filter((u) => u.status === 'OCCUPIED').reduce((s, u) => s + u.areaNLA, 0);
    const occupancyRate = totalArea > 0 ? (leasedArea / totalArea) * 100 : 0;

    const monthlyRevenue = monthInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const collectedRevenue = monthInvoices.reduce(
      (sum, invoice) => sum + invoice.payments.reduce((paid, payment) => paid + payment.amount, 0),
      0,
    );
    const overdueAmount = overdueInvoices.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce((value, payment) => value + payment.amount, 0);
      return sum + Math.max(0, invoice.totalAmount - paid);
    }, 0);
    const collectionRate = monthlyRevenue > 0 ? Math.min(100, (collectedRevenue / monthlyRevenue) * 100) : 0;
    const longMonthInvoices = monthInvoices.filter((invoice) => invoice.contract?.unit.leaseTermType === 'LONG');
    const longMonthlyRevenue = longMonthInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const longCollectedRevenue = longMonthInvoices.reduce(
      (sum, invoice) => sum + invoice.payments.reduce((paid, payment) => paid + payment.amount, 0),
      0,
    );
    const longBookingStats = {
      active: activeBookings,
      pending: pendingBookings,
      expiringSoon: expiringBookings,
    };

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
      collectionRate: +collectionRate.toFixed(1),
      overdueAmount,
      overdueCount: overdueInvoices.length,
      expiringIn30,
      expiringIn90,
      pendingApprovals,
      openTickets,
      healthScore: this.healthScoreForRole(role, occupancyRate, collectionRate),
      bookingStats: {
        ...longBookingStats,
      },
      byLeaseTerm: {
        LONG: {
          ...occupancyByLeaseTerm.LONG,
          leasedArea: occupancyByLeaseTerm.LONG.occupiedArea,
          bookingStats: longBookingStats,
          monthlyRevenue: longMonthlyRevenue,
          collectedRevenue: longCollectedRevenue,
          expiringIn30,
          expiringIn90,
        },
        SHORT: {
          ...occupancyByLeaseTerm.SHORT,
          leasedArea: occupancyByLeaseTerm.SHORT.occupiedArea,
          bookingStats: shortBookingStats,
          monthlyRevenue: shortBookingStats.revenue,
          collectedRevenue: shortBookingStats.revenue,
          expiringIn30: 0,
          expiringIn90: 0,
        },
      },
    };
  }

  async getCrossMallDashboard() {
    const malls = await this.prisma.mall.findMany({
      where: { isActive: true },
      include: {
        floors: {
          include: {
            units: {
              select: { id: true, status: true, areaNLA: true, leaseTermType: true },
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

        const [invoices, overdueCount, openTickets, expiringIn30, slotBookings] = await Promise.all([
          this.prisma.invoice.findMany({
            where: {
              isActive: true,
              period: { startsWith: currentMonth },
              contract: { unit: { floor: { mallId: mall.id } } },
            },
            select: {
              totalAmount: true,
              status: true,
              contract: { select: { unit: { select: { leaseTermType: true } } } },
            },
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
          this.prisma.slotBooking.findMany({
            where: { slot: { unit: { mallId: mall.id, leaseTermType: 'SHORT' } } },
            select: {
              status: true,
              installationStartDatetime: true,
              dismantlingEndDatetime: true,
              startDatetime: true,
              endDatetime: true,
              totalAmount: true,
              slot: { select: { id: true, unitId: true, area: true } },
            },
          }),
        ]);

        const occupancyByLeaseTerm = summarizeOccupancyByLeaseTerm(units, slotBookings);
        const shortBookingStats = summarizeShortBookingPipeline(slotBookings);
        const longInvoices = invoices.filter((invoice) => invoice.contract?.unit.leaseTermType === 'LONG');
        const longMonthlyRevenue = longInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
        const longCollectedRevenue = longInvoices
          .filter((invoice) => invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID')
          .reduce((sum, invoice) => sum + invoice.totalAmount, 0);

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
          byLeaseTerm: {
            LONG: {
              ...occupancyByLeaseTerm.LONG,
              leasedArea: occupancyByLeaseTerm.LONG.occupiedArea,
              monthlyRevenue: longMonthlyRevenue,
              collectedRevenue: longCollectedRevenue,
              collectionRate: longMonthlyRevenue > 0 ? +((longCollectedRevenue / longMonthlyRevenue) * 100).toFixed(1) : 0,
              unitCount: occupancyByLeaseTerm.LONG.total,
              expiringIn30,
            },
            SHORT: {
              ...occupancyByLeaseTerm.SHORT,
              leasedArea: occupancyByLeaseTerm.SHORT.occupiedArea,
              monthlyRevenue: shortBookingStats.revenue,
              collectedRevenue: shortBookingStats.revenue,
              bookingStats: shortBookingStats,
              collectionRate: shortBookingStats.revenue > 0 ? 100 : 0,
              unitCount: occupancyByLeaseTerm.SHORT.total,
              expiringIn30: 0,
            },
          },
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
        byLeaseTerm: {
          LONG: {
            totalArea: acc.byLeaseTerm.LONG.totalArea + m.byLeaseTerm.LONG.totalArea,
            occupiedArea: acc.byLeaseTerm.LONG.occupiedArea + m.byLeaseTerm.LONG.occupiedArea,
            total: acc.byLeaseTerm.LONG.total + m.byLeaseTerm.LONG.total,
            occupied: acc.byLeaseTerm.LONG.occupied + m.byLeaseTerm.LONG.occupied,
            monthlyRevenue: acc.byLeaseTerm.LONG.monthlyRevenue + m.byLeaseTerm.LONG.monthlyRevenue,
            collectedRevenue: acc.byLeaseTerm.LONG.collectedRevenue + m.byLeaseTerm.LONG.collectedRevenue,
            expiringIn30: acc.byLeaseTerm.LONG.expiringIn30 + m.byLeaseTerm.LONG.expiringIn30,
          },
          SHORT: {
            totalArea: acc.byLeaseTerm.SHORT.totalArea + m.byLeaseTerm.SHORT.totalArea,
            occupiedArea: acc.byLeaseTerm.SHORT.occupiedArea + m.byLeaseTerm.SHORT.occupiedArea,
            total: acc.byLeaseTerm.SHORT.total + m.byLeaseTerm.SHORT.total,
            occupied: acc.byLeaseTerm.SHORT.occupied + m.byLeaseTerm.SHORT.occupied,
            monthlyRevenue: acc.byLeaseTerm.SHORT.monthlyRevenue + m.byLeaseTerm.SHORT.monthlyRevenue,
            collectedRevenue: acc.byLeaseTerm.SHORT.collectedRevenue + m.byLeaseTerm.SHORT.collectedRevenue,
            expiringIn30: 0,
          },
        },
      }),
      {
        totalArea: 0, leasedArea: 0, monthlyRevenue: 0, collectedRevenue: 0,
        overdueCount: 0, openTickets: 0, expiringIn30: 0,
        byLeaseTerm: {
          LONG: { totalArea: 0, occupiedArea: 0, total: 0, occupied: 0, monthlyRevenue: 0, collectedRevenue: 0, expiringIn30: 0 },
          SHORT: { totalArea: 0, occupiedArea: 0, total: 0, occupied: 0, monthlyRevenue: 0, collectedRevenue: 0, expiringIn30: 0 },
        },
      },
    );

    return {
      malls: mallData,
      totals: {
        ...totals,
        byLeaseTerm: {
          LONG: {
            ...totals.byLeaseTerm.LONG,
            leasedArea: totals.byLeaseTerm.LONG.occupiedArea,
            vacantArea: Math.max(0, totals.byLeaseTerm.LONG.totalArea - totals.byLeaseTerm.LONG.occupiedArea),
            collectionRate: totals.byLeaseTerm.LONG.monthlyRevenue > 0
              ? +((totals.byLeaseTerm.LONG.collectedRevenue / totals.byLeaseTerm.LONG.monthlyRevenue) * 100).toFixed(1)
              : 0,
            occupancyRate: totals.byLeaseTerm.LONG.totalArea > 0
              ? +((totals.byLeaseTerm.LONG.occupiedArea / totals.byLeaseTerm.LONG.totalArea) * 100).toFixed(1)
              : 0,
          },
          SHORT: {
            ...totals.byLeaseTerm.SHORT,
            leasedArea: totals.byLeaseTerm.SHORT.occupiedArea,
            vacantArea: Math.max(0, totals.byLeaseTerm.SHORT.totalArea - totals.byLeaseTerm.SHORT.occupiedArea),
            collectionRate: totals.byLeaseTerm.SHORT.monthlyRevenue > 0
              ? +((totals.byLeaseTerm.SHORT.collectedRevenue / totals.byLeaseTerm.SHORT.monthlyRevenue) * 100).toFixed(1)
              : 0,
            occupancyRate: totals.byLeaseTerm.SHORT.totalArea > 0
              ? +((totals.byLeaseTerm.SHORT.occupiedArea / totals.byLeaseTerm.SHORT.totalArea) * 100).toFixed(1)
              : 0,
          },
        },
        occupancyRate: totals.totalArea > 0 ? +((totals.leasedArea / totals.totalArea) * 100).toFixed(1) : 0,
        collectionRate: totals.monthlyRevenue > 0 ? +((totals.collectedRevenue / totals.monthlyRevenue) * 100).toFixed(1) : 0,
      },
    };
  }
}
