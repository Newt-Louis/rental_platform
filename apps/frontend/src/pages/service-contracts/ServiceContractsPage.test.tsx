import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ServiceContractsPage from './ServiceContractsPage';
import { serviceContractsApi } from '@/api';

// Renders the current URL's querystring into the DOM so tests can assert on it directly —
// MemoryRouter keeps its own in-memory history and never touches window.location.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="url-probe">{location.pathname}{location.search}</div>;
}

const mallContext = vi.hoisted(() => ({ selectedMallId: null as string | null }));

vi.mock('@/api', () => ({
  serviceContractsApi: {
    list: vi.fn(),
    exportExcel: vi.fn(),
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
    vi.mocked(serviceContractsApi.updateStatus).mockResolvedValue({ id: 'contract-created', status: 'PROPOSAL' } as never);
  });

  it('loads contracts and alerts without a mallId while keeping creation mall-specific', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ServiceContractsPage />
        </QueryClientProvider>
      </MemoryRouter>,
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

    render(<MemoryRouter><QueryClientProvider client={queryClient}><ServiceContractsPage /></QueryClientProvider></MemoryRouter>);
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
    await waitFor(() => expect(serviceContractsApi.alerts).toHaveBeenCalledTimes(2));
  });

  it('explains lifecycle choices and requires confirmation before changing status', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={queryClient}><ServiceContractsPage /></QueryClientProvider></MemoryRouter>);

    fireEvent.click(await screen.findByText('HD-ALL-001'));
    expect(await screen.findByText('Trạng thái hiện tại')).toBeInTheDocument();
    expect(screen.getByText(/Hồ sơ đang được soạn thảo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Chuyển sang “Đề xuất”/ }));
    expect(serviceContractsApi.updateStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận chuyển trạng thái' }));

    await waitFor(() => expect(serviceContractsApi.updateStatus).toHaveBeenCalledWith('contract-1', 'PROPOSAL'));
  });
});

// Notification Deep-Link Completeness Wave: the selected contract now lives in the URL
// (?id=...), not local state, so a notification's /service-contracts?id=<id> link opens the
// exact record. Regression-critical: a "reset selection on mall change" effect used to also
// fire on the very first mount, silently wiping out a ?id= that arrived from a notification link.
describe('ServiceContractsPage — URL-driven contract selection', () => {
  const renderAt = (path: string) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={queryClient}>
          <LocationProbe />
          <Routes>
            <Route path="/service-contracts" element={<ServiceContractsPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mallContext.selectedMallId = null;
    vi.mocked(serviceContractsApi.list).mockResolvedValue({ data: [], total: 0, page: 1, limit: 25, totalPages: 1 } as never);
    vi.mocked(serviceContractsApi.alerts).mockResolvedValue({ expiring: 0, receivableDue: 0, payableDue: 0, overdue: 0 } as never);
  });

  it('opens the exact contract when the URL already carries ?id= on first load (fresh session / direct link / refresh)', async () => {
    vi.mocked(serviceContractsApi.detail).mockResolvedValue({
      id: 'svc-9', contractNumber: 'PL-2026-009', title: 'Hợp đồng vệ sinh', counterpartyName: 'Đối tác',
      type: 'CLEANING', status: 'ACTIVE', totalValue: 5000000, currency: 'VND',
      documents: [], events: [], payments: [], checklist: [], milestones: [],
    } as never);

    renderAt('/service-contracts?id=svc-9');

    expect(await screen.findByText('Hợp đồng vệ sinh')).toBeInTheDocument();
    expect(serviceContractsApi.detail).toHaveBeenCalledWith('svc-9');
  });

  it('fails gracefully for a nonexistent contract id instead of breaking the page', async () => {
    vi.mocked(serviceContractsApi.detail).mockRejectedValue(new Error('Not Found'));

    renderAt('/service-contracts?id=does-not-exist');

    expect(await screen.findByText('Không tìm thấy hợp đồng')).toBeInTheDocument();
    expect(screen.getByText('Hợp đồng dịch vụ này không tồn tại hoặc đã bị xóa.')).toBeInTheDocument();
  });

  it('closing the detail removes only ?id, preserving every other query param', async () => {
    vi.mocked(serviceContractsApi.detail).mockResolvedValue({
      id: 'svc-9', contractNumber: 'PL-2026-009', title: 'Hợp đồng vệ sinh', counterpartyName: 'Đối tác',
      type: 'CLEANING', status: 'ACTIVE', totalValue: 5000000, currency: 'VND',
      documents: [], events: [], payments: [], checklist: [], milestones: [],
    } as never);

    renderAt('/service-contracts?id=svc-9&status=ACTIVE&alert=PAYMENT_DUE');
    await screen.findByText('Hợp đồng vệ sinh');
    expect(screen.getByTestId('url-probe')).toHaveTextContent('id=svc-9');
    expect(screen.getByTestId('url-probe')).toHaveTextContent('status=ACTIVE');

    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons.find((b) => b.querySelector('svg.lucide-x'));
    await userEvent.setup().click(closeButton!);

    await screen.findByText((_, node) => {
      const text = node?.textContent ?? '';
      return text.includes('/service-contracts?') && !text.includes('id=svc-9') && text.includes('status=ACTIVE');
    }, { selector: '[data-testid="url-probe"]' });
  });

  it('does not fetch a contract at all when the URL has no ?id (no dead/erroneous request)', async () => {
    renderAt('/service-contracts');
    await waitFor(() => expect(serviceContractsApi.list).toHaveBeenCalled());
    expect(serviceContractsApi.detail).not.toHaveBeenCalled();
  });
});
