/**
 * CR-NOTIFICATION-RECIPIENT-ROUTING -- the admin screen must reflect the backend
 * registry, never invent its own policy: Group C is read-only, Group B can only
 * add copies, and an ineligible user cannot be picked.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({
  routing: { listEvents: vi.fn(), candidates: vi.fn(), upsert: vi.fn(), reset: vi.fn(), sendTest: vi.fn() },
  spaces: { listMalls: vi.fn() },
}));
vi.mock('@/api/notification-routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/notification-routing')>();
  return { ...actual, notificationRoutingApi: api.routing };
});
vi.mock('@/api', () => ({ spacesApi: api.spaces }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { NotificationRoutingTab } from './NotificationRoutingTab';

const event = (over: Record<string, unknown> = {}) => ({
  eventKey: 'HANDOVER_READINESS_WEEKLY_DIGEST',
  displayNameVi: 'Bàn giao mặt bằng — báo cáo tuần',
  descriptionVi: 'Tổng hợp tình hình bàn giao.',
  defaultRecipientRuleVi: 'Giám đốc Mall + Leasing Manager',
  category: 'INTERNAL_ROLE_ROUTED',
  scope: 'MALL',
  configurable: true,
  allowedModes: ['DEFAULT', 'REPLACE', 'DEFAULT_PLUS_CC'],
  requiredActionPermission: 'handover-readiness-view',
  eligibleRoles: ['ADMIN'],
  transport: 'QUEUED',
  producer: 'x',
  mode: 'DEFAULT',
  version: null,
  updatedAt: null,
  updatedById: null,
  recipients: [],
  ...over,
});
const invoiceEvent = event({
  eventKey: 'INVOICE_ISSUED',
  displayNameVi: 'Hóa đơn đã phát hành',
  defaultRecipientRuleVi: 'Email liên hệ của khách thuê / bên thanh toán trên hồ sơ',
  category: 'EXTERNAL_BUSINESS_RECIPIENT',
  allowedModes: ['DEFAULT', 'DEFAULT_PLUS_CC'],
});
const approvalEvent = event({
  eventKey: 'PROPOSAL_APPROVAL_REQUIRED',
  displayNameVi: 'Tờ trình chờ phê duyệt',
  defaultRecipientRuleVi: 'Người duyệt hiện tại theo Chính sách phê duyệt',
  category: 'WORKFLOW_APPROVER',
  configurable: false,
  allowedModes: ['DEFAULT'],
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><NotificationRoutingTab /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.spaces.listMalls.mockResolvedValue([{ id: 'mall-a', name: 'Mall A' }]);
  api.routing.candidates.mockResolvedValue([
    { id: 'u1', fullName: 'Ops One', email: 'o1@x.test', role: 'OPERATION', eligible: true, reasonCodes: [] },
    { id: 'u2', fullName: 'Ngoài Mall', email: 'o2@x.test', role: 'LEASING_MANAGER', eligible: false, reasonCodes: ['NO_MALL_ACCESS'] },
  ]);
  api.routing.upsert.mockResolvedValue(event({ mode: 'REPLACE' }));
});

describe('NotificationRoutingTab', () => {
  it('NOTIF-UI-001 groups events and shows each default rule verbatim', async () => {
    api.routing.listEvents.mockResolvedValue({ mallId: 'mall-a', items: [event(), invoiceEvent, approvalEvent] });
    renderTab();
    expect(await screen.findByText('Bàn giao mặt bằng — báo cáo tuần')).toBeInTheDocument();
    expect(screen.getByText('Giám đốc Mall + Leasing Manager')).toBeInTheDocument();
    expect(screen.getByText('Email liên hệ của khách thuê / bên thanh toán trên hồ sơ')).toBeInTheDocument();
    expect(screen.getByText('Thông báo nội bộ — có thể đổi người nhận')).toBeInTheDocument();
    expect(screen.getByText('Gửi khách / đối tác — chỉ thêm bản sao nội bộ')).toBeInTheDocument();
  });

  it('NOTIF-UI-002 Group C is read-only and points at the approval policy', async () => {
    api.routing.listEvents.mockResolvedValue({ mallId: 'mall-a', items: [approvalEvent] });
    renderTab();
    const row = (await screen.findByText('Tờ trình chờ phê duyệt')).closest('[data-event]') as HTMLElement;
    expect(within(row).getByText(/sửa tại tab/i)).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Gửi thử/ })).not.toBeInTheDocument();
  });

  it('NOTIF-UI-003 Group B offers only copy modes and says the customer address cannot change', async () => {
    api.routing.listEvents.mockResolvedValue({ mallId: 'mall-a', items: [invoiceEvent] });
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
    const modes = within(screen.getByLabelText('Chế độ định tuyến')).getAllByRole('option').map((o) => o.textContent);
    expect(modes).toEqual(['Mặc định', 'Mặc định + gửi thêm bản sao']);
    expect(screen.getByText(/Người nhận chính là địa chỉ trên hồ sơ/)).toBeInTheDocument();
  });

  it('NOTIF-UI-004 an ineligible candidate cannot be selected and its reason is shown', async () => {
    api.routing.listEvents.mockResolvedValue({ mallId: 'mall-a', items: [event()] });
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
    await userEvent.selectOptions(screen.getByLabelText('Chế độ định tuyến'), 'REPLACE');
    expect(await screen.findByLabelText('Ngoài Mall')).toBeDisabled();
    expect(screen.getByText('Không có quyền vào Mall này')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled(); // nothing picked yet
  });

  it('NOTIF-UI-005 saving sends the picked users with the concurrency token', async () => {
    api.routing.listEvents.mockResolvedValue({ mallId: 'mall-a', items: [event({ mode: 'REPLACE', version: 3, recipients: [] })] });
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
    await userEvent.click(await screen.findByLabelText('Ops One'));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(api.routing.upsert).toHaveBeenCalledWith('HANDOVER_READINESS_WEEKLY_DIGEST', 'mall-a', {
      mode: 'REPLACE',
      recipients: [{ userId: 'u1', recipientType: 'TO' }],
      expectedVersion: 3,
    }));
  });

  it('NOTIF-UI-006 reset is offered only once the event is overridden', async () => {
    api.routing.listEvents.mockResolvedValueOnce({ mallId: 'mall-a', items: [event()] });
    const { unmount } = renderTab();
    expect(await screen.findByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mặc định$/ })).not.toBeInTheDocument();
    unmount();

    api.routing.listEvents.mockResolvedValueOnce({ mallId: 'mall-a', items: [event({ mode: 'REPLACE', version: 1 })] });
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: /Mặc định/ }));
    await waitFor(() => expect(api.routing.reset).toHaveBeenCalledWith('HANDOVER_READINESS_WEEKLY_DIGEST', 'mall-a'));
  });

  it('NOTIF-UI-007 a 403 explains the missing permission instead of rendering an empty screen', async () => {
    api.routing.listEvents.mockRejectedValue({ response: { status: 403, data: { message: 'x' } } });
    renderTab();
    expect(await screen.findByText(/không có quyền cấu hình người nhận/i)).toBeInTheDocument();
  });

  it('NOTIF-UI-008 search narrows the list by name, key or description', async () => {
    api.routing.listEvents.mockResolvedValue({ mallId: 'mall-a', items: [event(), invoiceEvent, approvalEvent] });
    renderTab();
    expect(await screen.findByText('Hóa đơn đã phát hành')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Tìm sự kiện'), 'INVOICE_ISSUED');
    expect(screen.getByText('Hóa đơn đã phát hành')).toBeInTheDocument();
    expect(screen.queryByText('Bàn giao mặt bằng — báo cáo tuần')).not.toBeInTheDocument();
    expect(screen.queryByText('Tờ trình chờ phê duyệt')).not.toBeInTheDocument();
  });

  it('NOTIF-UI-009 the category filter keeps only that group', async () => {
    api.routing.listEvents.mockResolvedValue({ mallId: 'mall-a', items: [event(), invoiceEvent, approvalEvent] });
    renderTab();
    await screen.findByText('Hóa đơn đã phát hành');
    await userEvent.selectOptions(screen.getByLabelText('Lọc theo nhóm'), 'WORKFLOW_APPROVER');
    expect(screen.getByText('Tờ trình chờ phê duyệt')).toBeInTheDocument();
    expect(screen.queryByText('Hóa đơn đã phát hành')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Tìm sự kiện'), 'không-khớp-gì-cả');
    expect(screen.getByText('Không có sự kiện nào khớp bộ lọc.')).toBeInTheDocument();
  });

  it('NOTIF-UI-010 shows who changed a configured event, and says so when nothing is configured', async () => {
    api.routing.listEvents.mockResolvedValue({
      mallId: 'mall-a',
      items: [
        event({ mode: 'REPLACE', version: 2, updatedAt: '2026-09-21T03:00:00.000Z', updatedById: 'admin-1' }),
        invoiceEvent,
      ],
    });
    renderTab();
    const configured = (await screen.findByText('Bàn giao mặt bằng — báo cáo tuần')).closest('[data-event]') as HTMLElement;
    expect(within(configured).getByText(/Sửa lần cuối/)).toHaveTextContent('admin-1');
    const untouched = screen.getByText('Hóa đơn đã phát hành').closest('[data-event]') as HTMLElement;
    expect(within(untouched).getByText(/Chưa cấu hình/)).toBeInTheDocument();
  });
});
