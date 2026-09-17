/**
 * Proposal governance — `proposal-send-external` is manageable in the Admin
 * permission matrix and drives UI capability from the live, Mall-scoped matrix.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/lib/i18n';

const api = vi.hoisted(() => ({
  permissions: { getMatrix: vi.fn(), updateCell: vi.fn(), resetToDefault: vi.fn(), getEffective: vi.fn() },
  spaces: { listMalls: vi.fn() },
}));
vi.mock('@/api', () => ({
  permissionsApi: api.permissions,
  spacesApi: api.spaces,
  usersApi: {}, tenantsApi: {}, brandingApi: {}, emailSettingsApi: {}, mallAccessApi: {}, departmentsApi: {},
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { PermissionsTab } from './AdminPage';
import { canPerformAction, ACTION_PERMISSION_META } from '@/lib/permissions';
import { usePermissionsStore } from '@/store/permissions.store';

void i18n.changeLanguage('vi');

const SEND = 'proposal-send-external';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><PermissionsTab /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  usePermissionsStore.getState().reset();
  api.spaces.listMalls.mockResolvedValue([{ id: 'mall-a', name: 'Mall A' }, { id: 'mall-b', name: 'Mall B' }]);
  api.permissions.updateCell.mockResolvedValue({ success: true });
});

describe('Admin permission matrix — action permissions', () => {
  it('PROP-PERM-001 lists "Gửi tờ trình ra bên ngoài" as an action, not as module access', async () => {
    api.permissions.getMatrix.mockResolvedValue({ [SEND]: { roles: ['LEASING_MANAGER', 'MALL_DIRECTOR'], source: 'global' } });
    renderTab();

    const row = await waitFor(() => {
      const el = document.querySelector(`tr[data-permission="${SEND}"]`) as HTMLElement | null;
      if (!el) throw new Error('row not rendered');
      return el;
    });
    expect(row).toHaveTextContent(ACTION_PERMISSION_META[SEND].label);
    expect(row).toHaveTextContent('đã được phê duyệt');
    expect(screen.getByText('Quyền thao tác (không phải quyền truy cập màn hình)')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /LEASING_EXECUTIVE: đang chặn/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(row).getByRole('button', { name: /LEASING_MANAGER: đang cho phép/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('PROP-PERM-002/003/004 grants and revokes per selected Mall scope through the existing matrix API', async () => {
    api.permissions.getMatrix.mockImplementation(async (mallId?: string) => ({
      [SEND]: { roles: mallId === 'mall-a' ? ['LEASING_MANAGER'] : ['LEASING_MANAGER', 'MALL_DIRECTOR'], source: mallId ? 'mall' : 'global' },
    }));
    renderTab();
    const scope = await screen.findByRole('combobox');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Mall A' })).toBeInTheDocument());
    await userEvent.selectOptions(scope, 'mall-a');

    const row = await waitFor(() => document.querySelector(`tr[data-permission="${SEND}"]`) as HTMLElement);
    await waitFor(() => expect(api.permissions.getMatrix).toHaveBeenCalledWith('mall-a'));
    await userEvent.click(within(row).getByRole('button', { name: /LEASING_EXECUTIVE: đang chặn/ }));
    await waitFor(() => expect(api.permissions.updateCell).toHaveBeenCalledWith({ module: SEND, role: 'LEASING_EXECUTIVE', allowed: true, mallId: 'mall-a' }));

    await userEvent.click(within(row).getByRole('button', { name: /LEASING_MANAGER: đang cho phép/ }));
    await waitFor(() => expect(api.permissions.updateCell).toHaveBeenCalledWith({ module: SEND, role: 'LEASING_MANAGER', allowed: false, mallId: 'mall-a' }));
  });
});

describe('canPerformAction — effective action permission in the UI', () => {
  it('PROP-PERM-005 proposal module access alone does not enable sending', () => {
    usePermissionsStore.getState().setAllowedModules(['proposals', 'approvals']);
    expect(canPerformAction('LEASING_EXECUTIVE', SEND)).toBe(false);
  });

  it('PROP-PERM-008 follows the matrix loaded for the selected Mall', () => {
    usePermissionsStore.getState().setAllowedModules(['proposals', SEND]); // Mall A
    expect(canPerformAction('LEASING_EXECUTIVE', SEND)).toBe(true);
    usePermissionsStore.getState().setAllowedModules(['proposals']); // switched to Mall B
    expect(canPerformAction('LEASING_EXECUTIVE', SEND)).toBe(false);
  });

  it('PROP-PERM-009 logout clears the effective matrix; nobody is left with a stale grant', () => {
    usePermissionsStore.getState().setAllowedModules([SEND]);
    usePermissionsStore.getState().reset();
    expect(canPerformAction(undefined, SEND)).toBe(false);
    expect(canPerformAction('LEASING_EXECUTIVE', SEND)).toBe(false);
  });
});
