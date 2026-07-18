import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemTab } from './SystemTab';
import { healthApi } from '@/api/health';

vi.mock('@/api/health', () => ({
  healthApi: { get: vi.fn() },
}));

function renderSystemTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(<QueryClientProvider client={client}><SystemTab /></QueryClientProvider>);
}

describe('SystemTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows verified component health without exposing secret inputs', async () => {
    vi.mocked(healthApi.get).mockResolvedValue({
      status: 'ok',
      timestamp: '2026-07-18T08:00:00.000Z',
      service: 'THISO Leasing Platform API',
      components: { database: 'up', redis: 'up', ai: 'disabled', email: 'configured', sap: 'disabled' },
    });
    renderSystemTab();

    expect(await screen.findByText('THISO Leasing Platform API')).toBeInTheDocument();
    expect(screen.getByText('Cơ sở dữ liệu')).toBeInTheDocument();
    expect(screen.getAllByText('Đang hoạt động')).toHaveLength(2);
    expect(screen.queryByText('ANTHROPIC_API_KEY')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('sk-ant-api03-...')).not.toBeInTheDocument();
  });

  it('does not claim services are online when health request fails', async () => {
    vi.mocked(healthApi.get).mockRejectedValue(new Error('offline'));
    renderSystemTab();

    expect(await screen.findByText('Không thể kiểm tra trạng thái hệ thống')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText('Đang hoạt động')).not.toBeInTheDocument();
  });
});
