import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { AlertCircle, Clock, ClipboardCheck } from 'lucide-react';
import type { HandoverKpis } from '@/api/handover-readiness';

export function SpacesAlerts({
  mallId,
  handoverKpis,
  onOpenHandover,
}: {
  mallId?: string | null;
  /** CR-UNIT-HANDOVER-READINESS -- Mall-scoped KPIs from the server evaluator. */
  handoverKpis?: HandoverKpis;
  onOpenHandover?: () => void;
}) {
  const { data: staleData } = useQuery({
    queryKey: ['stale-vacant', mallId],
    queryFn: () => spacesApi.staleVacantUnits({ mallId: mallId ?? undefined, days: 60 }),
    enabled: true,
  });

  const { data: expiringData } = useQuery({
    queryKey: ['expiring-leases', mallId],
    queryFn: () => spacesApi.expiringLeases({ mallId: mallId ?? undefined, days: 90 }),
    enabled: true,
  });

  const staleCount = staleData?.total ?? 0;
  const expiringCritical = expiringData?.summary?.critical ?? 0;
  const expiringWarning = expiringData?.summary?.warning ?? 0;

  const handoverDue = handoverKpis?.dueWithin30 ?? 0;
  const handoverOverdue = handoverKpis?.overdue ?? 0;

  if (staleCount === 0 && expiringCritical === 0 && expiringWarning === 0 && handoverDue === 0 && handoverOverdue === 0) return null;

  return (
    <div className="flex gap-3 mb-4 flex-wrap">
      {handoverOverdue > 0 && (
        <button
          type="button"
          onClick={onOpenHandover}
          className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-300 rounded-lg text-sm hover:bg-red-100"
          data-testid="handover-alert-overdue"
        >
          <ClipboardCheck size={16} className="text-red-600" />
          <span className="text-red-700">
            <strong>{handoverOverdue}</strong> mặt bằng đã quá hạn bàn giao
          </span>
        </button>
      )}
      {handoverDue > 0 && (
        <button
          type="button"
          onClick={onOpenHandover}
          className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-sm hover:bg-amber-100"
          data-testid="handover-alert-due"
        >
          <ClipboardCheck size={16} className="text-amber-600" />
          <span className="text-amber-800">
            <strong>{handoverDue}</strong> mặt bằng sắp đến hạn bàn giao (≤30 ngày)
          </span>
        </button>
      )}
      {staleCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-red-700">
            <strong>{staleCount}</strong> units trống &gt;60 ngày
          </span>
        </div>
      )}
      {expiringCritical > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm">
          <Clock size={16} className="text-orange-500" />
          <span className="text-orange-700">
            <strong>{expiringCritical}</strong> lease hết hạn trong 30 ngày
          </span>
        </div>
      )}
      {expiringWarning > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <Clock size={16} className="text-amber-500" />
          <span className="text-amber-700">
            <strong>{expiringWarning}</strong> lease hết hạn trong 60 ngày
          </span>
        </div>
      )}
    </div>
  );
}
