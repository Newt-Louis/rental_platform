import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { parkingApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { AsyncState } from '@/components/ui/async-state';
import { ScanLine, Search, Download, ImageIcon, X } from 'lucide-react';

const PARKING_LOTS = [
  { code: 'sKVuws6s', name: 'Sala' },
  { code: 'e5GPYQMe', name: 'PHI' },
  { code: 'HVkrxUsp', name: 'PVT' },
];

function fmtVnd(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
}

function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface ParkingTransactionRow {
  id: string;
  recordId: string;
  vehicleTypeName?: string;
  cardCode?: string;
  entryLicensePlate?: string;
  exitLicensePlate?: string;
  entryTime: string;
  exitTime: string;
  totalTime?: string;
  parkingFee: number;
  cash: number;
  bankTransfer: number;
  totalAmount: number;
  entryLicensePlateImage?: string | null;
  exitLicensePlateImage?: string | null;
}

export default function ParkingTransactionPage() {
  const { t } = useTranslation('parking');
  const { toast } = useToast();
  const [filterForm, setFilterForm] = useState({
    parkingCode: PARKING_LOTS[0].code,
    startDate: yesterdayIso(),
    endDate: todayIso(),
    cardCode: '',
    licensePlate: '',
  });
  const [appliedFilter, setAppliedFilter] = useState(filterForm);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize] = useState(10);
  const [previewRow, setPreviewRow] = useState<ParkingTransactionRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parking-transactions', appliedFilter, pageIndex, pageSize],
    queryFn: () =>
      parkingApi.getTransactions({ ...appliedFilter, pageIndex, pageSize }),
  });

  const result = data?.data ?? data;
  const rawItems: ParkingTransactionRow[] = result?.items ?? [];
  const totalPages = result?.totalPages ?? 0;
  const totalItems = result?.totalItems ?? 0;

  const items = useMemo(() =>
    rawItems.map((row) => ({
      ...row,
      entryTime: row.entryTime ? new Date(row.entryTime).toLocaleString('vi-VN') : '—',
      exitTime: row.exitTime ? new Date(row.exitTime).toLocaleString('vi-VN') : '—',
    })),
    [rawItems],
  );

  const handleSubmit = () => {
    setPageIndex(1);
    setAppliedFilter(filterForm);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await parkingApi.exportTransactions({ ...appliedFilter, pageIndex: 1, pageSize: 10000 });
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ParkingHistory.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t('transaction.exportError', 'Không thể xuất Excel'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-2">
        <ScanLine size={22} className="text-indigo-600" />
        <h1 className="text-xl font-semibold tracking-tight">{t('transaction.title', 'Giao dịch bãi đỗ xe')}</h1>
      </section>

      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <Label>{t('transaction.parkingLot', 'Bãi đỗ')}</Label>
              <select
                value={filterForm.parkingCode}
                onChange={(e) => setFilterForm((f) => ({ ...f, parkingCode: e.target.value }))}
                className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {PARKING_LOTS.map((p) => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('transaction.startDate', 'Từ ngày')}</Label>
              <Input className="mt-1" type="date" value={filterForm.startDate}
                onChange={(e) => setFilterForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label>{t('transaction.endDate', 'Đến ngày')}</Label>
              <Input className="mt-1" type="date" value={filterForm.endDate}
                onChange={(e) => setFilterForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <Label>{t('transaction.cardCode', 'Mã thẻ')}</Label>
              <Input className="mt-1" value={filterForm.cardCode}
                onChange={(e) => setFilterForm((f) => ({ ...f, cardCode: e.target.value }))} />
            </div>
            <div>
              <Label>{t('transaction.licensePlate', 'Biển số')}</Label>
              <Input className="mt-1" value={filterForm.licensePlate}
                onChange={(e) => setFilterForm((f) => ({ ...f, licensePlate: e.target.value }))} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" className="gap-1.5" disabled={exporting} onClick={handleExport}>
              <Download size={15} /> {exporting ? t('transaction.exporting', 'Đang xuất...') : t('transaction.export', 'Xuất Excel')}
            </Button>
            <Button className="gap-1.5" onClick={handleSubmit}>
              <Search size={15} /> {t('transaction.search', 'Tìm kiếm')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <AsyncState
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            isEmpty={!isLoading && items.length === 0}
            emptyTitle={t('transaction.empty', 'Không có giao dịch nào')}
            loading={<div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="py-2 pr-3">{t('transaction.col.recordId', 'Mã')}</th>
                    <th className="py-2 pr-3">{t('transaction.col.vehicleType', 'Loại xe')}</th>
                    <th className="py-2 pr-3">{t('transaction.col.cardCode', 'Mã thẻ')}</th>
                    <th className="py-2 pr-3">{t('transaction.col.entryPlate', 'Biển vào')}</th>
                    <th className="py-2 pr-3">{t('transaction.col.exitPlate', 'Biển ra')}</th>
                    <th className="py-2 pr-3">{t('transaction.col.entryTime', 'Giờ vào')}</th>
                    <th className="py-2 pr-3">{t('transaction.col.exitTime', 'Giờ ra')}</th>
                    <th className="py-2 pr-3 text-right">{t('transaction.col.totalAmount', 'Tổng thu')}</th>
                    <th className="py-2 pr-3 text-center">{t('transaction.col.image', 'Ảnh')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pr-3">{row.recordId}</td>
                      <td className="py-2 pr-3">{row.vehicleTypeName}</td>
                      <td className="py-2 pr-3">{row.cardCode}</td>
                      <td className="py-2 pr-3">{row.entryLicensePlate}</td>
                      <td className="py-2 pr-3">{row.exitLicensePlate}</td>
                      <td className="py-2 pr-3">{row.entryTime}</td>
                      <td className="py-2 pr-3">{row.exitTime}</td>
                      <td className="py-2 pr-3 text-right font-medium">{fmtVnd(row.totalAmount)}</td>
                      <td className="py-2 pr-3 text-center">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPreviewRow(row)}>
                          <ImageIcon size={15} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
              <span>{t('transaction.total', 'Tổng: {{count}} giao dịch', { count: totalItems })}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={pageIndex <= 1} onClick={() => setPageIndex((p) => p - 1)}>
                  {t('transaction.prev', 'Trước')}
                </Button>
                <span>{pageIndex} / {Math.max(totalPages, 1)}</span>
                <Button size="sm" variant="outline" disabled={pageIndex >= totalPages} onClick={() => setPageIndex((p) => p + 1)}>
                  {t('transaction.next', 'Sau')}
                </Button>
              </div>
            </div>
          </AsyncState>
        </CardContent>
      </Card>

      {previewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewRow(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-sm">{t('transaction.imagePreview', 'Ảnh biển số')} — {previewRow.recordId}</h3>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPreviewRow(null)}>
                <X size={16} />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-gray-500">{t('transaction.entryImage', 'Ảnh vào')}</p>
                {previewRow.entryLicensePlateImage ? (
                  <img src={previewRow.entryLicensePlateImage} alt="entry" className="w-full rounded-lg border" />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-lg border text-xs text-gray-400">
                    {t('transaction.noImage', 'Không có ảnh')}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs text-gray-500">{t('transaction.exitImage', 'Ảnh ra')}</p>
                {previewRow.exitLicensePlateImage ? (
                  <img src={previewRow.exitLicensePlateImage} alt="exit" className="w-full rounded-lg border" />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-lg border text-xs text-gray-400">
                    {t('transaction.noImage', 'Không có ảnh')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
