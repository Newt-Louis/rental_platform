import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { fitoutChangeOrderApi } from '@/api/fitout';
import { ChangeOrderControl } from './RiskChangeControl';

vi.mock('@/api/fitout', () => ({
  fitoutChangeOrderApi: {
    list: vi.fn(),
    create: vi.fn(),
    transition: vi.fn(),
  },
  fitoutRiskApi: {
    list: vi.fn(),
    create: vi.fn(),
    transition: vi.fn(),
  },
}));

describe('ChangeOrderControl currency presentation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(fitoutChangeOrderApi.list).mockResolvedValue([]);
    await i18n.changeLanguage('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('vi');
  });

  it('shows the authoritative Contract currency without implicit VND copy', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ChangeOrderControl projectId="fitout-1" contractCurrency="USD" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Add/i }));

    expect(await screen.findByText('Currency inherited from Contract: USD')).toBeInTheDocument();
    expect(screen.getByText('Estimated cost *')).toBeInTheDocument();
    expect(screen.queryByText(/Estimated cost \(VND\)/i)).not.toBeInTheDocument();
  });

  it('renders an unsupported persisted legacy currency without rounding or substitution', async () => {
    vi.mocked(fitoutChangeOrderApi.list).mockResolvedValue([{
      id: 'change-eur-1',
      projectId: 'fitout-1',
      title: 'Legacy EUR change',
      estimatedCost: '1.25',
      currency: 'EUR',
      status: 'SUBMITTED',
    }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <ChangeOrderControl projectId="fitout-1" contractCurrency="USD" />
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText('1.25 EUR')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1 EUR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1.25 VND/)).not.toBeInTheDocument();
  });
});
