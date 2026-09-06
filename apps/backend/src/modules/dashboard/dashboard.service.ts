import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { MallAccessService } from '../../common/services/mall-access.service';
import {
  ContractStatus,
  InvoiceStatus,
  TicketStatus,
  WorkflowStatus,
  CurrencyCode,
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


/**
 * RPT-CUR-001 / RPT-CUR-003 — group monetary amounts by currency instead of
 * summing across them.
 *
 * There is no FX engine in this platform, so VND + USD + MMK cannot become one
 * number. Each currency gets its own bucket; `collectionRate` is a ratio of two
 * same-currency sums and is therefore computed per bucket, never across them.
 *
 * Buckets are emitted in a stable order so a consumer can rely on it, and a
 * currency with no invoices simply does not appear (rather than appearing as 0,
 * which would imply the mall trades in it).
 */
export type RevenueCurrencyBucket = {
  currencyCode: CurrencyCode;
  monthlyRevenue: number;
  collectedRevenue: number;
  collectionRate: number;
};

const CURRENCY_BUCKET_ORDER: CurrencyCode[] = ['VND', 'USD', 'MMK'];

export function groupRevenueByCurrency(
  invoices: { totalAmount: number; currencyCode: CurrencyCode; status: string }[],
): RevenueCurrencyBucket[] {
  const byCurrency = new Map<CurrencyCode, { monthlyRevenue: number; collectedRevenue: number }>();
  for (const invoice of invoices) {
    let bucket = byCurrency.get(invoice.currencyCode);
    if (!bucket) {
      bucket = { monthlyRevenue: 0, collectedRevenue: 0 };
      byCurrency.set(invoice.currencyCode, bucket);
    }
    bucket.monthlyRevenue += invoice.totalAmount;
    if (invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID') {
      bucket.collectedRevenue += invoice.totalAmount;
    }
  }

  return sortBuckets(
    [...byCurrency.entries()].map(([currencyCode, b]) => ({
      currencyCode,
      monthlyRevenue: b.monthlyRevenue,
      collectedRevenue: b.collectedRevenue,
      collectionRate: collectionRateOf(b.collectedRevenue, b.monthlyRevenue),
    })),
  );
}

/** Sum bucket lists across malls, still never mixing currencies. */
export function mergeRevenueBuckets(lists: RevenueCurrencyBucket[][]): RevenueCurrencyBucket[] {
  const merged = new Map<CurrencyCode, { monthlyRevenue: number; collectedRevenue: number }>();
  for (const list of lists) {
    for (const b of list) {
      const acc = merged.get(b.currencyCode) ?? { monthlyRevenue: 0, collectedRevenue: 0 };
      acc.monthlyRevenue += b.monthlyRevenue;
      acc.collectedRevenue += b.collectedRevenue;
      merged.set(b.currencyCode, acc);
    }
  }
  return sortBuckets(
    [...merged.entries()].map(([currencyCode, b]) => ({
      currencyCode,
      monthlyRevenue: b.monthlyRevenue,
      collectedRevenue: b.collectedRevenue,
      collectionRate: collectionRateOf(b.collectedRevenue, b.monthlyRevenue),
    })),
  );
}

function collectionRateOf(collected: number, billed: number): number {
  return billed > 0 ? +((collected / billed) * 100).toFixed(1) : 0;
}

function sortBuckets(buckets: RevenueCurrencyBucket[]): RevenueCurrencyBucket[] {
  const rank = (c: CurrencyCode) => {
    const i = CURRENCY_BUCKET_ORDER.indexOf(c);
    return i === -1 ? 99 : i;
  };
  return [...buckets].sort((a, b) => rank(a.currencyCode) - rank(b.currencyCode));
}

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
    if (role === 'OPERATION') return {
      ...base,
      openTickets: data.openTickets,
      openFitoutSlaBreaches: data.openFitoutSlaBreaches,
    };
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
      if (mallId) await this.mallAccess.assertMallAccess(user.id, user.role, mallId, { crossMallRead: true });
      else mallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role, { crossMallRead: true });
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
      openFitoutSlaBreaches,
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
      // Multi-currency (docs/program/MULTI_CURRENCY_ARCHITECTURE.md): these two
      // queries feed VND-denominated revenue KPIs (monthlyRevenue, collectedRevenue,
      // overdueAmount, ...) via plain arithmetic reduce() below. Scoping to VND here
      // means a USD/MMK invoice is correctly excluded from those KPIs rather than
      // silently summed into them as if it were VND -- no cross-currency SUM.
      this.prisma.invoice.findMany({
        where: {
          isActive: true,
          period: currentMonth,
          currencyCode: 'VND',
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
          currencyCode: 'VND',
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
      // Live SLA-breach state (FR-08 / docs/audit/07-DASHBOARD-REDESIGN.md): a
      // milestone is overdue the moment `targetDate` passes, independent of the
      // daily `fitout-sla-check` cron's `isOverdue` flag, so this stays accurate
      // between cron runs rather than only reflecting yesterday's 8am snapshot.
      this.prisma.fitoutMilestone.count({
        where: {
          completedAt: null,
          targetDate: { lt: today },
          ...(mallIds === null ? {} : { project: { unit: unitScope } }),
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
      openFitoutSlaBreaches,
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
          // RPT-CUR-003 / RPT-CUR-004: this used to carry `currencyCode: 'VND'`,
          // which kept the arithmetic safe but made USD/MMK revenue invisible to
          // the CEO screen with nothing disclosing the omission. The filter is
          // gone; the currency is selected and carried through aggregation so
          // amounts are GROUPED by currency instead of being excluded. No FX
          // conversion is performed anywhere.
          this.prisma.invoice.findMany({
            where: {
              isActive: true,
              period: { startsWith: currentMonth },
              contract: { unit: { floor: { mallId: mall.id } } },
            },
            select: {
              totalAmount: true,
              currencyCode: true,
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

        const revenueByCurrency = groupRevenueByCurrency(invoices);
        const longRevenueByCurrency = groupRevenueByCurrency(longInvoices);

        // RPT-CUR-004: the legacy scalars are retained for backward compatibility
        // but are VND-ONLY and must never be presented as an all-currency total.
        // `revenueScalarCurrency` makes that scope machine-readable so a consumer
        // cannot mistake them for a consolidated figure.
        const vndBucket = revenueByCurrency.find((b) => b.currencyCode === 'VND');
        const monthlyRevenue = vndBucket?.monthlyRevenue ?? 0;
        const collectedRevenue = vndBucket?.collectedRevenue ?? 0;
        const longVndBucket = longRevenueByCurrency.find((b) => b.currencyCode === 'VND');
        const longMonthlyRevenue = longVndBucket?.monthlyRevenue ?? 0;
        const longCollectedRevenue = longVndBucket?.collectedRevenue ?? 0;

        return {
          mall: { id: mall.id, name: mall.name, code: mall.code, city: mall.city },
          occupancyRate: +occupancyRate.toFixed(1),
          totalArea,
          leasedArea,
          vacantArea,
          unitCount: units.length,
          // RPT-CUR-001/003 — the authoritative monetary contract.
          revenueByCurrency,
          // RPT-CUR-004 — legacy scalars, VND-ONLY. Kept for backward
          // compatibility; never present these as an all-currency total.
          revenueScalarCurrency: 'VND' as CurrencyCode,
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
              revenueByCurrency: longRevenueByCurrency,
              revenueScalarCurrency: 'VND' as CurrencyCode,
              monthlyRevenue: longMonthlyRevenue,
              collectedRevenue: longCollectedRevenue,
              collectionRate: longMonthlyRevenue > 0 ? +((longCollectedRevenue / longMonthlyRevenue) * 100).toFixed(1) : 0,
              unitCount: occupancyByLeaseTerm.LONG.total,
              expiringIn30,
            },
            SHORT: {
              ...occupancyByLeaseTerm.SHORT,
              leasedArea: occupancyByLeaseTerm.SHORT.occupiedArea,
              // RPT-CUR-006 (deferred): SlotBooking has no currency column, so
              // this amount's unit is genuinely unknown. It is deliberately NOT
              // placed in a currency bucket — doing so would fabricate a
              // currency. Flagged so the UI can say so instead of implying VND.
              revenueCurrencyUnknown: true,
              revenueByCurrency: [] as RevenueCurrencyBucket[],
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

    const totalsRevenueByCurrency = mergeRevenueBuckets(mallData.map((m) => m.revenueByCurrency));
    const totalsLongRevenueByCurrency = mergeRevenueBuckets(
      mallData.map((m) => m.byLeaseTerm.LONG.revenueByCurrency),
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
        // RPT-CUR-001/003 — the authoritative cross-mall monetary contract. Each
        // currency stands on its own; there is no consolidated total because
        // producing one would require FX the platform does not have.
        revenueByCurrency: totalsRevenueByCurrency,
        // RPT-CUR-004 — the scalars above (`monthlyRevenue`, `collectedRevenue`,
        // `collectionRate`) are VND-ONLY. Declared, not implied.
        revenueScalarCurrency: 'VND' as CurrencyCode,
        byLeaseTerm: {
          LONG: {
            ...totals.byLeaseTerm.LONG,
            revenueByCurrency: totalsLongRevenueByCurrency,
            revenueScalarCurrency: 'VND' as CurrencyCode,
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
