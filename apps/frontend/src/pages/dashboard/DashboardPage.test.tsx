import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { dashboardApi } from '@/api';
import i18n from '@/lib/i18n';

beforeAll(() => i18n.changeLanguage('vi'));

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

vi.mock('@/api', () => ({
  dashboardApi: { getDashboard: vi.fn() },
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
  });

  it('renders consolidated booking data and navigates from an action item', async () => {
    renderDashboard();

    expect(await screen.findByText('Booking đang giữ')).toBeInTheDocument();
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Hóa đơn quá hạn/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/billing?status=OVERDUE');
    expect(dashboardApi.getDashboard).toHaveBeenCalledTimes(1);
    expect(dashboardApi.getDashboard).toHaveBeenCalledWith('mall-1');
  });

  it('allows an operator to refresh the dashboard explicitly', async () => {
    renderDashboard();
    const refresh = await screen.findByRole('button', { name: 'Làm mới' });
    fireEvent.click(refresh);
    await waitFor(() => expect(dashboardApi.getDashboard).toHaveBeenCalledTimes(2));
  });
});
