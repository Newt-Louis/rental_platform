import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingsPage from './BookingsPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Variables with "mock" prefix are hoisted alongside vi.mock() by Vitest
const mockListBookings = vi.fn();
const mockReinstate = vi.fn();
const mockSoftDelete = vi.fn();
const mockCancelBooking = vi.fn();
const mockDeleteSlotBooking = vi.fn();
const mockToast = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@/api', () => ({
  bookingApi: {
    list: (...args: any[]) => mockListBookings(...args),
    reinstate: (...args: any[]) => mockReinstate(...args),
    softDelete: (...args: any[]) => mockSoftDelete(...args),
    cancel: (...args: any[]) => mockCancelBooking(...args),
  },
  slotsApi: {
    listAllBookings: vi.fn().mockResolvedValue([
      {
        id: 'sb1', bookingRef: 'SB-001', type: 'DAILY', status: 'PENDING',
        slot: {
          code: 'S-01', name: 'Slot A',
          unit: { code: 'A1-01', mallId: 'mall-1' },
        },
        lead: { brandName: 'Coffee Bean' },
        startDatetime: '2024-02-01T08:00:00.000Z',
        endDatetime: '2024-02-01T18:00:00.000Z',
        totalAmount: 500_000,
        createdAt: '2024-01-20T00:00:00.000Z',
        updatedAt: '2024-01-20T00:00:00.000Z',
      },
    ]),
    deleteSlotBooking: (...args: any[]) => mockDeleteSlotBooking(...args),
  },
  authApi: {
    me: vi.fn().mockResolvedValue({ id: 'u1', role: 'LEASING_EXECUTIVE', fullName: 'Test User' }),
  },
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@tanstack/react-query', async (importActual) => {
  const actual = await importActual<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

vi.mock('@/store/mall.store', () => ({
  useMallStore: () => ({ selectedMallId: 'mall-1' }),
}));

vi.mock('@/hooks/useDragSelect', () => ({
  useDragSelect: () => ({
    gridRef: { current: null },
    selectoRef: { current: null },
    selectoProps: {},
  }),
  DRAG_SELECT_CLASS: 'drag-select',
}));

vi.mock('react-selecto', () => ({ default: () => null }));

vi.mock('./BookingDetailSheet', () => ({
  BookingDetailSheet: ({ booking, onClose }: any) =>
    booking ? <div data-testid="booking-detail-sheet" onClick={onClose} /> : null,
}));

vi.mock('./SlotBookingDetailSheet', () => ({
  SlotBookingDetailSheet: () => null,
}));

vi.mock('./CreateBookingDialog', () => ({
  CreateBookingDialog: ({ open }: any) =>
    open ? <div data-testid="create-booking-dialog" /> : null,
}));

vi.mock('./CreateSlotBookingDialog', () => ({
  CreateSlotBookingDialog: ({ open }: any) =>
    open ? <div data-testid="create-slot-dialog" /> : null,
}));

vi.mock('@/components/BulkSelectionBar', () => ({
  BulkSelectionBar: ({ children, selectedCount }: any) => (
    <div data-testid="bulk-bar" data-selected={String(selectedCount)}>{children}</div>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTIVE_BOOKING = {
  id: 'b1',
  bookingNumber: 'BK-001',
  unitId: 'u1',
  status: 'ACTIVE',
  priority: 1,
  holdDays: 30,
  expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  unit: { code: 'A1-01', floor: { name: 'Tầng 1' } },
  lead: { brandName: 'Pizza Hut', contactName: 'David Lee' },
  createdAt: '2024-01-15T00:00:00.000Z',
  updatedAt: '2024-01-15T00:00:00.000Z',
  assignedTo: { fullName: 'Nguyen Sale' },
};

const CANCELLED_BOOKING = {
  id: 'b2',
  bookingNumber: 'BK-002',
  unitId: 'u2',
  status: 'CANCELLED',
  priority: 2,
  holdDays: 30,
  expiresAt: null,
  unit: { code: 'B2-05', floor: { name: 'Tầng 2' } },
  customer: { companyName: 'KFC Corp' },
  createdAt: '2024-01-16T00:00:00.000Z',
  updatedAt: '2024-01-16T00:00:00.000Z',
  assignedTo: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderPage() {
  return render(<BookingsPage />, { wrapper: Wrapper });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BookingsPage — render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBookings.mockResolvedValue({
      data: [ACTIVE_BOOKING, CANCELLED_BOOKING],
      total: 2,
      totalPages: 1,
    });
  });

  it('shows page heading', () => {
    renderPage();
    expect(screen.getByText('Quản lý Booking')).toBeInTheDocument();
  });

  it('shows sub-heading description', () => {
    renderPage();
    expect(screen.getByText(/Theo dõi đặt chỗ lô thuê/)).toBeInTheDocument();
  });

  it('shows unit booking rows after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('BK-001')).toBeInTheDocument();
      expect(screen.getByText('Pizza Hut')).toBeInTheDocument();
      expect(screen.getByText('A1-01')).toBeInTheDocument();
    });
  });

  it('shows customer name for booking with customer (not lead)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('KFC Corp')).toBeInTheDocument();
    });
  });

  it('shows "Đang giữ" badge for ACTIVE booking', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Đang giữ')).toBeInTheDocument();
    });
  });

  it('shows "Đã hủy" badge for CANCELLED booking', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Đã hủy')).toBeInTheDocument();
    });
  });

  it('shows empty state when no bookings returned', async () => {
    mockListBookings.mockResolvedValueOnce({ data: [], total: 0, totalPages: 1 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Không có booking nào')).toBeInTheDocument();
    });
  });

  it('shows assigned sale staff name', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nguyen Sale')).toBeInTheDocument();
    });
  });
});

