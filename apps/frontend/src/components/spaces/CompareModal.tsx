import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { mediaUrl, STATUS_CONFIG } from '@/pages/spaces/spaces.constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Columns } from 'lucide-react';
import { formatVndAmount, formatVndRate, getUnitStatusLabel } from '@/pages/spaces/spacesPresentation';

export function CompareModal({
  unitIds,
  open,
  onClose,
}: {
  unitIds: string[];
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(['spaces', 'common']);
  const { data, isLoading } = useQuery({
    queryKey: ['compare-units', unitIds],
    queryFn: () => spacesApi.compareUnits(unitIds),
    enabled: open && unitIds.length >= 2,
  });

  const units = data?.units ?? [];
  const summary = data?.summary;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns size={18} className="text-gray-500" />
            {t('spaces:compare.unitCount', { count: unitIds.length })}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 text-center text-gray-400">{t('spaces:compare.loading')}</div>
        ) : units.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-gray-500">{t('spaces:compare.avgRent')}</div>
                  <div className="font-semibold tabular-nums">{formatVndRate(Number(summary.avgRent))}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">{t('spaces:compare.avgArea')}</div>
                  <div className="font-semibold">{Number(summary.avgArea).toLocaleString()} m²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">{t('spaces:compare.priceRange')}</div>
                  <div className="font-semibold text-sm tabular-nums">{formatVndAmount(summary.minRent)} – {formatVndAmount(summary.maxRent)}</div>
                </div>
              </div>
            )}

            {/* Comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">{t('spaces:compare.attribute')}</th>
                    {units.map((u: any) => (
                      <th key={u.id} className="text-left py-2 px-3 font-semibold">
                        {u.code}
                        {u.media?.[0]?.fileUrl && (
                          <img src={mediaUrl(u.media[0].fileUrl)} alt="" className="w-20 h-14 object-cover rounded mt-1" />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">{t('spaces:compare.statusRow')}</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">
                        <Badge className={STATUS_CONFIG[u.status]?.color}>{getUnitStatusLabel(t, u.status)}</Badge>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">{t('spaces:compare.areaNLA')}</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {u.areaNLA.toLocaleString()} m²
                        <span className={`ml-1 text-xs ${Number(u.areaVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.areaVsAvg > 0 ? '+' : ''}{u.areaVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">{t('spaces:compare.rentPerSqm')}</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {formatVndAmount(u.baseRentPerSqm)}
                        <span className={`ml-1 text-xs ${Number(u.rentVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.rentVsAvg > 0 ? '+' : ''}{u.rentVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">{t('spaces:compare.camPerSqm')}</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 tabular-nums">{formatVndAmount(u.camPerSqm)}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">{t('spaces:compare.totalMonthly')}</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-semibold text-gray-700">
                        {formatVndAmount(u.totalMonthlyRent)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">{t('spaces:compare.category')}</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.category ?? '—'}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">{t('spaces:compare.floor')}</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.floor?.name ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-gray-500">{t('spaces:compare.tenant')}</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.tenant?.brandName ?? '—'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
