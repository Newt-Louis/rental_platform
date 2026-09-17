/**
 * Zoom, pan and label detail on the mall map. The viewer used to have no zoom at
 * all and a fixed 10px label, so a unit on a large floor plan was unreadable.
 */
import { describe, expect, it } from 'vitest';
import {
  clampPan, clampZoom, detailLevel, focusOn, INITIAL_VIEW, MAX_ZOOM, MIN_ZOOM, unitScreenSize, zoomAt,
} from './mallMapView';

const FRAME = { w: 1000, h: 600 };

describe('zooming', () => {
  it('stays within the allowed range', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it('keeps the point under the cursor still', () => {
    const pointer = { x: 300, y: 200 };
    const zoomed = zoomAt(INITIAL_VIEW, 2, pointer.x, pointer.y, FRAME.w, FRAME.h);
    // The map coordinate under the cursor before and after must be the same.
    const before = (pointer.x - INITIAL_VIEW.x) / INITIAL_VIEW.zoom;
    const after = (pointer.x - zoomed.x) / zoomed.zoom;
    expect(zoomed.zoom).toBe(2);
    expect(after).toBeCloseTo(before, 6);
  });

  it('cannot zoom out past the frame, and never leaves empty space beside the plan', () => {
    const out = zoomAt(INITIAL_VIEW, 0.5, 500, 300, FRAME.w, FRAME.h);
    expect(out).toEqual(INITIAL_VIEW);
    const zoomed = zoomAt(INITIAL_VIEW, 3, 0, 0, FRAME.w, FRAME.h);
    const dragged = clampPan({ ...zoomed, x: 500, y: 400 }, FRAME.w, FRAME.h);
    expect(dragged.x).toBe(0);
    expect(dragged.y).toBe(0);
    const far = clampPan({ ...zoomed, x: -99999, y: -99999 }, FRAME.w, FRAME.h);
    expect(far.x).toBe(FRAME.w - FRAME.w * zoomed.zoom);
    expect(far.y).toBe(FRAME.h - FRAME.h * zoomed.zoom);
  });
});

describe('zooming to a unit', () => {
  it('centres that unit and respects the pan limits', () => {
    const view = focusOn(25, 40, 3, FRAME.w, FRAME.h);
    expect(view.zoom).toBe(3);
    // The unit's centre lands in the middle of the frame.
    expect(0.25 * FRAME.w * view.zoom + view.x).toBeCloseTo(FRAME.w / 2, 6);
    expect(0.4 * FRAME.h * view.zoom + view.y).toBeCloseTo(FRAME.h / 2, 6);
    // A unit near the edge is shown without dragging the plan out of the frame.
    const edge = focusOn(2, 2, 3, FRAME.w, FRAME.h);
    expect(edge.x).toBe(0);
    expect(edge.y).toBe(0);
  });
});

describe('how much a unit can say', () => {
  const square = (side: number): Array<[number, number]> => [[0, 0], [side, 0], [side, side], [0, side]];

  it('grows with the room the unit has on screen', () => {
    expect(detailLevel(30, 30)).toBe('DOT');
    expect(detailLevel(70, 30)).toBe('CODE');
    expect(detailLevel(120, 60)).toBe('COMPACT');
    expect(detailLevel(200, 90)).toBe('FULL');
  });

  it('a long thin unit gets a dot rather than a card it cannot fit', () => {
    expect(detailLevel(300, 14)).toBe('DOT');
  });

  it('zooming in is what turns a dot into a full card', () => {
    const poly = square(4); // 4% of the plan
    const at1 = unitScreenSize(poly, FRAME.w, FRAME.h, 1);
    const at4 = unitScreenSize(poly, FRAME.w, FRAME.h, 4);
    expect(detailLevel(at1.width, at1.height)).toBe('DOT');
    expect(detailLevel(at4.width, at4.height)).toBe('FULL');
  });
});
