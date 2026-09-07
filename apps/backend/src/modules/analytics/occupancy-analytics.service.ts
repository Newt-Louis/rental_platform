import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, UnitStatus, CurrencyCode } from '@prisma/client';

/**
 * MON-CUR-OCC-01 — the single currency the occupancy snapshot's revenue figures
 * are scoped to. The monthly writer filters its source invoices to exactly this
 * currency, so the persisted ratio is <this>/m2. Named rather than repeated as a
 * literal so the scope and the filter cannot drift apart.
 */
export const OCCUPANCY_REVENUE_SCALE_CURRENCY: CurrencyCode = 'VND';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { summarizeOccupancyByLeaseTerm } from '../../common/utils/lease-term-analytics';

/**
 * RPT-CUR-002 — billing revenue per currency.
 *
 * `Unit.baseRentPerSqm` / `camPerSqm` are denominated in `Unit.currencyCode`.
 * Adding them across currencies produces a number with no unit of account, so
 * they are grouped instead. Buckets are emitted in a stable order and a
 * currency with no occupied units simply does not appear.
 */
export type UnitBillingRevenueBucket = {
  currencyCode: CurrencyCode;
  totalMonthlyBillingRevenue: number;
  occupiedUnits: number;
};

const UNIT_CURRENCY_ORDER: CurrencyCode[] = ['VND', 'USD', 'MMK'];

export function groupUnitRevenueByCurrency(
  units: { baseRentPerSqm: number; camPerSqm?: number | null; areaNLA: number; currencyCode: CurrencyCode }[],
): UnitBillingRevenueBucket[] {
  const byCurrency = new Map<CurrencyCode, { total: number; count: number }>();
  for (const u of units) {
    const acc = byCurrency.get(u.currencyCode) ?? { total: 0, count: 0 };
    acc.total += (u.baseRentPerSqm + (u.camPerSqm ?? 0)) * u.areaNLA;
    acc.count += 1;
    byCurrency.set(u.currencyCode, acc);
  }
  return [...byCurrency.entries()]
    .sort((a, b) => {
      const rank = (c: CurrencyCode) => {
        const i = UNIT_CURRENCY_ORDER.indexOf(c);
        return i === -1 ? 99 : i;
      };
      return rank(a[0]) - rank(b[0]);
    })
    .map(([currencyCode, v]) => ({
      currencyCode,
      totalMonthlyBillingRevenue: Math.round(v.total),
      occupiedUnits: v.count,
    }));
}

@Injectable()
export class OccupancyAnalyticsService {
  private readonly logger = new Logger(OccupancyAnalyticsService.name);

  constructor(private prisma: PrismaService, private schedulerLock: SchedulerLockService) {}

