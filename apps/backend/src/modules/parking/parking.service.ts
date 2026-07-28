import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaMssqlService } from '../../prisma-mssql/prisma-mssql.service';
import { ParkingTransactionFilterDto } from './dto/parking-transaction-filter.dto';

// SP trên NewParkingDB trả cột theo tên property C# gốc (Dapper auto-map) — không đảm bảo casing
// đồng nhất giữa các SP, nên đọc phòng thủ bằng nhiều alias thay vì chỉ 1 key cố định.
function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  return undefined;
}

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

export interface ChartPoint {
  label: string;
  value: number;
}

@Injectable()
export class ParkingService {
  private readonly logger = new Logger(ParkingService.name);

  constructor(private readonly prismaMssql: PrismaMssqlService) {}

  private ensureConfigured() {
    if (!this.prismaMssql.isConfigured) {
      throw new ServiceUnavailableException(
        'Tích hợp MSSQL bãi đỗ xe chưa được cấu hình (MSSQL_ENABLED/MSSQL_DATABASE_URL)',
      );
    }
  }

  async getRevenueReport(parkingCode: string) {
    this.ensureConfigured();
    const rows = await this.prismaMssql.$queryRaw<Record<string, unknown>[]>`
      EXEC dbo.SP_GetRevenueReport @parkingCode = ${parkingCode}
    `;
    const row = rows[0] ?? {};
    return {
      todayRevenue: toNumber(pick(row, 'TodayRevenue', 'todayRevenue')),
      totalTodayTransaction: toNumber(pick(row, 'TotalTodayTransaction', 'totalTodayTransaction')),
      totalRevenueLastMonth: toNumber(pick(row, 'TotalRevenueLastMonth', 'totalRevenueLastMonth')),
      totalTransactionLastMonth: toNumber(pick(row, 'TotalTransactionLastMonth', 'totalTransactionLastMonth')),
    };
  }

  async getTransactionChart(parkingCode: string, startTime: string, finishTime: string): Promise<ChartPoint[]> {
    this.ensureConfigured();
    const points: ChartPoint[] = [];
    let cursor = new Date(startTime);
    const end = new Date(finishTime);
    while (cursor <= end) {
      const next = addDays(cursor, 1);
      const rows = await this.prismaMssql.$queryRaw<Record<string, unknown>[]>`
        DECLARE @Total INT;
        EXEC dbo.SP_GetNumberOfTransactionByTime
          @startTime = ${cursor}, @endTime = ${next}, @parkingCode = ${parkingCode},
          @NumberOfTransaction = @Total OUTPUT;
        SELECT @Total AS total;
      `;
      points.push({ label: formatDay(cursor), value: toNumber(rows[0]?.total) });
      cursor = next;
    }
    return points;
  }

  async getRevenueChart(parkingCode: string, startTime: string, finishTime: string): Promise<ChartPoint[]> {
    this.ensureConfigured();
    const points: ChartPoint[] = [];
    let cursor = new Date(startTime);
    const end = new Date(finishTime);
    while (cursor <= end) {
      const next = addDays(cursor, 1);
      const rows = await this.prismaMssql.$queryRaw<Record<string, unknown>[]>`
        DECLARE @Total INT;
        EXEC dbo.SP_GetTotalAmountByTime
          @startTime = ${cursor}, @endTime = ${next}, @parkingCode = ${parkingCode},
          @TotalAmount = @Total OUTPUT;
        SELECT @Total AS total;
      `;
      points.push({ label: formatDay(cursor), value: toNumber(rows[0]?.total) });
      cursor = next;
    }
    return points;
  }

  async getRevenueChartByYear(parkingCode: string, year: number): Promise<ChartPoint[]> {
    this.ensureConfigured();
    const points: ChartPoint[] = [];
    let cursor = new Date(Date.UTC(year, 0, 1));
    for (let m = 0; m < 12; m++) {
      const next = addMonths(cursor, 1);
      const rows = await this.prismaMssql.$queryRaw<Record<string, unknown>[]>`
        DECLARE @Total INT;
        EXEC dbo.SP_GetTotalAmountByTime
          @startTime = ${cursor}, @endTime = ${next}, @parkingCode = ${parkingCode},
          @TotalAmount = @Total OUTPUT;
        SELECT @Total AS total;
      `;
      points.push({ label: formatMonth(cursor), value: toNumber(rows[0]?.total) });
      cursor = next;
    }
    return points;
  }

  async getTransactions(filter: ParkingTransactionFilterDto) {
    this.ensureConfigured();
    const pageIndex = filter.pageIndex ?? 1;
    const pageSize = filter.pageSize ?? 10;
    const cardCode = filter.cardCode?.trim() || null;
    const licensePlate = filter.licensePlate?.trim() || null;

    const countRows = await this.prismaMssql.$queryRaw<Record<string, unknown>[]>`
      DECLARE @Total INT;
      EXEC dbo.SP_CountParkingTransactions
        @StartDate = ${filter.startDate}, @EndDate = ${filter.endDate}, @ParkingCode = ${filter.parkingCode},
        @LicensePlate = ${licensePlate}, @CardCode = ${cardCode}, @TotalRecords = @Total OUTPUT;
      SELECT @Total AS total;
    `;
    const totalItems = toNumber(countRows[0]?.total);

    const rows = await this.prismaMssql.$queryRaw<Record<string, unknown>[]>`
      EXEC dbo.SP_GetParkingTransactions
        @StartDate = ${filter.startDate}, @EndDate = ${filter.endDate}, @ParkingCode = ${filter.parkingCode},
        @PageIndex = ${pageIndex}, @PageSize = ${pageSize},
        @LicensePlate = ${licensePlate}, @CardCode = ${cardCode}
    `;

    return {
      items: rows.map((r) => mapTransactionRow(r, filter.parkingCode)),
      currentPage: pageIndex,
      pageSize,
      totalItems,
      totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0,
    };
  }

