import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MallSelector } from './MallSelector';
import { spacesApi } from '@/api';
import { authApi } from '@/api/auth';

const mallState = vi.hoisted(() => ({
  selectedMallId: 'revoked-mall' as string | null,
  selectedMallName: 'Mall đã thu hồi quyền',
  setSelectedMall: vi.fn(),
  openMallContextModal: vi.fn(),
}));

vi.mock('@/api', () => ({
  spacesApi: { listMalls: vi.fn() },
}));

vi.mock('@/api/auth', () => ({
  authApi: { setActiveMall: vi.fn() },
}));

vi.mock('@/store/mall.store', () => ({
  useMallStore: () => mallState,
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: () => ({ user: { id: 'user-1', role: 'OPERATION' } }),
}));

describe('MallSelector permission scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mallState.selectedMallId = 'revoked-mall';
    mallState.selectedMallName = 'Mall đã thu hồi quyền';
    vi.mocked(authApi.setActiveMall).mockResolvedValue({ activeMallId: 'mall-1' } as never);
  });

  it('replaces a stale unauthorized selection with the first accessible Mall', async () => {
    vi.mocked(spacesApi.listMalls).mockResolvedValue([
      { id: 'mall-1', name: 'Mall được phân quyền' },
    ] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MallSelector />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Mall được phân quyền')).toBeInTheDocument();
    expect(screen.queryByText('Mall đã thu hồi quyền')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(authApi.setActiveMall).toHaveBeenCalledWith('mall-1');
      expect(mallState.setSelectedMall).toHaveBeenCalledWith('mall-1', 'Mall được phân quyền');
    });
  });

  it('shows a clear message when the user has no Mall permission', async () => {
    vi.mocked(spacesApi.listMalls).mockResolvedValue([] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MallSelector />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Chưa được cấp Mall')).toBeInTheDocument();
    await waitFor(() => expect(mallState.setSelectedMall).toHaveBeenCalledWith(null));
  });
});
