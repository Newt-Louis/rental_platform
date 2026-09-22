/**
 * Spaces floor-plan view must have ONE floor selector. When the page drives it
 * (activeFloorLevel), the plan shows that floor and renders no tabs of its own;
 * without it the plan keeps its legacy internal tabs.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FloorPlan } from './FloorPlan';

const floors = [
  { id: 'f1', level: 'L1', name: 'Tầng 1', sortOrder: 1 },
  { id: 'f2', level: 'L2', name: 'Tầng 2', sortOrder: 2 },
];
const unit = (id: string, code: string, level: string, name: string) => ({
  id, code, name: code, status: 'VACANT', areaNLA: 50, areaGFA: 50, baseRentPerSqm: 0,
  floor: { level, name }, zone: { name: 'Zone A' },
}) as any;
const units = [unit('u1', 'A-101', 'L1', 'Tầng 1'), unit('u2', 'B-201', 'L2', 'Tầng 2')];

describe('FloorPlan floor selection', () => {
  it('FLOORPLAN-001 controlled: shows the page-selected floor and renders no own floor tabs', () => {
    render(<FloorPlan units={units} allFloors={floors} activeFloorLevel="L2" onUnitClick={vi.fn()} />);
    expect(screen.getByText('B-201')).toBeInTheDocument();
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
    // The internal tab buttons render the floor level + a count, e.g. "L1 (1)".
    expect(screen.queryByRole('button', { name: /^L1/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^L2/ })).not.toBeInTheDocument();
  });

  it('FLOORPLAN-002 controlled: follows the page when the selected floor changes', () => {
    const { rerender } = render(<FloorPlan units={units} allFloors={floors} activeFloorLevel="L1" onUnitClick={vi.fn()} />);
    expect(screen.getByText('A-101')).toBeInTheDocument();
    rerender(<FloorPlan units={units} allFloors={floors} activeFloorLevel="L2" onUnitClick={vi.fn()} />);
    expect(screen.getByText('B-201')).toBeInTheDocument();
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
  });

  it('FLOORPLAN-003 uncontrolled (no Mall selected): legacy internal tabs still work', async () => {
    render(<FloorPlan units={units} allFloors={floors} onUnitClick={vi.fn()} />);
    expect(screen.getByText('A-101')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^L2/ }));
    expect(screen.getByText('B-201')).toBeInTheDocument();
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
  });
});
