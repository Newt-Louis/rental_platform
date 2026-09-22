/**
 * CR-SPACES-FLOOR-MAP-UX-001 SPACE-MAP-FILTER-01 — the map and the list agree.
 *
 * The map used to fetch its floor straight from the floor-plan endpoint and
 * ignore every filter on the page around it. "Trống, 50-200 m²" listed four
 * spaces and drew forty, and a leasing executive reading the plan was reading
 * the wrong availability. These tests hold the two views to one population.
 *
 * They deliberately mock the units endpoint rather than re-deriving what the
 * server would return: the filtering itself is the server's, and what has to be
 * proved here is that both views consume the same answer for the same filters.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/lib/i18n';

const api = vi.hoisted(() => ({
  listFloors: vi.fn(),
  listUnits: vi.fn(),
  getFloorMapData: vi.fn(),
  getUnit: vi.fn(),
  deleteUnit: vi.fn(),
  deleteFloor: vi.fn(),
  getOptions: vi.fn(),
  getSummaries: vi.fn(),
  handoverList: vi.fn(),
}));

vi.mock('@/api', () => ({
  spacesApi: {
    listFloors: api.listFloors,
    listUnits: api.listUnits,
    getFloorMapData: api.getFloorMapData,
    getUnit: api.getUnit,
    deleteUnit: api.deleteUnit,
    deleteFloor: api.deleteFloor,
  },
  categoriesApi: { getOptions: api.getOptions },
  slotsApi: { getSummaries: api.getSummaries },
  handoverReadinessApi: { list: api.handoverList },
}));

// Not under test here, and each one opens queries of its own.
vi.mock('@/components/spaces/UnitDetailSheet', () => ({ UnitDetailSheet: () => null }));
vi.mock('@/components/spaces/AnalyticsView', () => ({ AnalyticsView: () => null }));
vi.mock('@/components/spaces/SpacesAlerts', () => ({ SpacesAlerts: () => null }));
vi.mock('@/components/MallMapEditor', () => ({ MallMapEditor: () => null }));
vi.mock('@/components/FloorPlan', () => ({ FloorPlan: () => null }));
vi.mock('@/components/spaces/dialogs/CreateEditUnitDialog', () => ({ CreateEditUnitDialog: () => null }));
vi.mock('@/components/spaces/dialogs/CreateEditFloorDialog', () => ({ CreateEditFloorDialog: () => null }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import SpacesPage from './SpacesPage';
import { useMallStore } from '@/store/mall.store';
import { useAuthStore } from '@/store/auth.store';

beforeAll(() => i18n.changeLanguage('vi'));

// ── Fixture: one floor whose units differ on every filterable dimension ───────

const FLOOR = { id: 'f1', mallId: 'mall-1', name: 'Tầng B1', level: 'B1', sortOrder: 1 };
const FLOOR_2 = { id: 'f2', mallId: 'mall-1', name: 'Tầng L1', level: 'L1', sortOrder: 2 };

const poly = (x: number): [number, number][] => [[x, 10], [x + 8, 10], [x + 8, 24], [x, 24]];

const U = (over: Record<string, unknown>) => ({
  mallId: 'mall-1', floorId: 'f1', areaGFA: 0, camPerSqm: 0,
  currencyCode: 'VND', baseRentPerSqm: 800000, leaseTermType: 'LONG',
  ...over,
}) as any;

const ALL_UNITS = [
  U({ id: 'u1', code: 'B1-01', status: 'VACANT', areaNLA: 120, category: 'F&B', mapPolygon: poly(2) }),
  U({ id: 'u2', code: 'B1-02', status: 'OCCUPIED', areaNLA: 640, category: 'Fashion', mapPolygon: poly(12), tenant: { brandName: 'Uniqlo' } }),
  U({ id: 'u3', code: 'B1-03', status: 'VACANT', areaNLA: 900, category: 'Fashion', mapPolygon: poly(22) }),
  U({ id: 'u4', code: 'B1-04', status: 'BOOKING', areaNLA: 60, category: 'F&B', mapPolygon: poly(32), currencyCode: 'USD', baseRentPerSqm: 28 }),
  // Short-term zone: the page partitions on lease type before anything else.
  U({ id: 'u5', code: 'B1-05', status: 'VACANT', areaNLA: 12, category: 'F&B', mapPolygon: poly(42), leaseTermType: 'SHORT' }),
  // Another floor entirely.
  U({ id: 'u6', code: 'L1-01', status: 'VACANT', areaNLA: 200, floorId: 'f2', category: 'F&B', mapPolygon: poly(52) }),
];

const onFloor1 = ALL_UNITS.filter((u) => u.floorId === 'f1');

/** Stand-in for the server: the page's query params decide what comes back. */
function serverFilter(params: Record<string, any>) {
  return ALL_UNITS.filter((u) => {
    if (params.floorId && u.floorId !== params.floorId) return false;
    if (params.leaseTermType && u.leaseTermType !== params.leaseTermType) return false;
    if (params.status && u.status !== params.status) return false;
    if (params.category && u.category !== params.category) return false;
    if (params.minArea && u.areaNLA < +params.minArea) return false;
    if (params.maxArea && u.areaNLA > +params.maxArea) return false;
    if (params.minRent && u.baseRentPerSqm < +params.minRent) return false;
    if (params.maxRent && u.baseRentPerSqm > +params.maxRent) return false;
    if (params.search && !u.code.toLowerCase().includes(String(params.search).toLowerCase())) return false;
    return true;
  });
}

