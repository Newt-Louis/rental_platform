/**
 * Replacing the person in charge of approvals in one place (APPROVER-REPLACE UI).
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({
  listApproversInUse: vi.fn(),
  listPolicyApproverCandidates: vi.fn(),
  replaceApprover: vi.fn(),
}));
vi.mock('@/api', () => ({ approvalsApi: api }));
const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { ApproverReplacementPanel } from './ApproverReplacementPanel';

function renderPanel(mallId = 'mall-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><ApproverReplacementPanel mallId={mallId} mallName="THISO Mall Sala" /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listApproversInUse.mockResolvedValue([
    { user: { id: 'u-old', fullName: 'Trần Thị B', email: 'b@x', role: 'LEASING_MANAGER', isActive: true }, issues: [], ruleCount: 2, pendingProposalSteps: 3, pendingBookingPriceSteps: 1 },
    { user: { id: 'u-legal', fullName: 'Hoàng Văn E', email: 'e@x', role: 'LEGAL', isActive: false }, issues: ['INACTIVE'], ruleCount: 1, pendingProposalSteps: 0, pendingBookingPriceSteps: 0 },
  ]);
  api.listPolicyApproverCandidates.mockResolvedValue([
    { id: 'u-old', fullName: 'Trần Thị B', role: 'LEASING_MANAGER' },
    { id: 'u-new', fullName: 'Nguyễn Văn K', role: 'LEASING_MANAGER' },
  ]);
});

describe('ApproverReplacementPanel', () => {
  it('lists the people approvals depend on, with rules, pending steps and what would block them', async () => {
    renderPanel();
    const old = await waitFor(() => {
      const row = document.querySelector('tr[data-approver="u-old"]') as HTMLElement | null;
      if (!row) throw new Error('not rendered yet');
      return row;
    });
    expect(old).toHaveTextContent('Trần Thị B');
    expect(old).toHaveTextContent('Hợp lệ');
    expect(old).toHaveTextContent('4 bước');
    const legal = document.querySelector('tr[data-approver="u-legal"]') as HTMLElement;
    expect(legal).toHaveTextContent('Tài khoản đang bị khoá');
    expect(legal).toHaveTextContent('Cần thay người');
    expect(api.listApproversInUse).toHaveBeenCalledWith('mall-1');
  });

  it('replaces the old person with the new one in one action and reports what moved', async () => {
    api.replaceApprover.mockResolvedValue({ rulesUpdated: 2, reassignedProposalSteps: 3, reassignedBookingPriceSteps: 1, skipped: [] });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Thay người phụ trách Trần Thị B' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('replacement-impact')).toHaveTextContent('2 quy tắc và 4 bước đang chờ sẽ chuyển sang người mới');
    const select = within(dialog).getByRole('combobox', { name: 'Người phụ trách mới' });
    // The person being replaced is not offered as their own replacement.
    await waitFor(() => expect(within(select).getByRole('option', { name: /Nguyễn Văn K/ })).toBeInTheDocument());
    expect(within(select).queryByRole('option', { name: /Trần Thị B/ })).toBeNull();

    const confirm = within(dialog).getByRole('button', { name: 'Thay người' });
    expect(confirm).toBeDisabled();
    await userEvent.selectOptions(select, 'u-new');
    await userEvent.click(confirm);

    await waitFor(() => expect(api.replaceApprover).toHaveBeenCalledWith({ mallId: 'mall-1', fromUserId: 'u-old', toUserId: 'u-new' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Đã thay Trần Thị B bằng Nguyễn Văn K',
      description: '2 quy tắc đã cập nhật · 4 bước đang chờ đã chuyển.',
    })));
  });

  it('says which steps stayed with the old person because the new one prepared that file', async () => {
    api.replaceApprover.mockResolvedValue({
      rulesUpdated: 2, reassignedProposalSteps: 2, reassignedBookingPriceSteps: 0,
      skipped: [{ entityType: 'PROPOSAL', entityId: 'p9', reference: 'PRO-2026-00009', stepName: 'Leasing Manager Approval', reason: 'SELF_APPROVAL' }],
    });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Thay người phụ trách Trần Thị B' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Nguyễn Văn K/ })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Người phụ trách mới' }), 'u-new');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thay người' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Proposal PRO-2026-00009 — Leasing Manager Approval');
    expect(alert).toHaveTextContent('người phụ trách mới chính là người lập hồ sơ');
  });

  it('asks for a Mall before showing anyone', () => {
    renderPanel('');
    expect(screen.getByText(/Chọn một Mall/)).toBeInTheDocument();
    expect(api.listApproversInUse).not.toHaveBeenCalled();
  });
});
