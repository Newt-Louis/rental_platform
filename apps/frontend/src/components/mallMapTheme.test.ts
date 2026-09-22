/**
 * CR-SPACES-FLOOR-MAP-UX-001 — the arithmetic behind the floating units.
 *
 * Depth on this map has to mean the same thing at every zoom level, and the
 * promotion of a selected unit has to happen without touching the order the
 * server sent. Both are pure functions so they can be proved here rather than
 * eyeballed in a browser.
 */
import { describe, it, expect } from 'vitest';
import {
  MAP_CAD, MAP_ELEVATION, MAP_STATUS, MAP_STATUS_ORDER,
  elevationLevel, presentationOrder, pxToUnits, shadowGeometry, statusToken,
} from './mallMapTheme';

describe('CAD de-emphasis', () => {
  it('holds the drawing back to context without blurring it away', () => {
    // Secondary, but still readable: corridors and escalators must survive.
    expect(MAP_CAD.opacity).toBeGreaterThanOrEqual(0.3);
    expect(MAP_CAD.opacity).toBeLessThanOrEqual(0.45);
    expect(MAP_CAD.filter).toContain('grayscale');
    expect(MAP_CAD.filter).not.toContain('blur');
  });
});

describe('status surfaces', () => {
  it('stays light enough to leave the plan visible underneath', () => {
    // A unit at rest is a translucent surface, not a paint bucket.
    expect(MAP_ELEVATION.rest.surfaceOpacity).toBeLessThan(0.4);
    expect(MAP_ELEVATION.selected.surfaceOpacity).toBeLessThan(0.7);
  });

  it('covers every status the leasing lifecycle can produce', () => {
    for (const status of MAP_STATUS_ORDER) expect(MAP_STATUS[status]).toBeDefined();
  });

  it('falls back to neutral grey rather than mislabelling an unknown status', () => {
    expect(statusToken('SOMETHING_NEW').surface).toBe(statusToken(null).surface);
    expect(statusToken('VACANT')).not.toEqual(statusToken('OCCUPIED'));
  });
});

describe('elevation', () => {
  it('rises from rest to hover to selected', () => {
    expect(MAP_ELEVATION.rest.dy).toBeLessThan(MAP_ELEVATION.hover.dy);
    expect(MAP_ELEVATION.hover.dy).toBeLessThan(MAP_ELEVATION.selected.dy);
  });

  it('never moves a unit off its footprint at rest', () => {
    // Only the unit being pointed at or worked on lifts; the rest of the floor
    // stays exactly where the architect drew it.
    expect(MAP_ELEVATION.rest.lift).toBe(0);
    expect(MAP_ELEVATION.hover.lift).toBeGreaterThan(0);
  });

  it('picks the level from what the reader is doing', () => {
    expect(elevationLevel(false, false)).toBe('rest');
    expect(elevationLevel(false, true)).toBe('hover');
    expect(elevationLevel(true, true)).toBe('selected');
  });
});

describe('screen-relative shadows', () => {
  it('converts pixels into the stretched viewBox rather than assuming square units', () => {
    // 900px wide frame => 9px per unit horizontally; 450px tall => 4.5 vertically.
    expect(pxToUnits(9, 900, 1)).toBeCloseTo(1);
    expect(pxToUnits(9, 450, 1)).toBeCloseTo(2);
  });

  it('survives an unmeasured frame instead of producing NaN', () => {
    expect(pxToUnits(8, 0, 1)).toBe(0);
    expect(pxToUnits(8, 900, 0)).toBe(0);
  });

  it('keeps a shadow the same size on screen at every zoom', () => {
    const at1 = shadowGeometry('hover', 900, 450, 1);
    const at4 = shadowGeometry('hover', 900, 450, 4);
    // Four times the magnification, a quarter of the drawing units: the reader
    // sees an identical drop. A shadow that scaled with the plan would smear.
    expect(at4.dy).toBeCloseTo(at1.dy / 4);
    expect(at4.blurY).toBeCloseTo(at1.blurY / 4);
    expect(at4.dy * 4 * (450 / 100)).toBeCloseTo(MAP_ELEVATION.hover.dy);
  });

  it('blurs each axis separately because the viewBox is stretched', () => {
    const geo = shadowGeometry('selected', 900, 450, 1);
    expect(geo.blurX).not.toBeCloseTo(geo.blurY);
  });

  it('drops the shadow downward and lifts the surface upward', () => {
    const geo = shadowGeometry('selected', 900, 450, 1);
    expect(geo.dy).toBeGreaterThan(0);
    expect(geo.lift).toBeGreaterThan(0);
    expect(geo.dx).toBe(0);
  });
});

describe('paint order', () => {
  const units = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('draws the selected unit last so its neighbours cannot cover it', () => {
    const order = presentationOrder(units, null, 'b');
    expect(order[order.length - 1].id).toBe('b');
  });

  it('puts the hovered unit above the rest but below the selected one', () => {
    const order = presentationOrder(units, 'c', 'b').map((u) => u.id);
    expect(order).toEqual(['a', 'd', 'c', 'b']);
  });

  it('leaves the caller’s array and the server’s order alone', () => {
    const source = [...units];
    presentationOrder(source, 'c', 'b');
    expect(source.map((u) => u.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never loses or duplicates a unit', () => {
    const order = presentationOrder(units, 'c', 'b');
    expect(order).toHaveLength(units.length);
    expect(new Set(order.map((u) => u.id)).size).toBe(units.length);
  });

  it('keeps the given order when nothing is hovered or selected', () => {
    expect(presentationOrder(units).map((u) => u.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
