/**
 * CR-UNIT-HANDOVER-READINESS -- frontend behaviour. The server is the authority
 * for status and capabilities; these tests pin that the UI (a) only renders
 * what the server says, (b) never shows CONFIRMED before the server commits,
 * and (c) enforces the required inputs before it will even send a request.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({
  getForUnit: vi.fn(), candidates: vi.fn(), start: vi.fn(), list: vi.fn(), changeTargetDate: vi.fn(),
  addRisk: vi.fn(), resolveRisk: vi.fn(), follow: vi.fn(), unfollow: vi.fn(), uploadEvidence: vi.fn(),
  removeEvidence: vi.fn(), confirm: vi.fn(), reopen: vi.fn(), cancel: vi.fn(),
}));
vi.mock('@/api/handover-readiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/handover-readiness')>();
  return { ...actual, handoverReadinessApi: api };
});
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ui/authenticated-image', () => ({
  AuthenticatedImage: ({ alt }: { alt: string }) => <img alt={alt} data-testid="evidence-img" />,
}));

import { HandoverReadinessTab } from './HandoverReadinessTab';
import { HandoverCardBadge, matchesHandoverFilter } from './handoverPresentation';
import { SpacesAlerts } from '../SpacesAlerts';
import { HandoverAnalyticsSection } from './HandoverAnalyticsSection';
import { fmtBusinessDate, businessDaysBetween } from '@/api/handover-readiness';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api', () => ({ spacesApi: { staleVacantUnits: vi.fn().mockResolvedValue({ total: 0 }), expiringLeases: vi.fn().mockResolvedValue({ summary: {} }) } }));

const caps = (over: Partial<Record<string, boolean>> = {}) => ({ view: true, manage: true, riskManage: true, confirm: false, reopen: false, ...over });
const evaluation = (over: Record<string, unknown> = {}) => ({
  status: 'TRACKING', daysRemaining: 20, delayDays: 0, dateChangeCount: 0, deadlineLevel: 'WARNING', slippage: false,
  openHighRiskCount: 0, conflict: null, earliestCommitment: null, riskFlags: ['DEADLINE_WARNING'], ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
  id: 'r1', mallId: 'm1', mallName: 'Mall', unitId: 'u1', unitCode: 'A-101', unitName: null, floorName: 'L1',
  lifecycleStatus: 'TRACKING', status: 'TRACKING', targetReadyDate: '2026-12-01', originalTargetDate: '2026-12-01',
  projectOwner: null, projectOwnerName: 'Anh Tuấn', recordedBy: { id: 'lm', fullName: 'LM' }, confirmedAt: null, confirmedBy: null,
  confirmNote: null, version: 0, evaluation: evaluation(), note: null, commitments: [], risks: [], followers: [], evidence: [],
  stagedEvidenceCount: 0, minConfirmationImages: 3, timeline: [], capabilities: caps(), isFollowing: false,
  sod: { canSelfConfirm: true, reason: null }, ...over,
});
const state = (readiness: any, over: Record<string, unknown> = {}) => ({
  unit: { id: 'u1', code: 'A-101', name: null, mallId: 'm1', isActive: true, status: 'VACANT' },
  capabilities: readiness?.capabilities ?? caps(), canStart: !readiness, readiness, cancelledHistory: [], ...over,
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><HandoverReadinessTab unitId="u1" /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.candidates.mockResolvedValue([{ id: 'op1', fullName: 'Ops One', role: 'OPERATION' }]);
  useAuthStore.setState({ user: { id: 'viewer', role: 'LEASING_MANAGER' } as any });
});

describe('business-date helpers', () => {
  it('format without timezone drift', () => {
    expect(fmtBusinessDate('2026-12-01')).toBe('01/12/2026');
    expect(businessDaysBetween('2026-11-28', '2026-12-03')).toBe(5);
  });
});

describe('HandoverReadinessTab', () => {
  it('HANDOVER-UI-001 tick -> date required -> start sends the exact YYYY-MM-DD date', async () => {
    api.getForUnit.mockResolvedValue(state(null));
    api.start.mockResolvedValue(detail());
    renderTab();
    const tick = await screen.findByRole('checkbox', { name: 'Theo dõi đủ điều kiện bàn giao MB' });
    await userEvent.click(tick);
    const submit = screen.getByRole('button', { name: 'Bắt đầu theo dõi' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Ngày dự kiến bàn giao'), '2026-12-01');
    await userEvent.click(submit);
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('u1', expect.objectContaining({ targetReadyDate: '2026-12-01' })));
  });

  it('HANDOVER-UI-002 users without manage cannot start', async () => {
    api.getForUnit.mockResolvedValue(state(null, { capabilities: caps({ manage: false }), canStart: false }));
    renderTab();
    expect(await screen.findByText(/Bạn không có quyền bắt đầu theo dõi/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('HANDOVER-UI-003 date change shows current/new/difference, flags a delay and requires a reason', async () => {
    api.getForUnit.mockResolvedValue(state(detail()));
    api.changeTargetDate.mockResolvedValue(detail({ targetReadyDate: '2026-12-06', version: 1 }));
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Đổi ngày' }));
    const input = screen.getByLabelText('Ngày mới');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-12-06');
    expect(screen.getByTestId('handover-date-diff')).toHaveTextContent('Lùi 5 ngày');
    const save = screen.getByRole('button', { name: 'Lưu ngày mới' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'Chậm nghiệm thu PCCC');
    await userEvent.click(save);
    await waitFor(() => expect(api.changeTargetDate).toHaveBeenCalledWith('r1', {
      targetReadyDate: '2026-12-06', reason: 'Chậm nghiệm thu PCCC', expectedVersion: 0,
    }));
  });

  it('HANDOVER-UI-004 confirm requires >=3 photos + note, and explains SoD when the viewer is the date setter', async () => {
    api.getForUnit.mockResolvedValue(state(detail({
      capabilities: caps({ confirm: true }),
      stagedEvidenceCount: 3,
      evidence: [1, 2, 3].map((i) => ({ id: `e${i}`, fileName: `p${i}.png`, confirmationEventId: null, downloadPath: `/x/${i}` })),
      sod: { canSelfConfirm: false, reason: 'Bạn là người đặt/cập nhật ngày dự kiến bàn giao gần nhất nên không thể tự xác nhận (tách biệt nhiệm vụ).' },
    })));
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: /Xác nhận đủ điều kiện/ }));
    expect(screen.getByTestId('handover-sod-warning')).toHaveTextContent('tách biệt nhiệm vụ');
    await userEvent.type(screen.getByLabelText('Ghi chú xác nhận'), 'Đủ điều kiện bàn giao');
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it('HANDOVER-UI-005 confirm is disabled with fewer than 3 photos', async () => {
    api.getForUnit.mockResolvedValue(state(detail({ capabilities: caps({ confirm: true }), stagedEvidenceCount: 2 })));
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: /Xác nhận đủ điều kiện/ }));
    expect(screen.getByText(/Cần tối thiểu 3 ảnh/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Ghi chú xác nhận'), 'Đủ điều kiện bàn giao');
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  });

  it('HANDOVER-UI-006 never shows CONFIRMED before the server commits (and not at all on failure)', async () => {
    api.getForUnit.mockResolvedValue(state(detail({ capabilities: caps({ confirm: true }), stagedEvidenceCount: 3 })));
    let reject!: (e: unknown) => void;
    api.confirm.mockReturnValue(new Promise((_, rej) => { reject = rej; }));
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: /Xác nhận đủ điều kiện/ }));
    await userEvent.type(screen.getByLabelText('Ghi chú xác nhận'), 'Đủ điều kiện bàn giao');
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(api.confirm).toHaveBeenCalled();
    expect(screen.queryByText('Đã xác nhận đủ điều kiện bàn giao')).not.toBeInTheDocument();
    reject({ response: { status: 409, data: { message: 'Mặt bằng đã được xác nhận' } } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận' })).not.toBeDisabled());
    expect(screen.queryByText('Đã xác nhận đủ điều kiện bàn giao')).not.toBeInTheDocument();
  });

  it('HANDOVER-UI-007 renders the customer-commitment conflict as a warning with dates, gap and source', async () => {
    api.getForUnit.mockResolvedValue(state(detail({
      status: 'AT_RISK',
      evaluation: evaluation({
        status: 'AT_RISK', riskFlags: ['COMMITMENT_CONFLICT'],
        conflict: { sourceType: 'PROPOSAL', sourceId: 'p1', sourceRef: 'TT-001', commitmentDate: '2026-11-20', projectTargetDate: '2026-12-01', differenceDays: 11,
          message: 'Ngày cam kết bàn giao cho khách sớm hơn ngày Ban dự án dự kiến bàn giao mặt bằng.' },
      }),
    })));
    renderTab();
    const alert = await screen.findByTestId('handover-conflict');
    expect(alert).toHaveTextContent('Ngày cam kết bàn giao cho khách sớm hơn ngày Ban dự án dự kiến bàn giao mặt bằng.');
    expect(alert).toHaveTextContent('01/12/2026');
    expect(alert).toHaveTextContent('20/11/2026');
    expect(alert).toHaveTextContent('11 ngày');
    expect(alert).toHaveTextContent('TT-001');
    expect(alert).toHaveTextContent('không chặn');
  });

  it('HANDOVER-UI-008 reopen is offered only with the reopen capability on a confirmed record', async () => {
    const confirmed = detail({ lifecycleStatus: 'CONFIRMED', status: 'CONFIRMED', evaluation: evaluation({ status: 'CONFIRMED', riskFlags: [] }),
      confirmedAt: '2026-11-30T03:00:00Z', confirmedBy: { id: 'op', fullName: 'Ops' } });
    api.getForUnit.mockResolvedValueOnce(state({ ...confirmed, capabilities: caps({ reopen: false }) }));
    const { unmount } = renderTab();
    expect(await screen.findByText('Đã xác nhận đủ điều kiện bàn giao')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mở lại/ })).not.toBeInTheDocument();
    unmount();
    api.getForUnit.mockResolvedValueOnce(state({ ...confirmed, capabilities: caps({ reopen: true }) }));
    renderTab();
    expect(await screen.findByRole('button', { name: /Mở lại/ })).toBeInTheDocument();
  });

  it('HANDOVER-UI-009 timeline shows date changes old -> new with reason', async () => {
    api.getForUnit.mockResolvedValue(state(detail({
      timeline: [
        { id: 't1', eventType: 'TRACKING_STARTED', occurredAt: '2026-09-01T02:00:00Z', actor: { id: 'lm', fullName: 'LM' }, reason: null, oldDate: null, newDate: '2026-12-01', riskId: null, metadata: null },
        { id: 't2', eventType: 'TARGET_DATE_CHANGED', occurredAt: '2026-09-10T02:00:00Z', actor: { id: 'lm', fullName: 'LM' }, reason: 'Chậm thi công', oldDate: '2026-12-01', newDate: '2026-12-15', riskId: null, metadata: null },
      ],
    })));
    renderTab();
    const tl = await screen.findByTestId('handover-timeline');
    expect(within(tl).getByText('01/12/2026 → 15/12/2026')).toBeInTheDocument();
    expect(within(tl).getByText('“Chậm thi công”')).toBeInTheDocument();
  });
});

describe('grid badge, filter and alerts', () => {
  const summary = (e: Record<string, unknown>) => ({ ...detail(), evaluation: evaluation(e) }) as any;

  it('HANDOVER-UI-010 compact card badge from server evaluation', () => {
    render(<HandoverCardBadge summary={summary({ daysRemaining: 12 })} />);
    expect(screen.getByTestId('handover-card-badge')).toHaveTextContent('MB: Còn 12 ngày');
  });

  it('HANDOVER-UI-011 filter buckets use only server fields', () => {
    expect(matchesHandoverFilter(undefined, 'TRACKED')).toBe(false);
    expect(matchesHandoverFilter(undefined, '')).toBe(true);
    expect(matchesHandoverFilter(summary({ status: 'OVERDUE', deadlineLevel: 'OVERDUE' }), 'OVERDUE')).toBe(true);
    expect(matchesHandoverFilter(summary({ status: 'OVERDUE', deadlineLevel: 'OVERDUE' }), 'DUE_30')).toBe(false);
    expect(matchesHandoverFilter(summary({ deadlineLevel: 'CRITICAL', status: 'AT_RISK' }), 'DUE_30')).toBe(true);
    expect(matchesHandoverFilter(summary({ status: 'CONFIRMED', deadlineLevel: 'NONE' }), 'TRACKED')).toBe(false);
    expect(matchesHandoverFilter(summary({ status: 'CONFIRMED', deadlineLevel: 'NONE' }), 'CONFIRMED')).toBe(true);
  });

  it('HANDOVER-UI-012 aggregated Mall alert navigates to analytics', async () => {
    const open = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <SpacesAlerts mallId="m1" onOpenHandover={open}
          handoverKpis={{ tracking: 5, dueWithin30: 3, dueWithin7: 1, overdue: 2, atRisk: 1, conflicts: 0, highRisks: 0, confirmed: 1 }} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('handover-alert-due')).toHaveTextContent('3 mặt bằng sắp đến hạn bàn giao');
    expect(screen.getByTestId('handover-alert-overdue')).toHaveTextContent('2 mặt bằng đã quá hạn bàn giao');
    await userEvent.click(screen.getByTestId('handover-alert-overdue'));
    expect(open).toHaveBeenCalled();
  });
});

describe('analytics section narrowed by floor', () => {
  const list = (items: any[]) => ({ items, asOf: '2026-09-19', kpis: { tracking: items.length, dueWithin30: 0, dueWithin7: 0, overdue: 0, atRisk: 0, conflicts: 0, highRisks: 0, confirmed: 0 } });
  const renderSection = (props: Record<string, unknown>) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><HandoverAnalyticsSection mallId="m1" {...props} /></QueryClientProvider>);
  };

  it('HANDOVER-UI-013 asks the server for the selected floor only and labels the scope', async () => {
    api.list.mockResolvedValue(list([{ ...detail({ id: 'r1', unitCode: 'L2-05', floorName: 'Tầng 2' }) }]));
    renderSection({ floorId: 'f2', floorName: 'Tầng 2' });
    expect(await screen.findByText('L2-05')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith('m1', 'f2');
    expect(screen.getByTestId('handover-analytics-scope')).toHaveTextContent('Tầng 2');
  });

  it('HANDOVER-UI-014 without a floor it shows the whole Mall', async () => {
    api.list.mockResolvedValue(list([]));
    renderSection({});
    expect(await screen.findByText('Chưa có mặt bằng nào đang được theo dõi bàn giao.')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith('m1', undefined);
    expect(screen.getByTestId('handover-analytics-scope')).toHaveTextContent('Tất cả tầng');
  });

  it('HANDOVER-UI-015 empty floor says so explicitly', async () => {
    api.list.mockResolvedValue(list([]));
    renderSection({ floorId: 'f9', floorName: 'Tầng 9' });
    expect(await screen.findByText('Tầng này chưa có mặt bằng nào đang được theo dõi bàn giao.')).toBeInTheDocument();
  });
});
