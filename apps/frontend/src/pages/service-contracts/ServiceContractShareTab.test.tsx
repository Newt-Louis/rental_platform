import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceContractShareTab, type ShareEntry } from './ServiceContractShareTab';
import { serviceContractsApi } from '@/api';

vi.mock('@/api', () => ({
  serviceContractsApi: { shareableUsers: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const USERS = [
  { id: 'u-md', fullName: 'Le Van C', email: 'director@thiso.com', role: 'MALL_DIRECTOR' },
  { id: 'u-fin', fullName: 'Pham Thi D', email: 'finance@thiso.com', role: 'FINANCE' },
];

function renderTab(value: ShareEntry[], onChange = vi.fn(), readOnly = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ServiceContractShareTab mallId="mall-1" value={value} onChange={onChange} readOnly={readOnly} />
    </QueryClientProvider>,
  );
  return onChange;
}

describe('ServiceContractShareTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serviceContractsApi.shareableUsers).mockResolvedValue(USERS as never);
  });

  it('lists candidates as "fullName - email" so two people with the same name stay distinguishable', async () => {
    renderTab([]);

    fireEvent.click(screen.getByRole('button', { name: 'sharePerson' }));

    expect(await screen.findByText('Le Van C - director@thiso.com')).toBeInTheDocument();
    expect(screen.getByText('Pham Thi D - finance@thiso.com')).toBeInTheDocument();
  });

  it('raises the typed term to the server instead of filtering only what is already loaded', async () => {
    renderTab([]);
    fireEvent.click(screen.getByRole('button', { name: 'sharePerson' }));

    fireEvent.change(await screen.findByPlaceholderText('shareSearchPlaceholder'), { target: { value: 'finance' } });

    await waitFor(() => expect(serviceContractsApi.shareableUsers).toHaveBeenCalledWith('mall-1', 'finance'));
  });

  it('adds the picked person at the selected permission and defaults to read', async () => {
    const onChange = renderTab([]);
    fireEvent.click(screen.getByRole('button', { name: 'sharePerson' }));
    fireEvent.click(await screen.findByText('Le Van C - director@thiso.com'));

    // Mặc định là đọc; chọn "sửa" trước khi thêm.
    fireEvent.click(screen.getByRole('radio', { name: /shareEdit/ }));
    fireEvent.click(screen.getByRole('button', { name: /shareAdd/ }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u-md', permission: 'EDIT', email: 'director@thiso.com' }),
    ]);
  });

  it('warns that a role-capped person will not actually get the higher grant', () => {
    // FINANCE xem được hợp đồng nhưng không nằm trong nhóm được sửa, nên cấp
    // EDIT cho họ là vô nghĩa — phải nói ra thay vì im lặng.
    renderTab([{ userId: 'u-fin', permission: 'EDIT', fullName: 'Pham Thi D', email: 'finance@thiso.com', role: 'FINANCE' }]);

    expect(screen.getByText('shareRoleCapped')).toBeInTheDocument();
  });

  it('does not warn for a role that can genuinely hold the grant', () => {
    renderTab([{ userId: 'u-md', permission: 'DELETE', fullName: 'Le Van C', email: 'director@thiso.com', role: 'MALL_DIRECTOR' }]);

    expect(screen.queryByText('shareRoleCapped')).not.toBeInTheDocument();
  });

  it('removes a person from the list', () => {
    const onChange = renderTab([
      { userId: 'u-md', permission: 'EDIT', fullName: 'Le Van C', email: 'director@thiso.com', role: 'MALL_DIRECTOR' },
      { userId: 'u-fin', permission: 'READ', fullName: 'Pham Thi D', email: 'finance@thiso.com', role: 'FINANCE' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'shareRemove Le Van C' }));

    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ userId: 'u-fin' })]);
  });

  it('hides the picker entirely and never queries accounts for a non-creator', () => {
    renderTab([], vi.fn(), true);

    expect(screen.getByText('shareOnlyCreator')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shareAdd/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'sharePerson' })).not.toBeInTheDocument();
    expect(serviceContractsApi.shareableUsers).not.toHaveBeenCalled();
  });

  it('still shows a non-creator who already holds access, without any control to change it', () => {
    renderTab(
      [{ userId: 'u-md', permission: 'EDIT', fullName: 'Le Van C', email: 'director@thiso.com', role: 'MALL_DIRECTOR' }],
      vi.fn(),
      true,
    );

    expect(screen.getByText('Le Van C - director@thiso.com')).toBeInTheDocument();
    expect(screen.getByText('shareEdit')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shareRemove/ })).not.toBeInTheDocument();
  });

  it('keeps someone already shared out of the picker so their level is changed in place', async () => {
    renderTab([{ userId: 'u-md', permission: 'EDIT', fullName: 'Le Van C', email: 'director@thiso.com', role: 'MALL_DIRECTOR' }]);

    fireEvent.click(screen.getByRole('button', { name: 'sharePerson' }));

    // Khoanh vùng trong listbox của dropdown: tên người đã chia sẻ vẫn hiện ở
    // bảng bên dưới, và <select> mức quyền ở đó cũng sinh ra role "option".
    const listbox = screen.getByRole('listbox');
    await waitFor(() => expect(within(listbox).getByText('Pham Thi D - finance@thiso.com')).toBeInTheDocument());
    expect(within(listbox).queryByText('Le Van C - director@thiso.com')).not.toBeInTheDocument();
  });
});
