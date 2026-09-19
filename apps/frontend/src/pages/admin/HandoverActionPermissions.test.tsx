/**
 * CR-UNIT-HANDOVER-READINESS -- the five handover action permissions are
 * manageable in the Admin matrix, and the ADMIN column reflects the explicit
 * per-action grant (ADMIN is NOT a confirmer) instead of an implied bypass.
 */
import React from 'react';
import { render, waitFor, within } from '@testing-library/react';
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
import { ACTION_PERMISSION_META, ACTION_PERMISSIONS, canPerformAction } from '@/lib/permissions';
import { usePermissionsStore } from '@/store/permissions.store';

void i18n.changeLanguage('vi');

const row = (module: string) => waitFor(() => {
  const el = document.querySelector(`tr[data-permission="${module}"]`) as HTMLElement | null;
  if (!el) throw new Error(`row ${module} not rendered`);
  return el;
});

beforeEach(() => {
  vi.clearAllMocks();
  usePermissionsStore.getState().reset();
  api.spaces.listMalls.mockResolvedValue([{ id: 'mall-a', name: 'Mall A' }]);
  api.permissions.getMatrix.mockResolvedValue({
    'handover-readiness-confirm': { roles: ['OPERATION'], source: 'global' },
    'handover-readiness-reopen': { roles: ['MALL_DIRECTOR'], source: 'global' },
    'proposal-send-external': { roles: ['LEASING_MANAGER', 'MALL_DIRECTOR'], source: 'global' },
    spaces: { roles: ['MALL_DIRECTOR', 'LEASING_MANAGER'], source: 'global' },
  });
});

describe('Admin matrix -- handover readiness actions', () => {
  it('HANDOVER-PERM-UI-001 lists all five actions with their labels', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><PermissionsTab /></QueryClientProvider>);
    for (const module of ['handover-readiness-view', 'handover-readiness-manage', 'handover-readiness-risk-manage', 'handover-readiness-confirm', 'handover-readiness-reopen'] as const) {
      expect(await row(module)).toHaveTextContent(ACTION_PERMISSION_META[module].label);
    }
  });

  it('HANDOVER-PERM-UI-002 ADMIN is shown as NOT a confirmer, but as able to reopen', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><PermissionsTab /></QueryClientProvider>);
    const confirm = await row('handover-readiness-confirm');
    const reopen = await row('handover-readiness-reopen');
    expect(confirm.querySelector('td[data-admin-allowed]')?.getAttribute('data-admin-allowed')).toBe('false');
    expect(reopen.querySelector('td[data-admin-allowed]')?.getAttribute('data-admin-allowed')).toBe('true');
    expect(within(confirm).getByRole('button', { name: /OPERATION: đang cho phép/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('HANDOVER-PERM-UI-003 pre-existing rows are unchanged: every module row and proposal-send-external keep ADMIN allowed', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><PermissionsTab /></QueryClientProvider>);
    await row('proposal-send-external');
    const cells = Array.from(document.querySelectorAll('tr[data-permission] td[data-admin-allowed]'));
    const denied = cells
      .filter((td) => td.getAttribute('data-admin-allowed') === 'false')
      .map((td) => td.closest('tr')!.getAttribute('data-permission'));
    // The ONLY row where ADMIN is not allowed is the handover confirm action.
    expect(denied).toEqual(['handover-readiness-confirm']);
    expect(cells.length).toBeGreaterThan(30); // all module rows + action rows rendered
  });
});

describe('canPerformAction -- ADMIN follows the explicit action grant (mirrors backend)', () => {
  it('HANDOVER-PERM-UI-004 unchanged for every action that existed before this CR', () => {
    expect(canPerformAction('ADMIN', 'proposal-send-external')).toBe(true);
  });
  it('HANDOVER-PERM-UI-005 ADMIN is not a confirmer, but can view/manage/risk-manage/reopen', () => {
    expect(canPerformAction('ADMIN', 'handover-readiness-confirm')).toBe(false);
    for (const a of ['handover-readiness-view', 'handover-readiness-manage', 'handover-readiness-risk-manage', 'handover-readiness-reopen'] as const) {
      expect(canPerformAction('ADMIN', a)).toBe(true);
    }
    // Only confirm omits ADMIN among all action permissions.
    expect(Object.entries(ACTION_PERMISSIONS).filter(([, roles]) => !roles.includes('ADMIN')).map(([k]) => k)).toEqual(['handover-readiness-confirm']);
  });
});
