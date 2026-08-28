import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationCenter } from './NotificationCenter';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

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
  mockMarkRead.mockResolvedValue({});
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

describe('NotificationCenter — click navigates to the specific record, not just the menu', () => {
  const clickAndExpect = async (notification: Record<string, unknown>, expectedPath: string | null) => {
    mockList.mockResolvedValue({ data: [notification] });
    renderCenter();
    const row = await screen.findByText(notification.title as string);
    await userEvent.setup().click(row);
    if (expectedPath) {
      expect(mockNavigate).toHaveBeenCalledWith(expectedPath);
    } else {
      expect(mockNavigate).not.toHaveBeenCalled();
    }
  };

  it('deep-links a TICKET notification to its ticket id, not the bare ticket list', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, entityType: 'TICKET', entityId: 'ticket-212' },
      '/tickets?id=ticket-212',
    ));

  it('deep-links an INVOICE notification using invoiceId, the exact param BillingPage reads', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Hóa đơn quá hạn', entityType: 'INVOICE', entityId: 'inv-1' },
      '/billing?invoiceId=inv-1',
    ));

  it('deep-links a BOOKING notification using id, the exact param BookingsPage reads', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Booking sắp hết hạn', entityType: 'BOOKING', entityId: 'booking-9' },
      '/bookings?id=booking-9',
    ));

  it('deep-links a LEAD notification using leadId, the exact param CrmPage reads', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Lead mới', entityType: 'LEAD', entityId: 'lead-7' },
      '/crm?leadId=lead-7',
    ));

  it('deep-links a FITOUT notification using projectId, the exact param FitoutPage reads', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Fit-out SLA', entityType: 'FITOUT', entityId: 'project-3' },
      '/fitout?projectId=project-3',
    ));

  it.each([
    ['WORK_ORDER', 'wo-1', '/work-orders?id=wo-1'],
    ['WORK_ORDER_OVERDUE', 'wo-2', '/work-orders?id=wo-2'],
    ['WORK_ORDER_DUE_SOON', 'wo-3', '/work-orders?id=wo-3'],
  ])('deep-links a %s notification to its work order id, the exact param WorkOrdersPage reads', (entityType, entityId, expectedPath) =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Công việc', entityType, entityId },
      expectedPath,
    ));

  it.each([
    ['PATROL_SHIFT', 'shift-1', '/patrol?id=shift-1'],
    ['PATROL_SHIFT_CANCELLED', 'shift-2', '/patrol?id=shift-2'],
    ['PATROL_SHIFT_OVERDUE', 'shift-3', '/patrol?id=shift-3'],
    ['PATROL_CHECK_ESCALATION', 'shift-4', '/patrol?id=shift-4'],
  ])('deep-links a %s notification to its shift id, the exact param PatrolPage reads (previously unmapped: no navigation happened at all)', (entityType, entityId, expectedPath) =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Tuần tra', entityType, entityId },
      expectedPath,
    ));

  it('deep-links a SERVICE_CONTRACT notification to its contract id, the exact param ServiceContractsPage reads (previously unmapped: no navigation happened at all)', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Hợp đồng dịch vụ sắp hết hạn', entityType: 'SERVICE_CONTRACT', entityId: 'svc-1' },
      '/service-contracts?id=svc-1',
    ));

  it('routes a FITOUT_SUBMITTAL notification to the approvals list — no per-submittal view exists yet', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Submittal chờ duyệt', entityType: 'FITOUT_SUBMITTAL', entityId: 'sub-1' },
      '/fitout-approvals',
    ));

  it('routes a FITOUT_ISSUE notification to the fitout list — no per-issue view exists yet', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Vấn đề mới được giao', entityType: 'FITOUT_ISSUE', entityId: 'issue-1' },
      '/fitout',
    ));

  it('does not navigate for an entity type with no destination view yet (e.g. SYSTEM)', () =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: 'Thông báo hệ thống', entityType: 'SYSTEM', entityId: 'sys-1' },
      null,
    ));

  it.each([
    ['TICKET', '/tickets'],
    ['BOOKING', '/bookings'],
    ['WORK_ORDER', '/work-orders'],
    ['PATROL_SHIFT', '/patrol'],
    ['SERVICE_CONTRACT', '/service-contracts'],
  ])('falls back to the bare %s list route (still navigates, just without a specific record) when entityId is missing', (entityType, expectedPath) =>
    clickAndExpect(
      { ...TASK_NOTIFICATION, title: `notif-${entityType}`, entityType, entityId: undefined },
      expectedPath,
    ));
});
