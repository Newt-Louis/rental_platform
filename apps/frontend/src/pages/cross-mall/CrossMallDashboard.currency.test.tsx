/**
 * REMEDIATION WAVE 1 — Cross-Mall CEO screen currency presentation.
 *
 * The backend now returns per-currency buckets; this proves the screen renders
 * them separately and never presents a consolidated or unlabelled figure.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CrossMallDashboard from './CrossMallDashboard';

const getCrossMallDashboard = vi.fn();
vi.mock('@/api', () => ({
  dashboardApi: { getCrossMallDashboard: () => getCrossMallDashboard() },
}));

const bucket = (currencyCode: string, monthlyRevenue: number, collectedRevenue: number, collectionRate: number) => ({
  currencyCode,
  monthlyRevenue,
  collectedRevenue,
  collectionRate,
});

const RESPONSE = {
  malls: [
    {
      mall: { id: 'mall-1', name: 'THISO Mall Sala', code: 'THISO-SALA', city: 'Ho Chi Minh City' },
      occupancyRate: 21.7,
      totalArea: 7509,
      leasedArea: 1632,
      vacantArea: 5877,
      unitCount: 30,
      revenueByCurrency: [
        bucket('VND', 1_200_000_000, 200_000_000, 16.7),
        bucket('USD', 12_500, 2_500, 20),
        bucket('MMK', 5_000_000, 5_000_000, 100),
      ],
      revenueScalarCurrency: 'VND',
      monthlyRevenue: 1_200_000_000,
      collectedRevenue: 200_000_000,
      collectionRate: 16.7,
      overdueCount: 0,
      openTickets: 3,
      expiringIn30: 0,
      byLeaseTerm: {
        LONG: {
          totalArea: 7509, occupiedArea: 1632, leasedArea: 1632, vacantArea: 5877,
          total: 30, occupied: 10, occupancyRate: 21.7, unitCount: 30, expiringIn30: 0,
          revenueByCurrency: [
            bucket('VND', 1_200_000_000, 200_000_000, 16.7),
            bucket('USD', 12_500, 2_500, 20),
            bucket('MMK', 5_000_000, 5_000_000, 100),
          ],
          revenueScalarCurrency: 'VND',
          monthlyRevenue: 1_200_000_000, collectedRevenue: 200_000_000, collectionRate: 16.7,
        },
        SHORT: {
          totalArea: 0, occupiedArea: 0, leasedArea: 0, vacantArea: 0,
          total: 0, occupied: 0, occupancyRate: 0, unitCount: 0, expiringIn30: 0,
          revenueCurrencyUnknown: true,
          revenueByCurrency: [],
          monthlyRevenue: 45_000_000, collectedRevenue: 45_000_000, collectionRate: 100,
        },
      },
    },
  ],
  totals: {
    totalArea: 7509, leasedArea: 1632, occupancyRate: 21.7,
    overdueCount: 0, openTickets: 3, expiringIn30: 0,
    revenueByCurrency: [
      bucket('VND', 1_200_000_000, 200_000_000, 16.7),
      bucket('USD', 12_500, 2_500, 20),
      bucket('MMK', 5_000_000, 5_000_000, 100),
    ],
    revenueScalarCurrency: 'VND',
    monthlyRevenue: 1_200_000_000, collectedRevenue: 200_000_000, collectionRate: 16.7,
    byLeaseTerm: {
      LONG: {
        totalArea: 7509, occupiedArea: 1632, leasedArea: 1632, vacantArea: 5877,
        total: 30, occupied: 10, occupancyRate: 21.7, expiringIn30: 0,
        revenueByCurrency: [
          bucket('VND', 1_200_000_000, 200_000_000, 16.7),
          bucket('USD', 12_500, 2_500, 20),
          bucket('MMK', 5_000_000, 5_000_000, 100),
        ],
        revenueScalarCurrency: 'VND',
        monthlyRevenue: 1_200_000_000, collectedRevenue: 200_000_000, collectionRate: 16.7,
      },
      SHORT: {
        totalArea: 0, occupiedArea: 0, leasedArea: 0, vacantArea: 0,
        total: 0, occupied: 0, occupancyRate: 0, expiringIn30: 0,
        revenueCurrencyUnknown: true, revenueByCurrency: [],
        monthlyRevenue: 45_000_000, collectedRevenue: 45_000_000, collectionRate: 100,
      },
    },
  },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CrossMallDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CrossMallDashboard — multi-currency presentation', () => {
  beforeEach(() => {
    getCrossMallDashboard.mockReset();
    getCrossMallDashboard.mockResolvedValue(RESPONSE);
  });

  it('renders one labelled figure per currency, not a consolidated total', async () => {
    renderPage();

    // Every currency present in the API response must be visible, each with its
    // ISO code attached to the number.
    const vnd = await screen.findAllByTestId('revenue-bucket-VND');
    expect(vnd.length).toBeGreaterThan(0);
    expect(vnd[0].textContent).toContain('VND');

    expect((await screen.findAllByTestId('revenue-bucket-USD'))[0].textContent).toContain('USD');
    expect((await screen.findAllByTestId('revenue-bucket-MMK'))[0].textContent).toContain('MMK');
  });

  it('never shows the cross-currency sum of the three buckets', async () => {
    const { container } = renderPage();
    await screen.findAllByTestId('revenue-bucket-VND');

    const naiveSum = (1_200_000_000 + 12_500 + 5_000_000).toLocaleString('vi-VN');
    expect(container.textContent).not.toContain(naiveSum);
  });

  it('drops the "Doanh thu tháng tổng" consolidated framing', async () => {
    renderPage();
    await screen.findAllByTestId('revenue-bucket-VND');

    expect(screen.queryByText(/Doanh thu tháng tổng/)).toBeNull();
    expect(screen.getByText(/Doanh thu tháng theo đơn vị tiền tệ/)).toBeInTheDocument();
  });

  it('discloses that no FX conversion is applied when more than one currency is present', async () => {
    renderPage();
    await screen.findAllByTestId('revenue-bucket-VND');

    expect(screen.getAllByText(/Không quy đổi tỷ giá/).length).toBeGreaterThan(0);
  });

  // RPT-CUR-006 deferred: SlotBooking has no currency. The screen must say so
  // rather than implying VND.
  it('labels SHORT-term revenue as currency-unknown instead of VND', async () => {
    renderPage();
    await screen.findAllByTestId('revenue-bucket-VND');

    fireEvent.click(screen.getByText('Cho thuê ngắn hạn'));

    const unknown = await screen.findAllByTestId('revenue-currency-unknown');
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown[0].textContent).toContain('Chưa xác định đơn vị tiền tệ');
    expect(unknown[0].textContent).not.toContain('VND');
    expect(unknown[0].textContent).not.toContain('₫');
  });

  // REGRESSION PROOF (T10, frontend half): if the API loses its currency
  // dimension — i.e. someone restores the VND-only scalar contract — the screen
  // must NOT fall back to rendering the scalar as if it were a total.
  it('does not present a bare scalar when the API returns no currency dimension', async () => {
    getCrossMallDashboard.mockResolvedValue({
      malls: [
        {
          ...RESPONSE.malls[0],
          revenueByCurrency: undefined,
          byLeaseTerm: {
            ...RESPONSE.malls[0].byLeaseTerm,
            LONG: { ...RESPONSE.malls[0].byLeaseTerm.LONG, revenueByCurrency: undefined },
          },
        },
      ],
      totals: {
        ...RESPONSE.totals,
        revenueByCurrency: undefined,
        byLeaseTerm: {
          ...RESPONSE.totals.byLeaseTerm,
          LONG: { ...RESPONSE.totals.byLeaseTerm.LONG, revenueByCurrency: undefined },
        },
      },
    });

    const { container } = renderPage();
    await screen.findAllByTestId('revenue-by-currency-empty');

    // The old scalar must not be rendered as a confident figure.
    expect(container.textContent).not.toContain((1_200_000_000).toLocaleString('vi-VN'));
    expect(screen.getAllByText(/Không có doanh thu trong kỳ/).length).toBeGreaterThan(0);
  });
});
