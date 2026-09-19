import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { fmtBusinessDate, handoverReadinessApi } from '@/api/handover-readiness';
import { HandoverStatusBadge, handoverDaysLabel } from './handoverPresentation';

/**
 * CR-UNIT-HANDOVER-READINESS -- Analytics block. Rows arrive already ordered by
 * urgency (OVERDUE -> AT_RISK -> TRACKING -> CONFIRMED, then days remaining)
 * and already evaluated; this component only renders.
 */
export function HandoverAnalyticsSection({
  mallId,
  floorId,
  floorName,
  onOpenUnit,
}: {
  mallId?: string | null;
  /** The floor chosen in the Spaces floor bar; list AND KPIs are narrowed server-side. */
  floorId?: string | null;
  floorName?: string | null;
  onOpenUnit?: (unitId: string) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['handover-list', mallId ?? null, floorId ?? null],
    queryFn: () => handoverReadinessApi.list(mallId, floorId),
    retry: false,
  });

  if (isError) return null; // no view permission for this Mall -> section simply absent
  const kpis = data?.kpis;
  const tiles: Array<[string, number | undefined, string]> = [
    ['Đang theo dõi', kpis?.tracking, 'text-sky-700'],
    ['≤30 ngày', kpis?.dueWithin30, 'text-amber-700'],
    ['≤7 ngày', kpis?.dueWithin7, 'text-orange-700'],
    ['Quá hạn', kpis?.overdue, 'text-red-700'],
    ['Xung đột cam kết', kpis?.conflicts, 'text-red-700'],
    ['Đã xác nhận', kpis?.confirmed, 'text-green-700'],
  ];

  return (
    <Card id="handover-readiness" data-testid="handover-analytics">
      <CardContent className="pt-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <ClipboardCheck size={16} className="text-gray-400" />
          Bàn giao mặt bằng từ Ban dự án
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${floorId ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
            data-testid="handover-analytics-scope"
          >
            {floorId ? (floorName ?? 'Tầng đã chọn') : 'Tất cả tầng'}
          </span>
          {data?.asOf && <span className="text-xs font-normal text-gray-400">· tính đến {fmtBusinessDate(data.asOf)}</span>}
        </h3>

        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map(([label, value, color], i) => (
            <div key={label} className={`px-3 py-3 ${i > 0 ? 'border-l border-gray-100' : ''}`}>
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{isLoading ? '…' : value ?? 0}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {!isLoading && (data?.items.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {floorId ? 'Tầng này chưa có mặt bằng nào đang được theo dõi bàn giao.' : 'Chưa có mặt bằng nào đang được theo dõi bàn giao.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium">Mặt bằng</th>
                  <th className="py-2 pr-3 font-medium">Ban dự án dự kiến</th>
                  <th className="py-2 pr-3 font-medium">Dự kiến ban đầu</th>
                  <th className="py-2 pr-3 font-medium">Cam kết với khách</th>
                  <th className="py-2 pr-3 font-medium">Còn lại</th>
                  <th className="py-2 pr-3 font-medium">Trễ</th>
                  <th className="py-2 pr-3 font-medium">Rủi ro CAO</th>
                  <th className="py-2 pr-3 font-medium">Trạng thái</th>
                  <th className="py-2 font-medium">Đầu mối Ban dự án</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((item) => {
                  const e = item.evaluation;
                  const commitment = e.conflict ?? e.earliestCommitment;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-50 ${onOpenUnit ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={() => onOpenUnit?.(item.unitId)}
                      data-testid="handover-analytics-row"
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium">{item.unitCode}</div>
                        <div className="text-xs text-gray-400">{[item.floorName, mallId ? null : item.mallName].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{fmtBusinessDate(item.targetReadyDate)}</td>
                      <td className="py-2 pr-3 tabular-nums text-gray-500">{fmtBusinessDate(item.originalTargetDate)}</td>
                      <td className={`py-2 pr-3 tabular-nums ${e.conflict ? 'font-semibold text-red-700' : 'text-gray-600'}`}>
                        {commitment ? fmtBusinessDate(commitment.commitmentDate) : '—'}
                        {e.conflict && <div className="text-[11px] font-normal">sớm hơn {e.conflict.differenceDays} ngày</div>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{handoverDaysLabel(e)}</td>
                      <td className="py-2 pr-3 tabular-nums">{e.delayDays > 0 ? `${e.delayDays} ngày` : '—'}{e.dateChangeCount > 0 && <div className="text-[11px] text-gray-400">{e.dateChangeCount} lần đổi</div>}</td>
                      <td className={`py-2 pr-3 tabular-nums ${e.openHighRiskCount > 0 ? 'font-semibold text-red-700' : 'text-gray-400'}`}>{e.openHighRiskCount}</td>
                      <td className="py-2 pr-3"><HandoverStatusBadge status={e.status} /></td>
                      <td className="py-2 text-gray-600">{item.projectOwner?.fullName ?? item.projectOwnerName ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
