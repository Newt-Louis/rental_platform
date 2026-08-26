import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { CheckSquare, Square, GitMerge } from 'lucide-react';
import { SlotSummaryBadge } from '@/components/SlotSummaryBadge';
import { STATUS_CONFIG } from '@/pages/spaces/spaces.constants';
import { formatVndRate, getUnitStatusLabel } from '@/pages/spaces/spacesPresentation';
import type { Unit, UnitSlotSummary } from '@/types';

export function UnitCard({
  unit,
  onClick,
  selectionMode,
  isSelected,
  onToggleSelect,
  slotSummary,
}: {
  unit: Unit;
  onClick: () => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  slotSummary?: UnitSlotSummary | null;
}) {
  const { t } = useTranslation('spaces');
  const cfg = STATUS_CONFIG[unit.status] ?? STATUS_CONFIG.VACANT;
  return (
    <Card
      className={`h-full cursor-pointer border-gray-200 shadow-none transition-colors hover:border-gray-400 hover:bg-gray-50/50 group ${
        isSelected ? 'ring-2 ring-blue-500 bg-gray-50' : ''
      }`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-start gap-2">
            {selectionMode && (
              <div
                className="pt-0.5 shrink-0"
                onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
              >
                {isSelected ? (
                  <CheckSquare size={16} className="text-blue-600" />
                ) : (
                  <Square size={16} className="text-gray-300 hover:text-gray-500" />
                )}
              </div>
            )}
            <div>
              <div className="font-semibold text-sm">{unit.code}</div>
              {unit.name && <div className="text-xs text-gray-400">{unit.name}</div>}
            </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{getUnitStatusLabel(t, unit.status)}</span>
        </div>
        <div className="text-xs text-gray-500 space-y-0.5">
          <div className="flex items-center gap-1">
            <span>{unit.floor?.name ?? '—'} · {unit.zone?.name ?? '—'}</span>
            {(unit as any).isCombined && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-violet-100 text-violet-600 rounded text-[10px] font-medium">
                <GitMerge size={9} /> {t('detail.combined')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>{unit.areaNLA.toLocaleString()} m² NLA</span>
            {unit.baseRentPerSqm > 0 && (
              <span className="text-green-700 tabular-nums">{formatVndRate(unit.baseRentPerSqm)}</span>
            )}
          </div>
          {unit.category && <div className="text-gray-700">{unit.category}</div>}
          <SlotSummaryBadge summary={slotSummary} compact />
          {unit.tenant && <div className="font-medium text-gray-700 pt-1">{unit.tenant.brandName}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
