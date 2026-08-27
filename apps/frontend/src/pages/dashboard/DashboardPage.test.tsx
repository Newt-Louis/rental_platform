import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { analyticsApi, billingApi, dashboardApi, reportsApi } from '@/api';
import i18n from '@/lib/i18n';

beforeAll(() => i18n.changeLanguage('vi'));

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

vi.mock('@/api', () => ({
  dashboardApi: { getDashboard: vi.fn() },
  reportsApi: { revenueReport: vi.fn() },
  analyticsApi: { getOccupancyTrend: vi.fn() },
  billingApi: { getCollectionKpi: vi.fn() },
}));
vi.mock('@/store/mall.store', () => ({
  useMallStore: () => ({ selectedMallId: 'mall-1', selectedMallName: 'THISO Mall' }),
}));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: () => ({ user: { role: 'ADMIN' } }),
}));

const dashboard = {
  mallId: 'mall-1', focusAreas: ['overview'], occupancyRate: 80,
  totalArea: 100, leasedArea: 80, vacantArea: 20, totalTenants: 4,
  monthlyRevenue: 1_000_000, collectedRevenue: 750_000,
  overdueAmount: 250_000, overdueCount: 2, expiringIn30: 1,
  expiringIn90: 3, pendingApprovals: 2, openTickets: 5,
  collectionRate: 75, healthScore: 78,
  bookingStats: { active: 6, pending: 2, expiringSoon: 1 },
};

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}{useLocation().search}</div>;
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardApi.getDashboard).mockResolvedValue(dashboard);
    vi.mocked(reportsApi.revenueReport).mockResolvedValue({
      byPeriod: [{ period: '2026-08', total: 3_165_855_000, paid: 2_400_000_000 }],
    });
    vi.mocked(analyticsApi.getOccupancyTrend).mockResolvedValue([
      { period: '2026-08', occupancyRate: 80 },
    ]);
    vi.mocked(billingApi.getCollectionKpi).mockResolvedValue({
      agingTrend: [{ period: '2026-08', current: 1_600_000_000, overdue: 800_000_000 }],
    });
  });

  it('renders consolidated booking data and navigates from an action item', async () => {
    renderDashboard();

    expect(await screen.findByText('Booking đang giữ')).toBeInTheDocument();
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 hóa đơn').length).toBeGreaterThan(0);
    expect(screen.getAllByText('250.000 VND').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Xử lý' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/billing?status=OVERDUE');
    expect(dashboardApi.getDashboard).toHaveBeenCalledTimes(1);
    expect(dashboardApi.getDashboard).toHaveBeenCalledWith('mall-1');
  });

  it('labels financial chart scales and demotes the composite score', async () => {
    renderDashboard();
    expect(await screen.findByText('Chỉ báo tổng hợp tham khảo')).toBeInTheDocument();
    expect(screen.getByText('1.000.000 VND')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Phương pháp chỉ báo' }));
    expect(screen.getByText(/không phải KPI kinh doanh đã phê duyệt/i)).toBeInTheDocument();
    expect((await screen.findAllByText('Đơn vị: Tỷ VND')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chưa đủ dữ liệu lịch sử').length).toBeGreaterThan(0);
  });

  it('allows an operator to refresh the dashboard explicitly', async () => {
    renderDashboard();
    const refresh = await screen.findByRole('button', { name: 'Làm mới' });
    fireEvent.click(refresh);
    await waitFor(() => expect(dashboardApi.getDashboard).toHaveBeenCalledTimes(2));
  });
});
