import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ServiceContractsPage from './ServiceContractsPage';
import { serviceContractsApi } from '@/api';

const mallContext = vi.hoisted(() => ({ selectedMallId: null as string | null }));

vi.mock('@/api', () => ({
  serviceContractsApi: {
    list: vi.fn(),
    detail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    upload: vi.fn(),
    alerts: vi.fn(),
    renew: vi.fn(),
    createPayment: vi.fn(),
    recurringPayments: vi.fn(),
    transferToBilling: vi.fn(),
    updatePayment: vi.fn(),
    createChecklist: vi.fn(),
    updateChecklist: vi.fn(),
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
  },
}));

vi.mock('@/store/mall.store', () => ({
  useMallStore: () => ({ selectedMallId: mallContext.selectedMallId }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasRole: () => true }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ServiceContractsPage all-mall view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mallContext.selectedMallId = null;
    vi.mocked(serviceContractsApi.list).mockResolvedValue({
      data: [{
        id: 'contract-1',
        contractNumber: 'HD-ALL-001',
        title: 'Hợp đồng tổng hợp',
        counterpartyName: 'Đối tác',
        type: 'SERVICE',
        status: 'ACTIVE',
        totalValue: 1000000,
        currency: 'VND',
        _count: { documents: 0 },
      }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    } as never);
    vi.mocked(serviceContractsApi.alerts).mockResolvedValue({
      expiring: 1,
      receivableDue: 2,
      payableDue: 3,
      overdue: 4,
    } as never);
    vi.mocked(serviceContractsApi.detail).mockResolvedValue({
      id: 'contract-created',
      contractNumber: 'PL-2026-001',
      title: 'Hợp đồng bảo trì',
      counterpartyName: 'Đối tác',
      type: 'MAINTENANCE',
      serviceCategory: 'MAINTENANCE',
      valueBasis: 'ANNUAL',
      paymentDirection: 'PAYABLE',
      status: 'DRAFT',
      totalValue: 120000000,
      currency: 'VND',
      documents: [], events: [], payments: [], checklist: [], milestones: [],
    } as never);
  });

  it('loads contracts and alerts without a mallId while keeping creation mall-specific', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ServiceContractsPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('HD-ALL-001')).toBeInTheDocument();
    expect(screen.getByText(/Đang xem tổng hợp hợp đồng của tất cả Mall/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'create' })).toBeDisabled();

    await waitFor(() => {
      expect(serviceContractsApi.list).toHaveBeenCalledWith(expect.objectContaining({ mallId: undefined }));
      expect(serviceContractsApi.alerts).toHaveBeenCalledWith(30, undefined);
    });
  });

  it('captures the legal number, standardized classification, value basis and original document during creation', async () => {
    const user = userEvent.setup();
    mallContext.selectedMallId = 'mall-1';
    vi.mocked(serviceContractsApi.create).mockResolvedValue({
      id: 'contract-created',
      contractNumber: 'PL-2026-001',
      status: 'DRAFT',
    } as never);
    vi.mocked(serviceContractsApi.upload).mockResolvedValue({ id: 'document-1' } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><ServiceContractsPage /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'create' }));
    fireEvent.change(screen.getByLabelText('Số hợp đồng pháp lý *'), { target: { value: 'PL-2026-001' } });
    fireEvent.change(screen.getByLabelText('Tên hợp đồng *'), { target: { value: 'Hợp đồng bảo trì' } });
    fireEvent.change(screen.getByLabelText('Tên đối tác *'), { target: { value: 'Đối tác' } });
    fireEvent.change(screen.getByLabelText('Nhóm sản phẩm/dịch vụ *'), { target: { value: 'MAINTENANCE' } });
    await user.type(screen.getByLabelText('Giá trị hợp đồng *'), '120000000');
    fireEvent.change(screen.getByLabelText('Cơ sở giá trị *'), { target: { value: 'ANNUAL' } });
    const original = new File(['contract'], 'hop-dong-goc.pdf', { type: 'application/pdf' });
    const originalInput = screen.getByLabelText(/Hợp đồng bản gốc/) as HTMLInputElement;
    await user.upload(originalInput, original);
    expect(originalInput.files?.[0]).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hợp đồng' }));

    await waitFor(() => expect(serviceContractsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      contractNumber: 'PL-2026-001',
      serviceCategory: 'MAINTENANCE',
      valueBasis: 'ANNUAL',
      totalValue: 120000000,
      mallId: 'mall-1',
    })));
    await waitFor(() => expect(serviceContractsApi.upload).toHaveBeenCalledWith('contract-created', original, 'CONTRACT'));
  });
});
