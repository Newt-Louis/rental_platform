import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi, workOrdersApi } from '@/api';
import i18n from '@/lib/i18n';
import WorkOrdersPage from './WorkOrdersPage';

void i18n.changeLanguage('vi');

// Renders the current URL's querystring into the DOM so tests can assert on it directly —
// MemoryRouter keeps its own in-memory history and never touches window.location.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="url-probe">{location.pathname}{location.search}</div>;
}

function BackButtonProbe() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>go-back-probe</button>;
}

vi.mock('@/api', () => ({
  usersApi: { listUsers: vi.fn() },
  workOrdersApi: {
    list: vi.fn(), summary: vi.fn(), detail: vi.fn(), create: vi.fn(), update: vi.fn(),
    status: vi.fn(), review: vi.fn(), addChecklist: vi.fn(), toggleChecklist: vi.fn(),
    uploadEvidence: vi.fn(), addComment: vi.fn(), exportCsv: vi.fn(), templates: vi.fn(),
    createTemplate: vi.fn(), updateTemplate: vi.fn(), toggleTemplate: vi.fn(), runTemplate: vi.fn(),
  },
}));

vi.mock('@/store/mall.store', () => ({
  useMallStore: (selector: (state: {
    selectedMallId: string;
    selectedMallName: string;
    openMallContextModal: () => void;
  }) => unknown) => selector({
    selectedMallId: 'mall-1',
    selectedMallName: 'Thiso Mall Sala',
    openMallContextModal: vi.fn(),
  }),
}));

describe('WorkOrdersPage departments and images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.listUsers).mockResolvedValue({ data: [
      { id: 'user-2', fullName: 'Trần Kỹ Thuật', role: 'OPERATION', department: 'Kỹ thuật' },
    ] } as never);
    vi.mocked(workOrdersApi.list).mockResolvedValue({
      data: [{
        id: 'wo-1', workOrderNumber: 'WO-001', title: 'Sửa đèn', category: 'TECHNICAL',
        assignedDepartment: 'Kỹ thuật', priority: 'HIGH', status: 'NEW', requester: {
          id: 'user-1', fullName: 'Nguyễn Vận Hành', department: 'Vận hành',
        }, _count: { checklist: 0, evidence: 0 },
      }], total: 1, totalPages: 1,
    } as never);
    vi.mocked(workOrdersApi.summary).mockResolvedValue({ total: 1, byStatus: {}, pendingReview: 0, overdue: 0 } as never);
    vi.mocked(workOrdersApi.create).mockResolvedValue({ id: 'wo-created', title: 'Kiểm tra máy lạnh' } as never);
    vi.mocked(workOrdersApi.uploadEvidence).mockResolvedValue({ id: 'evidence-1' } as never);
    vi.mocked(workOrdersApi.detail).mockResolvedValue({
      id: 'wo-created', workOrderNumber: 'WO-002', title: 'Kiểm tra máy lạnh', category: 'TECHNICAL',
      status: 'NEW', requester: { fullName: 'Nguyễn Vận Hành', department: 'Vận hành' },
      assignedDepartment: 'Kỹ thuật', evidence: [], checklist: [], comments: [], events: [],
    } as never);
  });

  it('shows the requester department and sends the processing department filter', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><WorkOrdersPage /></QueryClientProvider></MemoryRouter>);

    expect(await screen.findByText('Vận hành')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Tất cả bộ phận xử lý'), { target: { value: 'Kỹ thuật' } });

    await waitFor(() => expect(workOrdersApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ department: 'Kỹ thuật' })));
  });

  it('uploads all selected request images immediately after creating a work order', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><WorkOrdersPage /></QueryClientProvider></MemoryRouter>);

    await screen.findByText('WO-001');
    await user.click(screen.getByRole('button', { name: 'Tạo công việc' }));
    expect(screen.getByText('Thiso Mall Sala')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tiêu đề'), 'Kiểm tra máy lạnh');
    fireEvent.change(screen.getByLabelText('Bộ phận xử lý'), { target: { value: 'Kỹ thuật' } });
    const first = new File(['one'], 'hinh-1.jpg', { type: 'image/jpeg' });
    const second = new File(['two'], 'hinh-2.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Hình ảnh yêu cầu'), [first, second]);
    await user.click(screen.getByRole('button', { name: 'Lưu và giao việc' }));

    await waitFor(() => expect(workOrdersApi.create).toHaveBeenCalledWith(expect.objectContaining({
      mallId: 'mall-1', title: 'Kiểm tra máy lạnh', assignedDepartment: 'Kỹ thuật',
    })));
    await waitFor(() => expect(workOrdersApi.uploadEvidence).toHaveBeenCalledTimes(2));
    expect(workOrdersApi.uploadEvidence).toHaveBeenNthCalledWith(1, 'wo-created', first, 'BEFORE');
    expect(workOrdersApi.uploadEvidence).toHaveBeenNthCalledWith(2, 'wo-created', second, 'BEFORE');
  });
});

