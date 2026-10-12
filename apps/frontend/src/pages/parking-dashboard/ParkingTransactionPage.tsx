import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, DataTableSort } from '@/components/ui/data-table';
import { ScanLine, Search, Download, ImageIcon, X, Tag, SlidersHorizontal, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateTimeVN } from '@/lib/utils';
import { formatMoney } from '@/lib/currency';
import { TransactionFilterDrawer, TransactionFilterState } from './components/TransactionFilterDrawer';

// Parking transactions are currency-less by design (VND is the platform's
// implicit unit) — see apps/frontend/src/lib/currency.ts and CR-111.
function fmtVnd(n: number) {
  return formatMoney(n, 'VND');
}

function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function VoucherDetailContent({ rowData, t }: { rowData: ParkingTransactionRow; t: (key: string, fallback: string) => string }) {
  return (
    <>
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
      {!rowData.promotionDetail?.voucherBillAmount && !rowData.promotionDetail?.voucherCouponAmount ? (
        <p className="text-gray-500">{rowData.voucherCode}</p>
      ) : null}
    </>
  );
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
  voucherTypeName?: string;
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
  promotionType: '',
  paymentStatus: '',
  invoiceStatus: '',
  voucherTypeNames: [],
};

const STORAGE_KEY = 'parking-transactions-view';

interface PersistedView {
  parkingCode: string;
  appliedDrawer: TransactionFilterState;
  sort: DataTableSort;
  page: number;
}

function loadView(): Partial<PersistedView> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const PAGE_SIZE = 50;

function unwrapTransactionsPage(page: unknown): { items: ParkingTransactionRow[]; total: number } {
  const result = (page as { data?: unknown })?.data ?? page;
  const payload = result as { items?: ParkingTransactionRow[]; total?: number };
  return { items: payload?.items ?? [], total: payload?.total ?? 0 };
}

