import React from 'react';
import { BookmarkPlus, Building2 } from 'lucide-react';
import type { Unit, UnitSlotSummary } from '@/types';
import type { HandoverSummary } from '@/api/handover-readiness';
import { HandoverCardBadge } from './handover/handoverPresentation';
import { SlotSummaryBadge } from '@/components/SlotSummaryBadge';
import { bookingHolderLabel, type UnitBookingSummary } from './unitBookingSummary';

/**
 * The facts a space carries, written the same way everywhere.
 *
 * The list, the floor plan and the mall map each described a space differently
 * -- different fields, different order, different wording -- so the same space
 * told three stories depending on which tab you were on. This is the one
 * description; each view decides how much room to give it, never what it says.
 */

export interface UnitFactsData {
  unit: Unit;
  handover?: HandoverSummary;
  slotSummary?: UnitSlotSummary;
  booking?: UnitBookingSummary;
}

/** The tenant in occupation, if any. */
export function UnitTenantLine({ unit, className = '' }: { unit: Unit; className?: string }) {
  if (!unit.tenant?.brandName) return null;
  return (
    <div className={`flex items-center gap-1.5 truncate text-xs font-medium text-gray-700 ${className}`}>
      <Building2 size={11} className="shrink-0 text-gray-400" />
      <span className="truncate">{unit.tenant.brandName}</span>
    </div>
  );
}

/**
 * Who is holding the space.
 *
 * Distinct from the tenant line on purpose: a booked space has no tenant yet,
 * and reading "Đang giữ chỗ" without a name is what sent people to the Bookings
 * screen to find out whose hold it was.
 */
export function UnitBookingLine({ booking, className = '' }: { booking?: UnitBookingSummary; className?: string }) {
  const label = bookingHolderLabel(booking);
  if (!label) return null;
  const waiting = (booking!.queueCount ?? 1) > 1;
  return (
    <div
      className={`flex items-center gap-1.5 truncate text-xs ${waiting ? 'text-amber-700' : 'text-gray-600'} ${className}`}
      title={`Khách booking: ${label}${booking!.bookingNumber ? ` · ${booking!.bookingNumber}` : ''}`}
    >
      <BookmarkPlus size={11} className="shrink-0 text-amber-500" />
      <span className="truncate">{label}</span>
    </div>
  );
}

/**
 * The badges a space carries: the Project Board's handover date, and any
 * short-term slots sold inside it.
 */
export function UnitBadges({ handover, slotSummary, className = '' }: {
  handover?: HandoverSummary;
  slotSummary?: UnitSlotSummary;
  className?: string;
}) {
  if (!handover && !slotSummary?.totalSlots) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {handover && <HandoverCardBadge summary={handover} />}
      {slotSummary?.totalSlots ? <SlotSummaryBadge summary={slotSummary} compact /> : null}
    </div>
  );
}

/** Tenant, then who is booking it -- the two "who" lines, in that order. */
export function UnitOccupancyLines({ unit, booking, className = '' }: {
  unit: Unit;
  booking?: UnitBookingSummary;
  className?: string;
}) {
  if (!unit.tenant?.brandName && !booking) return null;
  return (
    <div className={`space-y-0.5 ${className}`}>
      <UnitTenantLine unit={unit} />
      <UnitBookingLine booking={booking} />
    </div>
  );
}
