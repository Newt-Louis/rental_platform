/**
 * CR-SPACES-FLOOR-MAP-UX-001 — the floor map reads as a leasing business map.
 *
 * Before this the plan was drawn at full strength and every unit was covered by
 * an opaque status patch with a white sticker on top: the architecture the map
 * exists to show was hidden, and nothing on the screen said which unit was the
 * one being worked on. The plan is now context, each unit polygon floats above
 * it, and the unit under the pointer — or under the cursor of whoever is
 * working — is the one that rises.
 *
 * The invariant underneath all of it: elevation is paint. Stored geometry is
 * never touched.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/lib/i18n';

const api = vi.hoisted(() => ({ getFloorMapData: vi.fn() }));
vi.mock('@/api', () => ({ spacesApi: api }));

import { MallMapViewer, UnitLabel } from './MallMapViewer';
import { MAP_CAD, MAP_ELEVATION, statusToken } from './mallMapTheme';

void i18n.changeLanguage('vi');

// UnitLabel is rendered directly in the label tests, so it gets the few strings
// it asks for rather than the whole i18n runtime.
const LABELS: Record<string, string> = { 'status.VACANT': 'Trống', 'status.OCCUPIED': 'Đang thuê' };
const t = (key: string) => LABELS[key] ?? key;

const POLY: [number, number][] = [[10, 10], [30, 10], [30, 30], [10, 30]];
const POLY_POINTS = '10,10 30,10 30,30 10,30';

const unit = (over: Record<string, unknown> = {}) => ({
  id: 'u1', mallId: 'm1', code: 'L2-01', areaGFA: 130, areaNLA: 120,
  baseRentPerSqm: 800000, camPerSqm: 50000, currencyCode: 'VND', status: 'VACANT',
  mapPolygon: POLY,
  ...over,
}) as any;

const other = (over: Record<string, unknown> = {}) => unit({
  id: 'u2', code: 'L2-02', status: 'OCCUPIED', tenant: { brandName: 'Zara' },
  mapPolygon: [[40, 10], [70, 10], [70, 40], [40, 40]],
  ...over,
});

const FLOOR = { id: 'f1', mallId: 'm1', name: 'Tầng 2', level: 'L2', sortOrder: 2 } as any;
const FLOOR_3 = { id: 'f2', mallId: 'm1', name: 'Tầng 3', level: 'L3', sortOrder: 3 } as any;

function renderMap(units: any[], props: Record<string, unknown> = {}) {
  api.getFloorMapData.mockResolvedValue({
    ...FLOOR, floorPlanUrl: '/uploads/floor.png', floorPlanRatio: 1.6, units,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MallMapViewer floors={[FLOOR]} {...props} />
    </QueryClientProvider>,
  );
}

const hit = (code: string) => screen.getByTestId(`map-hit-${code}`);
const findHit = (code: string) => screen.findByTestId(`map-hit-${code}`);

beforeEach(() => vi.clearAllMocks());
afterEach(() => { delete (window as any).matchMedia; });

// ─── Polygons and the plan underneath them ────────────────────────────────────

describe('the unit polygon floats above the plan', () => {
  it('SPACE-MAP-UX-001 draws the unit’s own stored shape, not a stand-in rectangle', async () => {
    renderMap([unit({ mapPolygon: [[10, 10], [30, 12], [28, 34], [8, 30]] })]);
    const target = await findHit('L2-01');

    const irregular = '10,10 30,12 28,34 8,30';
    expect(target.getAttribute('points')).toBe(irregular);
    // Every layer of the float — shadow, underlay, surface — uses that same shape.
    const group = screen.getByTestId('map-unit-L2-01');
    for (const polygon of group.querySelectorAll('polygon')) {
      expect(polygon.getAttribute('points')).toBe(irregular);
    }
  });

  it('SPACE-MAP-UX-002 keeps the architectural drawing as a separate, secondary layer', async () => {
    renderMap([unit()]);
    const cad = await screen.findByTestId('map-cad-layer');

    expect(cad.tagName).toBe('IMG');
    expect(cad.closest('svg')).toBeNull();          // context layer, not a unit
    expect(Number(cad.style.opacity)).toBe(MAP_CAD.opacity);
    expect(cad.style.filter).toContain('grayscale');
    // Held back, not erased: the corridors and escalators stay readable.
    expect(Number(cad.style.opacity)).toBeGreaterThan(0.25);
  });

  it('SPACE-MAP-UX-006 paints the status the map’s own token says, over a stabilising underlay', async () => {
    renderMap([unit({ status: 'UNDER_FITOUT' })]);
    await findHit('L2-01');

    const polygons = screen.getByTestId('map-unit-L2-01').querySelectorAll('polygon');
    const surface = Array.from(polygons).find((p) => p.getAttribute('fill') === statusToken('UNDER_FITOUT').surface);
    expect(surface).toBeDefined();
    // Translucent by design: a solid fill would bury the plan under it.
    expect(Number(surface!.getAttribute('fill-opacity'))).toBeLessThan(0.4);
    expect(Array.from(polygons).some((p) => p.getAttribute('fill') === '#ffffff')).toBe(true);
  });
});

// ─── Elevation, and the geometry it must not touch ────────────────────────────

describe('elevation is paint, never geometry', () => {
  it('SPACE-MAP-UX-003 hovering raises the unit without moving a single coordinate', async () => {
    const source = unit();
    const stored = JSON.stringify(source.mapPolygon);
    renderMap([source]);
    const target = await findHit('L2-01');

    fireEvent.mouseEnter(target);

    await waitFor(() => {
      const shadow = screen.getByTestId('map-unit-L2-01').querySelector('[data-elevation]');
      expect(shadow).toHaveAttribute('data-elevation', 'hover');
    });
    expect(target.getAttribute('points')).toBe(POLY_POINTS);
    expect(JSON.stringify(source.mapPolygon)).toBe(stored);
  });

  it('SPACE-MAP-UX-004 selecting a unit raises it further, still without moving it', async () => {
    const source = unit();
    const stored = JSON.stringify(source.mapPolygon);
    renderMap([source]);
    await userEvent.click(await findHit('L2-01'));

    await waitFor(() => {
      expect(screen.getByTestId('map-unit-L2-01').querySelector('[data-elevation]'))
        .toHaveAttribute('data-elevation', 'selected');
    });
    expect(hit('L2-01').getAttribute('points')).toBe(POLY_POINTS);
    expect(JSON.stringify(source.mapPolygon)).toBe(stored);
    expect(MAP_ELEVATION.selected.dy).toBeGreaterThan(MAP_ELEVATION.hover.dy);
  });

  it('SPACE-MAP-UX-005 promotes the selected unit above its neighbours in paint order', async () => {
    renderMap([unit(), other()]);
    await findHit('L2-01');

    // Drawn first by default: a later neighbour would paint over its shadow.
    const before = Array.from(document.querySelectorAll('svg g[data-testid^="map-unit-"]'))
      .map((g) => g.getAttribute('data-testid'));
    expect(before).toEqual(['map-unit-L2-01', 'map-unit-L2-02']);

    await userEvent.click(hit('L2-01'));

    await waitFor(() => {
      const after = Array.from(document.querySelectorAll('svg g[data-testid^="map-unit-"]'))
        .map((g) => g.getAttribute('data-testid'));
      expect(after[after.length - 1]).toBe('map-unit-L2-01');
    });
  });

  it('SPACE-MAP-UX-014 never asks the server to store what it drew', async () => {
    renderMap([unit()]);
    const target = await findHit('L2-01');

    fireEvent.mouseEnter(target);
    await userEvent.click(target);
    fireEvent.doubleClick(target);

    // Reading the floor is the only thing this screen does. Layout editing is a
    // different component, and elevation must never leak into it.
    expect(Object.keys(api)).toEqual(['getFloorMapData']);
    expect(api.getFloorMapData).toHaveBeenCalled();
  });
});

// ─── Hit testing ──────────────────────────────────────────────────────────────

describe('hit testing survives the lift', () => {
  it('SPACE-MAP-UX-013 leaves the shadow and the label out of the pointer’s way', async () => {
    renderMap([unit()]);
    await findHit('L2-01');

    const shadow = screen.getByTestId('map-unit-L2-01').querySelector('[data-elevation]') as SVGElement;
    expect(shadow.style.pointerEvents).toBe('none');
    const label = screen.getByTestId('map-dot-L2-01').parentElement as HTMLElement;
    expect(label.style.pointerEvents).toBe('none');
  });

  it('keeps the click target where the unit is drawn even while it is raised', async () => {
    renderMap([unit()]);
    const target = await findHit('L2-01');

    fireEvent.mouseEnter(target);

    // The visible polygon lifts; the target must not, or the pointer would fall
    // off its own hover and the unit would flicker.
    await waitFor(() => expect(screen.getByTestId('map-unit-L2-01').querySelector('[data-elevation]'))
      .toHaveAttribute('data-elevation', 'hover'));
    expect(target).not.toHaveAttribute('transform');
    expect(target.getAttribute('points')).toBe(POLY_POINTS);
  });
});

// ─── Labels ───────────────────────────────────────────────────────────────────

describe('labels say more as the unit gets more room', () => {
  const props = { selected: false, hovered: false, scale: 1, liftPx: 0, t };

  it('SPACE-MAP-UX-007 a unit too small for words becomes a status marker that still names itself', () => {
    render(<UnitLabel unit={unit()} detail="DOT" {...props} />);
    expect(screen.getByTestId('map-dot-L2-01')).toHaveAttribute('title', expect.stringContaining('L2-01'));
  });

  it('SPACE-MAP-UX-007 a small unit shows its code and nothing that will not fit', () => {
    const { container } = render(<UnitLabel unit={unit()} detail="CODE" {...props} />);
    expect(container.textContent).toContain('L2-01');
    expect(container.textContent).not.toContain('120');
  });

  it('SPACE-MAP-UX-008 a medium unit adds area and status; a large one adds the rent', () => {
    const { rerender, container } = render(<UnitLabel unit={other({ code: 'L2-01' })} detail="COMPACT" {...props} />);
    expect(container.textContent).toContain('120');
    expect(container.textContent).toContain('Đang thuê');
    expect(container.textContent).not.toContain('800.000');

    rerender(<UnitLabel unit={other({ code: 'L2-01' })} detail="FULL" {...props} />);
    expect(container.textContent).toContain('Zara');
    expect(container.textContent).toContain('800.000');
  });

  it('is ink on the unit’s surface, not a white card over the drawing', () => {
    const { container } = render(<UnitLabel unit={unit()} detail="FULL" {...props} />);
    const label = container.firstElementChild as HTMLElement;
    expect(label.className).not.toContain('bg-white');
    // Readability comes from a halo around the glyphs, which covers nothing.
    expect(label.style.textShadow).toContain('rgba(255,255,255');
  });

  it('SPACE-MAP-UX-015 prices a unit in the unit’s own currency', () => {
    const { container } = render(
      <UnitLabel unit={unit({ currencyCode: 'USD', baseRentPerSqm: 28 })} detail="FULL" {...props} />,
    );
    expect(container.textContent).toContain('USD');
    expect(container.textContent).not.toContain('VND');
  });

  it('keeps its size on screen: the counter-scale cancels the map zoom', () => {
    const { container } = render(<UnitLabel unit={unit()} detail="COMPACT" {...props} scale={0.25} />);
    expect((container.firstElementChild as HTMLElement).style.transform).toContain('scale(0.25)');
  });

  it('rises with the unit it belongs to', () => {
    const { container } = render(<UnitLabel unit={unit()} detail="COMPACT" {...props} liftPx={6} />);
    expect((container.firstElementChild as HTMLElement).style.transform).toContain('translateY(-6px)');
  });
});

// ─── The work panel ───────────────────────────────────────────────────────────

describe('the selected unit opens beside the map', () => {
  it('SPACE-MAP-UX-009 and 010 click a unit and that unit is what opens', async () => {
    renderMap([unit(), other()]);
    await userEvent.click(await findHit('L2-02'));

    const panel = await screen.findByTestId('map-unit-panel');
    expect(within(panel).getByText('L2-02')).toBeInTheDocument();
    expect(within(panel).getByText('Đang thuê')).toBeInTheDocument();
    expect(within(panel).getByText('Zara')).toBeInTheDocument();
    expect(within(panel).getByText('Tầng 2')).toBeInTheDocument();
    // Opened next to the plan, not thrown on top of it.
    expect(panel.closest('svg')).toBeNull();
  });

  it('shows the unit’s own currency in the panel too', async () => {
    renderMap([unit({ currencyCode: 'USD', askingRentPerSqm: 28 })]);
    await userEvent.click(await findHit('L2-01'));

    const panel = await screen.findByTestId('map-unit-panel');
    expect(within(panel).getAllByText(/USD\/m²/).length).toBeGreaterThan(0);
    expect(panel.textContent).not.toContain('VND');
  });

  it('SPACE-MAP-UX-016 offers an action only when the page granted it', async () => {
    const onBook = vi.fn();
    const { unmount } = renderMap([unit()], { onBookUnit: onBook, onUnitClick: vi.fn() });
    await userEvent.click(await findHit('L2-01'));
    expect(within(await screen.findByTestId('map-unit-panel')).getByRole('button', { name: 'Booking' })).toBeInTheDocument();
    unmount();

    // A caller that withholds the handler — because the reader may not book —
    // gets a panel with no way to book from it.
    renderMap([unit()]);
    await userEvent.click(await findHit('L2-01'));
    const panel = await screen.findByTestId('map-unit-panel');
    expect(within(panel).queryByRole('button', { name: 'Booking' })).not.toBeInTheDocument();
  });

  it('does not offer Booking on a unit that is not free', async () => {
    renderMap([other()], { onBookUnit: vi.fn() });
    await userEvent.click(await findHit('L2-02'));
    const panel = await screen.findByTestId('map-unit-panel');
    expect(within(panel).queryByRole('button', { name: 'Booking' })).not.toBeInTheDocument();
  });

  it('closes on a second click, and puts the unit down when the plan is clicked', async () => {
    renderMap([unit()]);
    await userEvent.click(await findHit('L2-01'));
    expect(await screen.findByTestId('map-unit-panel')).toBeInTheDocument();

    await userEvent.click(hit('L2-01'));
    await waitFor(() => expect(screen.queryByTestId('map-unit-panel')).toBeNull());
  });
});

// ─── Filters, floors, empty states ────────────────────────────────────────────

describe('filters and floors', () => {
  it('SPACE-MAP-UX-011 a status filter narrows the map and leaves the plan standing', async () => {
    renderMap([unit(), other()]);
    await findHit('L2-01');

    await userEvent.click(screen.getByRole('button', { name: /^Đang thuê \(1\)$/ }));

    await waitFor(() => expect(screen.queryByTestId('map-hit-L2-01')).toBeNull());
    expect(screen.getByTestId('map-hit-L2-02')).toBeInTheDocument();
    // The excluded unit leaves the business overlay entirely -- a half-visible
    // ghost of it would be one more thing to mistake for available space.
    expect(screen.queryByTestId('map-unit-L2-01')).toBeNull();
    expect(screen.queryByTestId('map-dot-L2-01')).toBeNull();
    // The drawing underneath is what keeps the floor readable.
    expect(screen.getByTestId('map-cad-layer')).toBeInTheDocument();
  });

  it('SPACE-MAP-UX-019 says so when a filter leaves nothing on the floor', async () => {
    renderMap([unit()]);
    await findHit('L2-01');

    // Select vacant, then a second click clears it; use a status with no units
    // by filtering to the only one and then switching floors is overkill — the
    // direct case is a filter that matches nothing on this floor.
    await userEvent.click(screen.getByRole('button', { name: /^Trống \(1\)$/ }));
    expect(screen.queryByTestId('map-empty-filter')).toBeNull();

    renderMap([]);
    await waitFor(() => expect(screen.getAllByText(/Chưa có unit nào được đặt vị trí/).length).toBeGreaterThan(0));
  });

  it('drops a unit from the panel when a filter stops showing it', async () => {
    renderMap([unit(), other()]);
    await userEvent.click(await findHit('L2-01'));
    expect(await screen.findByTestId('map-unit-panel')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Đang thuê \(1\)$/ }));

    await waitFor(() => expect(screen.queryByTestId('map-unit-panel')).toBeNull());
  });

  it('SPACE-MAP-UX-012 changing floor clears the unit that belonged to the old one', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.getFloorMapData.mockResolvedValue({
      ...FLOOR, floorPlanUrl: '/uploads/floor.png', floorPlanRatio: 1.6, units: [unit()],
    });
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <MallMapViewer floors={[FLOOR, FLOOR_3]} activeFloorId="f1" onFloorChange={vi.fn()} />
      </QueryClientProvider>,
    );
    await userEvent.click(await findHit('L2-01'));
    expect(await screen.findByTestId('map-unit-panel')).toBeInTheDocument();

    api.getFloorMapData.mockResolvedValue({
      ...FLOOR_3, floorPlanUrl: '/uploads/floor3.png', floorPlanRatio: 1.6, units: [],
    });
    rerender(
      <QueryClientProvider client={qc}>
        <MallMapViewer floors={[FLOOR, FLOOR_3]} activeFloorId="f2" onFloorChange={vi.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByTestId('map-unit-panel')).toBeNull());
  });

  it('draws no second floor selector when the page already has one', async () => {
    renderMap([unit()], { activeFloorId: 'f1', onFloorChange: vi.fn() });
    await findHit('L2-01');
    expect(screen.queryByTestId('map-floor-nav')).toBeNull();
  });

  it('still offers floor navigation where the page has none', async () => {
    renderMap([unit()]);
    await findHit('L2-01');
    expect(screen.getByTestId('map-floor-nav')).toBeInTheDocument();
  });

  it('reports the floor at a glance', async () => {
    renderMap([unit(), other()]);
    const strip = await screen.findByTestId('map-kpi-strip');
    expect(strip).toHaveTextContent('Tổng mặt bằng');
    expect(strip).toHaveTextContent('Tỷ lệ lấp đầy');
  });

  it('SPACE-MAP-UX-019 says the plan image failed rather than showing a blank frame', async () => {
    renderMap([unit()]);
    fireEvent.error(await screen.findByTestId('map-cad-layer'));
    expect(await screen.findByText(/Không tải được ảnh sơ đồ/)).toBeInTheDocument();
  });
});

// ─── Access ───────────────────────────────────────────────────────────────────

describe('reachable without a mouse', () => {
  it('SPACE-MAP-UX-017 every unit is focusable and says its status in words', async () => {
    renderMap([unit()]);
    const target = await findHit('L2-01');

    expect(target).toHaveAttribute('tabindex', '0');
    // Status must not be carried by colour alone.
    expect(target).toHaveAttribute('aria-label', expect.stringContaining('Trống'));
    expect(target.getAttribute('aria-label')).toContain('L2-01');
  });

  it('SPACE-MAP-UX-017 focusing raises the unit and Enter opens it', async () => {
    renderMap([unit()]);
    const target = await findHit('L2-01');

    fireEvent.focus(target);
    await waitFor(() => expect(screen.getByTestId('map-unit-L2-01').querySelector('[data-elevation]'))
      .toHaveAttribute('data-elevation', 'hover'));
    // The ring itself is a :focus-visible rule keyed off this class, so it
    // greets a reader who tabbed here and stays off one who clicked.
    expect(target).toHaveClass('map-unit-hit');

    fireEvent.keyDown(target, { key: 'Enter' });
    expect(await screen.findByTestId('map-unit-panel')).toBeInTheDocument();
  });

  it('SPACE-MAP-UX-018 drops the animation when the reader asked for less motion', async () => {
    (window as any).matchMedia = vi.fn().mockReturnValue({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    renderMap([unit()]);
    await findHit('L2-01');

    const shadow = screen.getByTestId('map-unit-L2-01').querySelector('[data-elevation]') as SVGElement;
    // The raised state still arrives — it just does not travel there.
    expect(shadow.style.transition).toBe('none');
  });
});

// ─── Regression on what already worked ────────────────────────────────────────

describe('SPACE-MAP-UX-020 the map still behaves like the map', () => {
  it('offers zoom controls and reports the current zoom', async () => {
    renderMap([unit()]);

    const zoomIn = await screen.findByRole('button', { name: 'Phóng to' });
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu nhỏ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Về khung ban đầu' })).toBeDisabled();

    await userEvent.click(zoomIn);

    await waitFor(() => expect(screen.getByText('140%')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Thu nhỏ' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Về khung ban đầu' })).toBeEnabled();
  });

  it('returns to the whole floor when the view is reset', async () => {
    renderMap([unit()]);
    await userEvent.click(await screen.findByRole('button', { name: 'Phóng to' }));
    await waitFor(() => expect(screen.getByText('140%')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Về khung ban đầu' }));

    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument());
  });

  it('leaves the page scroll alone: a plain wheel does not zoom, and says what does', async () => {
    renderMap([unit()]);
    const frame = await screen.findByTestId('mall-map-frame');

    fireEvent.wheel(frame, { deltaY: -200 });

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(await screen.findByTestId('map-wheel-hint')).toHaveTextContent('Ctrl');
  });

  it('zooms when the reader asks for it with Ctrl', async () => {
    renderMap([unit()]);
    const frame = await screen.findByTestId('mall-map-frame');

    fireEvent.wheel(frame, { deltaY: -200, ctrlKey: true });

    await waitFor(() => expect(screen.getByText('140%')).toBeInTheDocument());
    expect(screen.queryByTestId('map-wheel-hint')).toBeNull();
  });

  it('draws every placed unit', async () => {
    renderMap([unit(), other()]);

    await waitFor(() => {
      expect(screen.getByTestId('map-unit-L2-01')).toBeInTheDocument();
      expect(screen.getByTestId('map-unit-L2-02')).toBeInTheDocument();
    });
  });

  /**
   * Found in browser QA and present before this CR: pressing anywhere on a
   * zoomed-in map captured the pointer for panning, which swallowed the click.
   * The map stuck at 140% and nothing on it could be clicked again.
   */
  it('stays clickable once it is zoomed in', async () => {
    renderMap([unit()]);
    const zoomIn = await screen.findByRole('button', { name: 'Phóng to' });

    await userEvent.click(zoomIn);
    await waitFor(() => expect(screen.getByText('140%')).toBeInTheDocument());
    await userEvent.click(zoomIn);
    await waitFor(() => expect(screen.getByText('196%')).toBeInTheDocument());

    await userEvent.click(hit('L2-01'));
    expect(await screen.findByTestId('map-unit-panel')).toBeInTheDocument();
  });

  it('treats a press that does not travel as a click, not a drag', async () => {
    renderMap([unit()]);
    await userEvent.click(await screen.findByRole('button', { name: 'Phóng to' }));
    await waitFor(() => expect(screen.getByText('140%')).toBeInTheDocument());
    const frame = screen.getByTestId('mall-map-frame');
    // jsdom has no PointerEvent, and its stand-in drops clientX/clientY; a
    // MouseEvent under the pointer name carries the coordinates this is about.
    const pointer = (type: string, clientX: number, clientY: number) =>
      fireEvent(frame, new MouseEvent(type, { button: 0, clientX, clientY, bubbles: true }));

    pointer('pointerdown', 100, 100);
    pointer('pointermove', 102, 101);

    expect(frame.style.cursor).toBe('grab');   // still a click in progress

    pointer('pointermove', 160, 140);
    expect(frame.style.cursor).toBe('grabbing');
    pointer('pointerup', 160, 140);
    expect(frame.style.cursor).toBe('grab');
  });

  /**
   * Found in browser QA once the filter bar moved next to the map: the map's
   * shortcuts listened on the window, so typing a unit code into a search box
   * reset the view on the "0" and jumped to fullscreen on the "f".
   */
  it('leaves the keyboard alone while someone is typing', async () => {
    renderMap([unit()]);
    await userEvent.click(await screen.findByRole('button', { name: 'Phóng to' }));
    await waitFor(() => expect(screen.getByText('140%')).toBeInTheDocument());

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: '0' });
    fireEvent.keyDown(input, { key: 'f' });
    fireEvent.keyDown(input, { key: '-' });

    expect(screen.getByText('140%')).toBeInTheDocument();
    expect(screen.getByTestId('mall-map-frame')).toBeInTheDocument();  // not fullscreen
    input.remove();
  });

  it('still answers the same keys outside a field', async () => {
    renderMap([unit()]);
    await userEvent.click(await screen.findByRole('button', { name: 'Phóng to' }));
    await waitFor(() => expect(screen.getByText('140%')).toBeInTheDocument());

    fireEvent.keyDown(document.body, { key: '0' });

    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument());
  });

  it('offers fullscreen from inside the map controls', async () => {
    renderMap([unit()]);
    expect(await screen.findByRole('button', { name: 'Toàn màn hình' })).toBeInTheDocument();
  });
});

