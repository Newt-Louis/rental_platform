import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { AlertCircle, Clock } from 'lucide-react';

export function SpacesAlerts({ mallId }: { mallId?: string | null }) {
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

  if (staleCount === 0 && expiringCritical === 0 && expiringWarning === 0) return null;

  return (
    <div className="flex gap-3 mb-4 flex-wrap">
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
