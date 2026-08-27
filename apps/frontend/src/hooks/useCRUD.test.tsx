import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { useCRUD } from './useCRUD';

const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const makeWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useCRUD', () => {
  beforeEach(() => mockToast.mockClear());

  it('fetches data via queryFn', async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: '1', name: 'Item' }]);
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([{ id: '1', name: 'Item' }]);
  });

  it('create.mutateAsync calls createFn and shows success toast', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const createFn = vi.fn().mockResolvedValue({ id: '2' });
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, createFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.create.mutateAsync({ name: 'New' } as unknown));
    expect(createFn).toHaveBeenCalledWith({ name: 'New' });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Mục đã được tạo' });
  });

  it('update.mutateAsync calls updateFn and shows success toast', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const updateFn = vi.fn().mockResolvedValue({});
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, updateFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () =>
      result.current.update.mutateAsync({ id: '1', data: { name: 'Updated' } as unknown })
    );
    expect(updateFn).toHaveBeenCalledWith({ id: '1', data: { name: 'Updated' } });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Mục đã được cập nhật' });
  });

  it('remove.mutateAsync calls deleteFn and shows success toast', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, deleteFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.remove.mutateAsync('1'));
    expect(deleteFn).toHaveBeenCalledWith('1');
    expect(mockToast).toHaveBeenCalledWith({ title: 'Mục đã được xóa' });
  });

  it('shows destructive toast on createFn error', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const createFn = vi.fn().mockRejectedValue({
      response: { data: { message: 'Tên bị trùng' } },
    });
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, createFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      try { await result.current.create.mutateAsync({} as unknown); } catch { /* expected */ }
    });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Tên bị trùng', variant: 'destructive' });
  });

  it('falls back to generic error message when response has no message', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const createFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, createFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      try { await result.current.create.mutateAsync({} as unknown); } catch { /* expected */ }
    });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Đã xảy ra lỗi', variant: 'destructive' });
  });

  it('does not fire toast when createFn is absent and create is called', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    // No createFn provided
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.create.mutateAsync({} as unknown));
    expect(mockToast).not.toHaveBeenCalled();
  });
});
