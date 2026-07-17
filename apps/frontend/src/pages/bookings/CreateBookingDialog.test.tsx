import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateBookingDialog } from './CreateBookingDialog';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// "mock" prefix → hoisted alongside vi.mock() by Vitest
const mockCreateBooking = vi.fn();
const mockListUnits = vi.fn();
const mockListLeads = vi.fn();
const mockListUsers = vi.fn();
const mockToast = vi.fn();

const MOCK_UNITS = [
  { id: 'unit-1', code: 'A1-01', name: 'Kiosk A1', areaGFA: 50, floor: { name: 'Tầng 1' } },
  { id: 'unit-2', code: 'B2-05', name: 'Cửa hàng B2', areaGFA: 120, floor: { name: 'Tầng 2' } },
];
const MOCK_LEADS = [
  { id: 'lead-1', brandName: 'Pizza Hut', contactName: 'David Lee', status: 'HOT' },
  { id: 'lead-2', brandName: 'KFC', contactName: 'John Smith', status: 'WARM' },
];

vi.mock('@/api', () => ({
  bookingApi: {
    create: (...args: any[]) => mockCreateBooking(...args),
  },
  spacesApi: {
    listUnits: (...args: any[]) => mockListUnits(...args),
  },
  crmApi: {
    listLeads: (...args: any[]) => mockListLeads(...args),
  },
  usersApi: {
    listUsers: (...args: any[]) => mockListUsers(...args),
  },
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@tanstack/react-query', async (importActual) => {
  const actual = await importActual<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

// ── Global beforeEach — reset API mocks to default data before every test ─────
// This prevents mock overrides in one test (e.g. mockResolvedValue) from
// leaking into subsequent tests.

beforeEach(() => {
  vi.clearAllMocks();
  mockListUnits.mockResolvedValue({ data: MOCK_UNITS });
  mockListLeads.mockResolvedValue({ data: MOCK_LEADS });
  mockListUsers.mockResolvedValue({ data: [{ id: 'user-1', fullName: 'Nguyễn Sale' }] });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog(props?: { open?: boolean; onClose?: () => void; mallId?: string }) {
  const onClose = vi.fn();
  render(
    <CreateBookingDialog
      open={props?.open ?? true}
      onClose={props?.onClose ?? onClose}
      mallId={props?.mallId ?? 'mall-1'}
    />,
    { wrapper: Wrapper },
  );
  return { onClose };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateBookingDialog — render', () => {
  it('renders dialog title when open=true', () => {
    renderDialog();
    expect(screen.getByText('Tạo Booking Giữ Lô')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('Tạo Booking Giữ Lô')).not.toBeInTheDocument();
  });

  it('submit button is disabled initially (no unit or lead)', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /Tạo Booking/ })).toBeDisabled();
  });

  it('shows holdDays default value of 30', () => {
    renderDialog();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
  });

  it('shows Sale dropdown with blank option', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '-- Chưa phân công --' })).toBeInTheDocument();
    });
  });

  it('shows Sale user option after loading', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Nguyễn Sale' })).toBeInTheDocument();
    });
  });
});

describe('CreateBookingDialog — unit picker', () => {
  it('shows vacant units list after loading', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('A1-01')).toBeInTheDocument();
      expect(screen.getByText('B2-05')).toBeInTheDocument();
    });
  });

  it('selecting a unit replaces search input with selected label', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByText('A1-01'));
    await user.click(screen.getByText('A1-01'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Tìm mã lô (A1-01, B2-05...)')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/A1-01/)).toBeInTheDocument();
  });

  it('can clear selected unit to re-show search input', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByText('A1-01'));
    await user.click(screen.getByText('A1-01'));

    // Click the X clear button
    await waitFor(() => screen.queryByPlaceholderText('Tìm mã lô (A1-01, B2-05...)') === null);
    const clearBtn = screen.getByRole('button', { name: '' }); // X icon button inside unit card
    // Find the X button in the unit selection card (it's the only X button at this point)
    const allXButtons = screen.getAllByRole('button');
    // The X button is in the unit selected card (has no visible text)
    const unitClearBtn = allXButtons.find((btn) =>
      btn.closest('.bg-amber-50') !== null,
    );
    if (unitClearBtn) {
      await user.click(unitClearBtn);
    }

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Tìm mã lô (A1-01, B2-05...)')).toBeInTheDocument();
    });
  });

  it('shows "Không tìm thấy" message when unit search has no results', async () => {
    const user = userEvent.setup();
    renderDialog();

    // Wait for initial query (unitSearch='') to resolve
    await waitFor(() => expect(screen.getByText('A1-01')).toBeInTheDocument());

    // Each typed character triggers a new query key, so override permanently.
    // The global beforeEach will restore the default before the next test.
    mockListUnits.mockResolvedValue({ data: [] });

    const searchInput = screen.getByPlaceholderText('Tìm mã lô (A1-01, B2-05...)');
    await user.type(searchInput, 'ZZZZZ');

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy lô VACANT phù hợp')).toBeInTheDocument();
    });
  });
});

