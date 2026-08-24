import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { parkingDashboardApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { AsyncState } from '@/components/ui/async-state';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DataTable, DataTableSort } from '@/components/ui/data-table';
import { ScanLine, Search, Download, ImageIcon, X, Tag, SlidersHorizontal, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDateTimeVN } from '@/lib/utils';
import { TransactionFilterDrawer, TransactionFilterState } from './components/TransactionFilterDrawer';

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

function splitCsv(v: string): string[] | undefined {
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
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
  durationDisplay?: string;
  voucherCode?: string;
  parkingFee: number;
  inFee?: number;
  outFee?: number;
  cash: number;
  bankTransfer: number;
  totalAmount: number;
  isOnlinePayment?: boolean;
  onlinePaymentStatus?: string | null;
  invoiceStatus?: string | null;
  invoiceNo?: string | null;
  checkInLaneId?: number | null;
  checkOutLaneId?: number | null;
  checkInOperatorId?: number | null;
  checkOutOperatorId?: number | null;
  alprMatched?: boolean;
  promotion?: number;
  promotionDetail?: {
    voucherBillNumber?: string | null;
    voucherBillAmount?: number;
    voucherBillCompany?: string | null;
    voucherCouponCode?: string | null;
    voucherCouponAmount?: number;
    voucherCouponCompany?: string | null;
  };
  entryLicensePlateImage?: string | null;
  exitLicensePlateImage?: string | null;
}

const emptyDrawerFilter: TransactionFilterState = {
  startDate: yesterdayIso(),
  endDate: todayIso(),
  search: '',
  laneId: '',
  promotionUsed: false,
  paymentStatus: '',
  invoiceStatus: '',
};