export default function ParkingTransactionPage() {
  const { t } = useTranslation('parking');
  const { toast } = useToast();

  const { data: tenantsRes } = useQuery({
    queryKey: ['parking-tenants'],
    queryFn: () => parkingDashboardApi.getTenants(),
  });
  const tenants: { parkingCode: string; name: string }[] = tenantsRes?.data ?? tenantsRes ?? [];

  const saved = useMemo(loadView, []);
  const [parkingCode, setParkingCode] = useState(saved.parkingCode ?? '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerForm, setDrawerForm] = useState<TransactionFilterState>({ ...emptyDrawerFilter, ...saved.appliedDrawer });
  const [appliedDrawer, setAppliedDrawer] = useState<TransactionFilterState>({ ...emptyDrawerFilter, ...saved.appliedDrawer });
  const [sort, setSort] = useState<DataTableSort>(saved.sort ?? { field: 'check_in_time', dir: 'desc' });
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState<ParkingTransactionRow | null>(null);
  const [hoveredPromotionRowId, setHoveredPromotionRowId] = useState<string | null>(null);
  const [hoveredVoucherRowId, setHoveredVoucherRowId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const now = new Date();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState(now.getMonth() + 1);
  const [exportYear, setExportYear] = useState(now.getFullYear());
  const [page, setPage] = useState(saved.page ?? 1);
  const exportAbortRef = useRef<AbortController | null>(null);

  // Cancel an in-flight export on unmount, so navigating away doesn't leave it running
  // orphaned on the server.
  useEffect(() => {
    return () => exportAbortRef.current?.abort();
  }, []);

  if (!parkingCode && tenants.length > 0) setParkingCode(tenants[0].parkingCode);

  const appliedFilter = useMemo(
    () => ({
      parkingCode,
      startDate: appliedDrawer.startDate,
      endDate: appliedDrawer.endDate,
      search: appliedDrawer.search || undefined,
      laneId: appliedDrawer.laneId ? Number(appliedDrawer.laneId) : undefined,
      promotionType: appliedDrawer.promotionType || undefined,
      paymentStatus: splitCsv(appliedDrawer.paymentStatus),
      invoiceStatus: splitCsv(appliedDrawer.invoiceStatus),
      voucherTypeNames: appliedDrawer.voucherTypeNames.length ? appliedDrawer.voucherTypeNames : undefined,
      sortBy: sort.field as any,
      sortDir: sort.dir,
    }),
    [parkingCode, appliedDrawer, sort],
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['parking-transactions-v2', appliedFilter, page],
    queryFn: () => parkingDashboardApi.getTransactionsV2({ ...appliedFilter, page, limit: PAGE_SIZE }),
    enabled: !!parkingCode && !!appliedFilter.startDate && !!appliedFilter.endDate,
    placeholderData: keepPreviousData,
  });

  const { items: rawItems, total } = useMemo(() => unwrapTransactionsPage(data), [data]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const items = useMemo(
    () =>
      rawItems.map((row) => ({
        ...row,
        entryTime: formatDateTimeVN(row.entryTime),
        exitTime: formatDateTimeVN(row.exitTime),
      })),
    [rawItems],
  );

  const filterKey = JSON.stringify(appliedFilter);
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setPage(1);
    }
  }, [filterKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ parkingCode, appliedDrawer, sort, page }));
    } catch {
      /* storage unavailable */
    }
  }, [parkingCode, appliedDrawer, sort, page]);

  const { data: voucherTypesRes } = useQuery({
    queryKey: ['parking-voucher-types', parkingCode],
    queryFn: () => parkingDashboardApi.getVoucherTypes(parkingCode),
    enabled: !!parkingCode,
  });
  const voucherTypeOptions: string[] = voucherTypesRes?.data ?? voucherTypesRes ?? [];

  function applyFilters() {
    setAppliedDrawer(drawerForm);
    setDrawerOpen(false);
  }

  function handleSort(field: string) {
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' }));
  }

  // Export always targets one calendar month picked in a dedicated dialog — never the
  // filter bar's (arbitrary-width) date range.
  function monthRange(year: number, month1to12: number): { startDate: string; endDate: string } {
    const lastDay = new Date(year, month1to12, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      startDate: `${year}-${pad(month1to12)}-01T00:00`,
      endDate: `${year}-${pad(month1to12)}-${pad(lastDay)}T23:59`,
    };
  }

  const handleExport = async () => {
    setExportDialogOpen(false);
    const { startDate, endDate } = monthRange(exportYear, exportMonth);

    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExporting(true);
    try {
      const blob = await parkingDashboardApi.exportTransactions({ parkingCode, startDate, endDate }, controller.signal);
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ParkingHistory-${exportYear}-${String(exportMonth).padStart(2, '0')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      if (error?.code === 'ERR_CANCELED') return; // navigated away — not a real failure
      toast({
        title: error?.response?.data?.message ?? t('transaction.exportError', 'Không thể xuất Excel'),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnDef<ParkingTransactionRow, any>[] = [
    { accessorKey: 'recordId', header: t('transaction.col.recordId', 'Mã'), meta: { sortField: undefined } },
    { accessorKey: 'vehicleTypeName', header: t('transaction.col.vehicleType', 'Loại xe') },
    {
      accessorKey: 'cardCode',
      header: t('transaction.col.cardCode', 'Mã thẻ'),
      cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
    },
    {
      id: 'plates',
      header: t('transaction.col.plates', 'Biển số (vào / ra)'),
      cell: ({ row }) => (
        <span className="inline-flex items-start gap-1.5">
          <span className="flex flex-col leading-tight">
            <span>{row.original.entryLicensePlate}</span>
            <span>{row.original.exitLicensePlate}</span>
          </span>
          {row.original.alprMatched === false && (
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" aria-label={t('transaction.col.alprMismatch', 'ALPR không khớp')} />
          )}
          {row.original.alprMatched === true && (
            <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-green-500" aria-label={t('transaction.col.alprMatched', 'ALPR khớp')} />
          )}
        </span>
      ),
    },
    { accessorKey: 'entryTime', header: t('transaction.col.entryTime', 'Giờ vào'), meta: { sortField: 'check_in_time' } },
    { accessorKey: 'exitTime', header: t('transaction.col.exitTime', 'Giờ ra'), meta: { sortField: 'check_out_time' } },
    { accessorKey: 'durationDisplay', header: t('transaction.col.duration', 'Thời gian đỗ'), meta: { sortField: 'duration' } },
    {
      id: 'voucherType',
      header: t('transaction.col.voucherType', 'Loại voucher'),
      cell: ({ row }) => {
        const rowData = row.original;
        if (!rowData.voucherTypeName) return <span className="flex justify-center">—</span>;
        return (
          <Popover open={hoveredVoucherRowId === row.id} onOpenChange={(open) => setHoveredVoucherRowId(open ? row.id : null)}>
            <PopoverTrigger asChild>
              <span
                className="flex items-center justify-center gap-1 text-blue-600"
                onMouseEnter={() => setHoveredVoucherRowId(row.id)}
                onMouseLeave={() => setHoveredVoucherRowId(null)}
              >
                <Tag size={16} />
                <span className="text-xs">{rowData.voucherTypeName}</span>
              </span>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-3 text-xs"
              onMouseEnter={() => setHoveredVoucherRowId(row.id)}
              onMouseLeave={() => setHoveredVoucherRowId(null)}
            >
              <VoucherDetailContent rowData={rowData} t={t} />
            </PopoverContent>
          </Popover>
        );
      },
      meta: { align: 'center' },
    },
    {
      accessorKey: 'voucherCode',
      header: t('transaction.col.voucherCode', 'Mã voucher'),
      cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() || '—'}</span>,
    },
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
          <Popover open={hoveredPromotionRowId === row.id} onOpenChange={(open) => setHoveredPromotionRowId(open ? row.id : null)}>
            <PopoverTrigger asChild>
              <button
                className="inline-flex items-center gap-1 text-orange-700"
                onMouseEnter={() => setHoveredPromotionRowId(row.id)}
                onMouseLeave={() => setHoveredPromotionRowId(null)}
              >
                {fmtVnd(rowData.promotion)} <Tag size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-3 text-xs"
              onMouseEnter={() => setHoveredPromotionRowId(row.id)}
              onMouseLeave={() => setHoveredPromotionRowId(null)}
            >
              <VoucherDetailContent rowData={rowData} t={t} />
            </PopoverContent>
          </Popover>
        );
      },
      meta: { align: 'right' },
    },
    {
      id: 'image',
      header: t('transaction.col.image', 'Ảnh'),
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => (row.original.exitLicensePlateImage?.trim() ? setPreviewRow(row.original) : setIncompleteOpen(true))}
        >
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
                showTime
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs text-gray-500">
                {t('transaction.filterDrawer.search', 'Tìm nhanh (biển số / mã voucher)')}
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
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={exporting}
              onClick={() => {
                setExportMonth(now.getMonth() + 1);
                setExportYear(now.getFullYear());
                setExportDialogOpen(true);
              }}
            >
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
            <div className="max-h-[60vh] overflow-auto">
              <DataTable
                columns={columns}
                data={items}
                sort={sort}
                onSortChange={handleSort}
                getRowId={(r) => r.id}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>{t('transaction.pagination.total', 'Tổng {{total}} giao dịch', { total })}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={16} />
                </Button>
                <span>{t('transaction.pagination.page', 'Trang {{page}} / {{totalPages}}', { page, totalPages })}</span>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page >= totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={16} />
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
        voucherTypeOptions={voucherTypeOptions}
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

      <Dialog open={incompleteOpen} onOpenChange={setIncompleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('transaction.dataIncomplete', 'Dữ liệu chưa hoàn tất')}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setIncompleteOpen(false)}>{t('transaction.close', 'Đóng')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('transaction.exportDialog.title', 'Chọn tháng xuất Excel')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            {t('transaction.exportDialog.description', 'Xuất toàn bộ giao dịch trong tháng đã chọn, không phụ thuộc bộ lọc ngày ở trên.')}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-gray-500">{t('transaction.exportDialog.monthLabel', 'Tháng')}</Label>
              <Select value={String(exportMonth)} onValueChange={(v) => setExportMonth(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {t('transaction.exportDialog.month', 'Tháng {{m}}', { m })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-gray-500">{t('transaction.exportDialog.year', 'Năm')}</Label>
              <Select value={String(exportYear)} onValueChange={(v) => setExportYear(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => now.getFullYear() - 9 + i).map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              {t('transaction.filterDrawer.cancel', 'Hủy')}
            </Button>
            <Button onClick={handleExport}>
              <Download size={15} className="mr-1.5" /> {t('transaction.export', 'Xuất Excel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