describe('BookingsPage — cancel booking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBookings.mockResolvedValue({
      data: [ACTIVE_BOOKING, CANCELLED_BOOKING],
      total: 2,
      totalPages: 1,
    });
  });

  it('ACTIVE booking shows cancel button (Hủy booking)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());
    expect(screen.getByTitle('Hủy booking')).toBeInTheDocument();
  });

  it('clicking cancel button opens confirmation dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Hủy booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Hủy booking'));

    expect(screen.getByText('Xác nhận hủy booking')).toBeInTheDocument();
    expect(screen.getByText(/1 booking/)).toBeInTheDocument();
  });

  it('confirming cancel calls bookingApi.cancel with booking id', async () => {
    mockCancelBooking.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Hủy booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Hủy booking'));
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(mockCancelBooking).toHaveBeenCalledWith('b1');
    });
  });

  it('successful cancel shows toast', async () => {
    mockCancelBooking.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Hủy booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Hủy booking'));
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringContaining('hủy') }),
      );
    });
  });

  it('clicking "Không" in cancel dialog closes without calling API', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Hủy booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Hủy booking'));
    await user.click(screen.getByRole('button', { name: 'Không' }));

    await waitFor(() => {
      expect(screen.queryByText('Xác nhận hủy booking')).not.toBeInTheDocument();
    });
    expect(mockCancelBooking).not.toHaveBeenCalled();
  });
});

describe('BookingsPage — reinstate booking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBookings.mockResolvedValue({
      data: [ACTIVE_BOOKING, CANCELLED_BOOKING],
      total: 2,
      totalPages: 1,
    });
  });

  it('CANCELLED booking shows reinstate button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-002')).toBeInTheDocument());
    expect(screen.getByTitle('Khôi phục booking')).toBeInTheDocument();
  });

  it('clicking reinstate button opens confirm dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Khôi phục booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Khôi phục booking'));

    expect(screen.getByText('Xác nhận khôi phục booking')).toBeInTheDocument();
  });

  it('confirming reinstate calls bookingApi.reinstate with booking id', async () => {
    mockReinstate.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Khôi phục booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Khôi phục booking'));
    await user.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => {
      expect(mockReinstate).toHaveBeenCalledWith('b2');
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Đã khôi phục booking' }),
      );
    });
  });

  it('reinstate API error shows destructive toast with backend message', async () => {
    mockReinstate.mockRejectedValue({
      response: { data: { message: 'Không thể khôi phục' } },
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Khôi phục booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Khôi phục booking'));
    await user.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Không thể khôi phục',
          variant: 'destructive',
        }),
      );
    });
  });

  it('reinstate generic error shows fallback error toast', async () => {
    mockReinstate.mockRejectedValue(new Error('timeout'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Khôi phục booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Khôi phục booking'));
    await user.click(screen.getByRole('button', { name: 'Khôi phục' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });
  });
});

describe('BookingsPage — delete booking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBookings.mockResolvedValue({
      data: [ACTIVE_BOOKING, CANCELLED_BOOKING],
      total: 2,
      totalPages: 1,
    });
  });

  it('CANCELLED booking shows delete button for non-admin user', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-002')).toBeInTheDocument());
    expect(screen.getByTitle('Xóa booking')).toBeInTheDocument();
  });

  it('ACTIVE booking does NOT show delete button for non-admin', async () => {
    // Only one delete button should exist (for CANCELLED booking)
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());

    const deleteButtons = screen.queryAllByTitle('Xóa booking');
    expect(deleteButtons).toHaveLength(1); // only for b2 (CANCELLED)
  });

  it('clicking delete button opens confirm dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Xóa booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Xóa booking'));

    expect(screen.getByText('Xác nhận xóa booking')).toBeInTheDocument();
  });

  it('confirming delete calls bookingApi.softDelete and shows toast', async () => {
    mockSoftDelete.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Xóa booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Xóa booking'));
    await user.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(mockSoftDelete).toHaveBeenCalledWith('b2');
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Đã xóa booking' }),
      );
    });
  });

  it('delete error shows destructive toast', async () => {
    mockSoftDelete.mockRejectedValue({
      response: { data: { message: 'Không thể xóa' } },
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Xóa booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Xóa booking'));
    await user.click(screen.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });
  });
});

