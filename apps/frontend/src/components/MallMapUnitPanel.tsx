import { useTranslation } from 'react-i18next';
import { X, Building2, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Unit } from '@/types';
import { formatRatePerSqm, getUnitStatusLabel } from '@/pages/spaces/spacesPresentation';
import { statusToken } from './mallMapTheme';

/**
 * CR-SPACES-FLOOR-MAP-UX-001 — the work panel beside the map.
 *
 * Clicking a unit used to throw a floating card over the plan, covering the
 * neighbours the reader was comparing it against. The unit now opens here
 * instead, next to the map, so the plan stays whole.
 *
 * Everything shown comes from the floor-map payload the map already holds.
 * The deeper record — media, sales pipeline, slots, handover — stays behind
 * "view detail", which opens the existing unit sheet with its own permissions
 * rather than a second copy of them.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-gray-400">{label}</span>
      <span className="truncate text-right text-xs font-medium text-gray-700">{children}</span>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-gray-50 px-2.5 py-2">
      <div className="truncate text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

export function MallMapUnitPanel({
  unit, coverUrl, floorName, onClose, onViewDetail, onBook,
}: {
  unit: Unit;
  coverUrl?: string;
  floorName?: string;
  onClose: () => void;
  onViewDetail?: (u: Unit) => void;
  onBook?: (u: Unit) => void;
}) {
  const { t } = useTranslation('spaces');
  const token = statusToken(unit.status);
  const rent = unit.askingRentPerSqm ?? unit.baseRentPerSqm;
  const leaseTerm = unit.leaseTermType
    ? t(`map.panel.lease.${unit.leaseTermType}`, { defaultValue: unit.leaseTermType })
    : null;

  return (
    <aside
      data-testid="map-unit-panel"
      aria-label={t('map.panel.title', { code: unit.code })}
      className="flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:w-[380px] lg:shrink-0"
    >
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-gray-900">{unit.code}</div>
          {unit.name && <div className="truncate text-xs text-gray-500">{unit.name}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            className="border text-xs"
            style={{ background: `${token.surface}33`, borderColor: token.border, color: token.ink }}
          >
            {getUnitStatusLabel(t, unit.status)}
          </Badge>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('map.panel.close')}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-16 items-center justify-center bg-gray-50 text-gray-200">
            <ImageIcon size={24} />
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5 px-4 pt-3">
          <Kpi label={t('map.panel.area')} value={`${unit.areaNLA.toLocaleString('vi-VN')} m²`} />
          <Kpi label={t('map.panel.rent')} value={rent > 0 ? formatRatePerSqm(rent, unit.currencyCode) : '—'} />
          <Kpi label={t('map.panel.leaseType')} value={leaseTerm ?? '—'} />
        </div>

        {unit.tenant && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-green-50 px-2.5 py-2">
            <Building2 size={13} className="shrink-0 text-green-600" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-green-800">{unit.tenant.brandName}</div>
              {unit.tenant.companyName && (
                <div className="truncate text-[11px] text-green-600">{unit.tenant.companyName}</div>
              )}
            </div>
          </div>
        )}

        <div className="px-4 py-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {t('map.panel.information')}
          </div>
          <div className="divide-y divide-gray-50">
            {floorName && <Row label={t('map.panel.floor')}>{floorName}</Row>}
            {unit.zone?.name && <Row label={t('map.zone')}>{unit.zone.name}</Row>}
            {(unit as any).categoryRef?.name || unit.category ? (
              <Row label={t('map.panel.category')}>{(unit as any).categoryRef?.name ?? unit.category}</Row>
            ) : null}
            {unit.areaGFA > 0 && unit.areaGFA !== unit.areaNLA && (
              <Row label={t('map.panel.areaGFA')}>{unit.areaGFA.toLocaleString('vi-VN')} m²</Row>
            )}
            {unit.camPerSqm > 0 && (
              <Row label={t('map.panel.cam')}>{formatRatePerSqm(unit.camPerSqm, unit.currencyCode)}</Row>
            )}
            {(unit.minLeaseTerm || unit.maxLeaseTerm) && (
              <Row label={t('map.panel.term')}>
                {[unit.minLeaseTerm, unit.maxLeaseTerm].filter(Boolean).join('–')} {t('map.panel.months')}
              </Row>
            )}
            {unit.leaseEndDate && (
              <Row label={t('map.panel.leaseEnd')}>{new Date(unit.leaseEndDate).toLocaleDateString('vi-VN')}</Row>
            )}
            {unit.status === 'VACANT' && unit.vacantSince && (
              <Row label={t('map.panel.vacantSince')}>{new Date(unit.vacantSince).toLocaleDateString('vi-VN')}</Row>
            )}
          </div>
        </div>
      </div>

      {(onBook || onViewDetail) && (
        <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
          {onBook && unit.status === 'VACANT' && (
            <Button size="sm" className="h-8 flex-1 text-xs" onClick={() => onBook(unit)}>Booking</Button>
          )}
          {onViewDetail && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 text-xs"
              onClick={() => onViewDetail(unit)}
            >
              {t('detail.viewDetail')}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
