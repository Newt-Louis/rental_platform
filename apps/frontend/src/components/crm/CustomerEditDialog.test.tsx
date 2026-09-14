/**
 * CR-CRM-CUSTOMER-PROFILE-EDIT — editing a customer profile.
 *
 * Before this, a customer captured at creation (or copied from a Lead on
 * conversion) was frozen: the sheet could advance a status and log an activity,
 * but a wrong tax code or a changed phone number had no path back.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdateCustomer = vi.fn();
const mockGetOptions = vi.fn().mockResolvedValue([{ id: 'cat-fnb', code: 'FNB', name: 'F&B' }]);

vi.mock('@/api', () => ({
  customersApi: { updateCustomer: (...a: any[]) => mockUpdateCustomer(...a) },
  usersApi: { listAssignableUsers: vi.fn().mockResolvedValue([{ id: 'u1', fullName: 'Trần B' }]) },
  categoriesApi: { getOptions: (...a: any[]) => mockGetOptions(...a) },
}));

const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { CustomerEditDialog } from './CustomerEditDialog';

const CUSTOMER = {
  id: 'cus-1',
  customerCode: 'CUST-008',
  companyName: 'CellphoneS JSC',
  brandName: 'CellphoneS',
  taxCode: '0301234567',
  contactName: 'Nguyễn Văn A',
  phone: '0901234567',
  email: 'a@cellphones.vn',
  preferredCategoryId: 'cat-fnb',
  preferredCategory: 'F&B',
  budgetMin: 500000,
  budgetMax: 900000,
  currencyCode: 'VND',
  rating: 4,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function open(customer: any = CUSTOMER) {
  const onClose = vi.fn();
  render(<CustomerEditDialog customer={customer} open onClose={onClose} />, { wrapper: Wrapper });
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateCustomer.mockResolvedValue({});
  mockGetOptions.mockResolvedValue([{ id: 'cat-fnb', code: 'FNB', name: 'F&B' }]);
});

describe('CustomerEditDialog', () => {
  it('loads the existing profile into the form', () => {
    open();
    expect(screen.getByDisplayValue('CellphoneS JSC')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0301234567')).toBeInTheDocument();
  });

  it('shows the customer code as identity that cannot be edited', () => {
    open();
    expect(screen.getByText('CUST-008')).toBeInTheDocument();
    expect(screen.getByText(/không thể thay đổi/)).toBeInTheDocument();
    // It is text, not an input: the server strips it anyway, and offering a box
    // the server ignores would be worse than not offering one.
    expect(screen.queryByDisplayValue('CUST-008')).not.toBeInTheDocument();
  });

  it('saves the edited company details', async () => {
    open();

    const name = screen.getByDisplayValue('CellphoneS JSC');
    await userEvent.clear(name);
    await userEvent.type(name, 'CellphoneS Group');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockUpdateCustomer).toHaveBeenCalled());
    const [id, payload] = mockUpdateCustomer.mock.calls[0];
    expect(id).toBe('cus-1');
    expect(payload.companyName).toBe('CellphoneS Group');
  });

  it('never sends the identity or bookkeeping fields', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockUpdateCustomer).toHaveBeenCalled());
    const payload = mockUpdateCustomer.mock.calls[0][1];
    for (const field of ['customerCode', 'createdById', 'isActive', 'deletedAt', 'wonAt', 'id']) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  it('refuses to save an empty company name', async () => {
    open();

    await userEvent.clear(screen.getByDisplayValue('CellphoneS JSC'));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(mockUpdateCustomer).not.toHaveBeenCalled();
    expect(screen.getByText('Tên công ty không được để trống')).toBeInTheDocument();
  });

  it('refuses a malformed email', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: 'Liên hệ' }));
    const email = screen.getByDisplayValue('a@cellphones.vn');
    await userEvent.clear(email);
    await userEvent.type(email, 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(mockUpdateCustomer).not.toHaveBeenCalled();
    expect(screen.getByText('Email không đúng định dạng')).toBeInTheDocument();
  });

  it('refuses a budget with no currency rather than letting the API reject it', async () => {
    open({ ...CUSTOMER, currencyCode: null });

    await userEvent.click(screen.getByRole('button', { name: 'Nhu cầu thuê' }));
    expect(screen.getByText(/hệ thống không mặc định VND/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(mockUpdateCustomer).not.toHaveBeenCalled();
  });

  it('refuses a maximum budget below the minimum', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: 'Nhu cầu thuê' }));
    const max = screen.getByLabelText('Ngân sách tối đa');
    await userEvent.clear(max);
    await userEvent.type(max, '100');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(mockUpdateCustomer).not.toHaveBeenCalled();
    expect(screen.getByText('Ngân sách tối đa phải lớn hơn tối thiểu')).toBeInTheDocument();
  });

  it('sends the canonical category id, not the display text', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: 'Nhu cầu thuê' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockUpdateCustomer).toHaveBeenCalled());
    expect(mockUpdateCustomer.mock.calls[0][1].preferredCategoryId).toBe('cat-fnb');
  });

  it('omits the category while the record is still on unmapped legacy text', async () => {
    // Sending null here would erase a value nobody asked to change.
    open({ ...CUSTOMER, preferredCategoryId: null, preferredCategory: 'Health & Beauty' });

    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockUpdateCustomer).toHaveBeenCalled());
    expect(mockUpdateCustomer.mock.calls[0][1].preferredCategoryId).toBeUndefined();
  });
});
