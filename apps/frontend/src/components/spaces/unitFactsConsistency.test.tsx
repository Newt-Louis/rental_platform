/**
 * The list, the floor plan and the mall map describe a space the same way.
 *
 * They used to disagree: only the list mentioned the Project Board's handover
 * date, only the plan showed short-term slots, and none of the three said who
 * was booking the space -- so "Đang giữ chỗ" on the map gave no way to tell
 * whose hold it was without leaving the screen. These tests hold the three
 * views to one description.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import i18n from '@/lib/i18n';

vi.mock('@/api', () => ({ spacesApi: { getFloorMapData: vi.fn() } }));

import { UnitCard } from './UnitCard';
import { FloorPlan } from '@/components/FloorPlan';
import { MallMapUnitPanel } from '@/components/MallMapUnitPanel';
import type { UnitBookingSummary } from './unitBookingSummary';

beforeAll(() => i18n.changeLanguage('vi'));

const UNIT = {
  id: 'u1', mallId: 'm1', code: 'L2-D01', name: 'Unit D01',
  areaGFA: 220, areaNLA: 200, baseRentPerSqm: 850000, camPerSqm: 50000,
  currencyCode: 'VND', status: 'BOOKING', category: 'F&B',
  floor: { id: 'f1', name: 'Tầng 2', level: 'L2', sortOrder: 2 },
  zone: { id: 'z1', name: 'Khu A' },
} as any;

const BOOKING: UnitBookingSummary = {
  customerName: 'Zara Vietnam',
  status: 'ACTIVE',
  bookingNumber: 'BK-2026-00003',
  queueCount: 2,
  expiresAt: null,
};

const HANDOVER = {
  unitId: 'u1',
  evaluation: { status: 'TRACKING', daysRemaining: 12, deadlineLevel: 'D30' },
} as any;

describe('the three Spaces views agree on what a space says', () => {
  it('the list card names the booking holder and the handover date', () => {
    render(<UnitCard unit={UNIT} booking={BOOKING} handover={HANDOVER} onClick={() => {}} />);

    expect(screen.getByText('Zara Vietnam (+1 chờ)')).toBeInTheDocument();
    expect(screen.getByTestId('handover-card-badge')).toHaveTextContent('BDA dự kiến bàn giao');
  });

  it('the floor plan names them too', () => {
    render(
      <FloorPlan
        units={[UNIT]}
        onUnitClick={() => {}}
        bookingByUnit={{ u1: BOOKING }}
        handoverByUnit={{ u1: HANDOVER }}
      />,
    );

    expect(screen.getByText('Zara Vietnam (+1 chờ)')).toBeInTheDocument();
    expect(screen.getByTestId('handover-card-badge')).toHaveTextContent('BDA dự kiến bàn giao');
  });

  it('the mall map panel names them too', () => {
    render(
      <MallMapUnitPanel
        unit={UNIT}
        booking={BOOKING}
        handover={HANDOVER}
        floorName="Tầng 2"
        onClose={() => {}}
      />,
    );

    const panel = screen.getByTestId('map-unit-panel');
    expect(within(panel).getByText('Zara Vietnam (+1 chờ)')).toBeInTheDocument();
    expect(within(panel).getByText('Khách booking')).toBeInTheDocument();
    expect(within(panel).getByTestId('handover-card-badge')).toHaveTextContent('BDA dự kiến bàn giao');
  });

  it('none of them invents a holder for a space nobody has booked', () => {
    const { unmount } = render(<UnitCard unit={UNIT} onClick={() => {}} />);
    expect(screen.queryByText(/chờ\)/)).toBeNull();
    unmount();

    render(<MallMapUnitPanel unit={UNIT} floorName="Tầng 2" onClose={() => {}} />);
    expect(within(screen.getByTestId('map-unit-panel')).queryByText('Khách booking')).toBeNull();
  });

  it('says whose hold it is rather than leaving "Đang giữ chỗ" unattributed', () => {
    render(<UnitCard unit={UNIT} booking={{ ...BOOKING, queueCount: 1 }} onClick={() => {}} />);

    // The status alone is what sent readers to the Bookings screen.
    expect(screen.getByText('Đang giữ chỗ')).toBeInTheDocument();
    expect(screen.getByText('Zara Vietnam')).toBeInTheDocument();
  });
});
