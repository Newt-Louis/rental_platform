import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadEditDialog } from './BookingsPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUpdateLead = vi.fn();

vi.mock('@/api', () => ({
  crmApi:      { updateLead: (...args: any[]) => mockUpdateLead(...args) },
  bookingApi:  { get: vi.fn(), list: vi.fn(), stats: vi.fn() },
  slotsApi:    { list: vi.fn() },
  spacesApi:   { listUnits: vi.fn() },
  customersApi:{ listCustomers: vi.fn() },
}));

const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// refetchQueries được await trong onSuccess — mock để resolve ngay
vi.mock('@tanstack/react-query', async (importActual) => {
  const actual = await importActual<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      refetchQueries: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_LEAD = {
  id:          'cmqt98blj006uwkh5m8wswsmp',
  brandName:   'Pizza Hut',
  company:     'Pizza Corp',
  contactName: 'David Lee',
  phone:       '0912345678',
  email:       'david@pizza.com',
  category:    'FB',
  notes:       'Ghi chú test',
  status:      'NEW',
  priority:    'HOT',
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog(props?: Partial<{ lead: any; open: boolean; onClose: () => void }>) {
  const onClose = vi.fn();
  render(
    <LeadEditDialog
      lead={props?.lead ?? MOCK_LEAD}
      open={props?.open ?? true}
      onClose={props?.onClose ?? onClose}
      bookingId="booking-test-id"
    />,
    { wrapper: Wrapper },
  );
  return { onClose };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LeadEditDialog — form render', () => {
  it('hiển thị đúng dữ liệu lead khi mở dialog', () => {
    renderDialog();
    expect(screen.getByDisplayValue('Pizza Hut')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pizza Corp')).toBeInTheDocument();
    expect(screen.getByDisplayValue('David Lee')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0912345678')).toBeInTheDocument();
    expect(screen.getByDisplayValue('david@pizza.com')).toBeInTheDocument();
  });

  it('không render khi open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('Chỉnh sửa khách hàng')).not.toBeInTheDocument();
  });
});

describe('LeadEditDialog — validation', () => {
  it('không gọi API khi brandName bị xóa trắng', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByDisplayValue('Pizza Hut'));
    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    expect(mockUpdateLead).not.toHaveBeenCalled();
  });

  it('không gọi API khi contactName bị xóa trắng', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByDisplayValue('David Lee'));
    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    expect(mockUpdateLead).not.toHaveBeenCalled();
  });
});

describe('LeadEditDialog — gọi API và payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateLead.mockResolvedValue({ ...MOCK_LEAD });
  });

  it('gọi crmApi.updateLead với đúng lead.id và payload', async () => {
    const user = userEvent.setup();
    renderDialog();

    // Đổi brandName
    const brandInput = screen.getByDisplayValue('Pizza Hut');
    await user.clear(brandInput);
    await user.type(brandInput, 'Burger King');

    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => {
      expect(mockUpdateLead).toHaveBeenCalledWith(
        'cmqt98blj006uwkh5m8wswsmp',
        expect.objectContaining({ brandName: 'Burger King' }),
      );
    });
  });

  it('gửi company=empty string khi user xóa field (không phải undefined)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByDisplayValue('Pizza Corp'));
    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => {
      const [, payload] = mockUpdateLead.mock.calls[0];
      // company phải là '' để xóa giá trị trong DB
      expect(payload.company).toBe('');
    });
  });

  it('gửi phone=undefined khi field trống (tránh lỗi @Matches validator backend)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByDisplayValue('0912345678'));
    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => {
      const [, payload] = mockUpdateLead.mock.lastCall!;
      expect(payload.phone).toBeUndefined();
    });
  });

  it('gửi email=undefined khi field trống (tránh lỗi @IsEmail validator backend)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByDisplayValue('david@pizza.com'));
    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => {
      const [, payload] = mockUpdateLead.mock.lastCall!;
      expect(payload.email).toBeUndefined();
    });
  });
});

describe('LeadEditDialog — backend response', () => {
  beforeEach(() => vi.clearAllMocks());

  it('onSuccess: đóng dialog và hiển thị toast thành công', async () => {
    const user = userEvent.setup();
    const BACKEND_RESPONSE = {
      ...MOCK_LEAD,
      brandName: 'Burger King',
      company:   '',           // company đã được xóa
    };
    mockUpdateLead.mockResolvedValue(BACKEND_RESPONSE);

    const { onClose } = renderDialog();
    const brandInput = screen.getByDisplayValue('Pizza Hut');
    await user.clear(brandInput);
    await user.type(brandInput, 'Burger King');
    await user.clear(screen.getByDisplayValue('Pizza Corp'));

    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => {
      // Dialog phải đóng
      expect(onClose).toHaveBeenCalled();
      // Toast thành công phải hiện
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Đã cập nhật thông tin khách hàng' }),
      );
    });
  });

  it('onError: hiển thị toast lỗi khi backend trả về lỗi', async () => {
    const user = userEvent.setup();
    mockUpdateLead.mockRejectedValue({
      response: { data: { message: 'Lead không tồn tại' } },
    });

    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Lead không tồn tại', variant: 'destructive' }),
      );
    });
  });

  it('log payload và response thực tế để debug', async () => {
    const user = userEvent.setup();
    let capturedPayload: any;
    let capturedResponse: any;

    mockUpdateLead.mockImplementation(async (_id: string, data: any) => {
      capturedPayload = data;
      // Simulate backend: chỉ update field được gửi, giữ nguyên field undefined
      capturedResponse = {
        ...MOCK_LEAD,
        ...(data.brandName   !== undefined ? { brandName:   data.brandName }   : {}),
        ...(data.company     !== undefined ? { company:     data.company }     : {}),
        ...(data.contactName !== undefined ? { contactName: data.contactName } : {}),
        ...(data.phone       !== undefined ? { phone:       data.phone }       : {}),
        ...(data.email       !== undefined ? { email:       data.email }       : {}),
        ...(data.category    !== undefined ? { category:    data.category }    : {}),
        ...(data.notes       !== undefined ? { notes:       data.notes }       : {}),
      };
      return capturedResponse;
    });

    renderDialog();

    const brandInput = screen.getByDisplayValue('Pizza Hut');
    await user.clear(brandInput);
    await user.type(brandInput, 'Burger King');
    await user.clear(screen.getByDisplayValue('Pizza Corp')); // xóa company

    await user.click(screen.getByRole('button', { name: 'Cập nhật' }));

    await waitFor(() => expect(mockUpdateLead).toHaveBeenCalled());

    console.table({
      'brandName gửi đi':     capturedPayload.brandName,
      'company gửi đi':       capturedPayload.company,
      'phone gửi đi':         capturedPayload.phone,
      'brandName từ backend': capturedResponse.brandName,
      'company từ backend':   capturedResponse.company,
      'phone từ backend':     capturedResponse.phone,
    });

    expect(capturedPayload.brandName).toBe('Burger King');
    expect(capturedPayload.company).toBe('');        // gửi '' để xóa
    expect(capturedPayload.phone).toBe('0912345678'); // phone không đổi → vẫn gửi giá trị
    expect(capturedResponse.company).toBe('');        // backend lưu ''
  });
});