describe('CreateBookingDialog — lead picker', () => {
  it('shows leads list after loading', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText('Pizza Hut')).toBeInTheDocument();
      expect(screen.getByText('KFC')).toBeInTheDocument();
    });
  });

  it('selecting a lead replaces search input with selected label', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByText('Pizza Hut'));
    await user.click(screen.getByText('Pizza Hut'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Nhập tên thương hiệu để tìm lead...')).not.toBeInTheDocument();
    });
    // The selected lead shows "Pizza Hut — David Lee" in the blue card
    expect(screen.getByText(/Pizza Hut/)).toBeInTheDocument();
  });
});

describe('CreateBookingDialog — validation', () => {
  it('submit button disabled when unit selected but no lead', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByText('A1-01'));
    await user.click(screen.getByText('A1-01'));

    // Still no lead → disabled
    expect(screen.getByRole('button', { name: /Tạo Booking/ })).toBeDisabled();
  });

  it('shows validation hint when no unit selected', async () => {
    renderDialog();
    expect(screen.getByText('Chọn mặt bằng để tiếp tục')).toBeInTheDocument();
  });

  it('shows lead hint after unit selected but no lead', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByText('A1-01'));
    await user.click(screen.getByText('A1-01'));

    await waitFor(() => {
      expect(screen.getByText('Chọn Lead/Khách hàng để tiếp tục')).toBeInTheDocument();
    });
  });

  it('submit button enabled when both unit and lead selected', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByText('A1-01'));
    await user.click(screen.getByText('A1-01'));

    await waitFor(() => screen.getByText('Pizza Hut'));
    await user.click(screen.getByText('Pizza Hut'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tạo Booking/ })).not.toBeDisabled();
    });
  });
});

describe('CreateBookingDialog — submit', () => {
  async function selectUnitAndLead(user: ReturnType<typeof userEvent.setup>) {
    await waitFor(() => screen.getByText('A1-01'));
    await user.click(screen.getByText('A1-01'));
    await waitFor(() => screen.getByText('Pizza Hut'));
    await user.click(screen.getByText('Pizza Hut'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tạo Booking/ })).not.toBeDisabled();
    });
  }

  it('calls bookingApi.create with unitId, leadId, and default holdDays=30', async () => {
    mockCreateBooking.mockResolvedValue({ id: 'b-new', bookingNumber: 'BK-099' });
    const user = userEvent.setup();
    renderDialog();

    await selectUnitAndLead(user);
    await user.click(screen.getByRole('button', { name: /Tạo Booking/ }));

    await waitFor(() => {
      expect(mockCreateBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          unitId: 'unit-1',
          leadId: 'lead-1',
          holdDays: 30,
        }),
      );
    });
  });

  it('calls bookingApi.create with custom holdDays', async () => {
    mockCreateBooking.mockResolvedValue({ id: 'b-new', bookingNumber: 'BK-099' });
    const user = userEvent.setup();
    renderDialog();

    await selectUnitAndLead(user);

    const holdInput = screen.getByDisplayValue('30');
    await user.clear(holdInput);
    await user.type(holdInput, '14');

    await user.click(screen.getByRole('button', { name: /Tạo Booking/ }));

    await waitFor(() => {
      expect(mockCreateBooking).toHaveBeenCalledWith(
        expect.objectContaining({ holdDays: 14 }),
      );
    });
  });

  it('on success: shows toast and calls onClose', async () => {
    mockCreateBooking.mockResolvedValue({ id: 'b-new', bookingNumber: 'BK-099' });
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await selectUnitAndLead(user);
    await user.click(screen.getByRole('button', { name: /Tạo Booking/ }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Đã tạo booking lô thuê' }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('on error: shows destructive toast with backend message', async () => {
    mockCreateBooking.mockRejectedValue({
      response: { data: { message: 'Unit đã có booking active' } },
    });
    const user = userEvent.setup();
    renderDialog();

    await selectUnitAndLead(user);
    await user.click(screen.getByRole('button', { name: /Tạo Booking/ }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Unit đã có booking active',
          variant: 'destructive',
        }),
      );
    });
  });

  it('on generic error: shows fallback error toast', async () => {
    mockCreateBooking.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderDialog();

    await selectUnitAndLead(user);
    await user.click(screen.getByRole('button', { name: /Tạo Booking/ }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });
  });

  it('clicking Hủy button calls onClose without API call', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onClose).toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });
});
