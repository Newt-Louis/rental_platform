import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationCenter } from './NotificationCenter';

// t() returns the raw i18n key in this test environment (no i18next instance
// is initialized here) — consistent with the rest of this codebase's tests,
// see UnifiedAddDialog.test.tsx / LeadEditDialog.test.tsx.

const mockList = vi.fn();
const mockGetUnreadCount = vi.fn();
const mockMarkRead = vi.fn();
const mockMarkAllRead = vi.fn();
const mockApprovalsPending = vi.fn();

vi.mock('@/api', () => ({
  notificationsApi: {
    list: (...args: any[]) => mockList(...args),
    getUnreadCount: (...args: any[]) => mockGetUnreadCount(...args),
    markRead: (...args: any[]) => mockMarkRead(...args),
    markAllRead: (...args: any[]) => mockMarkAllRead(...args),
  },
  approvalsApi: {
    pending: (...args: any[]) => mockApprovalsPending(...args),
  },
}));

const TASK_NOTIFICATION = {
  id: 'n-1',
  title: 'Ticket #212 sắp quá SLA',
  body: 'Còn 40 phút',
  type: 'TICKET_SLA_BREACH',
  entityType: 'TICKET',
  entityId: 'ticket-212',
  isRead: false,
  createdAt: new Date().toISOString(),
};

const INFO_NOTIFICATION = {
  id: 'n-2',
  title: 'Đề xuất đã được duyệt',
  body: 'Đề xuất #1023 đã được phê duyệt',
  type: 'PROPOSAL_APPROVED',
  entityType: 'PROPOSAL',
  entityId: 'proposal-1023',
  isRead: true,
  createdAt: new Date().toISOString(),
};

function renderCenter() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationCenter open onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ data: [TASK_NOTIFICATION, INFO_NOTIFICATION] });
  mockApprovalsPending.mockResolvedValue({ data: [] });
});

describe('NotificationCenter — task/notification split', () => {
  it('renders a Tasks tab and a Notifications tab', async () => {
    renderCenter();
    expect(await screen.findByText('notifications.tabs.tasks')).toBeInTheDocument();
    expect(screen.getByText('notifications.tabs.notifications')).toBeInTheDocument();
  });

  it('shows a task-classified notification (TICKET_SLA_BREACH) in the default Task tab', async () => {
    renderCenter();
    expect(await screen.findByText('Ticket #212 sắp quá SLA')).toBeInTheDocument();
    // The informational notification should not appear in the Task tab
    expect(screen.queryByText('Đề xuất đã được duyệt')).not.toBeInTheDocument();
  });

  it('moves an informational notification (PROPOSAL_APPROVED) to the Notifications tab', async () => {
    renderCenter();
    await screen.findByText('Ticket #212 sắp quá SLA');
    const user = userEvent.setup();
    await user.click(screen.getByText('notifications.tabs.notifications'));
    expect(await screen.findByText('Đề xuất đã được duyệt')).toBeInTheDocument();
    expect(screen.queryByText('Ticket #212 sắp quá SLA')).not.toBeInTheDocument();
  });

  it('surfaces pending approvals inside the Task tab', async () => {
    mockApprovalsPending.mockResolvedValue({ data: [{ id: 'a-1' }, { id: 'a-2' }] });
    renderCenter();
    expect(await screen.findByText('notifications.pendingApprovals')).toBeInTheDocument();
  });

  it('shows a positive empty state in the Task tab when nothing needs action', async () => {
    mockList.mockResolvedValue({ data: [INFO_NOTIFICATION] });
    renderCenter();
    expect(await screen.findByText('notifications.noTasks')).toBeInTheDocument();
  });
});
