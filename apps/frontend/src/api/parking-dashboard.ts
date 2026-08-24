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

export interface ParkingDashboardKpiFilter {
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
  promotionUsed?: boolean;
  paymentStatus?: string[];
  invoiceStatus?: string[];
  sortBy?: 'check_in_time' | 'check_out_time' | 'total_fee' | 'duration';
  sortDir?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
}

export const parkingDashboardApi = {
  getTenants: () => api.get('/parking-dashboard/tenants').then((r) => r.data),
  getKpiSummary: (filter: ParkingDashboardKpiFilter) =>
    api.get('/parking-dashboard/kpi-summary', { params: filter }).then((r) => r.data),
  getRevenueVolumeChart: (filter: ParkingDashboardKpiFilter) =>
    api.get('/parking-dashboard/revenue-volume-chart', { params: filter }).then((r) => r.data),
  getRevenueSplitChart: (filter: ParkingDashboardKpiFilter, dimension: 'vehicle_type_name' | 'card_type_name') =>
    api.get('/parking-dashboard/revenue-split-chart', { params: { ...filter, dimension } }).then((r) => r.data),
  getInflowOutflowChart: (filter: ParkingDashboardKpiFilter) =>
    api.get('/parking-dashboard/inflow-outflow-chart', { params: filter }).then((r) => r.data),
  getPromotionUtilizationChart: (filter: ParkingDashboardKpiFilter) =>
    api.get('/parking-dashboard/promotion-utilization-chart', { params: filter }).then((r) => r.data),
  getTransactionsV2: (filter: ParkingTransactionFilterV2) =>
    api.post('/parking-dashboard/transactions/v2', filter).then((r) => r.data),
  revenueReport: (parkingCode: string) =>
    api.get('/parking-dashboard/revenue-report', { params: { parkingCode } }).then((r) => r.data),
  transactionChart: (parkingCode: string, startTime: string, finishTime: string) =>
    api.get('/parking-dashboard/transaction-chart', { params: { parkingCode, startTime, finishTime } }).then((r) => r.data),
  revenueChart: (parkingCode: string, startTime: string, finishTime: string) =>
    api.get('/parking-dashboard/revenue-chart', { params: { parkingCode, startTime, finishTime } }).then((r) => r.data),
  revenueChartByYear: (parkingCode: string, year: number) =>
    api.get('/parking-dashboard/revenue-chart-by-year', { params: { parkingCode, year } }).then((r) => r.data),
  paymentBreakdown: (parkingCode: string, startTime: string, finishTime: string) =>
    api.get('/parking-dashboard/payment-breakdown', { params: { parkingCode, startTime, finishTime } }).then((r) => r.data),
  getTransactions: (filter: ParkingTransactionFilter) =>
    api.post('/parking-dashboard/transactions', filter).then((r) => r.data),
  exportTransactions: (filter: ParkingTransactionExportFilter) =>
    api.post('/parking-dashboard/transactions/export', filter, { responseType: 'blob' }).then((r) => r.data),
};