  async exportTransactions(filter: ParkingTransactionFilterDto) {
    this.ensureConfigured();
    const cardCode = filter.cardCode?.trim() || null;
    const licensePlate = filter.licensePlate?.trim() || null;
    const ROW_CAP = 10_000;

    const rows = await this.prismaMssql.$queryRawUnsafe<Record<string, unknown>[]>(
      `EXEC dbo.SP_GetParkingTransactions @StartDate=@P1, @EndDate=@P2, @ParkingCode=@P3, @PageIndex=@P4, @PageSize=@P5, @LicensePlate=@P6, @CardCode=@P7`,
      filter.startDate,
      filter.endDate,
      filter.parkingCode,
      1,
      ROW_CAP,
      licensePlate,
      cardCode,
    );

    const overviewRows = await this.prismaMssql.$queryRaw<Record<string, unknown>[]>`
      EXEC dbo.SP_GetOverviewReport
        @StartDate = ${filter.startDate}, @EndDate = ${filter.endDate}, @ParkingCode = ${filter.parkingCode},
        @LicensePlate = ${licensePlate}, @CardCode = ${cardCode}
    `;

    return buildTransactionWorkbook(
      rows.map((r) => mapTransactionRow(r, filter.parkingCode)),
      overviewRows.map(mapOverviewRow),
    );
  }
}

function formatDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

function mapTransactionRow(row: Record<string, unknown>, parkingCode: string) {
  const baseUrl = PARKING_IMAGE_BASE_URL[parkingCode] ?? '';
  const imageIn = parseImageJson(pick(row, 'ImageIn', 'imageIn'));
  const imageOut = parseImageJson(pick(row, 'ImageOut', 'imageOut'));
  return {
    id: pick(row, 'Id', 'id'),
    recordId: pick(row, 'RecordId', 'recordId'),
    vehicleTypeName: pick(row, 'VehicleTypeName', 'vehicleTypeName'),
    cardCode: pick(row, 'CardCode', 'cardCode'),
    entryLicensePlate: pick(row, 'EntryLicensePlate', 'entryLicensePlate'),
    exitLicensePlate: pick(row, 'ExitLicensePlate', 'exitLicensePlate'),
    entryTime: pick(row, 'EntryTime', 'entryTime'),
    exitTime: pick(row, 'ExitTime', 'exitTime'),
    totalTime: pick(row, 'TotalTime', 'totalTime'),
    voucherTypeName: pick(row, 'VoucherTypeName', 'voucherTypeName'),
    voucherCode: pick(row, 'VoucherCode', 'voucherCode'),
    voucherValue: toNumber(pick(row, 'VoucherValue', 'voucherValue')),
    parkingFee: toNumber(pick(row, 'ParkingFee', 'parkingFee')),
    cash: toNumber(pick(row, 'Cash', 'cash')),
    bankTransfer: toNumber(pick(row, 'BankTransfer', 'bankTransfer')),
    totalAmount: toNumber(pick(row, 'TotalAmount', 'totalAmount')),
    entryLicensePlateImage: imageIn?.back ? baseUrl + imageIn.back : null,
    entryOverviewImage: imageIn?.front ? baseUrl + imageIn.front : null,
    exitLicensePlateImage: imageOut?.back ? baseUrl + imageOut.back : null,
    exitOverviewImage: imageOut?.front ? baseUrl + imageOut.front : null,
  };
}

function mapOverviewRow(row: Record<string, unknown>) {
  return {
    vehicleTypeName: pick(row, 'VehicleTypeName', 'vehicleTypeName'),
    totalTransaction: toNumber(pick(row, 'TotalTransaction', 'totalTransaction')),
    totalParkingFee: toNumber(pick(row, 'TotalParkingFee', 'totalParkingFee')),
    totalVoucherValue: toNumber(pick(row, 'TotalVoucherValue', 'totalVoucherValue')),
    totalCash: toNumber(pick(row, 'TotalCash', 'totalCash')),
    totalBankTransfer: toNumber(pick(row, 'TotalBankTransfer', 'totalBankTransfer')),
    totalRevenue: toNumber(pick(row, 'TotalRevenue', 'totalRevenue')),
  };
}

function parseImageJson(v: unknown): { front?: string; back?: string } | null {
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

  const PAGE_SIZE = 1000;
  for (let i = 0; i < transactions.length; i += PAGE_SIZE) {
    const page = transactions.slice(i, i + PAGE_SIZE);
    const sheet = workbook.addWorksheet(`ReportParkingHistory_Page${Math.floor(i / PAGE_SIZE) + 1}`);
    sheet.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Mã', key: 'recordId', width: 12 },
      { header: 'Loại Xe', key: 'vehicleTypeName', width: 14 },
      { header: 'Loại Thẻ', key: 'cardTypeName', width: 14 },
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
    ];
    page.forEach((row, idx) => sheet.addRow({ stt: i + idx + 1, ...row }));
  }

  return workbook.xlsx.writeBuffer();
}