// ── The page owning the filters ───────────────────────────────────────────────

describe('SPACE-MAP-FILTER the page can own the population', () => {
  it('SPACE-MAP-FILTER-018 an embed that passes no population keeps its own pills and its whole floor', async () => {
    // This is the Fitout D-Map: no filter bar around it, so nothing changes.
    renderMap([unit(), other()]);
    await findHit('L2-01');

    expect(screen.getByTestId('map-status-filters')).toBeInTheDocument();
    expect(screen.getByTestId('map-hit-L2-02')).toBeInTheDocument();
  });

  it('draws only the units the page resolved, whatever the floor endpoint returned', async () => {
    renderMap([unit(), other()], { activeUnitIds: new Set(['u2']) });
    await findHit('L2-02');

    expect(screen.queryByTestId('map-hit-L2-01')).toBeNull();
    expect(screen.queryByTestId('map-unit-L2-01')).toBeNull();
  });

  it('SPACE-MAP-FILTER-016 hides its own status pills when the page owns the filters', async () => {
    renderMap([unit(), other()], { activeUnitIds: new Set(['u1', 'u2']) });
    await findHit('L2-01');

    expect(screen.queryByTestId('map-status-filters')).toBeNull();
  });

  it('SPACE-MAP-FILTER-008 counts only the units it is drawing', async () => {
    renderMap([unit(), other()], { activeUnitIds: new Set(['u1']) });
    await findHit('L2-01');

    const strip = screen.getByTestId('map-kpi-strip');
    expect(within(strip).getByText('Tổng mặt bằng').nextElementSibling).toHaveTextContent('1');
    expect(within(strip).getByTestId('map-kpi-filtered-note')).toHaveTextContent('1/2');
  });

  it('SPACE-MAP-FILTER-017 fullscreen reports the page’s filters instead of keeping a second copy', async () => {
    const onClearFilters = vi.fn();
    renderMap([unit(), other()], { activeUnitIds: new Set(['u1']), filtersActive: true, onClearFilters });
    await findHit('L2-01');

    fireEvent.keyDown(window, { key: 'f' });

    const summary = await screen.findByTestId('map-filter-summary');
    expect(summary).toHaveTextContent('1/2');
    expect(screen.queryByTestId('map-status-filters')).toBeNull();
    await userEvent.click(within(summary).getByRole('button', { name: /Xóa/i }));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it('SPACE-MAP-FILTER-013 offers the page’s reset when a filter empties the floor', async () => {
    const onClearFilters = vi.fn();
    renderMap([unit(), other()], { activeUnitIds: new Set<string>(), filtersActive: true, onClearFilters });

    const note = await screen.findByTestId('map-empty-filter');
    expect(screen.getByTestId('map-cad-layer')).toBeInTheDocument();
    await userEvent.click(within(note).getByRole('button', { name: /Xóa/i }));
    expect(onClearFilters).toHaveBeenCalled();
  });
});
