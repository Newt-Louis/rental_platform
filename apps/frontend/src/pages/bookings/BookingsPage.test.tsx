import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/lib/i18n';
import BookingsPage, {
  countSlotBookingStatuses,
  countUnitBookingStatuses,
  filterSlotBookings,
  groupSlotBookings,
  groupUnitBookings,
} from './BookingsPage';

// This file's rendering assertions expect real Vietnamese UI text (e.g. 'Quản
// lý Booking'), not raw i18n keys — react-i18next isn't initialized by the
// shared test setup (apps/frontend/src/test/setup.ts) at all, and even when
// initialized, jsdom's LanguageDetector resolves to English by default, not
// the app's Vietnamese fallback. Scoped to this file only (not the shared
// setup) — see docs/reliability/TEST_BASELINE_REMEDIATION.md for why a
// global fix was tried and reverted (it broke other tests that correctly
// assert against un-resolved i18n keys).
beforeAll(() => i18n.changeLanguage('vi'));

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
    // Test defect fix (docs/reliability/TEST_BASELINE_REMEDIATION.md):
    // BookingsPage queries bookingApi.stats() for the header stat tiles —
    // this mock never included it, so every render hit a real TypeError
    // ("bookingApi.stats is not a function"), which React Query surfaced as
    // a query error ("Không thể tải thống kê booking"). That error banner,
    // not any of the actual assertions below, was masking/breaking several
    // of this file's tests.
    stats: vi.fn().mockResolvedValue({ total: 0, active: 0, pending: 0, expiringSoon: 0 }),
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
  spacesApi: {
    listFloors: vi.fn().mockResolvedValue([]),
    listUnits: vi.fn().mockResolvedValue({ data: [] }),
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

describe('groupUnitBookings', () => {
  it('sorts unit codes naturally and keeps each queue in priority order', () => {
    const groups = groupUnitBookings([
      { ...ACTIVE_BOOKING, id: 'b10', unitId: 'u10', unit: { code: 'A-10' }, priority: 1 },
      { ...ACTIVE_BOOKING, id: 'b2-p2', unitId: 'u2', unit: { code: 'A-2' }, priority: 2 },
      { ...ACTIVE_BOOKING, id: 'b2-p1', unitId: 'u2', unit: { code: 'A-2' }, priority: 1 },
    ] as any);

    expect(groups.map((group) => group.bookings[0].unit?.code)).toEqual(['A-2', 'A-10']);
    expect(groups[0].bookings.map((booking) => booking.priority)).toEqual([1, 2]);
  });

  it('counts held and waiting bookings separately for a unit', () => {
    const counts = countUnitBookingStatuses([
      ACTIVE_BOOKING,
      { ...ACTIVE_BOOKING, id: 'b-pending-1', status: 'PENDING' },
      { ...ACTIVE_BOOKING, id: 'b-pending-2', status: 'PENDING' },
    ] as any);

    expect(counts).toEqual({ total: 3, active: 1, pending: 2 });
  });
});

describe('groupSlotBookings', () => {
  it('sorts naturally by unit, then slot and booking time', () => {
    const groups = groupSlotBookings([
      { id: '3', startDatetime: '2026-08-03', slot: { code: 'S-1', unit: { id: 'u10', code: 'A-10' } } },
      { id: '2', startDatetime: '2026-08-02', slot: { code: 'S-10', unit: { id: 'u2', code: 'A-2' } } },
      { id: '1', startDatetime: '2026-08-01', slot: { code: 'S-2', unit: { id: 'u2', code: 'A-2' } } },
    ]);

    expect(groups.map((group) => group.bookings[0].slot.unit.code)).toEqual(['A-2', 'A-10']);
    expect(groups[0].bookings.map((booking) => booking.slot.code)).toEqual(['S-2', 'S-10']);
  });

  it('counts pending and confirmed short-term bookings separately', () => {
    expect(countSlotBookingStatuses([
      { status: 'PENDING' },
      { status: 'PENDING' },
      { status: 'CONFIRMED' },
      { status: 'CANCELLED' },
    ])).toEqual({ total: 4, pending: 2, confirmed: 1 });
  });

  it('filters short-term bookings by floor, slot and floor-name search', () => {
    const bookings = [
      {
        id: 'booking-1', bookingRef: 'SB-001',
        slot: { id: 'slot-1', code: 'S-01', unit: { code: 'A-01', floor: { id: 'floor-1', name: 'Tầng 1' } } },
      },
      {
        id: 'booking-2', bookingRef: 'SB-002',
        slot: { id: 'slot-2', code: 'S-02', unit: { code: 'A-02', floor: { id: 'floor-2', name: 'Tầng 2' } } },
      },
    ];

    expect(filterSlotBookings(bookings, { floorId: 'floor-2' }).map((booking) => booking.id)).toEqual(['booking-2']);
    expect(filterSlotBookings(bookings, { slotId: 'slot-1' }).map((booking) => booking.id)).toEqual(['booking-1']);
    expect(filterSlotBookings(bookings, { search: 'tầng 2' }).map((booking) => booking.id)).toEqual(['booking-2']);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function TestProviders({ children, initialEntry = '/bookings' }: { children: React.ReactNode; initialEntry?: string }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

function renderPage(initialEntry = '/bookings') {
  return render(
    <TestProviders initialEntry={initialEntry}>
      <BookingsPage />
    </TestProviders>,
  );
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
    // Test defect fix (docs/reliability/TEST_BASELINE_REMEDIATION.md): page
    // copy was reworded ("Quản lý Booking" → "Quản lý đặt chỗ",
    // locales/vi/bookings.json `page.title`) without this assertion being
    // updated.
    expect(screen.getByText('Quản lý đặt chỗ')).toBeInTheDocument();
  });

  it('shows sub-heading description', () => {
    renderPage();
    expect(screen.getByText(/Theo dõi giữ chỗ mặt bằng dài hạn/)).toBeInTheDocument();
  });

  it('shows unit booking rows after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('BK-001')).toBeInTheDocument();
      expect(screen.getByText('Pizza Hut')).toBeInTheDocument();
      expect(screen.getByText('A1-01')).toBeInTheDocument();
    });
  });

  it('applies expiringSoon filter from the URL', async () => {
    renderPage('/bookings?expiringSoon=true');

    await waitFor(() => {
      expect(mockListBookings).toHaveBeenCalledWith(expect.objectContaining({
        expiringSoon: true,
        page: 1,
      }));
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
      const row = screen.getByText('BK-001').closest('tr');
      expect(row).not.toBeNull();
      expect(within(row!).getByText('Đang giữ')).toBeInTheDocument();
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
    expect(within(screen.getByRole('dialog')).getByText(/1 booking/)).toBeInTheDocument();
  });

  it('confirming cancel calls bookingApi.cancel with booking id', async () => {
    mockCancelBooking.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Hủy booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Hủy booking'));
    await user.type(screen.getByPlaceholderText('Nhập lý do để lưu vào lịch sử booking...'), 'Khách đổi kế hoạch');
    await user.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() => {
      expect(mockCancelBooking).toHaveBeenCalledWith('b1', 'Khách đổi kế hoạch');
    });
  });

  it('successful cancel shows toast', async () => {
    mockCancelBooking.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Hủy booking')).toBeInTheDocument());

    await user.click(screen.getByTitle('Hủy booking'));
    await user.type(screen.getByPlaceholderText('Nhập lý do để lưu vào lịch sử booking...'), 'Khách đổi kế hoạch');
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
    expect(screen.getByTitle('Xóa')).toBeInTheDocument();
  });

  it('ACTIVE booking does NOT show delete button for non-admin', async () => {
    // Only one delete button should exist (for CANCELLED booking)
    renderPage();
    await waitFor(() => expect(screen.getByText('BK-001')).toBeInTheDocument());

    const deleteButtons = screen.queryAllByTitle('Xóa');
    expect(deleteButtons).toHaveLength(1); // only for b2 (CANCELLED)
  });

  it('clicking delete button opens confirm dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Xóa')).toBeInTheDocument());

    await user.click(screen.getByTitle('Xóa'));

    expect(screen.getByText('Xác nhận xóa booking')).toBeInTheDocument();
  });

  it('confirming delete calls bookingApi.softDelete and shows toast', async () => {
    mockSoftDelete.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTitle('Xóa')).toBeInTheDocument());

    await user.click(screen.getByTitle('Xóa'));
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
    await waitFor(() => expect(screen.getByTitle('Xóa')).toBeInTheDocument());

    await user.click(screen.getByTitle('Xóa'));
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