  async getOccupancyV2(mallId?: string, floorId?: string, category?: string, mallIds?: string[] | null) {
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;
    else if (mallIds) where.mallId = { in: mallIds };
    if (floorId) where.floorId = floorId;
    if (category) where.category = category;

    const units = await this.prisma.unit.findMany({
      where,
      select: {
        id: true,
        status: true,
        areaNLA: true,
        baseRentPerSqm: true,
        camPerSqm: true,
        // RPT-CUR-002: needed to bucket rent by its actual unit of account.
        currencyCode: true,
        category: true,
        categoryId: true,
        leaseTermType: true,
        floor: { select: { id: true, name: true } },
        mall: { select: { id: true, name: true } },
      },
    });
    const shortBookings = await this.prisma.slotBooking.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        slot: {
          unit: {
            isActive: true,
            leaseTermType: 'SHORT',
            ...(mallId ? { mallId } : {}),
            ...(floorId ? { floorId } : {}),
            ...(category ? { category } : {}),
          },
        },
      },
      select: {
        status: true,
        installationStartDatetime: true,
        dismantlingEndDatetime: true,
        startDatetime: true,
        endDatetime: true,
        slot: { select: { id: true, unitId: true, area: true } },
      },
    });
    const occupancyByLeaseTerm = summarizeOccupancyByLeaseTerm(units, shortBookings);

    const totalUnits = units.length;
    const totalArea = units.reduce((s, u) => s + (u.areaNLA ?? 0), 0);

    const occupied = units.filter((u) => u.status === UnitStatus.OCCUPIED);
    const vacant = units.filter((u) => u.status === UnitStatus.VACANT);
    const booking = units.filter((u) => u.status === UnitStatus.BOOKING);
    const negotiating = units.filter((u) => u.status === UnitStatus.NEGOTIATING);
    const contracted = units.filter((u) => u.status === UnitStatus.CONTRACTED);
    const underFitout = units.filter((u) => u.status === UnitStatus.UNDER_FITOUT);

    const occupiedArea = occupied.reduce((s, u) => s + (u.areaNLA ?? 0), 0);
    const vacantArea = vacant.reduce((s, u) => s + (u.areaNLA ?? 0), 0);
    const underFitoutArea = underFitout.reduce((s, u) => s + (u.areaNLA ?? 0), 0);

    const occupancyRate = totalArea > 0 ? Math.round((occupiedArea / totalArea) * 1000) / 10 : 0;
    const effectiveOccupancy = totalArea > 0
      ? Math.round(((occupiedArea + underFitoutArea) / totalArea) * 1000) / 10
      : 0;

    // GAP #26 — avgRentPerSqm theo floor; GAP #29 — totalMonthlyBillingRevenue
    //
    // RPT-CUR-002 (Wave 1): this reduce() used to add every occupied unit's
    // rent together regardless of `Unit.currencyCode`, producing a VND + USD +
    // MMK sum with no unit of account. There is no FX engine, so the amounts
    // are GROUPED by currency instead. `Unit.currencyCode` is NOT NULL with a
    // default, so every unit lands in exactly one bucket -- no schema change
    // was needed for this.
    const billingRevenueByCurrency = groupUnitRevenueByCurrency(occupied);
    const vndBillingRevenue = billingRevenueByCurrency
      .find((b) => b.currencyCode === 'VND')?.totalMonthlyBillingRevenue ?? 0;

    const byCategory = await this.groupByCategoryHierarchical(units);
    const byFloor = this.groupByFieldWithRent(units, 'floor');
    const byLeaseTerm = Object.values(occupancyByLeaseTerm).map((zone) => ({
      leaseTermType: zone.leaseTermType,
      name: zone.label,
      total: zone.total,
      occupied: zone.occupied,
      vacant: zone.vacant,
      area: zone.totalArea,
      occupiedArea: zone.occupiedArea,
      occupancyRate: zone.occupancyRate,
    }));

    return {
      summary: {
        totalUnits,
        totalArea,
        occupiedUnits: occupied.length,
        occupiedArea,
        vacantUnits: vacant.length,
        vacantArea,
        bookingUnits: booking.length,
        negotiatingUnits: negotiating.length,
        contractedUnits: contracted.length,
        underFitoutUnits: underFitout.length,
        underFitoutArea,
        occupancyRate,
        effectiveOccupancy,
        // GAP #29 — doanh thu tiền thuê (billing) phân biệt với doanh thu tenant (sales)
        //
        // RPT-CUR-002 — the authoritative monetary contract: one entry per
        // currency, never a combined total.
        billingRevenueByCurrency,
        // Legacy scalar, retained for backward compatibility. It is VND-ONLY
        // and `billingRevenueScalarCurrency` says so, so a consumer cannot
        // mistake it for a system-wide total. Previously this was a
        // cross-currency sum.
        billingRevenueScalarCurrency: 'VND' as CurrencyCode,
        totalMonthlyBillingRevenue: Math.round(vndBillingRevenue),
      },
      byCategory,
      byFloor,
      byLeaseTerm,
    };
  }

  // Groups occupancy by category the way the Admin > Ngành hàng tree structures
  // them (parent immediately followed by its children, indented) instead of a
  // flat alphabetical/insertion-order list -- units tagged at different levels
  // of specificity (some "F&B", some the narrower "Coffee & Tea") previously
  // showed as unrelated bars with no visual link between parent and child.
  private async groupByCategoryHierarchical(units: any[]) {
    const groups: Record<string, {
      name: string; categoryId: string | null;
      total: number; occupied: number; vacant: number; area: number; occupiedArea: number;
    }> = {};

    for (const unit of units) {
      const key = unit.categoryId ?? unit.category ?? 'Unknown';
      if (!groups[key]) {
        groups[key] = { name: unit.category ?? 'Unknown', categoryId: unit.categoryId ?? null, total: 0, occupied: 0, vacant: 0, area: 0, occupiedArea: 0 };
      }
      groups[key].total++;
      groups[key].area += unit.areaNLA ?? 0;
      if (unit.status === UnitStatus.OCCUPIED) {
        groups[key].occupied++;
        groups[key].occupiedArea += unit.areaNLA ?? 0;
      } else if (unit.status === UnitStatus.VACANT) {
        groups[key].vacant++;
      }
    }

    const categoryIds = Object.values(groups)
      .map((g) => g.categoryId)
      .filter((id): id is string => !!id);
    const categoryMeta = categoryIds.length
      ? await this.prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, parentId: true, sortOrder: true } })
      : [];
    const metaById = new Map(categoryMeta.map((c) => [c.id, c]));

    const entries = Object.values(groups).map((g) => ({
      ...g,
      occupancyRate: g.area > 0 ? Math.round((g.occupiedArea / g.area) * 1000) / 10 : 0,
      parentId: (g.categoryId && metaById.get(g.categoryId)?.parentId) || null,
      sortOrder: (g.categoryId && metaById.get(g.categoryId)?.sortOrder) || 0,
    }));

    const byParent = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = e.parentId ?? '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(e);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

    const ordered: Array<Omit<(typeof entries)[number], 'parentId' | 'sortOrder' | 'categoryId'>> = [];
    const visited = new Set<string>();
    const visit = (parentKey: string, depth: number) => {
      for (const e of byParent.get(parentKey) ?? []) {
        const idKey = e.categoryId ?? e.name;
        if (visited.has(idKey)) continue;
        visited.add(idKey);
        const { parentId: _parentId, sortOrder: _sortOrder, categoryId: _categoryId, name, ...rest } = e;
        ordered.push({ name: depth > 0 ? `↳ ${name}` : name, ...rest });
        // Only a real category can have children -- an entry with no categoryId
        // (the "Unknown"/uncategorized bucket) must never recurse, or `?? ''`
        // sends it right back into the ROOT bucket at depth+1 and mislabels every
        // other not-yet-visited root sibling as if it were that bucket's child.
        if (e.categoryId) visit(e.categoryId, depth + 1);
      }
    };
    visit('', 0);
    // A subcategory whose parent has zero units of its own never gets reached by
    // the walk above (nothing to descend *from*) -- surface it anyway, flat,
    // rather than silently dropping real occupancy data.
    for (const e of entries) {
      const idKey = e.categoryId ?? e.name;
      if (!visited.has(idKey)) {
        visited.add(idKey);
        const { parentId: _parentId, sortOrder: _sortOrder, categoryId: _categoryId, ...rest } = e;
        ordered.push(rest);
      }
    }
    return ordered;
  }

  private groupByField(units: any[], field: string) {
    const groups: Record<string, any> = {};

    for (const unit of units) {
      const key = field === 'floor' ? unit.floor?.name ?? 'Unknown' : unit[field] ?? 'Unknown';
      if (!groups[key]) {
        groups[key] = { total: 0, occupied: 0, vacant: 0, area: 0, occupiedArea: 0 };
      }
      groups[key].total++;
      groups[key].area += unit.areaNLA ?? 0;
      if (unit.status === UnitStatus.OCCUPIED) {
        groups[key].occupied++;
        groups[key].occupiedArea += unit.areaNLA ?? 0;
      } else if (unit.status === UnitStatus.VACANT) {
        groups[key].vacant++;
      }
    }

    return Object.entries(groups).map(([name, data]: [string, any]) => ({
      name,
      ...data,
      occupancyRate: data.area > 0 ? Math.round((data.occupiedArea / data.area) * 1000) / 10 : 0,
    }));
  }

  /** GAP #26 — groupByField nhưng bổ sung avgRentPerSqm cho từng floor */
  private groupByFieldWithRent(units: any[], field: string) {
    const groups: Record<string, any> = {};

    for (const unit of units) {
      const key = field === 'floor' ? unit.floor?.name ?? 'Unknown' : unit[field] ?? 'Unknown';
      if (!groups[key]) {
        groups[key] = {
          total: 0, occupied: 0, vacant: 0, area: 0, occupiedArea: 0, rentSum: 0, occupiedCount: 0,
          currencies: new Set<CurrencyCode>(),
        };
      }
      const g = groups[key];
      g.total++;
      g.area += unit.areaNLA ?? 0;
      if (unit.status === UnitStatus.OCCUPIED) {
        g.occupied++;
        g.occupiedArea += unit.areaNLA ?? 0;
        g.rentSum += unit.baseRentPerSqm ?? 0;
        g.occupiedCount++;
        g.currencies.add(unit.currencyCode as CurrencyCode);
      } else if (unit.status === UnitStatus.VACANT) {
        g.vacant++;
      }
    }

    return Object.entries(groups).map(([name, data]: [string, any]) => ({
      name,
      total: data.total,
      occupied: data.occupied,
      vacant: data.vacant,
      area: data.area,
      occupiedArea: data.occupiedArea,
      // GAP #26 — giá thuê trung bình/m² của các unit OCCUPIED
      //
      // RPT-CUR-002 — KNOWN DEFECT, DEFERRED (Wave 1 scope fence). This averages
      // `Unit.baseRentPerSqm` across whatever currencies the group's occupied
      // units carry, so once a floor mixes VND and USD the number has no unit
      // of account. It is NOT corrected here because splitting it per currency
      // changes what `avgRentPerSqm` MEANS (one figure becomes a set), which is
      // a reporting-policy decision the business has not made.
      //
      // What IS done: the currency mix is disclosed, so a consumer can tell a
      // trustworthy average from an untrustworthy one instead of having to
      // assume. Do not remove these two fields while avgRentPerSqm is still a
      // single scalar.
      avgRentPerSqm: data.occupiedCount > 0 ? Math.round(data.rentSum / data.occupiedCount) : 0,
      avgRentCurrencies: [...(data.currencies as Set<CurrencyCode>)],
      avgRentCurrencyMixed: (data.currencies as Set<CurrencyCode>).size > 1,
      occupancyRate: data.area > 0 ? Math.round((data.occupiedArea / data.area) * 1000) / 10 : 0,
    }));
  }

  // ─── GAP #28 — Breakdown floor × category với occupancy ratio ─────────────

  async getCategoryByFloor(mallId?: string, mallIds?: string[] | null) {
    const where: any = { isActive: true };
    if (mallId) where.mallId = mallId;
    else if (mallIds) where.mallId = { in: mallIds };

    const units = await this.prisma.unit.findMany({
      where,
      select: {
        status: true,
        areaNLA: true,
        category: true,
        floor: { select: { id: true, name: true } },
      },
    });

    if (units.length === 0) return [];

    // Group: floorName → categoryName → {total, occupied, area}
    const map = new Map<string, Map<string, { total: number; occupied: number; area: number }>>();

    for (const u of units) {
      const floorKey = u.floor?.name ?? 'Unknown';
      const catKey = u.category ?? 'Khác';

      if (!map.has(floorKey)) map.set(floorKey, new Map());
      const catMap = map.get(floorKey)!;

      if (!catMap.has(catKey)) catMap.set(catKey, { total: 0, occupied: 0, area: 0 });
      const g = catMap.get(catKey)!;
      g.total++;
      g.area += u.areaNLA ?? 0;
      if (u.status === UnitStatus.OCCUPIED) g.occupied++;
    }

    return Array.from(map.entries()).map(([floorName, catMap]) => ({
      floorName,
      categories: Array.from(catMap.entries()).map(([category, data]) => ({
        category,
        total: data.total,
        occupied: data.occupied,
        area: data.area,
        occupancyRate: data.total > 0 ? ((data.occupied / data.total) * 100).toFixed(1) : '0.0',
        areaRatio: data.area,
      })).sort((a, b) => b.total - a.total),
    })).sort((a, b) => a.floorName.localeCompare(b.floorName));
  }

  async getOccupancyTrend(mallId?: string, months = 12, mallIds?: string[] | null) {
    const where: any = { floorId: null, category: null };
    if (mallId) where.mallId = mallId;
    else if (mallIds) where.mallId = { in: mallIds };
    const snapshots = await this.prisma.occupancySnapshot.findMany({
      where,
      orderBy: { period: 'asc' },
      take: months,
    });

    return snapshots.map((s) => ({
      period: s.period,
      occupancyRate: s.occupancyRate,
      totalUnits: s.totalUnits,
      occupiedUnits: s.occupiedUnits,
      vacantUnits: s.vacantUnits,
      revenuePerSqm: s.revenuePerSqm,
      // MON-CUR-OCC-01: a monetary figure never leaves this API without its
      // unit of account. NULL means the snapshot predates the column and is
      // genuinely unknown -- consumers must render it as unknown, not as VND.
      revenuePerSqmCurrency: s.revenuePerSqmCurrency,
      leaseTermType: s.leaseTermType,
    }));
  }

  @Cron('0 1 1 * *', { name: 'occupancy-snapshot', timeZone: 'Asia/Ho_Chi_Minh' })
  async takeMonthlySnapshot() {
    return this.schedulerLock.runExclusive('occupancy-snapshot', 21_600_000, () => this.takeMonthlySnapshotUnlocked());
  }

  private async takeMonthlySnapshotUnlocked() {
    this.logger.log('Taking monthly occupancy snapshot...');
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const malls = await this.prisma.mall.findMany({ where: { isActive: true } });
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const mall of malls) {
      const units = await this.prisma.unit.findMany({
        where: { mallId: mall.id, isActive: true },
      });

      const shortBookings = await this.prisma.slotBooking.findMany({
        where: { slot: { unit: { mallId: mall.id, leaseTermType: 'SHORT' } } },
        select: {
          status: true,
          installationStartDatetime: true,
          dismantlingEndDatetime: true,
          startDatetime: true,
          endDatetime: true,
          slot: { select: { id: true, unitId: true, area: true } },
        },
      });
      const occupancy = summarizeOccupancyByLeaseTerm(units, shortBookings, now);
      // MON-CUR-OCC-01 — this query is deliberately VND-scoped, the same
      // convention as the dashboard's revenue KPIs. That makes the arithmetic
      // SAFE (no cross-currency SUM) but it also means the KPI is VND-only, and
      // that scope was previously undisclosed: the number was persisted and
      // returned with nothing saying what unit it was in.
      //
      // The scope is NOT widened here. Turning this into a multi-currency figure
      // would change what the KPI means, which is a business decision. What
      // changes is that the unit of account is now recorded WITH the snapshot.
      // Do not remove the currencyCode filter without also revisiting
      // revenuePerSqmCurrency below.
      const monthInvoices = await this.prisma.invoice.aggregate({
        where: {
          contract: { unit: { mallId: mall.id } },
          period,
          status: { in: ['ISSUED', 'PAID', 'PARTIALLY_PAID'] },
          currencyCode: 'VND',
        },
        _sum: { subtotal: true },
      });
      const longRevenue = monthInvoices._sum.subtotal ?? 0;

      for (const leaseTermType of ['LONG', 'SHORT'] as const) {
        const segment = occupancy[leaseTermType];
        const underFitout = units.filter((unit) => unit.leaseTermType === leaseTermType && unit.status === UnitStatus.UNDER_FITOUT).length;
        const revenue = leaseTermType === 'LONG' ? longRevenue : 0;
        const revenuePerSqm = segment.occupiedArea > 0 ? revenue / segment.occupiedArea : 0;
        // LONG revenue comes from the VND-scoped aggregate above, so the ratio
        // is VND/m2 and says so. SHORT revenue is hardcoded 0 -- it is not
        // computed from any monetary source at all -- so that zero has no unit
        // of account and is deliberately left NULL rather than labelled VND.
        const revenuePerSqmCurrency: CurrencyCode | null =
          leaseTermType === 'LONG' ? OCCUPANCY_REVENUE_SCALE_CURRENCY : null;
        const measures = {
          snapshotDate: now,
          totalUnits: segment.total,
          occupiedUnits: segment.occupied,
          vacantUnits: segment.vacant,
          underFitout,
          totalAreaSqm: segment.totalArea,
          occupiedAreaSqm: segment.occupiedArea,
          occupancyRate: segment.occupancyRate,
          revenuePerSqm,
          revenuePerSqmCurrency,
        };

        // OCC-CRON-001 -- this was an upsert keyed on
        // @@unique([mallId, floorId, category, leaseTermType, period]) with
        // floorId and category passed as null. Prisma refuses null inside a
        // compound-unique `where`, so the call threw on the first mall and the
        // job never wrote a row: every snapshot in the database came from the
        // seed.
        //
        // Swapping in findFirst alone would not be enough. Postgres treats NULLs
        // as DISTINCT in a standard unique index, so that constraint never
        // prevented duplicate mall-level rows either -- an application check
        // with nothing behind it. The migration adds a PARTIAL unique index
        // carrying this exact predicate, and the P2002 branch below is what
        // makes the check and the constraint agree instead of merely coexisting.
        try {
          const existing = await this.prisma.occupancySnapshot.findFirst({
            where: { mallId: mall.id, floorId: null, category: null, leaseTermType, period },
            select: { id: true },
          });

          if (existing) {
            await this.prisma.occupancySnapshot.update({ where: { id: existing.id }, data: measures });
            updated++;
          } else {
            try {
              await this.prisma.occupancySnapshot.create({
                data: { mallId: mall.id, leaseTermType, period, ...measures },
              });
              created++;
            } catch (error) {
              // A concurrent run won the race between findFirst and create. The
              // snapshot is idempotent, so adopt its row and write the same
              // measures rather than failing the month.
              if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
              ) {
                const winner = await this.prisma.occupancySnapshot.findFirst({
                  where: { mallId: mall.id, floorId: null, category: null, leaseTermType, period },
                  select: { id: true },
                });
                if (!winner) throw error;
                await this.prisma.occupancySnapshot.update({ where: { id: winner.id }, data: measures });
                updated++;
              } else {
                throw error;
              }
            }
          }
        } catch (error: any) {
          // One mall must not take the whole month's run down with it -- the
          // same isolation the sibling monthly schedulers use.
          failed++;
          this.logger.error(
            `Occupancy snapshot failed for mall ${mall.id} (${leaseTermType}, ${period}): ${error?.message}`,
          );
        }
      }
    }

    // The old log said "taken for N malls" from the mall count alone, so it
    // would have reported success even while every write threw. It now reports
    // what actually reached the table.
    this.logger.log(
      `Occupancy snapshot ${period}: ${created} created, ${updated} updated, ${failed} failed across ${malls.length} mall(s)`,
    );
    return { period, created, updated, failed, malls: malls.length };
  }

  async getVacancyAnalysis(mallId?: string, mallIds?: string[] | null) {
    const where: any = { isActive: true, status: UnitStatus.VACANT };
    if (mallId) where.mallId = mallId;
    else if (mallIds) where.mallId = { in: mallIds };

    const vacantUnits = await this.prisma.unit.findMany({
      where,
      select: {
        id: true,
        code: true,
        areaNLA: true,
        category: true,
        updatedAt: true,
        floor: { select: { name: true } },
      },
    });

    const now = new Date();
    const analysis = vacantUnits.map((u) => {
      const daysVacant = Math.floor((now.getTime() - u.updatedAt.getTime()) / 86400000);
      return {
        unitCode: u.code,
        floor: u.floor?.name,
        category: u.category,
        areaNLA: u.areaNLA,
        daysVacant,
        estimatedLoss: (u.areaNLA ?? 0) * 500000 * (daysVacant / 30),
      };
    });

    const totalVacantArea = analysis.reduce((s, a) => s + (a.areaNLA ?? 0), 0);
    const totalEstimatedLoss = analysis.reduce((s, a) => s + a.estimatedLoss, 0);
    const avgDaysVacant = analysis.length > 0
      ? Math.round(analysis.reduce((s, a) => s + a.daysVacant, 0) / analysis.length)
      : 0;

    return {
      summary: {
        totalVacantUnits: analysis.length,
        totalVacantArea,
        avgDaysVacant,
        totalEstimatedLoss,
      },
      units: analysis.sort((a, b) => b.daysVacant - a.daysVacant),
    };
  }
}
