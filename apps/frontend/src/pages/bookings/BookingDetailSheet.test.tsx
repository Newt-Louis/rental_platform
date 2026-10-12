/**
 * Opening a booking for editing used to blank the screen.
 *
 * The assignee picker here fetched the ADMIN-only paginated /users, but stored
 * it under ['users-picker'] -- the cache key every other assignee picker in the
 * app already used for /users/assignable, which answers with a bare array. The
 * booking sheet therefore poisoned that key with { data, total, page }, and the
 * lead dialog it renders alongside called .map() on the envelope:
 * "users.map is not a function", and the page went white. CRM and Tickets read
 * the same key, so they broke for the rest of the session too.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/lib/i18n';

const api = vi.hoisted(() => ({
  bookingGet: vi.fn(),
  listUnits: vi.fn(),
  listLeads: vi.fn(),
  listCustomers: vi.fn(),
  listUsers: vi.fn(),
  listAssignableUsers: vi.fn(),
  me: vi.fn(),
  bookingUpdate: vi.fn(),
}));

vi.mock('@/api', () => ({
  bookingApi: {
    get: api.bookingGet,
    cancel: vi.fn(),
    reinstate: vi.fn(),
    update: api.bookingUpdate,
  },
  spacesApi: { listUnits: api.listUnits },
  crmApi: { listLeads: api.listLeads, updateLead: vi.fn(), getLead: vi.fn() },
  customersApi: { list: api.listCustomers, listCustomers: api.listCustomers },
  usersApi: { listUsers: api.listUsers, listAssignableUsers: api.listAssignableUsers },
  authApi: { me: api.me },
  categoriesApi: { getOptions: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { BookingDetailSheet } from './BookingDetailSheet';

beforeAll(() => i18n.changeLanguage('vi'));

const BOOKING = {
  id: 'bk1', bookingNumber: 'BK-2026-00003', status: 'ACTIVE',
  unitId: 'u1', leadId: 'l1', requestedArea: 300, requestedTerm: 36,
  expectedRent: 800000, currencyCode: 'VND', holdDays: 30,
  budgetRentMin: 600000, budgetRentMax: 700000,
  proposedRentPerSqm: 650000, proposedCamPerSqm: 50000,
  createdById: 'admin', assignedToId: 'user-1',
  unit: { id: 'u1', code: 'L2-D01', name: 'Unit L2-D01', areaGFA: 200, mall: {} },
  lead: { id: 'l1', brandName: 'Zara Vietnam', contactName: 'Carlos Rodriguez' },
} as any;

const PEOPLE = [
  { id: 'user-1', fullName: 'Nguyen Van A', email: 'a@x.test', role: 'LEASING_EXECUTIVE' },
  { id: 'user-2', fullName: 'Chen Wei', email: 'c@x.test', role: 'LEASING_MANAGER' },
];

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <BookingDetailSheet booking={BOOKING} initialEditing onClose={() => {}} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.bookingGet.mockResolvedValue({ ...BOOKING, activities: [] });
  api.listUnits.mockResolvedValue({ data: [] });
  api.listLeads.mockResolvedValue({ data: [] });
  api.listCustomers.mockResolvedValue({ data: [] });
  api.me.mockResolvedValue({ id: 'admin', role: 'ADMIN', fullName: 'Admin' });
  api.listAssignableUsers.mockResolvedValue(PEOPLE);
  api.listUsers.mockResolvedValue({ data: PEOPLE, total: 2, page: 1, limit: 100 });
  api.bookingUpdate.mockResolvedValue({ id: 'bk1' });
});

describe('BookingDetailSheet edit mode', () => {
  it('opens the edit form instead of blanking the screen', async () => {
    renderSheet();

    expect(await screen.findByText('BK-2026-00003')).toBeInTheDocument();
    expect(await screen.findByText('Chi tiết Booking')).toBeInTheDocument();
    expect(screen.getByDisplayValue('300')).toBeInTheDocument();      // requested area
  });

  it('reads the assignee list from the shared picker endpoint, not the admin-only paginated one', async () => {
    renderSheet();
    await screen.findByText('Chi tiết Booking');

    // The cache key ['users-picker'] belongs to /users/assignable. Writing the
    // paginated /users into it is what broke every other screen that reads it.
    await waitFor(() => expect(api.listAssignableUsers).toHaveBeenCalled());
    expect(api.listUsers).not.toHaveBeenCalled();
  });

  it('offers the people it fetched as assignees', async () => {
    renderSheet();
    await screen.findByText('Chi tiết Booking');

    await waitFor(() => expect(screen.getByRole('option', { name: 'Chen Wei' })).toBeInTheDocument());
  });

  it('survives a picker response that arrives as a paginated envelope', async () => {
    // Belt and braces: even if something writes an envelope into that cache key
    // again, the sheet must show an empty picker rather than take the page down.
    api.listAssignableUsers.mockResolvedValue({ data: PEOPLE, total: 2 } as any);
    renderSheet();

    expect(await screen.findByText('Chi tiết Booking')).toBeInTheDocument();
  });

  it('shows the currency', async () => {
    renderSheet();
    await screen.findByText('Chi tiết Booking');

    expect(screen.getByLabelText('Đơn vị tiền tệ')).toHaveValue('VND');
  });
});

/**
 * CR-BOOK-CURRENCY-EDIT-001 — the currency can be corrected while no price has
 * been approved. Every amount on the booking is denominated in it, so the
 * change costs a re-entry of all of them; once a price is approved the sign-off
 * was given in the old currency and the change is refused outright.
 */
