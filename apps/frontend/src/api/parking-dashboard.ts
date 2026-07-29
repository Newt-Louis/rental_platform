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

export const parkingDashboardApi = {
  revenueReport: (parkingCode: string) =>
    api.get('/parking-dashboard/revenue-report', { params: { parkingCode } }).then((r) => r.data),
  transactionChart: (parkingCode: string, startTime: string, finishTime: string) =>
    api.get('/parking-dashboard/transaction-chart', { params: { parkingCode, startTime, finishTime } }).then((r) => r.data),
  revenueChart: (parkingCode: string, startTime: string, finishTime: string) =>
    api.get('/parking-dashboard/revenue-chart', { params: { parkingCode, startTime, finishTime } }).then((r) => r.data),
  revenueChartByYear: (parkingCode: string, year: number) =>
    api.get('/parking-dashboard/revenue-chart-by-year', { params: { parkingCode, year } }).then((r) => r.data),
  getTransactions: (filter: ParkingTransactionFilter) =>
    api.post('/parking-dashboard/transactions', filter).then((r) => r.data),
  exportTransactions: (filter: ParkingTransactionFilter) =>
    api.post('/parking-dashboard/transactions/export', filter, { responseType: 'blob' }).then((r) => r.data),
};
