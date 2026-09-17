import type { QueryClient } from '@tanstack/react-query';

/**
 * Booking, Tờ trình and Unit move together.
 *
 * Converting a booking, deleting a Tờ trình, cancelling or deleting a booking
 * each change what several screens show: the booking list and its detail, the
 * proposal list, the unit's status on the spaces screens and the occupancy
 * figures. Queries are cached for 30 seconds (main.tsx), so a screen that only
 * refreshed its own module left the others showing the old state until the user
 * reloaded the page. Every mutation that moves this lifecycle refreshes all of
 * them; inactive screens refetch the next time they are opened.
 */
export const LEASING_LIFECYCLE_QUERY_KEYS = [
  'bookings',
  'booking-detail',
  'booking-stats',
  'slot-bookings',
  'slot-summaries',
  'unit-slots',
  'proposals',
  'proposal-detail',
  'proposal-stats',
  'proposal-document',
  'proposal-versions',
  'units',
  'unit-detail',
  'occupancy',
  'floors',
  'floor-map',
  'contracts',
  'crm-pipeline',
] as const;

export function refreshLeasingLifecycle(qc: QueryClient) {
  for (const key of LEASING_LIFECYCLE_QUERY_KEYS) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}