function renderPage(query: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/spaces${query}`]}>
      <QueryClientProvider client={qc}><SpacesPage /></QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Parameters of the most recent units request. */
const lastUnitsQuery = () => api.listUnits.mock.calls[api.listUnits.mock.calls.length - 1][0];

/** Codes the map is actually drawing (hit layer = what a reader can click). */
const mapCodes = () => Array.from(document.querySelectorAll('[data-testid^="map-hit-"]'))
  .map((el) => el.getAttribute('data-testid')!.replace('map-hit-', '')).sort();

/** Codes the grid is actually listing. */
const gridCodes = () => onFloor1.concat(ALL_UNITS)
  .map((u) => u.code)
  .filter((code, i, arr) => arr.indexOf(code) === i)
  .filter((code) => screen.queryAllByText(code).length > 0)
  .sort();

beforeEach(() => {
  vi.clearAllMocks();
  useMallStore.setState({ selectedMallId: 'mall-1', selectedMallName: 'Mall 1' });
  useAuthStore.setState({ user: { id: 'admin', role: 'ADMIN', fullName: 'Admin' } } as any);
  api.listFloors.mockResolvedValue([FLOOR, FLOOR_2]);
  api.getOptions.mockResolvedValue([{ id: 'c1', name: 'F&B' }, { id: 'c2', name: 'Fashion' }]);
  api.getSummaries.mockResolvedValue({});
  api.handoverList.mockResolvedValue({ items: [], kpis: {} });
  api.listUnits.mockImplementation(async (params: any) => ({ data: serverFilter(params), total: 0, page: 1 }));
  // The floor-plan endpoint keeps returning the WHOLE floor, as it always has.
  // Nothing the page filters may leak back in through this door.
  api.getFloorMapData.mockResolvedValue({
    ...FLOOR, floorPlanUrl: '/uploads/b1.png', floorPlanRatio: 1.6, units: onFloor1,
  });
});

// ── Population agreement ──────────────────────────────────────────────────────

describe('SPACE-MAP-FILTER map and grid show the same units', () => {
  const cases: Array<[string, string, string[]]> = [
    ['001 status', '?status=VACANT', ['B1-01', 'B1-03']],
    ['002 area', '?minArea=100&maxArea=700', ['B1-01', 'B1-02']],
    ['003 category', '?category=Fashion', ['B1-02', 'B1-03']],
    ['004 rent', '?minRent=500000', ['B1-01', 'B1-02', 'B1-03']],
    ['006 lease type', '?leaseTerm=SHORT', ['B1-05']],
    ['007 combined status+area', '?status=VACANT&minArea=100', ['B1-01', 'B1-03']],
    ['007 combined category+area', '?category=Fashion&maxArea=700', ['B1-02']],
    ['007 combined rent+status', '?status=VACANT&minRent=500000', ['B1-01', 'B1-03']],
    ['007 search', '?search=B1-0', ['B1-01', 'B1-02', 'B1-03', 'B1-04']],
  ];

  for (const [name, query, expected] of cases) {
    it(`SPACE-MAP-FILTER-${name} narrows the map exactly as it narrows the list`, async () => {
      const { unmount } = renderPage(`?view=map&floor=f1${query.replace('?', '&')}`);
      await waitFor(() => expect(document.querySelector('[data-testid^="map-hit-"]')).toBeTruthy(), { timeout: 4000 });
      expect(mapCodes()).toEqual(expected);
      unmount();

      renderPage(`?view=grid&floor=f1${query.replace('?', '&')}`);
      await waitFor(() => expect(screen.queryAllByText(expected[0]).length).toBeGreaterThan(0), { timeout: 4000 });
      expect(gridCodes()).toEqual(expected);
    });
  }

  it('SPACE-MAP-FILTER-005 applies the readiness filter, which is resolved on the client, to the map too', async () => {
    api.handoverList.mockResolvedValue({
      items: [
        { unitId: 'u1', evaluation: { status: 'OVERDUE', deadlineLevel: 'OVERDUE' } },
        { unitId: 'u3', evaluation: { status: 'AT_RISK', deadlineLevel: 'D30' } },
      ],
      kpis: {},
    });
    renderPage('?view=map&floor=f1&handover=OVERDUE');
    await waitFor(() => expect(document.querySelector('[data-testid^="map-hit-"]')).toBeTruthy(), { timeout: 4000 });
    expect(mapCodes()).toEqual(['B1-01']);
  });

  it('never lets the floor-plan endpoint put a filtered-out unit back on the map', async () => {
    // The endpoint returns all five B1 units; the filter matched two.
    renderPage('?view=map&floor=f1&status=VACANT');
    await waitFor(() => expect(document.querySelector('[data-testid^="map-hit-"]')).toBeTruthy(), { timeout: 4000 });
    expect(mapCodes()).toEqual(['B1-01', 'B1-03']);
    expect(screen.queryByTestId('map-hit-B1-02')).toBeNull();
    expect(screen.queryByTestId('map-unit-B1-02')).toBeNull();
  });

  it('asks the server for the floor it is drawing, so a page limit cannot truncate it', async () => {
    renderPage('?view=map&floor=f1');
    await waitFor(() => expect(api.listUnits).toHaveBeenCalled());
    expect(lastUnitsQuery()).toMatchObject({ floorId: 'f1', mallId: 'mall-1', leaseTermType: 'LONG' });
  });

  it('SPACE-MAP-FILTER-019 leaves rent comparison to the one server contract, adding no currency of its own', async () => {
    // B1-04 is quoted 28 USD. The server contract compares the raw number, so a
    // "min 500.000" filter drops it -- the map must not rescue it by comparing
    // some other field, nor convert anything.
    renderPage('?view=map&floor=f1&minRent=500000');
    await waitFor(() => expect(document.querySelector('[data-testid^="map-hit-"]')).toBeTruthy(), { timeout: 4000 });
    expect(mapCodes()).not.toContain('B1-04');
    const sent = lastUnitsQuery();
    expect(sent.minRent).toBe('500000');
    expect(Object.keys(sent)).not.toContain('currency');
  });

  it('SPACE-MAP-FILTER-020 passes the category the page holds, without matching on the label shown', async () => {
    renderPage('?view=map&floor=f1&category=Fashion');
    await waitFor(() => expect(api.listUnits).toHaveBeenCalled());
    // Whatever identity the page's canonical filter uses, the map inherits it
    // rather than comparing the text drawn on a polygon.
    expect(lastUnitsQuery().category).toBe('Fashion');
  });
});

// ── KPI, state and empty results ──────────────────────────────────────────────

describe('SPACE-MAP-KPI the strip describes what is drawn', () => {
  it('SPACE-MAP-FILTER-008 and 009 count and measure only the filtered units', async () => {
    renderPage('?view=map&floor=f1&status=VACANT');
    const strip = await screen.findByTestId('map-kpi-strip', {}, { timeout: 4000 });

    // Two vacant units of 120 and 900 m2 -- not the whole floor's five.
    expect(within(strip).getByText('Tổng mặt bằng').nextElementSibling).toHaveTextContent('2');
    expect(within(strip).getByText('Trống').nextElementSibling).toHaveTextContent('2');
    expect(within(strip).getByText('Tổng diện tích').nextElementSibling).toHaveTextContent('1.020');
  });

  it('SPACE-MAP-FILTER-010 computes occupancy over the filtered units, not the floor', async () => {
    renderPage('?view=map&floor=f1&minArea=100&maxArea=700');
    const strip = await screen.findByTestId('map-kpi-strip', {}, { timeout: 4000 });
    // B1-01 vacant 120 + B1-02 occupied 640 => 640/760 = 84%.
    expect(within(strip).getByText('Tỷ lệ lấp đầy').nextElementSibling).toHaveTextContent('84%');
  });

  it('SPACE-MAP-FILTER-013 keeps the plan visible when nothing matches, and offers a way out', async () => {
    renderPage('?view=map&floor=f1&status=LIQUIDATED');
    const note = await screen.findByTestId('map-empty-filter', {}, { timeout: 4000 });

    expect(note).toBeInTheDocument();
    expect(screen.getByTestId('map-cad-layer')).toBeInTheDocument();   // CAD stays
    expect(within(note).getByRole('button', { name: /Xóa/i })).toBeInTheDocument();
  });

  it('SPACE-MAP-FILTER-014 brings the units back when the filter is cleared', async () => {
    const user = (await import('@testing-library/user-event')).default;
    renderPage('?view=map&floor=f1&status=LIQUIDATED');
    const note = await screen.findByTestId('map-empty-filter', {}, { timeout: 4000 });

    await user.click(within(note).getByRole('button', { name: /Xóa/i }));

    await waitFor(() => expect(mapCodes().length).toBeGreaterThan(0), { timeout: 4000 });
    expect(mapCodes()).toContain('B1-02');
  });
});

describe('SPACE-MAP-FILTER state left behind by a filter change', () => {
  it('SPACE-MAP-FILTER-011 and 012 close the panel and drop the hover for a unit that is filtered away', async () => {
    const user = (await import('@testing-library/user-event')).default;
    const { fireEvent } = await import('@testing-library/react');
    renderPage('?view=map&floor=f1');
    await screen.findByTestId('map-hit-B1-02', {}, { timeout: 4000 });

    await user.click(screen.getByTestId('map-hit-B1-02'));
    expect(await screen.findByTestId('map-unit-panel')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByTestId('map-hit-B1-02'));
    await waitFor(() => expect(screen.getByTestId('map-unit-B1-02').querySelector('[data-elevation]'))
      .toHaveAttribute('data-elevation', 'selected'));

    // Narrow the page filter, in place, to something B1-02 does not match.
    await user.type(screen.getByLabelText('Tìm theo tên, mã...'), 'B1-01');

    await waitFor(() => expect(screen.queryByTestId('map-hit-B1-02')).toBeNull(), { timeout: 4000 });
    // Nothing of the vanished unit is left behind: no panel, no raised polygon.
    expect(screen.queryByTestId('map-unit-panel')).toBeNull();
    expect(screen.queryByTestId('map-unit-B1-02')).toBeNull();
    expect(mapCodes()).toEqual(['B1-01']);
  });

  it('SPACE-MAP-FILTER-015 keeps the reader’s zoom when the filters change', async () => {
    const user = (await import('@testing-library/user-event')).default;
    renderPage('?view=map&floor=f1');
    await screen.findByTestId('map-hit-B1-02', {}, { timeout: 4000 });

    await user.click(screen.getByRole('button', { name: 'Phóng to' }));
    await waitFor(() => expect(screen.getByTestId('map-zoom-level')).toHaveTextContent('140%'));

    // Changing what is shown is not a reason to throw away where the reader is.
    await user.type(screen.getByLabelText('Tìm theo tên, mã...'), 'B1-01');

    await waitFor(() => expect(mapCodes()).toEqual(['B1-01']), { timeout: 4000 });
    expect(screen.getByTestId('map-zoom-level')).toHaveTextContent('140%');
  });

  it('SPACE-MAP-FILTER-016 shows one floor selector, owned by the page', async () => {
    renderPage('?view=map&floor=f1');
    await screen.findByTestId('map-kpi-strip', {}, { timeout: 4000 });
    expect(screen.queryByTestId('map-floor-nav')).toBeNull();
    expect(screen.queryByText('Tất cả tầng')).toBeNull();
  });

  it('shows the filter bar in map view, so an active filter is never invisible', async () => {
    renderPage('?view=map&floor=f1&status=VACANT');
    await screen.findByTestId('map-kpi-strip', {}, { timeout: 4000 });
    expect(screen.getByLabelText('Tìm theo tên, mã...')).toBeInTheDocument();
  });
});
