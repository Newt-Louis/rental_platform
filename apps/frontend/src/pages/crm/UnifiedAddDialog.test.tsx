import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UnifiedAddDialog } from './CrmPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCreateLead = vi.fn();
const mockCreateCustomer = vi.fn();
const mockListUsers = vi.fn();
const mockGetOptions = vi.fn();
const mockToast = vi.fn();

const SELF_USER = { id: 'user-le-1', fullName: 'Trần Executive', role: 'LEASING_EXECUTIVE' };
const OTHER_USER = { id: 'user-2', fullName: 'Lê Manager', role: 'LEASING_MANAGER' };

let mockAuthUser: any = SELF_USER;

vi.mock('@/api', () => ({
  crmApi: { createLead: (...args: any[]) => mockCreateLead(...args) },
  customersApi: { createCustomer: (...args: any[]) => mockCreateCustomer(...args) },
  usersApi: { listUsers: (...args: any[]) => mockListUsers(...args) },
  categoriesApi: { getOptions: (...args: any[]) => mockGetOptions(...args) },
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: () => ({ user: mockAuthUser }),
}));

vi.mock('@/store/mall.store', () => ({
  useMallStore: () => ({ selectedMallId: 'mall-1' }),
}));

vi.mock('@tanstack/react-query', async (importActual) => {
  const actual = await importActual<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockListUsers.mockResolvedValue({ data: [SELF_USER, OTHER_USER] });
  mockGetOptions.mockResolvedValue([]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog() {
  const onClose = vi.fn();
  render(<UnifiedAddDialog open={true} onClose={onClose} />, { wrapper: Wrapper });
  return { onClose };
}

// UnifiedAddDialog uses react-i18next's t() for all labels/placeholders, and no
// i18next instance is initialized in the test environment (consistent with the
// rest of this codebase's tests — see LeadEditDialog.test.tsx), so t() falls
// back to returning the raw key. Locate text-type inputs by DOM order/role
// instead of by translated placeholder text: in Lead mode the first two
// textboxes are always [brandName, contactName].
function getBrandAndContactInputs() {
  const textboxes = screen.getAllByRole('textbox');
  return { brandInput: textboxes[0], contactInput: textboxes[1] };
}

// ── Tests: LEASING_EXECUTIVE (locked) ───────────────────────────────────────────

describe('UnifiedAddDialog — assignee field, LEASING_EXECUTIVE', () => {
  beforeEach(() => {
    mockAuthUser = SELF_USER;
  });

  it('hides the assignee dropdown and shows own name as static text', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(SELF_USER.fullName)).toBeInTheDocument();
    });
    // The other user must never appear as a selectable option
    expect(screen.queryByRole('option', { name: OTHER_USER.fullName })).not.toBeInTheDocument();
  });

  it('submits createLead with assignedToId = own id, without letting it be changed', async () => {
    mockCreateLead.mockResolvedValue({ id: 'lead-new' });
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByText(SELF_USER.fullName));
    const { brandInput, contactInput } = getBrandAndContactInputs();
    await user.type(brandInput, 'Highlands');
    await user.type(contactInput, 'Nguyen Van A');

    await user.click(screen.getByRole('button', { name: /addToPipeline|Thêm vào Pipeline/ }));

    await waitFor(() => {
      expect(mockCreateLead).toHaveBeenCalledWith(
        expect.objectContaining({ assignedToId: SELF_USER.id }),
      );
    });
  });
});

// ── Tests: other roles (editable, defaulted to self) ────────────────────────────

describe('UnifiedAddDialog — assignee field, non-Leasing-Executive role', () => {
  beforeEach(() => {
    mockAuthUser = OTHER_USER;
  });

  it('shows the assignee dropdown pre-selected to self', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: OTHER_USER.fullName })).toBeInTheDocument();
    });
    const select = screen.getByRole('option', { name: OTHER_USER.fullName }).closest('select');
    expect(select).toHaveValue(OTHER_USER.id);
  });

  it('allows picking a different user', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByRole('option', { name: SELF_USER.fullName }));
    const select = screen.getByRole('option', { name: SELF_USER.fullName }).closest('select')!;
    await user.selectOptions(select, SELF_USER.id);

    expect(select).toHaveValue(SELF_USER.id);
  });
});
