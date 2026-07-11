import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { spacesApi } from '@/api';
import { mediaUrl, STATUS_CONFIG } from '@/pages/spaces/spaces.constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Columns } from 'lucide-react';

export function CompareModal({
  unitIds,
  open,
  onClose,
}: {
  unitIds: string[];
  open: boolean;
  onClose: () => void;
}) {
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
            So sánh {unitIds.length} mặt bằng
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 text-center text-gray-400">Đang tải...</div>
        ) : units.length > 0 && (
          <div className="space-y-4">
            {/* Summary */}
            {summary && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Giá thuê TB</div>
                  <div className="font-semibold">{Number(summary.avgRent).toLocaleString()} ₫/m²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Diện tích TB</div>
                  <div className="font-semibold">{Number(summary.avgArea).toLocaleString()} m²</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Range giá</div>
                  <div className="font-semibold text-sm">{summary.minRent.toLocaleString()} - {summary.maxRent.toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Thuộc tính</th>
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
                    <td className="py-2 px-3 text-gray-500">Trạng thái</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">
                        <Badge className={STATUS_CONFIG[u.status]?.color}>{STATUS_CONFIG[u.status]?.label}</Badge>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Diện tích NLA</td>
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
                    <td className="py-2 px-3 text-gray-500">Giá thuê/m²</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-medium">
                        {u.baseRentPerSqm.toLocaleString()} ₫
                        <span className={`ml-1 text-xs ${Number(u.rentVsAvg) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({u.rentVsAvg > 0 ? '+' : ''}{u.rentVsAvg}%)
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Phí CAM/m²</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.camPerSqm.toLocaleString()} ₫</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Tổng/tháng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3 font-semibold text-gray-700">
                        {u.totalMonthlyRent?.toLocaleString()} ₫
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Ngành hàng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.category ?? '—'}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 text-gray-500">Tầng</td>
                    {units.map((u: any) => (
                      <td key={u.id} className="py-2 px-3">{u.floor?.name ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-gray-500">Khách thuê</td>
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
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