export default function ParkingTransactionPage() {
  const { t } = useTranslation('parking');
  const { toast } = useToast();

  const { data: tenantsRes } = useQuery({
    queryKey: ['parking-tenants'],
    queryFn: () => parkingDashboardApi.getTenants(),
  });
  const tenants: { parkingCode: string; name: string }[] = tenantsRes?.data ?? tenantsRes ?? [];

  const [parkingCode, setParkingCode] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerForm, setDrawerForm] = useState<TransactionFilterState>(emptyDrawerFilter);
  const [appliedDrawer, setAppliedDrawer] = useState<TransactionFilterState>(emptyDrawerFilter);
  const [sort, setSort] = useState<DataTableSort>({ field: 'check_in_time', dir: 'desc' });
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [previewRow, setPreviewRow] = useState<ParkingTransactionRow | null>(null);
  const [exporting, setExporting] = useState(false);

  if (!parkingCode && tenants.length > 0) setParkingCode(tenants[0].parkingCode);

  const appliedFilter = useMemo(
    () => ({
      parkingCode,
      startDate: appliedDrawer.startDate,
      endDate: appliedDrawer.endDate,
      search: appliedDrawer.search || undefined,
      laneId: appliedDrawer.laneId ? Number(appliedDrawer.laneId) : undefined,
      promotionUsed: appliedDrawer.promotionUsed || undefined,
      paymentStatus: splitCsv(appliedDrawer.paymentStatus),
      invoiceStatus: splitCsv(appliedDrawer.invoiceStatus),
      sortBy: sort.field as any,
      sortDir: sort.dir,
    }),
    [parkingCode, appliedDrawer, sort],
  );

  const cursor = cursorStack[pageIndex] ?? undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parking-transactions-v2', appliedFilter, cursor],
    queryFn: () => parkingDashboardApi.getTransactionsV2({ ...appliedFilter, cursor, limit: 25 }),
    enabled: !!parkingCode && !!appliedFilter.startDate && !!appliedFilter.endDate,
  });

  const result = data?.data ?? data;
  const rawItems: ParkingTransactionRow[] = result?.items ?? [];
  const hasMore: boolean = result?.hasMore ?? false;
  const nextCursor: string | null = result?.nextCursor ?? null;

  const items = useMemo(
    () =>
      rawItems.map((row) => ({
        ...row,
        entryTime: formatDateTimeVN(row.entryTime),
        exitTime: formatDateTimeVN(row.exitTime),
      })),
    [rawItems],
  );

  function applyFilters() {
    setAppliedDrawer(drawerForm);
    setCursorStack([null]);
    setPageIndex(0);
    setDrawerOpen(false);
  }

  function handleSort(field: string) {
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' }));
    setCursorStack([null]);
    setPageIndex(0);
  }

  function goNext() {
    if (!hasMore || !nextCursor) return;
    setCursorStack((stack) => (pageIndex + 1 < stack.length ? stack : [...stack, nextCursor]));
    setPageIndex((p) => p + 1);
  }

  function goPrev() {
    setPageIndex((p) => Math.max(0, p - 1));
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await parkingDashboardApi.exportTransactions({
        parkingCode,
        startDate: appliedDrawer.startDate,
        endDate: appliedDrawer.endDate,
      });
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

  const columns: ColumnDef<ParkingTransactionRow, any>[] = [
    { accessorKey: 'recordId', header: t('transaction.col.recordId', 'Mã'), meta: { sortField: undefined } },
    { accessorKey: 'vehicleTypeName', header: t('transaction.col.vehicleType', 'Loại xe') },
    { accessorKey: 'cardCode', header: t('transaction.col.cardCode', 'Mã thẻ') },
    {
      id: 'plates',
      header: t('transaction.col.plates', 'Biển số (vào / ra)'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5">
          {row.original.entryLicensePlate} / {row.original.exitLicensePlate}
          {row.original.alprMatched === false && (
            <AlertTriangle size={12} className="text-amber-500" aria-label={t('transaction.col.alprMismatch', 'ALPR không khớp')} />
          )}
          {row.original.alprMatched === true && (
            <CheckCircle2 size={12} className="text-green-500" aria-label={t('transaction.col.alprMatched', 'ALPR khớp')} />
          )}
        </span>
      ),
    },
    { accessorKey: 'entryTime', header: t('transaction.col.entryTime', 'Giờ vào'), meta: { sortField: 'check_in_time' } },
    { accessorKey: 'exitTime', header: t('transaction.col.exitTime', 'Giờ ra'), meta: { sortField: 'check_out_time' } },
    {
      id: 'lane',
      header: t('transaction.col.lane', 'Làn (vào/ra)'),
      cell: ({ row }) => `${row.original.checkInLaneId ?? '—'} / ${row.original.checkOutLaneId ?? '—'}`,
    },
    { accessorKey: 'durationDisplay', header: t('transaction.col.duration', 'Thời gian đỗ'), meta: { sortField: 'duration' } },
    { accessorKey: 'voucherCode', header: t('transaction.col.voucherCode', 'Mã voucher') },
    { accessorKey: 'cash', header: t('transaction.col.cash', 'Tiền mặt'), cell: ({ getValue }) => fmtVnd(getValue()), meta: { align: 'right' } },
    {
      id: 'bankTransfer',
      header: t('transaction.col.bankTransfer', 'Chuyển khoản'),
      cell: ({ row }) => (
        <>
          {fmtVnd(row.original.bankTransfer)}
          {row.original.isOnlinePayment && (
            <Badge variant="blue" className="ml-1.5 align-middle">
              {t('transaction.onlinePayment', 'Online')}
            </Badge>
          )}
        </>
      ),
      meta: { align: 'right' },
    },
    {
      accessorKey: 'totalAmount',
      header: t('transaction.col.totalAmount', 'Tổng thu'),
      cell: ({ getValue }) => <span className="font-medium">{fmtVnd(getValue())}</span>,
      meta: { align: 'right', sortField: 'total_fee' },
    },
    {
      id: 'promotion',
      header: t('transaction.col.promotion', 'Khuyến mãi'),
      cell: ({ row }) => {
        const rowData = row.original;
        if (!rowData.promotion) return '—';
        return (
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 text-orange-700 hover:underline">
                {fmtVnd(rowData.promotion)} <Tag size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 text-xs">
              <p className="mb-2 font-semibold text-gray-700">{t('transaction.promotionDetail', 'Chi tiết khuyến mãi')}</p>
              {rowData.promotionDetail?.voucherBillAmount ? (
                <div className="mb-1.5">
                  <p className="text-gray-500">{t('transaction.voucherBill', 'Voucher hóa đơn')}</p>
                  <p>{rowData.promotionDetail.voucherBillNumber} · {rowData.promotionDetail.voucherBillCompany}</p>
                  <p className="font-medium">{fmtVnd(rowData.promotionDetail.voucherBillAmount)}</p>
                </div>
              ) : null}
              {rowData.promotionDetail?.voucherCouponAmount ? (
                <div>
                  <p className="text-gray-500">{t('transaction.voucherCoupon', 'Voucher coupon')}</p>
                  <p>{rowData.promotionDetail.voucherCouponCode} · {rowData.promotionDetail.voucherCouponCompany}</p>
                  <p className="font-medium">{fmtVnd(rowData.promotionDetail.voucherCouponAmount)}</p>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        );
      },
      meta: { align: 'right' },
    },
    {
      id: 'invoiceStatus',
      header: t('transaction.col.invoiceStatus', 'Hóa đơn'),
      cell: ({ row }) =>
        row.original.invoiceStatus ? <Badge variant="outline">{row.original.invoiceStatus}</Badge> : '—',
    },
    {
      id: 'image',
      header: t('transaction.col.image', 'Ảnh'),
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPreviewRow(row.original)}>
          <ImageIcon size={15} />
        </Button>
      ),
      meta: { align: 'center' },
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-2">
        <ScanLine size={22} className="text-indigo-600" />
        <h1 className="text-xl font-semibold tracking-tight">{t('transaction.title', 'Giao dịch bãi đỗ xe')}</h1>
      </section>

      <Card className="border-slate-200">
        <CardContent className="pt-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">{t('transaction.parkingLot', 'Bãi đỗ')}</Label>
              <Select value={parkingCode} onValueChange={setParkingCode}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((p) => (
                    <SelectItem key={p.parkingCode} value={p.parkingCode}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">{t('transaction.dateRange', 'Khoảng ngày')}</Label>
              <DateRangePicker
                className="w-full"
                from={drawerForm.startDate}
                to={drawerForm.endDate}
                onFromChange={(v) => setDrawerForm((f) => ({ ...f, startDate: v }))}
                onToChange={(v) => setDrawerForm((f) => ({ ...f, endDate: v }))}
                placeholder={t('transaction.dateRange', 'Khoảng ngày')}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs text-gray-500">
                {t('transaction.filterDrawer.search', 'Tìm nhanh (biển số / thẻ / hóa đơn / mã đặt chỗ)')}
              </Label>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  className="h-9 pl-8"
                  value={drawerForm.search}
                  onChange={(e) => setDrawerForm((f) => ({ ...f, search: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="outline" className="gap-1.5" onClick={() => setDrawerOpen(true)}>
              <SlidersHorizontal size={15} /> {t('transaction.filterDrawer.title', 'Bộ lọc nâng cao')}
            </Button>
            <Button variant="outline" className="gap-1.5" disabled={exporting} onClick={handleExport}>
              <Download size={15} /> {exporting ? t('transaction.exporting', 'Đang xuất...') : t('transaction.export', 'Xuất Excel')}
            </Button>
            <Button className="gap-1.5" onClick={applyFilters}>
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
            <DataTable columns={columns} data={items} sort={sort} onSortChange={handleSort} getRowId={(r) => r.id} />

            <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
              <span>{t('transaction.pageInfo', 'Trang {{page}}', { page: pageIndex + 1 })}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={pageIndex <= 0} onClick={goPrev}>
                  {t('transaction.prev', 'Trước')}
                </Button>
                <Button size="sm" variant="outline" disabled={!hasMore} onClick={goNext}>
                  {t('transaction.next', 'Sau')}
                </Button>
              </div>
            </div>
          </AsyncState>
        </CardContent>
      </Card>

      <TransactionFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={drawerForm}
        onChange={setDrawerForm}
        onApply={applyFilters}
      />

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
