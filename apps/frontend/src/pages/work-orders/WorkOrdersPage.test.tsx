import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersApi, workOrdersApi } from '@/api';
import WorkOrdersPage from './WorkOrdersPage';

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
    render(<QueryClientProvider client={client}><WorkOrdersPage /></QueryClientProvider>);

    expect(await screen.findByText('Vận hành')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Tất cả bộ phận xử lý'), { target: { value: 'Kỹ thuật' } });

    await waitFor(() => expect(workOrdersApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ department: 'Kỹ thuật' })));
  });

  it('uploads all selected request images immediately after creating a work order', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><WorkOrdersPage /></QueryClientProvider>);

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