// Notification Deep-Link Completeness Wave: the selected work order now lives in the URL
// (?id=...), not local state, so a notification's /work-orders?id=<id> link opens the exact
// record. Regression-critical: a "reset selection on mall change" effect used to also fire on
// the very first mount, silently wiping out a ?id= that arrived from a notification link.
describe('WorkOrdersPage — URL-driven work order selection', () => {
  const renderAt = (path: string) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={client}>
          <LocationProbe />
          <Routes>
            <Route path="/work-orders" element={<WorkOrdersPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.listUsers).mockResolvedValue({ data: [] } as never);
    vi.mocked(workOrdersApi.list).mockResolvedValue({ data: [], total: 0, totalPages: 1 } as never);
    vi.mocked(workOrdersApi.summary).mockResolvedValue({ total: 0, byStatus: {}, pendingReview: 0, overdue: 0 } as never);
  });

  it('opens the exact work order when the URL already carries ?id= on first load (fresh session / direct link / refresh)', async () => {
    vi.mocked(workOrdersApi.detail).mockResolvedValue({
      id: 'wo-9', workOrderNumber: 'WO-009', title: 'Sửa thang máy', category: 'TECHNICAL',
      status: 'NEW', requester: { fullName: 'Ai đó', department: 'Vận hành' },
      assignedDepartment: 'Kỹ thuật', evidence: [], checklist: [], comments: [], events: [],
    } as never);

    renderAt('/work-orders?id=wo-9');

    expect(await screen.findByText('Sửa thang máy')).toBeInTheDocument();
    expect(workOrdersApi.detail).toHaveBeenCalledWith('wo-9');
  });

  it('fails gracefully for a nonexistent work order id instead of breaking the page', async () => {
    vi.mocked(workOrdersApi.detail).mockRejectedValue(new Error('Not Found'));

    renderAt('/work-orders?id=does-not-exist');

    expect(await screen.findByText('Không tìm thấy công việc')).toBeInTheDocument();
    expect(screen.getByText('Công việc này không tồn tại hoặc đã bị xóa.')).toBeInTheDocument();
  });

  it('closing the detail removes only ?id, preserving every other query param', async () => {
    vi.mocked(workOrdersApi.detail).mockResolvedValue({
      id: 'wo-9', workOrderNumber: 'WO-009', title: 'Sửa thang máy', category: 'TECHNICAL',
      status: 'NEW', requester: { fullName: 'Ai đó', department: 'Vận hành' },
      assignedDepartment: 'Kỹ thuật', evidence: [], checklist: [], comments: [], events: [],
    } as never);

    renderAt('/work-orders?id=wo-9&priority=HIGH&alert=overdue');
    await screen.findByText('Sửa thang máy');
    expect(screen.getByTestId('url-probe')).toHaveTextContent('id=wo-9');
    expect(screen.getByTestId('url-probe')).toHaveTextContent('priority=HIGH');

    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons.find((b) => b.querySelector('svg.lucide-x'));
    await userEvent.setup().click(closeButton!);

    await screen.findByText((_, node) => {
      const text = node?.textContent ?? '';
      return text.includes('/work-orders?') && !text.includes('id=wo-9') && text.includes('priority=HIGH');
    }, { selector: '[data-testid="url-probe"]' });
  });

  it('does not fetch a work order at all when the URL has no ?id (no dead/erroneous request)', async () => {
    renderAt('/work-orders');
    await waitFor(() => expect(workOrdersApi.list).toHaveBeenCalled());
    expect(workOrdersApi.detail).not.toHaveBeenCalled();
  });

  it('browser Back restores the prior (closed) selection, since the URL is the single source of truth', async () => {
    vi.mocked(workOrdersApi.detail).mockResolvedValue({
      id: 'wo-9', workOrderNumber: 'WO-009', title: 'Sửa thang máy', category: 'TECHNICAL',
      status: 'NEW', requester: { fullName: 'Ai đó', department: 'Vận hành' },
      assignedDepartment: 'Kỹ thuật', evidence: [], checklist: [], comments: [], events: [],
    } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      // Two real history entries, landing on the second (detail-open) one — mirrors a user who
      // opened the list, then clicked a notification/row to open a detail.
      <MemoryRouter initialEntries={['/work-orders', '/work-orders?id=wo-9']} initialIndex={1}>
        <QueryClientProvider client={client}>
          <LocationProbe />
          <BackButtonProbe />
          <Routes>
            <Route path="/work-orders" element={<WorkOrdersPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Sửa thang máy')).toBeInTheDocument();

    // fireEvent, not userEvent: Radix's Dialog overlay sets pointer-events:none on the rest of
    // the page while open, and this probe button deliberately lives outside the dialog (it
    // stands in for the browser's own Back button, which isn't subject to in-page CSS at all).
    fireEvent.click(screen.getByText('go-back-probe'));

    await waitFor(() => expect(screen.queryByText('Sửa thang máy')).not.toBeInTheDocument());
    expect(screen.getByTestId('url-probe')).toHaveTextContent('/work-orders');
    expect(screen.getByTestId('url-probe')).not.toHaveTextContent('id=wo-9');
  });
});
