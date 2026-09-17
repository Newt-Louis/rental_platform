/**
 * One booking action changes several screens. Queries are cached for 30s, so a
 * mutation that only refreshed its own module left the others stale until the
 * user reloaded the page.
 */
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { LEASING_LIFECYCLE_QUERY_KEYS, refreshLeasingLifecycle } from './leasingLifecycle';

describe('refreshLeasingLifecycle', () => {
  it('refreshes every screen a booking/proposal/unit change is visible on', () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockImplementation(() => Promise.resolve());

    refreshLeasingLifecycle(qc);

    const refreshed = invalidate.mock.calls.map(([arg]: any) => arg.queryKey[0]);
    for (const screen of ['bookings', 'booking-detail', 'booking-stats', 'proposals', 'proposal-detail', 'units', 'unit-detail', 'occupancy', 'floor-map', 'contracts']) {
      expect(refreshed).toContain(screen);
    }
    expect(refreshed).toEqual([...LEASING_LIFECYCLE_QUERY_KEYS]);
  });

  it('marks whole query families, so a detail cached per id is refreshed too', () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockImplementation(() => Promise.resolve());

    refreshLeasingLifecycle(qc);

    // ['booking-detail'] matches ['booking-detail', id] — a key with the id
    // would leave every other booking's cached detail stale.
    for (const [arg] of invalidate.mock.calls as any[]) {
      expect(arg.queryKey).toHaveLength(1);
    }
  });
});
