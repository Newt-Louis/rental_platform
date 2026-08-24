import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaParkingService } from '../../prisma-parking/prisma-parking.service';
import { Prisma, parking_transaction, tenants } from '../../../node_modules/.prisma/parking-client';
import {
  ParkingDashboardKpiFilterDto,
  ParkingTransactionExportFilterDto,
  ParkingTransactionFilterDto,
  ParkingTransactionFilterV2Dto,
} from './dto/parking-transaction-filter.dto';

function toNumber(v: unknown): number {
  return v == null ? 0 : Number(v);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export interface ChartPoint {
  label: string;
  value: number;
}

@Injectable()
export class ParkingDashboardService {
  private readonly logger = new Logger(ParkingDashboardService.name);

  constructor(private readonly prisma: PrismaParkingService) {}

  private ensureConfigured() {
    if (!this.prisma.isConfigured) {
      throw new ServiceUnavailableException(
        'Tích hợp CSDL bãi đỗ xe chưa được cấu hình (PARKING_DATABASE_URL)',
      );
    }
  }

  private async resolveTenant(parkingCode: string): Promise<tenants> {
    const tenant = await this.prisma.tenants.findUnique({ where: { tenant_code: parkingCode } });
    if (!tenant) {
      throw new NotFoundException(`Không tìm thấy bãi đỗ xe với mã "${parkingCode}"`);
    }
    return tenant;
  }

  private async loadVehicleTypeNames(tenantId: number): Promise<Map<string, string>> {
    const mappings = await this.prisma.vehicle_type_mappings.findMany({
      where: { OR: [{ tenant_id: tenantId }, { tenant_id: null }] },
      include: { vehicle_types: true },
    });
    const map = new Map<string, string>();
    for (const m of mappings) {
      if (!map.has(m.foreign_vehicle_type_id)) {
        map.set(m.foreign_vehicle_type_id, m.vehicle_types.name);
      }
    }
    return map;
  }

  async getRevenueReport(parkingCode: string) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(parkingCode);

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = addDays(todayStart, 1);
    const lastMonthStart = startOfMonth(addMonths(now, -1));
    const lastMonthEnd = startOfMonth(now);

    const [todayAgg, lastMonthAgg] = await Promise.all([
      this.prisma.parking_transaction.aggregate({
        _sum: { total_fee: true },
        _count: { _all: true },
        where: { tenant_id: tenant.tenant_id, check_out_time: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.parking_transaction.aggregate({
        _sum: { total_fee: true },
        _count: { _all: true },
        where: { tenant_id: tenant.tenant_id, check_out_time: { gte: lastMonthStart, lt: lastMonthEnd } },
      }),
    ]);

    return {
      todayRevenue: toNumber(todayAgg._sum.total_fee),
      totalTodayTransaction: todayAgg._count._all,
      totalRevenueLastMonth: toNumber(lastMonthAgg._sum.total_fee),
      totalTransactionLastMonth: lastMonthAgg._count._all,
    };
  }

  async getTransactionChart(parkingCode: string, startTime: string, finishTime: string): Promise<ChartPoint[]> {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(parkingCode);
    const start = startOfDay(new Date(startTime));
    const end = addDays(startOfDay(new Date(finishTime)), 1);

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', check_out_time) AS day, COUNT(*)::bigint AS count
      FROM parking_transaction
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1
      ORDER BY 1
    `;

    const byDay = new Map<string, number>();
    for (const row of rows) byDay.set(formatDay(row.day), toNumber(row.count));
    return fillDays(start, end, byDay);
  }

  async getRevenueChart(parkingCode: string, startTime: string, finishTime: string): Promise<ChartPoint[]> {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(parkingCode);
    const start = startOfDay(new Date(startTime));
    const end = addDays(startOfDay(new Date(finishTime)), 1);

    const rows = await this.prisma.$queryRaw<Array<{ day: Date; total: number }>>`
      SELECT date_trunc('day', check_out_time) AS day, COALESCE(SUM(total_fee), 0) AS total
      FROM parking_transaction
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1
      ORDER BY 1
    `;

    const byDay = new Map<string, number>();
    for (const row of rows) byDay.set(formatDay(row.day), toNumber(row.total));
    return fillDays(start, end, byDay);
  }

  async getRevenueChartByYear(parkingCode: string, year: number): Promise<ChartPoint[]> {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(parkingCode);
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const rows = await this.prisma.$queryRaw<Array<{ month: Date; total: number }>>`
      SELECT date_trunc('month', check_out_time) AS month, COALESCE(SUM(total_fee), 0) AS total
      FROM parking_transaction
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1
      ORDER BY 1
    `;

    const byMonth = new Map<number, number>();
    for (const row of rows) byMonth.set(new Date(row.month).getMonth(), toNumber(row.total));

    const points: ChartPoint[] = [];
    for (let m = 0; m < 12; m++) {
      points.push({ label: formatMonth(new Date(year, m, 1)), value: byMonth.get(m) ?? 0 });
    }
    return points;
  }

  async getPaymentBreakdown(parkingCode: string, startTime: string, finishTime: string) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(parkingCode);
    const start = startOfDay(new Date(startTime));
    const end = addDays(startOfDay(new Date(finishTime)), 1);

    const agg = await this.prisma.parking_transaction.aggregate({
      _sum: {
        cash_amount: true,
        bank_transfer_amount: true,
        voucher_coupon_amount: true,
        voucher_bill_amount: true,
      },
      where: { tenant_id: tenant.tenant_id, check_out_time: { gte: start, lt: end } },
    });

    return {
      cash: toNumber(agg._sum.cash_amount),
      bankTransfer: toNumber(agg._sum.bank_transfer_amount),
      voucherCoupon: toNumber(agg._sum.voucher_coupon_amount),
      voucherBill: toNumber(agg._sum.voucher_bill_amount),
    };
  }

  async getTenants() {
    this.ensureConfigured();
    const tenants = await this.prisma.tenants.findMany({
      select: { tenant_id: true, tenant_code: true, name: true },
      orderBy: { name: 'asc' },
    });
    return tenants.map((t) => ({ parkingCode: t.tenant_code, name: t.name }));
  }

  async getKpiSummary(filter: ParkingDashboardKpiFilterDto) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(filter.parkingCode);
    const { start, end } = dayRange(filter.startDate, filter.endDate);
    const { priorStart, priorEnd } = trailingPriorWindow(start, end);

    const [
      revenueAgg,
      priorRevenueAgg,
      activeOccupancy,
      completedCount,
      peakHourRows,
      promotionAgg,
      durationAgg,
      priorDurationAgg,
    ] = await Promise.all([
      this.prisma.parking_transaction.aggregate({
        _sum: { total_fee: true },
        where: { tenant_id: tenant.tenant_id, check_out_time: { gte: start, lt: end } },
      }),
      this.prisma.parking_transaction.aggregate({
        _sum: { total_fee: true },
        where: { tenant_id: tenant.tenant_id, check_out_time: { gte: priorStart, lt: priorEnd } },
      }),
      this.prisma.parking_transaction.count({
        where: { tenant_id: tenant.tenant_id, check_out_time: null },
      }),
      this.prisma.parking_transaction.count({
        where: { tenant_id: tenant.tenant_id, check_out_time: { gte: start, lt: end } },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM parking_transaction
        WHERE tenant_id = ${tenant.tenant_id}
          AND check_out_time >= ${start} AND check_out_time < ${end}
        GROUP BY date_trunc('hour', check_out_time)
        ORDER BY count DESC
        LIMIT 1
      `,
      this.prisma.parking_transaction.aggregate({
        _sum: { promotion_amount: true, voucher_bill_amount: true },
        where: { tenant_id: tenant.tenant_id, check_out_time: { gte: start, lt: end } },
      }),
      this.prisma.parking_transaction.aggregate({
        _avg: { duration: true },
        where: { tenant_id: tenant.tenant_id, check_out_time: { gte: start, lt: end } },
      }),
      this.prisma.parking_transaction.aggregate({
        _avg: { duration: true },
        where: { tenant_id: tenant.tenant_id, check_out_time: { gte: priorStart, lt: priorEnd } },
      }),
    ]);

    const revenue = toNumber(revenueAgg._sum.total_fee);
    const priorRevenue = toNumber(priorRevenueAgg._sum.total_fee);
    const promotionsTotal = toNumber(promotionAgg._sum.promotion_amount) + toNumber(promotionAgg._sum.voucher_bill_amount);
    const avgDuration = durationAgg._avg.duration != null ? Number(durationAgg._avg.duration) : 0;
    const priorAvgDuration = priorDurationAgg._avg.duration != null ? Number(priorDurationAgg._avg.duration) : 0;

    return {
      revenue: { value: revenue, changePct: pctChange(revenue, priorRevenue) },
      activeOccupancy: { value: activeOccupancy },
      completedSessions: {
        value: completedCount,
        peakHourlyThroughput: peakHourRows.length ? toNumber(peakHourRows[0].count) : 0,
      },
      promotionsApplied: {
        value: promotionsTotal,
        pctOfRevenue: revenue > 0 ? (promotionsTotal / revenue) * 100 : null,
      },
      avgDuration: { value: avgDuration, changePct: pctChange(avgDuration, priorAvgDuration) },
    };
  }

  async getRevenueVolumeChart(filter: ParkingDashboardKpiFilterDto) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(filter.parkingCode);
    const { start, end } = dayRange(filter.startDate, filter.endDate);
    const isSingleDay = end.getTime() - start.getTime() <= 86400000;
    const bucket = isSingleDay ? 'hour' : 'day';

    const rows = await this.prisma.$queryRaw<Array<{ bucket: Date; revenue: number; volume: bigint }>>`
      SELECT date_trunc(${bucket}, check_out_time) AS bucket,
             COALESCE(SUM(total_fee), 0) AS revenue,
             COUNT(*)::bigint AS volume
      FROM parking_transaction
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((r) => ({
      label: isSingleDay ? formatHour(r.bucket) : formatDay(r.bucket),
      revenue: toNumber(r.revenue),
      volume: toNumber(r.volume),
    }));
  }

  async getRevenueSplitChart(filter: ParkingDashboardKpiFilterDto, dimension: 'vehicle_type_name' | 'card_type_name') {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(filter.parkingCode);
    const { start, end } = dayRange(filter.startDate, filter.endDate);
    const column = dimension === 'card_type_name' ? Prisma.sql`card_type_name` : Prisma.sql`vehicle_type_name`;

    const rows = await this.prisma.$queryRaw<Array<{ label: string | null; revenue: number; count: bigint }>>`
      SELECT ${column} AS label, COALESCE(SUM(total_fee), 0) AS revenue, COUNT(*)::bigint AS count
      FROM parking_transaction
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1
      ORDER BY revenue DESC
    `;

    return rows.map((r) => ({
      label: r.label ?? 'Không xác định',
      revenue: toNumber(r.revenue),
      count: toNumber(r.count),
    }));
  }

  async getInflowOutflowChart(filter: ParkingDashboardKpiFilterDto) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(filter.parkingCode);
    const { start, end } = dayRange(filter.startDate, filter.endDate);

    const [inflowRows, outflowRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
        SELECT EXTRACT(HOUR FROM check_in_time)::int AS hour, COUNT(*)::bigint AS count
        FROM parking_transaction
        WHERE tenant_id = ${tenant.tenant_id}
          AND check_in_time >= ${start} AND check_in_time < ${end}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
        SELECT EXTRACT(HOUR FROM check_out_time)::int AS hour, COUNT(*)::bigint AS count
        FROM parking_transaction
        WHERE tenant_id = ${tenant.tenant_id}
          AND check_out_time >= ${start} AND check_out_time < ${end}
        GROUP BY 1
      `,
    ]);

    const inflowByHour = new Map(inflowRows.map((r) => [r.hour, toNumber(r.count)]));
    const outflowByHour = new Map(outflowRows.map((r) => [r.hour, toNumber(r.count)]));

    const points = [];
    for (let hour = 0; hour < 24; hour++) {
      points.push({
        label: `${String(hour).padStart(2, '0')}:00`,
        inflow: inflowByHour.get(hour) ?? 0,
        outflow: outflowByHour.get(hour) ?? 0,
      });
    }
    return points;
  }

  async getPromotionUtilizationChart(filter: ParkingDashboardKpiFilterDto) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(filter.parkingCode);
    const { start, end } = dayRange(filter.startDate, filter.endDate);

    const rows = await this.prisma.$queryRaw<Array<{ company: string | null; count: bigint; amount: number }>>`
      SELECT voucher_bill_company AS company, COUNT(*)::bigint AS count,
             COALESCE(SUM(promotion_amount + voucher_bill_amount), 0) AS amount
      FROM parking_transaction
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
        AND promotion_used = true
      GROUP BY 1
      ORDER BY amount DESC
    `;

    return rows.map((r) => ({
      label: r.company ?? 'Khuyến mãi trực tiếp',
      count: toNumber(r.count),
      amount: toNumber(r.amount),
    }));
  }

  async getTransactionsV2(filter: ParkingTransactionFilterV2Dto) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(filter.parkingCode);
    const { start, end } = dayRange(filter.startDate, filter.endDate);
    const limit = filter.limit ?? 25;
    const sortBy = filter.sortBy ?? 'check_in_time';
    const sortDir = filter.sortDir ?? 'desc';

    const where = this.buildTransactionWhereV2(tenant.tenant_id, start, end, filter);

    // Keyset cursor is only supported for the default sort (check_in_time desc,
    // matching idx_pt_keyset). Any other sort falls back to a plain first page.
    const usesKeyset = sortBy === 'check_in_time' && sortDir === 'desc';
    if (usesKeyset && filter.cursor) {
      const cursor = decodeCursor(filter.cursor);
      where.OR = [
        { check_in_time: { lt: cursor.checkInTime } },
        { check_in_time: cursor.checkInTime, parking_session_id: { lt: BigInt(cursor.sessionId) } },
      ];
    }

    const rows = await this.prisma.parking_transaction.findMany({
      where,
      orderBy: usesKeyset
        ? [{ check_in_time: 'desc' }, { parking_session_id: 'desc' }]
        : [{ [sortBy]: sortDir }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const vehicleTypeNames = await this.loadVehicleTypeNames(tenant.tenant_id);
    const lastRow = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map((r) => mapTransactionRowV2(r, tenant.tenant_code, vehicleTypeNames)),
      hasMore,
      nextCursor:
        hasMore && lastRow ? encodeCursor(lastRow.check_in_time, lastRow.parking_session_id.toString()) : null,
    };
  }

  private buildTransactionWhereV2(
    tenantId: number,
    start: Date,
    end: Date,
    filter: ParkingTransactionFilterV2Dto,
  ): Prisma.parking_transactionWhereInput {
    const where: Prisma.parking_transactionWhereInput = {
      tenant_id: tenantId,
      check_in_time: { gte: start, lt: end },
    };
    // laneId/search live under `AND` (not the top-level `OR`), since
    // getTransactionsV2 uses `where.OR` for the keyset cursor predicate.
    const and: Prisma.parking_transactionWhereInput[] = [];

    if (filter.laneId != null) {
      and.push({ OR: [{ check_in_lane_id: filter.laneId }, { check_out_lane_id: filter.laneId }] });
    }

    const search = filter.search?.trim();
    if (search) {
      and.push({
        OR: [
          { vehicle_number: { contains: search, mode: 'insensitive' } },
          { card_number: { contains: search, mode: 'insensitive' } },
          { invoice_no: { contains: search, mode: 'insensitive' } },
          { reservation_code: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length) {
      where.AND = and;
    }

    if (filter.promotionUsed != null) {
      where.promotion_used = filter.promotionUsed;
    }
    if (filter.paymentStatus?.length) {
      where.online_payment_status = { in: filter.paymentStatus };
    }
    if (filter.invoiceStatus?.length) {
      where.invoice_status = { in: filter.invoiceStatus };
    }

    return where;
  }

  async getTransactions(filter: ParkingTransactionFilterDto) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(filter.parkingCode);
    const pageIndex = filter.pageIndex ?? 1;
    const pageSize = filter.pageSize ?? 10;

    const where = this.buildTransactionWhere(tenant.tenant_id, filter.startDate, filter.endDate, {
      cardCode: filter.cardCode,
      licensePlate: filter.licensePlate,
    });

    const [totalItems, rows] = await Promise.all([
      this.prisma.parking_transaction.count({ where }),
      this.prisma.parking_transaction.findMany({
        where,
        orderBy: { check_out_time: 'desc' },
        skip: (pageIndex - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const vehicleTypeNames = await this.loadVehicleTypeNames(tenant.tenant_id);

    return {
      items: rows.map((r) => mapTransactionRow(r, tenant.tenant_code, vehicleTypeNames)),
      currentPage: pageIndex,
      pageSize,
      totalItems,
      totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0,
    };
  }

  async exportTransactions(filter: ParkingTransactionExportFilterDto) {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(filter.parkingCode);
    const where = this.buildTransactionWhere(tenant.tenant_id, filter.startDate, filter.endDate);

    const [rows, vehicleTypeNames, overviewAgg] = await Promise.all([
      this.prisma.parking_transaction.findMany({ where, orderBy: { check_out_time: 'desc' } }),
      this.loadVehicleTypeNames(tenant.tenant_id),
      this.prisma.parking_transaction.groupBy({
        by: ['vehicle_type_id'],
        where,
        _count: { _all: true },
        _sum: {
          total_fee: true,
          promotion_amount: true,
          cash_amount: true,
          bank_transfer_amount: true,
        },
      }),
    ]);

    return buildTransactionWorkbook(
      rows.map((r) => mapTransactionRow(r, tenant.tenant_code, vehicleTypeNames)),
      overviewAgg.map((row) => mapOverviewRow(row, vehicleTypeNames)),
    );
  }

  private buildTransactionWhere(
    tenantId: number,
    startDate: string,
    endDate: string,
    opts?: { cardCode?: string; licensePlate?: string },
  ): Prisma.parking_transactionWhereInput {
    const where: Prisma.parking_transactionWhereInput = {
      tenant_id: tenantId,
      check_out_time: { gte: startOfDay(new Date(startDate)), lt: addDays(startOfDay(new Date(endDate)), 1) },
    };
    const cardCode = opts?.cardCode?.trim();
    if (cardCode) {
      where.card_number = { contains: cardCode, mode: 'insensitive' };
    }
    const licensePlate = opts?.licensePlate?.trim();
    if (licensePlate) {
      where.OR = [
        { vehicle_number: { contains: licensePlate, mode: 'insensitive' } },
        { check_in_alpr_vehicle_number: { contains: licensePlate, mode: 'insensitive' } },
        { check_out_alpr_vehicle_number: { contains: licensePlate, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}

function formatDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatHour(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

function dayRange(startDate: string, endDate: string): { start: Date; end: Date } {
  const start = startOfDay(new Date(startDate));
  const end = addDays(startOfDay(new Date(endDate)), 1);
  return { start, end };
}

function trailingPriorWindow(start: Date, end: Date): { priorStart: Date; priorEnd: Date } {
  const windowMs = end.getTime() - start.getTime();
  return { priorStart: new Date(start.getTime() - windowMs), priorEnd: start };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

interface TransactionCursor {
  checkInTime: Date;
  sessionId: string;
}

function encodeCursor(checkInTime: Date, sessionId: string): string {
  return Buffer.from(JSON.stringify({ t: checkInTime.toISOString(), id: sessionId }), 'utf8').toString('base64');
}

function decodeCursor(cursor: string): TransactionCursor {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    return { checkInTime: new Date(decoded.t), sessionId: String(decoded.id) };
  } catch {
    throw new BadRequestException('Cursor phân trang không hợp lệ');
  }
}

function formatDurationHms(minutes: number | null): string {
  if (minutes == null) return '--:--:--';
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function mapTransactionRowV2(
  row: parking_transaction,
  parkingCode: string,
  vehicleTypeNames: Map<string, string>,
) {
  const base = mapTransactionRow(row, parkingCode, vehicleTypeNames);
  const alprMatched =
    row.check_in_alpr_vehicle_number != null &&
    row.vehicle_number != null &&
    row.check_in_alpr_vehicle_number === row.vehicle_number;
  return {
    ...base,
    tenantCode: parkingCode,
    checkInLaneId: row.check_in_lane_id,
    checkOutLaneId: row.check_out_lane_id,
    checkInOperatorId: row.check_in_operator_id,
    checkOutOperatorId: row.check_out_operator_id,
    alprMatched,
    durationDisplay: formatDurationHms(row.duration),
    inFee: toNumber(row.in_fee),
    outFee: toNumber(row.out_fee),
    bankPaymentMethod: row.bank_payment_method,
    onlinePaymentStatus: row.online_payment_status,
    invoiceStatus: row.invoice_status,
    invoiceNo: row.invoice_no,
    reservationCode: row.reservation_code,
  };
}

const MONTH_NAMES_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

function formatMonth(d: Date): string {
  return MONTH_NAMES_VI[d.getMonth()];
}

function fillDays(start: Date, endExclusive: Date, byDay: Map<string, number>): ChartPoint[] {
  const dayMs = 86400000;
  const dayCount = Math.round((endExclusive.getTime() - start.getTime()) / dayMs);
  const points = new Array<ChartPoint>(dayCount);
  let cursor = start.getTime();
  for (let i = 0; i < dayCount; i++) {
    const key = formatDay(new Date(cursor));
    points[i] = { label: key, value: byDay.get(key) ?? 0 };
    cursor += dayMs;
  }
  return points;
}

// Ảnh lưu đường dẫn tương đối, mỗi bãi đỗ trỏ về một image server riêng (Sala/PHI/PVT) —
// khớp AppConfig.ImageSalaParkingUrl/ImagePHIParkingUrl/ImagePVTParkingUrl bên WebCore.Server.
const PARKING_IMAGE_BASE_URL: Record<string, string> = {
  sKVuws6s: 'https://parkingsala.thiso.vn/images/',
  e5GPYQMe: 'https://parkingphi.thiso.vn/api/CentralParkingData/GetImage?path=',
  HVkrxUsp: 'http://113.164.29.122:9191/images/',
};

function mapTransactionRow(
  row: parking_transaction,
  parkingCode: string,
  vehicleTypeNames: Map<string, string>,
) {
  const baseUrl = PARKING_IMAGE_BASE_URL[parkingCode] ?? '';
  const imageIn = parseImageJson(row.check_in_images);
  const imageOut = parseImageJson(row.check_out_images);
  return {
    id: row.parking_session_id.toString(),
    recordId: row.parking_session_id.toString(),
    vehicleTypeName: (row.vehicle_type_id != null && vehicleTypeNames.get(String(row.vehicle_type_id))) || row.vehicle_type_name,
    cardCode: row.card_number,
    entryLicensePlate: row.check_in_alpr_vehicle_number ?? row.vehicle_number,
    exitLicensePlate: row.check_out_alpr_vehicle_number ?? row.vehicle_number,
    entryTime: row.check_in_time,
    exitTime: row.check_out_time,
    totalTime: row.duration,
    voucherTypeName: row.voucher_type,
    voucherCode: row.voucher_coupon_code ?? row.voucher_bill_number,
    voucherValue: toNumber(row.voucher_coupon_amount) + toNumber(row.voucher_bill_amount),
    parkingFee: toNumber(row.total_fee),
    cash: toNumber(row.cash_amount),
    bankTransfer: toNumber(row.bank_transfer_amount),
    totalAmount: toNumber(row.total_fee),
    isOnlinePayment: row.online_payment_type === 'WebPayment',
    promotion: toNumber(row.promotion_amount),
    promotionDetail: {
      voucherBillNumber: row.voucher_bill_number,
      voucherBillAmount: toNumber(row.voucher_bill_amount),
      voucherBillCompany: row.voucher_bill_company,
      voucherCouponCode: row.voucher_coupon_code,
      voucherCouponAmount: toNumber(row.voucher_coupon_amount),
      voucherCouponCompany: row.voucher_coupon_company,
    },
    entryLicensePlateImage: imageIn?.back ? baseUrl + imageIn.back : null,
    entryOverviewImage: imageIn?.front ? baseUrl + imageIn.front : null,
    exitLicensePlateImage: imageOut?.back ? baseUrl + imageOut.back : null,
    exitOverviewImage: imageOut?.front ? baseUrl + imageOut.front : null,
  };
}

interface OverviewAggRow {
  vehicle_type_id: number | null;
  _count: { _all: number };
  _sum: {
    total_fee: number | null;
    promotion_amount: number | null;
    cash_amount: number | null;
    bank_transfer_amount: number | null;
  };
}

function mapOverviewRow(row: OverviewAggRow, vehicleTypeNames: Map<string, string>) {
  return {
    vehicleTypeName: (row.vehicle_type_id != null && vehicleTypeNames.get(String(row.vehicle_type_id))) || 'Khác',
    totalTransaction: row._count._all,
    totalParkingFee: toNumber(row._sum.total_fee),
    totalVoucherValue: toNumber(row._sum.promotion_amount),
    totalCash: toNumber(row._sum.cash_amount),
    totalBankTransfer: toNumber(row._sum.bank_transfer_amount),
    totalRevenue: toNumber(row._sum.total_fee),
  };
}

function parseImageJson(v: unknown): { front?: string; back?: string } | null {
  if (v == null) return null;
  if (typeof v === 'object') return v as { front?: string; back?: string };
  if (typeof v !== 'string' || !v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function buildTransactionWorkbook(
  transactions: ReturnType<typeof mapTransactionRow>[],
  overview: ReturnType<typeof mapOverviewRow>[],
) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const overviewSheet = workbook.addWorksheet('OverViewReport');
  overviewSheet.columns = [
    { header: 'Loại Xe', key: 'vehicleTypeName', width: 20 },
    { header: 'Tổng Giao Dịch', key: 'totalTransaction', width: 16 },
    { header: 'Phí Gửi Xe', key: 'totalParkingFee', width: 16 },
    { header: 'Voucher', key: 'totalVoucherValue', width: 16 },
    { header: 'Tiền Mặt', key: 'totalCash', width: 16 },
    { header: 'Chuyển Khoản', key: 'totalBankTransfer', width: 16 },
    { header: 'Tổng Thu', key: 'totalRevenue', width: 16 },
  ];
  overview.forEach((row) => overviewSheet.addRow(row));

  const sheet = workbook.addWorksheet('ReportParkingHistory');
  sheet.columns = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'Mã', key: 'recordId', width: 12 },
    { header: 'Loại Xe', key: 'vehicleTypeName', width: 14 },
    { header: 'Mã Thẻ', key: 'cardCode', width: 14 },
    { header: 'Biển Số Vào', key: 'entryLicensePlate', width: 14 },
    { header: 'Biển Số Ra', key: 'exitLicensePlate', width: 14 },
    { header: 'Thời Gian Vào', key: 'entryTime', width: 18 },
    { header: 'Thời Gian Ra', key: 'exitTime', width: 18 },
    { header: 'Tổng Thời Gian', key: 'totalTime', width: 14 },
    { header: 'Loại Voucher', key: 'voucherTypeName', width: 14 },
    { header: 'Mã Voucher', key: 'voucherCode', width: 14 },
    { header: 'Giá Trị Voucher', key: 'voucherValue', width: 14 },
    { header: 'Phí Gửi Xe', key: 'parkingFee', width: 14 },
    { header: 'Tiền Mặt', key: 'cash', width: 14 },
    { header: 'Ngân Lượng', key: 'bankTransfer', width: 14 },
    { header: 'Tổng Thu', key: 'totalAmount', width: 14 },
    { header: 'Khuyến Mãi', key: 'promotion', width: 14 },
  ];
  transactions.forEach((row, idx) => sheet.addRow({ stt: idx + 1, ...row }));

  return workbook.xlsx.writeBuffer();
}