describe('BookingDetailSheet currency correction', () => {
  const withBooking = (over: Record<string, unknown>) => {
    const b = { ...BOOKING, ...over };
    api.bookingGet.mockResolvedValue({ ...b, activities: [] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BookingDetailSheet booking={b as any} initialEditing onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  };

  it('offers the currencies the system supports', async () => {
    renderSheet();
    await screen.findByText('Chi tiết Booking');

    const select = screen.getByLabelText('Đơn vị tiền tệ');
    expect(select).toBeEnabled();
    expect(within(select).getByRole('option', { name: /^USD/ })).toBeInTheDocument();
  });

  it('locks the currency, and says why, once a price has been approved', async () => {
    withBooking({ priceApprovalStatus: 'APPROVED' });
    await screen.findByText('Chi tiết Booking');

    expect(screen.queryByLabelText('Đơn vị tiền tệ')).not.toBeInTheDocument();
    expect(screen.getByText(/Giá đã được duyệt nên không đổi được/)).toBeInTheDocument();
  });

  it('empties the amounts on switching, because they are in the currency being left', async () => {
    const user = (await import('@testing-library/user-event')).default;
    renderSheet();
    await screen.findByText('Chi tiết Booking');
    expect(screen.getByDisplayValue('650,000')).toBeInTheDocument();   // proposed rent, in dong

    await user.selectOptions(screen.getByLabelText('Đơn vị tiền tệ'), 'USD');

    // 650.000 dong must not silently become 650.000 dollars.
    expect(screen.queryByDisplayValue('650,000')).not.toBeInTheDocument();
    expect(screen.getByText(/nhập lại toàn bộ các mức giá/)).toBeInTheDocument();
  });

  it('will not save until the emptied amounts are back', async () => {
    const user = (await import('@testing-library/user-event')).default;
    renderSheet();
    await screen.findByText('Chi tiết Booking');

    await user.selectOptions(screen.getByLabelText('Đơn vị tiền tệ'), 'USD');

    expect(screen.getByRole('button', { name: /Lưu thay đổi/ })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Giá thuê đề xuất');
  });

  it('relabels the money fields in the currency being entered', async () => {
    const user = (await import('@testing-library/user-event')).default;
    renderSheet();
    await screen.findByText('Chi tiết Booking');
    expect(screen.getByText(/Giá kỳ vọng \(₫\/m²\)/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Đơn vị tiền tệ'), 'USD');

    expect(screen.getByText(/Giá kỳ vọng \(\$\/m²\)/)).toBeInTheDocument();
    // A rate only means something once the money is not already dong.
    expect(screen.getByText(/Tỷ giá áp dụng \(VND\/USD\)/)).toBeInTheDocument();
  });

  it('sends the new currency together with the re-entered amounts', async () => {
    const user = (await import('@testing-library/user-event')).default;
    renderSheet();
    await screen.findByText('Chi tiết Booking');

    await user.selectOptions(screen.getByLabelText('Đơn vị tiền tệ'), 'USD');
    for (const [label, value] of [
      [/Giá ngân sách — thấp nhất/, '24'],
      [/Giá ngân sách — cao nhất/, '28'],
      [/Giá kỳ vọng/, '30'],
      [/Giá thuê đề xuất/, '26'],
      [/CAM đề xuất/, '2'],
    ] as Array<[RegExp, string]>) {
      await user.type(screen.getByLabelText(label), value);
    }

    await user.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));

    await waitFor(() => expect(api.bookingUpdate).toHaveBeenCalled());
    expect(api.bookingUpdate.mock.calls[0][1]).toMatchObject({
      currencyCode: 'USD', proposedRentPerSqm: 26, proposedCamPerSqm: 2,
    });
  });
});
