import api from '@/lib/axios';

export interface ParkingTransactionFilter {
  parkingCode: string;
  startDate: string;
  endDate: string;
  pageIndex?: number;
  pageSize?: number;
  cardCode?: string;
  licensePlate?: string;
}

export interface ParkingTransactionExportFilter {
  parkingCode: string;
  startDate: string;
  endDate: string;
}

export interface ParkingTransactionFilterV2 {
  parkingCode: string;
  startDate: string;
  endDate: string;
  laneId?: number;
  search?: string;
  promotionType?: 'NONE' | 'BILL' | 'VOUCHER';
  paymentStatus?: string[];
  invoiceStatus?: string[];
  voucherTypeNames?: string[];
  sortBy?: 'check_in_time' | 'check_out_time' | 'total_fee' | 'duration';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface MonthlyBucket {
  cash: number;
  online: number;
  voucher: number;
  total: number;
  vehicleCount: number;
}

export interface MonthlySummary {
  currentMonth: MonthlyBucket;
  previousMonth: MonthlyBucket;
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

export const parkingDashboardApi = {
  getTenants: () => api.get('/parking-dashboard/tenants').then((r) => r.data),
  getMonthlySummary: (parkingCode: string) =>
    api.get('/parking-dashboard/monthly-summary', { params: { parkingCode } }).then((r) => r.data),
  getRevenueVehicleChartByMonth: (parkingCode: string, year: number) =>
    api.get('/parking-dashboard/revenue-vehicle-chart-by-month', { params: { parkingCode, year } }).then((r) => r.data),
  getRevenueVehicleChartByDay: (parkingCode: string, year: number, month: number) =>
    api.get('/parking-dashboard/revenue-vehicle-chart-by-day', { params: { parkingCode, year, month } }).then((r) => r.data),
  getRevenueVehicleChartByYear: (parkingCode: string, fromYear: number, toYear: number) =>
    api.get('/parking-dashboard/revenue-vehicle-chart-by-year', { params: { parkingCode, fromYear, toYear } }).then((r) => r.data),
  getVoucherTypes: (parkingCode: string) =>
    api.get('/parking-dashboard/voucher-types', { params: { parkingCode } }).then((r) => r.data),
  getTransactionImage: (params: { parkingCode: string; sessionId: string; direction: 'entry' | 'exit'; view?: 'plate' | 'overview' }) =>
    api.get('/parking-dashboard/transactions/image', { params, responseType: 'blob' }).then((r) => r.data as Blob),
  getTransactionsV2: (filter: ParkingTransactionFilterV2) =>
    api.post('/parking-dashboard/transactions/v2', filter).then((r) => r.data),
  getTransactions: (filter: ParkingTransactionFilter) =>
    api.post('/parking-dashboard/transactions', filter).then((r) => r.data),
  exportTransactions: (filter: ParkingTransactionExportFilter, signal?: AbortSignal) =>
    api.post('/parking-dashboard/transactions/export', filter, { responseType: 'blob', signal }).then((r) => r.data),
};
