import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { patrolApi, usersApi } from '@/api';
import PatrolPage from './PatrolPage';

// Renders the current URL's querystring into the DOM so tests can assert on it directly —
// MemoryRouter keeps its own in-memory history and never touches window.location.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="url-probe">{location.pathname}{location.search}</div>;
}

// Notification Deep-Link Completeness Wave: PatrolPage's selected shift now lives in the URL
// (?id=...), not local state, so a notification's /patrol?id=<shiftId> link opens the exact
// shift. These tests cover the URL-driven-selection contract itself, not the page's full
// feature surface (routes/schedules/reports are left as empty defaults throughout).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'vi' },
  }),
}));

vi.mock('@/api', () => ({
  usersApi: { listUsers: vi.fn() },
  patrolApi: {
    routes: vi.fn(), schedules: vi.fn(), shifts: vi.fn(), summary: vi.fn(), report: vi.fn(),
    shift: vi.fn(), createRoute: vi.fn(), updateRoute: vi.fn(), addPoint: vi.fn(), updatePoint: vi.fn(),
    deletePoint: vi.fn(), reorderPoints: vi.fn(), createShift: vi.fn(), start: vi.fn(), complete: vi.fn(),
    cancelShift: vi.fn(), reassignShift: vi.fn(), check: vi.fn(), evidence: vi.fn(), createSchedule: vi.fn(),
    updateSchedule: vi.fn(), deleteSchedule: vi.fn(),
  },
}));

vi.mock('@/store/mall.store', () => ({
  useMallStore: (selector: (state: { selectedMallId: string; selectedMallName: string }) => unknown) =>
    selector({ selectedMallId: 'mall-1', selectedMallName: 'Thiso Mall Sala' }),
}));

const SHIFT_DETAIL = {
  id: 'shift-1',
  shiftNumber: 'PS-2026-001',
  status: 'COMPLETED',
  route: { name: 'Tuyến chính' },
  assigneeId: null,
  cancelReason: null,
  checks: [],
};

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <LocationProbe />
        <Routes>
          <Route path="/patrol" element={<PatrolPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('PatrolPage — URL-driven shift selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.listUsers).mockResolvedValue({ data: [] } as never);
    vi.mocked(patrolApi.routes).mockResolvedValue([] as never);
    vi.mocked(patrolApi.schedules).mockResolvedValue([] as never);
    vi.mocked(patrolApi.shifts).mockResolvedValue({ data: [], total: 0 } as never);
    vi.mocked(patrolApi.summary).mockResolvedValue({} as never);
    vi.mocked(patrolApi.report).mockResolvedValue({} as never);
  });

  it('opens the exact shift when the URL already carries ?id= on first load (fresh session / direct link / refresh)', async () => {
    vi.mocked(patrolApi.shift).mockResolvedValue(SHIFT_DETAIL as never);

    renderAt('/patrol?id=shift-1');

    expect(await screen.findByText('PS-2026-001', { exact: false })).toBeInTheDocument();
    expect(patrolApi.shift).toHaveBeenCalledWith('shift-1');
  });

  it('fails gracefully for a nonexistent shift id instead of breaking the page', async () => {
    vi.mocked(patrolApi.shift).mockRejectedValue(new Error('Not Found'));

    renderAt('/patrol?id=does-not-exist');

    expect(await screen.findByText('Không tìm thấy ca tuần tra')).toBeInTheDocument();
    expect(screen.getByText('Ca tuần tra này không tồn tại hoặc đã bị xóa.')).toBeInTheDocument();
  });

  it('closing the detail removes only ?id, preserving every other query param', async () => {
    vi.mocked(patrolApi.shift).mockResolvedValue(SHIFT_DETAIL as never);

    renderAt('/patrol?id=shift-1&tab=maintenance&mallId=mall-9');
    await screen.findByText('PS-2026-001', { exact: false });
    expect(screen.getByTestId('url-probe')).toHaveTextContent('/patrol?id=shift-1&tab=maintenance&mallId=mall-9');

    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons.find((b) => b.querySelector('svg.lucide-x'));
    await userEvent.setup().click(closeButton!);

    await screen.findByText((_, node) => node?.textContent === '/patrol?tab=maintenance&mallId=mall-9', {
      selector: '[data-testid="url-probe"]',
    });
  });

  it('does not fetch a shift at all when the URL has no ?id (no dead/erroneous request)', async () => {
    renderAt('/patrol');
    await screen.findByText('Thiso Mall Sala', { exact: false }).catch(() => undefined);
    expect(patrolApi.shift).not.toHaveBeenCalled();
  });
});
