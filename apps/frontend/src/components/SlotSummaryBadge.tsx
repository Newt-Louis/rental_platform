import { BookmarkPlus } from 'lucide-react';
import type { UnitSlotSummary } from '@/types';

export function SlotSummaryBadge({
  summary,
  compact = false,
}: {
  summary?: UnitSlotSummary | null;
  compact?: boolean;
}) {
  if (!summary || summary.totalSlots === 0) return null;

  const hasActivity = summary.confirmedSlots > 0 || summary.pendingSlots > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-[10px] mt-1">
        <BookmarkPlus size={10} className="text-gray-400 shrink-0" />
        {summary.confirmedSlots > 0 && (
          <span className="text-red-600 font-medium">{summary.confirmedSlots} thuê</span>
        )}
        {summary.pendingSlots > 0 && (
          <span className="text-amber-600 font-medium">
            {summary.confirmedSlots > 0 ? '· ' : ''}{summary.pendingSlots} book
          </span>
        )}
        {!hasActivity && (
          <span className="text-green-600">{summary.vacantSlots}/{summary.totalSlots} ô trống</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="flex items-center gap-1 text-gray-500">
        <BookmarkPlus size={12} className="text-gray-500" />
        {summary.totalSlots} ô · {summary.totalSlotArea.toLocaleString('vi-VN')} m²
      </span>
      {summary.confirmedSlots > 0 && (
        <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">
          {summary.confirmedSlots} đang thuê ({summary.bookedArea.toLocaleString('vi-VN')} m²)
        </span>
      )}
      {summary.pendingSlots > 0 && (
        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">
          {summary.pendingSlots} chờ book ({summary.pendingArea.toLocaleString('vi-VN')} m²)
        </span>
      )}
      {summary.vacantSlots > 0 && (
        <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600">
          {summary.vacantSlots} trống
        </span>
      )}
    </div>
  );
}
