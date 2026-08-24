import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaParkingService } from '../../prisma-parking/prisma-parking.service';
import { Prisma, parking_transactions, tenants } from '../../../node_modules/.prisma/parking-client';
import {
  ParkingTransactionExportFilterDto,
  ParkingTransactionFilterDto,
  ParkingTransactionFilterV2Dto,
} from './dto/parking-transaction-filter.dto';

function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
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

// Date-only strings keep the whole-day behavior (midnight to next midnight); a string with a
// time component is used as-is, so a picked time range isn't widened back to whole days.
function parseRangeBoundary(dateStr: string, isEnd: boolean): Date {
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  const day = startOfDay(new Date(dateStr));
  return isEnd ? addDays(day, 1) : day;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export interface MonthlyBucket {
  cash: number;
  online: number;
  voucher: number;
  total: number;
  vehicleCount: number;
}

export interface RevenueVehicleSeriesPoint {
  label: string;
  bucketKey: string;
  totalRevenue: number;
  cashRevenue: number;
  onlineRevenue: number;
  voucherRevenue: number;
  vehicleCount: number;
  vehicleCountByType: Record<string, number>;
}

@Injectable()
export class ParkingDashboardService {
  private readonly logger = new Logger(ParkingDashboardService.name);

  // Each concurrent export can run ~90s and push RSS up several hundred MB — cap concurrency
  // to avoid OOM. In-memory counter only works for a single instance (would need Redis behind a LB).
  private activeExports = 0;
  private static readonly MAX_CONCURRENT_EXPORTS = 2;

  // TEMPORARY server-side cache (os.tmpdir(), not a volume — wiped on rebuild/recreate) for
  // exported workbooks. Identical requests reuse the file. TTL 2 weeks, refreshed on hit.
  private static readonly EXPORT_CACHE_DIR = path.join(os.tmpdir(), 'thiso-parking-export-cache');
  private static readonly EXPORT_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

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

  // Same resolution order as mapTransactionRow: vehicle_type_mappings first, then the raw
  // (often null) vehicle_type_name, then a literal fallback.
  private resolveVehicleTypeLabel(
    vehicleTypeNames: Map<string, string>,
    vehicleTypeId: number | null,
    rawName: string | null,
  ): string {
    return (vehicleTypeId != null && vehicleTypeNames.get(String(vehicleTypeId))) || rawName || 'Khác';
  }

  // Calendar this-month vs last-month totals, cash/online/voucher + vehicle count, in one
  // CASE WHEN GROUP BY query instead of two separate round trips.
  async getMonthlySummary(parkingCode: string): Promise<{ currentMonth: MonthlyBucket; previousMonth: MonthlyBucket }> {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(parkingCode);

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = startOfMonth(addMonths(now, 1));
    const lastMonthStart = startOfMonth(addMonths(now, -1));

    const rows = await this.prisma.$queryRaw<Array<{
      period: string; cash: number; online: number; voucher: number; total: number; count: bigint;
    }>>`
      SELECT
        CASE WHEN check_out_time >= ${thisMonthStart} THEN 'current' ELSE 'previous' END AS period,
        COALESCE(SUM(cash_amount), 0) AS cash,
        COALESCE(SUM(bank_transfer_amount), 0) AS online,
        COALESCE(SUM(voucher_coupon_amount + voucher_bill_amount), 0) AS voucher,
        COALESCE(SUM(total_fee), 0) AS total,
        COUNT(*)::bigint AS count
      FROM parking_transactions
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${lastMonthStart} AND check_out_time < ${thisMonthEnd}
      GROUP BY 1
    `;

    const byPeriod = new Map(rows.map((r) => [r.period, r]));
    const toBucket = (r: (typeof rows)[number] | undefined): MonthlyBucket => ({
      cash: toNumber(r?.cash),
      online: toNumber(r?.online),
      voucher: toNumber(r?.voucher),
      total: toNumber(r?.total),
      vehicleCount: r ? toNumber(r.count) : 0,
    });

    return {
      currentMonth: toBucket(byPeriod.get('current')),
      previousMonth: toBucket(byPeriod.get('previous')),
    };
  }

  // Revenue (total + cash/online/voucher split) and vehicle count, bucketed by calendar
  // month within one year, filled to all 12 months.
  async getRevenueVehicleChartByMonth(parkingCode: string, year: number): Promise<RevenueVehicleSeriesPoint[]> {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(parkingCode);
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);

    const rows = await this.prisma.$queryRaw<Array<{
      month: Date; cash: number; online: number; voucher: number; total: number; count: bigint;
    }>>`
      SELECT date_trunc('month', check_out_time) AS month,
             COALESCE(SUM(cash_amount), 0) AS cash,
             COALESCE(SUM(bank_transfer_amount), 0) AS online,
             COALESCE(SUM(voucher_coupon_amount + voucher_bill_amount), 0) AS voucher,
             COALESCE(SUM(total_fee), 0) AS total,
             COUNT(*)::bigint AS count
      FROM parking_transactions
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1
      ORDER BY 1
    `;

    const typeRows = await this.prisma.$queryRaw<Array<{
      month: Date; vehicle_type_id: number | null; vehicle_type_name: string | null; count: bigint;
    }>>`
      SELECT date_trunc('month', check_out_time) AS month,
             vehicle_type_id, vehicle_type_name,
             COUNT(*)::bigint AS count
      FROM parking_transactions
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1, 2, 3
    `;

    const vehicleTypeNames = await this.loadVehicleTypeNames(tenant.tenant_id);
    const byMonth = new Map(rows.map((r) => [new Date(r.month).getMonth(), r]));
    const typeByMonth = new Map<number, Record<string, number>>();
    for (const r of typeRows) {
      const m = new Date(r.month).getMonth();
      const label = this.resolveVehicleTypeLabel(vehicleTypeNames, r.vehicle_type_id, r.vehicle_type_name);
      const byType = typeByMonth.get(m) ?? {};
      byType[label] = (byType[label] ?? 0) + toNumber(r.count);
      typeByMonth.set(m, byType);
    }

    const points: RevenueVehicleSeriesPoint[] = [];
    for (let m = 0; m < 12; m++) {
      const r = byMonth.get(m);
      points.push({
        label: formatMonth(new Date(year, m, 1)),
        bucketKey: `${year}-${String(m + 1).padStart(2, '0')}`,
        totalRevenue: toNumber(r?.total),
        cashRevenue: toNumber(r?.cash),
        onlineRevenue: toNumber(r?.online),
        voucherRevenue: toNumber(r?.voucher),
        vehicleCount: r ? toNumber(r.count) : 0,
        vehicleCountByType: typeByMonth.get(m) ?? {},
      });
    }
    return points;
  }

  // Same shape as the monthly chart, bucketed by calendar year across a range instead.
  // fromYear/toYear are swapped if reversed and the span is capped at 15 years.
  async getRevenueVehicleChartByYear(
    parkingCode: string,
    fromYearIn: number,
    toYearIn: number,
  ): Promise<RevenueVehicleSeriesPoint[]> {
    this.ensureConfigured();
    const tenant = await this.resolveTenant(parkingCode);
    const fromYear = Math.min(fromYearIn, toYearIn);
    const toYearRaw = Math.max(fromYearIn, toYearIn);
    const toYear = Math.min(toYearRaw, fromYear + 14);
    const start = new Date(fromYear, 0, 1);
    const end = new Date(toYear + 1, 0, 1);

    const rows = await this.prisma.$queryRaw<Array<{
      yr: number; cash: number; online: number; voucher: number; total: number; count: bigint;
    }>>`
      SELECT EXTRACT(YEAR FROM check_out_time)::int AS yr,
             COALESCE(SUM(cash_amount), 0) AS cash,
             COALESCE(SUM(bank_transfer_amount), 0) AS online,
             COALESCE(SUM(voucher_coupon_amount + voucher_bill_amount), 0) AS voucher,
             COALESCE(SUM(total_fee), 0) AS total,
             COUNT(*)::bigint AS count
      FROM parking_transactions
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1
      ORDER BY 1
    `;

    const typeRows = await this.prisma.$queryRaw<Array<{
      yr: number; vehicle_type_id: number | null; vehicle_type_name: string | null; count: bigint;
    }>>`
      SELECT EXTRACT(YEAR FROM check_out_time)::int AS yr,
             vehicle_type_id, vehicle_type_name,
             COUNT(*)::bigint AS count
      FROM parking_transactions
      WHERE tenant_id = ${tenant.tenant_id}
        AND check_out_time >= ${start} AND check_out_time < ${end}
      GROUP BY 1, 2, 3
    `;

    const vehicleTypeNames = await this.loadVehicleTypeNames(tenant.tenant_id);
    const byYear = new Map(rows.map((r) => [r.yr, r]));
    const typeByYear = new Map<number, Record<string, number>>();
    for (const r of typeRows) {
      const label = this.resolveVehicleTypeLabel(vehicleTypeNames, r.vehicle_type_id, r.vehicle_type_name);
      const byType = typeByYear.get(r.yr) ?? {};
      byType[label] = (byType[label] ?? 0) + toNumber(r.count);
      typeByYear.set(r.yr, byType);
    }

    const points: RevenueVehicleSeriesPoint[] = [];
    for (let y = fromYear; y <= toYear; y++) {
      const r = byYear.get(y);
      points.push({
        label: String(y),
        bucketKey: String(y),
        totalRevenue: toNumber(r?.total),
        cashRevenue: toNumber(r?.cash),
        onlineRevenue: toNumber(r?.online),
        voucherRevenue: toNumber(r?.voucher),
        vehicleCount: r ? toNumber(r.count) : 0,
        vehicleCountByType: typeByYear.get(y) ?? {},
      });
    }
    return points;
  }

  async getTenants() {
    this.ensureConfigured();
    const tenants = await this.prisma.tenants.findMany({
      select: { tenant_id: true, tenant_code: true, name: true },
      orderBy: { name: 'asc' },
    });
    return tenants.map((t) => ({ parkingCode: t.tenant_code, name: t.name }));
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
        { check_in_time: cursor.checkInTime, parking_session_id: { lt: cursor.sessionId } },
      ];
    }

    const rows = await this.prisma.parking_transactions.findMany({
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
        hasMore && lastRow ? encodeCursor(lastRow.check_in_time, lastRow.parking_session_id) : null,
    };
  }

  private buildTransactionWhereV2(
    tenantId: number,
    start: Date,
    end: Date,
    filter: ParkingTransactionFilterV2Dto,
  ): Prisma.parking_transactionsWhereInput {
    const where: Prisma.parking_transactionsWhereInput = {
      tenant_id: tenantId,
      check_in_time: { gte: start, lt: end },
    };
    // laneId/search live under `AND` (not the top-level `OR`), since
    // getTransactionsV2 uses `where.OR` for the keyset cursor predicate.
    const and: Prisma.parking_transactionsWhereInput[] = [];

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
      where.promotion_used = filter.promotionUsed ? 1 : 0;
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
      this.prisma.parking_transactions.count({ where }),
      this.prisma.parking_transactions.findMany({
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

  // Streamed one day at a time — a single findMany() over a full month (up to ~280k rows for
  // a high-volume tenant) reliably crashes Prisma's Rust<->Node bridge, confirmed live.
  async exportTransactions(filter: ParkingTransactionExportFilterDto, res: Response): Promise<void> {
    this.ensureConfigured();
    const start = parseRangeBoundary(filter.startDate, false);
    const end = parseRangeBoundary(filter.endDate, true);
    const maxRangeMs = 31 * 24 * 60 * 60 * 1000; // 1 month
    if (end.getTime() - start.getTime() > maxRangeMs) {
      throw new BadRequestException('Khoảng ngày xuất Excel tối đa là 1 tháng');
    }

    const cachePath = this.exportCachePath(filter.parkingCode, filter.startDate, filter.endDate);
    if (await this.tryServeExportCache(cachePath, res)) {
      return;
    }

    if (this.activeExports >= ParkingDashboardService.MAX_CONCURRENT_EXPORTS) {
      throw new BadRequestException(
        `Đang có ${this.activeExports} yêu cầu xuất Excel khác được xử lý. Vui lòng thử lại sau ít phút.`,
      );
    }
    this.activeExports += 1;
    try {
      await this.streamTransactionsWorkbook(filter, start, end, cachePath);
      await this.serveExportFile(cachePath, res);
    } finally {
      this.activeExports -= 1;
    }
  }

  private exportCachePath(parkingCode: string, startDate: string, endDate: string): string {
    const key = crypto.createHash('sha1').update(`${parkingCode}|${startDate}|${endDate}`).digest('hex');
    return path.join(ParkingDashboardService.EXPORT_CACHE_DIR, `export-${key}.xlsx`);
  }

  private async tryServeExportCache(cachePath: string, res: Response): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(cachePath);
      if (Date.now() - stat.mtimeMs > ParkingDashboardService.EXPORT_CACHE_TTL_MS) return false;
      const now = new Date();
      await fs.promises.utimes(cachePath, now, now); // refresh TTL on hit
      this.logger.log(`EXPORT_DEBUG cache hit path=${cachePath}`);
      await this.serveExportFile(cachePath, res);
      return true;
    } catch {
      return false; // no cache file, or stat failed — fall through to a fresh export
    }
  }

  private async serveExportFile(cachePath: string, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ParkingHistory.xlsx"');
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(cachePath);
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.pipe(res);
    });
  }

  private async streamTransactionsWorkbook(
    filter: ParkingTransactionExportFilterDto,
    start: Date,
    end: Date,
    cachePath: string,
  ): Promise<void> {
    const tenant = await this.resolveTenant(filter.parkingCode);
    const vehicleTypeNames = await this.loadVehicleTypeNames(tenant.tenant_id);
    const baseWhere: Prisma.parking_transactionsWhereInput = { tenant_id: tenant.tenant_id };

    // TEMPORARY diagnostic logging — remove once day-chunked streaming is confirmed stable
    // for a full high-volume month end to end.
    const t0 = Date.now();
    this.logger.log(`EXPORT_DEBUG starting parkingCode=${filter.parkingCode} ${filter.startDate}..${filter.endDate} activeExports=${this.activeExports}`);

    const overviewAgg = await this.prisma.parking_transactions.groupBy({
      by: ['vehicle_type_id'],
      where: { ...baseWhere, check_out_time: { gte: start, lt: end } },
      _count: { _all: true },
      _sum: { total_fee: true, promotion_amount: true, cash_amount: true, bank_transfer_amount: true },
    });

    await fs.promises.mkdir(ParkingDashboardService.EXPORT_CACHE_DIR, { recursive: true });
    const tmpPath = `${cachePath}.tmp-${crypto.randomBytes(6).toString('hex')}`;
    const fileStream = fs.createWriteStream(tmpPath);
    const fileFinished = new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    try {
      await this.writeWorkbookToStream(fileStream, overviewAgg, tenant, vehicleTypeNames, baseWhere, start, end, t0);
      await fileFinished;
      await fs.promises.rename(tmpPath, cachePath);
    } catch (err) {
      await fs.promises.unlink(tmpPath).catch(() => {}); // best-effort — don't mask the real error
      throw err;
    }
  }

  private async writeWorkbookToStream(
    fileStream: fs.WriteStream,
    overviewAgg: Array<{
      vehicle_type_id: number | null;
      _count: { _all: number };
      _sum: { total_fee: Prisma.Decimal | null; promotion_amount: Prisma.Decimal | null; cash_amount: Prisma.Decimal | null; bank_transfer_amount: Prisma.Decimal | null };
    }>,
    tenant: tenants,
    vehicleTypeNames: Map<string, string>,
    baseWhere: Prisma.parking_transactionsWhereInput,
    start: Date,
    end: Date,
    t0: number,
  ): Promise<void> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: fileStream });

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
    for (const row of overviewAgg.map((r) => mapOverviewRow(r, vehicleTypeNames))) {
      overviewSheet.addRow(row).commit();
    }
    overviewSheet.commit();

    const detailSheet = workbook.addWorksheet('ReportParkingHistory');
    detailSheet.columns = [
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

    let stt = 0;
    let dayCursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (dayCursor < end) {
      const nextDay = addDays(dayCursor, 1);
      const dayStart = dayCursor > start ? dayCursor : start;
      const dayEnd = nextDay < end ? nextDay : end;

      const dayRows = await this.prisma.parking_transactions.findMany({
        where: { ...baseWhere, check_out_time: { gte: dayStart, lt: dayEnd } },
        orderBy: { check_out_time: 'desc' },
      });
      for (const r of dayRows) {
        stt += 1;
        detailSheet.addRow({ stt, ...mapTransactionRow(r, tenant.tenant_code, vehicleTypeNames) }).commit();
      }
      this.logger.log(
        `EXPORT_DEBUG day=${dayStart.toISOString().slice(0, 10)} rows=${dayRows.length} runningTotal=${stt} rssMb=${Math.round(process.memoryUsage().rss / 1024 / 1024)}`,
      );

      dayCursor = nextDay;
    }
    detailSheet.commit();
    await workbook.commit(); // triggers fileStream.end() internally

    this.logger.log(`EXPORT_DEBUG done totalRows=${stt} totalMs=${Date.now() - t0} rssMb=${Math.round(process.memoryUsage().rss / 1024 / 1024)}`);
  }

  private buildTransactionWhere(
    tenantId: number,
    startDate: string,
    endDate: string,
    opts?: { cardCode?: string; licensePlate?: string },
  ): Prisma.parking_transactionsWhereInput {
    const where: Prisma.parking_transactionsWhereInput = {
      tenant_id: tenantId,
      check_out_time: { gte: parseRangeBoundary(startDate, false), lt: parseRangeBoundary(endDate, true) },
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

function dayRange(startDate: string, endDate: string): { start: Date; end: Date } {
  const start = parseRangeBoundary(startDate, false);
  const end = parseRangeBoundary(endDate, true);
  return { start, end };
}

interface TransactionCursor {
  checkInTime: Date;
  sessionId: number;
}

function encodeCursor(checkInTime: Date, sessionId: number): string {
  return Buffer.from(JSON.stringify({ t: checkInTime.toISOString(), id: sessionId }), 'utf8').toString('base64');
}

function decodeCursor(cursor: string): TransactionCursor {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    const sessionId = Number(decoded.id);
    if (!Number.isFinite(sessionId)) {
      throw new Error('invalid session id');
    }
    return { checkInTime: new Date(decoded.t), sessionId };
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
  row: parking_transactions,
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
    parkingFee: toNumber(row.parking_fee),
    calculationTime: row.calculation_time,
    paymentDate: row.payment_date,
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

// Ảnh lưu đường dẫn tương đối, mỗi bãi đỗ trỏ về một image server riêng (Sala/PHI/PVT) —
// khớp AppConfig.ImageSalaParkingUrl/ImagePHIParkingUrl/ImagePVTParkingUrl bên WebCore.Server.
const PARKING_IMAGE_BASE_URL: Record<string, string> = {
  sKVuws6s: 'https://parkingsala.thiso.vn/images/',
  e5GPYQMe: 'https://parkingphi.thiso.vn/api/CentralParkingData/GetImage?path=',
  HVkrxUsp: 'http://113.164.29.122:9191/images/',
};

function mapTransactionRow(
  row: parking_transactions,
  parkingCode: string,
  vehicleTypeNames: Map<string, string>,
) {
  const baseUrl = PARKING_IMAGE_BASE_URL[parkingCode] ?? '';
  const imageIn = parseImageJson(row.check_in_images);
  const imageOut = parseImageJson(row.check_out_images);
  return {
    id: String(row.parking_session_id),
    recordId: String(row.parking_session_id),
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
    parkingFee: toNumber(row.parking_fee),
    cash: toNumber(row.cash_amount),
    bankTransfer: toNumber(row.bank_transfer_amount),
    // total_fee is the charged amount; if 0 (fully covered by promo), fall back to
    // promotion_amount's magnitude (stored negative) instead of showing a bare 0.
    totalAmount: toNumber(row.total_fee) || Math.abs(toNumber(row.promotion_amount)),
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
    total_fee: Prisma.Decimal | null;
    promotion_amount: Prisma.Decimal | null;
    cash_amount: Prisma.Decimal | null;
    bank_transfer_amount: Prisma.Decimal | null;
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

