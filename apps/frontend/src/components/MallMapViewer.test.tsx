/**
 * The mall map shows each unit as a card whose colour is its status, and lets
 * the viewer zoom in. Before this the map had no zoom, printed a fixed 10px
 * code, and tinted the status colour with whatever the floor plan had underneath.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/lib/i18n';

const api = vi.hoisted(() => ({ getFloorMapData: vi.fn() }));
vi.mock('@/api', () => ({ spacesApi: api }));

import { MallMapViewer, UnitCard } from './MallMapViewer';

void i18n.changeLanguage('vi');

const t = (key: string) => key;

const unit = (over: Record<string, unknown> = {}) => ({
  id: 'u1', mallId: 'm1', code: 'L2-01', areaGFA: 130, areaNLA: 120,
  baseRentPerSqm: 800000, camPerSqm: 50000, currencyCode: 'VND', status: 'VACANT',
  mapPolygon: [[10, 10], [30, 10], [30, 30], [10, 30]],
  ...over,
}) as any;

const FLOOR = { id: 'f1', mallId: 'm1', name: 'Tầng 2', level: 'L2', sortOrder: 2 } as any;

function renderMap(units: any[]) {
  api.getFloorMapData.mockResolvedValue({
    ...FLOOR, floorPlanUrl: '/uploads/floor.png', floorPlanRatio: 1.6, units,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MallMapViewer floors={[FLOOR]} /></QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe('Unit card', () => {
  it('carries the status colour itself, so the floor plan underneath cannot tint it', () => {
    const { container } = render(<UnitCard unit={unit()} detail="FULL" selected={false} hovered={false} scale={1} t={t} />);
    const card = container.firstElementChild as HTMLElement;
    // A solid accent on an opaque card, not a translucent wash over the plan.
    expect(card.style.borderLeft).toContain('rgb(239, 68, 68)');
    expect(card.className).toContain('bg-white/95');
  });

  it('says more as the unit gets more room, and never less than its code', () => {
    const { rerender, container } = render(<UnitCard unit={unit({ tenant: { brandName: 'Zara' } })} detail="CODE" selected={false} hovered={false} scale={1} t={t} />);
    expect(container.textContent).toContain('L2-01');
    expect(container.textContent).not.toContain('120');

    rerender(<UnitCard unit={unit({ tenant: { brandName: 'Zara' } })} detail="COMPACT" selected={false} hovered={false} scale={1} t={t} />);
    expect(container.textContent).toContain('120');

    rerender(<UnitCard unit={unit({ tenant: { brandName: 'Zara' } })} detail="FULL" selected={false} hovered={false} scale={1} t={t} />);
    expect(container.textContent).toContain('Zara');
    expect(container.textContent).toContain('800.000');
  });

  it('a unit too small for a card becomes a status dot that still names itself', () => {
    render(<UnitCard unit={unit()} detail="DOT" selected={false} hovered={false} scale={1} t={t} />);
    expect(screen.getByTestId('map-dot-L2-01')).toHaveAttribute('title', expect.stringContaining('L2-01'));
  });

  it('keeps its size on screen: the counter-scale cancels the map zoom', () => {
    const { container } = render(<UnitCard unit={unit()} detail="COMPACT" selected={false} hovered={false} scale={0.25} t={t} />);
    expect((container.firstElementChild as HTMLElement).style.transform).toBe('scale(0.25)');
  });
});

describe('MallMapViewer', () => {
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

  it('draws a card per placed unit', async () => {
    renderMap([unit(), unit({ id: 'u2', code: 'L2-02', status: 'OCCUPIED', tenant: { brandName: 'Zara' }, mapPolygon: [[40, 10], [70, 10], [70, 40], [40, 40]] })]);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="map-card-L2-01"], [data-testid="map-dot-L2-01"]')).toBeTruthy();
      expect(document.querySelector('[data-testid="map-card-L2-02"], [data-testid="map-dot-L2-02"]')).toBeTruthy();
    });
  });
});