describe('BookingsPage — create booking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBookings.mockResolvedValue({ data: [], total: 0, totalPages: 1 });
  });

  it('clicking "Tạo booking lô" button opens CreateBookingDialog', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Tạo booking lô')).toBeInTheDocument());
    await user.click(screen.getByText('Tạo booking lô'));

    expect(screen.getByTestId('create-booking-dialog')).toBeInTheDocument();
  });
});

describe('BookingsPage — search filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBookings.mockResolvedValue({
      data: [ACTIVE_BOOKING],
      total: 1,
      totalPages: 1,
    });
  });

  it('clicking "Tìm kiếm" calls bookingApi.list with search term', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Tìm unit, lead, khách hàng...');
    await user.type(searchInput, 'Pizza');
    await user.click(screen.getByRole('button', { name: /Tìm kiếm/ }));

    await waitFor(() => {
      expect(mockListBookings).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Pizza' }),
      );
    });
  });

  it('pressing Enter in search input applies search', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Tìm unit, lead, khách hàng...');
    await user.type(searchInput, 'A1-01{Enter}');

    await waitFor(() => {
      expect(mockListBookings).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'A1-01' }),
      );
    });
  });

  it('shows Xóa (clear) button after filter applied', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Tìm unit, lead, khách hàng...');
    await user.type(searchInput, 'Test');
    await user.click(screen.getByRole('button', { name: /Tìm kiếm/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Xóa/ })).toBeInTheDocument();
    });
  });

  it('clicking Xóa resets search and refetches without filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Tìm unit, lead, khách hàng...');
    await user.type(searchInput, 'Test');
    await user.click(screen.getByRole('button', { name: /Tìm kiếm/ }));

    await waitFor(() => screen.getByRole('button', { name: /Xóa/ }));
    await user.click(screen.getByRole('button', { name: /Xóa/ }));

    await waitFor(() => {
      expect(mockListBookings).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined }),
      );
    });
  });
});

describe('BookingsPage — pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBookings.mockResolvedValue({
      data: [ACTIVE_BOOKING],
      total: 30,
      totalPages: 2,
    });
  });

  it('shows pagination controls when totalPages > 1', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Trang 1 \/ 2/)).toBeInTheDocument();
      expect(screen.getByText(/30 bookings/)).toBeInTheDocument();
    });
  });

  it('"Trước" button is disabled on page 1', async () => {
    renderPage();
    await waitFor(() => screen.getByText(/Trang 1 \/ 2/));
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
  });

  it('"Sau" button is enabled on page 1', async () => {
    renderPage();
    await waitFor(() => screen.getByText(/Trang 1 \/ 2/));
    expect(screen.getByRole('button', { name: 'Sau' })).not.toBeDisabled();
  });

  it('clicking "Sau" calls bookingApi.list with page=2', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: 'Sau' }));

    await user.click(screen.getByRole('button', { name: 'Sau' }));

    await waitFor(() => {
      expect(mockListBookings).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });
  });
});

describe('BookingsPage — bulk selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListBookings.mockResolvedValue({
      data: [ACTIVE_BOOKING, CANCELLED_BOOKING],
      total: 2,
      totalPages: 1,
    });
  });

  it('individual row checkbox (div[data-checkbox]) toggles selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());

    // Each booking row's checkbox is a div[data-checkbox] inside td[data-checkbox]
    const rows = screen.getAllByRole('row');
    const b1Row = rows.find((r) => r.getAttribute('data-booking-id') === 'b1');
    // querySelector returns the first match = the td; we need the inner div
    const checkboxDiv = b1Row?.querySelector('div[data-checkbox]');
    if (checkboxDiv) await user.click(checkboxDiv as Element);

    await waitFor(() => {
      expect(screen.getByTestId('bulk-bar').getAttribute('data-selected')).toBe('1');
    });
  });

  it('header checkbox selects all bookings at once', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());

    const headerCheckbox = screen
      .getAllByRole('columnheader')[0]
      .querySelector('div.cursor-pointer');
    if (headerCheckbox) await user.click(headerCheckbox as Element);

    await waitFor(() => {
      expect(screen.getByTestId('bulk-bar').getAttribute('data-selected')).toBe('2');
    });
  });
});
