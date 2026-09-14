import { cloneElement, useEffect, useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { bookingApi } from '@/api';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NumericField } from '@/components/form/NumericField';
import { buildProposalPrefill } from '@/pages/bookings/proposal-prefill';
import { formatMoneyWithCode, type CurrencyCode } from '@/lib/currency';

/**
 * THE single Proposal-conversion form.
 *
 * Both entry points — the Spaces unit detail and the Bookings list — render this
 * component and submit the identical DTO. Before consolidation there were two
 * independently written dialogs whose field sets were almost disjoint, so which
 * screen a user happened to start from silently determined which contractual
 * terms the Proposal ended up carrying. See docs/audit/RENT_FREE_DATA_RISK.md.
 *
 * Numeric fields go through `NumericField` (react-hook-form `useController` +
 * NumericFormat). They must NOT be wired with `register()`: `<Input
 * type="number">` renders a controlled NumericFormat and `register()` supplies
 * no `value`, so the field silently fails to repopulate on `reset()`.
 *
 * Field classification (parity matrix in docs/audit/RENT_FREE_DATA_RISK.md):
 *   REQUIRED                 area, term, startDate, rentPerSqm
 *   VISIBLE_BUSINESS_DEFAULT deposit=3, fitoutDays=90, paymentTermDays=30
 *   OPTIONAL_ZERO_ALLOWED    camPerSqm, serviceFeeSqm, businessSupportFeeSqm,
 *                            rentFree, escalationPercent, utilityFee,
 *                            afterHoursFee, depositFitout, fitoutFee
 *   OPTIONAL                 businessModel, handoverDate, openingDate,
 *                            operatingHours, specialConditions, notes
 *   DERIVED                  depositLease (0 → backend computes deposit × rent)
 *
 * SEM-001: `rentFree` is MONTHS everywhere. Do not relabel it as days.
 */

export type ProposalConversionBooking = {
  id: string;
  bookingNumber?: string;
  unit?: { code?: string } | null;
  lead?: { brandName?: string } | null;
  customer?: { companyName?: string } | null;
} & Record<string, unknown>;

/** Numeric form state is already `number | null`; only strip the nulls. */
const numOrUndef = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
/** Fields where a missing value must reach the API as an explicit 0. */
const numOrZero = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 text-xs font-medium uppercase tracking-wider text-gray-400">
      {children}
    </div>
  );
}

/**
 * Associates the label with its control via a generated id, so the field is
 * reachable by assistive tech (and by getByLabelText in tests) rather than
 * being a bare visual caption. `NumericField` does its own labelling.
 */
function Field({
  label, required = false, children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactElement;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {cloneElement(children, { id, 'aria-required': required || undefined } as any)}
    </div>
  );
}

/**
 * Radix `Select` does not forward an `id` from its root to the trigger button,
 * so a label's `htmlFor` pointing at the root resolves to nothing. The id must
 * go on `SelectTrigger` — which is the element the user actually focuses.
 */
function SelectField({
  label, value, onChange, options, placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-9">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ProposalConversionForm({
  booking,
  open,
  onClose,
  onSuccess,
}: {
  booking: ProposalConversionBooking | null;
  open: boolean;
  onClose: () => void;
  /** Entry-point specific follow-up (cache keys to invalidate, navigation). */
  onSuccess?: (result: any) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const {
    register, handleSubmit, watch, setValue, reset, control,
    formState: { errors },
  } = useForm({
    defaultValues: buildProposalPrefill(null),
    mode: 'onSubmit',
  });

  // Repopulates every field — including the NumericFormat-backed ones, which is
  // only true because they are bound through useController rather than register.
  useEffect(() => {
    if (open && booking) reset(buildProposalPrefill(booking as any));
  }, [booking, open, reset]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      bookingApi.convertToProposal(booking!.id, {
        // ── A. Mặt bằng & Thời hạn ──
        area: numOrUndef(data.area),
        term: numOrUndef(data.term),
        startDate: data.startDate,
        businessModel: str(data.businessModel),
        // ── B. Điều khoản Tài chính ──
        rentCurrency: data.rentCurrency || 'VND',
        rentPerSqm: numOrUndef(data.rentPerSqm),
        camPerSqm: numOrUndef(data.camPerSqm),
        serviceFeeSqm: numOrUndef(data.serviceFeeSqm),
        businessSupportFeeSqm: numOrUndef(data.businessSupportFeeSqm),
        deposit: numOrUndef(data.deposit),
        // SEM-001 — MONTHS.
        rentFree: numOrZero(data.rentFree),
        escalationPercent: numOrZero(data.escalationPercent),
        paymentTermDays: numOrUndef(data.paymentTermDays),
        // 0 means "let the backend derive it from deposit × monthlyRent".
        depositLease: Number(data.depositLease) > 0 ? Number(data.depositLease) : undefined,
        depositFitout: numOrZero(data.depositFitout),
        fitoutFee: numOrZero(data.fitoutFee),
        utilityFee: numOrZero(data.utilityFee),
        afterHoursFee: numOrZero(data.afterHoursFee),
        // ── C. Tiến độ & Bàn giao ──
        fitoutDays: numOrUndef(data.fitoutDays),
        handoverDate: str(data.handoverDate),
        openingDate: str(data.openingDate),
        // ── D. Điều khoản khác ──
        operatingHours: str(data.operatingHours),
        specialConditions: str(data.specialConditions),
        notes: str(data.notes),
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['unit-detail'] });
      qc.invalidateQueries({ queryKey: ['units'] });
      toast({ title: 'Đã tạo đề xuất thành công' });
      onClose();
      onSuccess?.(result);
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const currency = (watch('rentCurrency') ?? 'VND') as CurrencyCode;
  const area = Number(watch('area') || 0);
  const rent = Number(watch('rentPerSqm') || 0);
  const cam = Number(watch('camPerSqm') || 0);
  const svc = Number(watch('serviceFeeSqm') || 0);
  const bsf = Number(watch('businessSupportFeeSqm') || 0);
  const rentFreeMonths = Number(watch('rentFree') || 0);
  const monthlyTotal = area * (rent + cam + svc + bsf);

  const party = booking?.lead?.brandName ?? booking?.customer?.companyName ?? '—';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lập Tờ Trình Đề xuất từ Booking {booking?.bookingNumber ?? ''}</DialogTitle>
          {booking?.unit?.code && (
            <p className="text-sm text-muted-foreground">
              Mặt bằng {booking.unit.code} · {party}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 pb-2 text-sm">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
            Đã kế thừa mặt bằng, khách hàng, diện tích, thời hạn, giá thuê, CAM và ghi chú từ Booking.
            Các giá trị mặc định (cọc 3 tháng, thi công 90 ngày, thanh toán 30 ngày) đã điền sẵn — vui lòng
            kiểm tra trước khi lập đề xuất.
          </div>

          {/* ═══ A. Mặt bằng & Thời hạn ═══ */}
          <SectionHeading>A. Mặt bằng &amp; Thời hạn</SectionHeading>
          <div className="grid grid-cols-3 gap-3">
            <NumericField control={control} name="area" label="Diện tích (m²)" kind="DECIMAL" required />
            <NumericField control={control} name="term" label="Thời hạn (tháng)" kind="MONTHS" required />
            <Field label="Ngày bắt đầu" required>
              <Input
                {...register('startDate', { required: 'Trường này là bắt buộc' })}
                type="date"
                aria-invalid={errors.startDate ? true : undefined}
                className={errors.startDate ? 'border-red-500' : ''}
              />
            </Field>
          </div>
          <SelectField
            label="Mô hình Kinh doanh"
            value={watch('businessModel')}
            onChange={(v) => setValue('businessModel', v)}
            placeholder="Chọn mô hình kinh doanh..."
            options={[
              ['SHOP', 'Gian hàng (SHOP)'],
              ['KIOSK', 'Kiosk'],
              ['POP_UP', 'Pop-up'],
              ['EVENT', 'Sự kiện (EVENT)'],
              ['CHAIN', 'Chuỗi (CHAIN)'],
            ]}
          />

          {/* ═══ B. Điều khoản Tài chính ═══ */}
          <SectionHeading>B. Điều khoản Tài chính</SectionHeading>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SelectField
              label="Đơn vị tiền tệ"
              value={currency}
              onChange={(v) => setValue('rentCurrency', v as any)}
              options={[['VND', 'VND'], ['USD', 'USD'], ['MMK', 'MMK']]}
            />
            <NumericField control={control} name="rentPerSqm" label={`Giá thuê/m² (${currency})`} kind="CURRENCY_AMOUNT" required />
            <NumericField control={control} name="camPerSqm" label="CAM/m²" kind="CURRENCY_AMOUNT" />
            <NumericField control={control} name="serviceFeeSqm" label="Phí Dịch vụ/m²" kind="CURRENCY_AMOUNT" />
            <NumericField control={control} name="businessSupportFeeSqm" label="Phí HT KD/m²" kind="CURRENCY_AMOUNT" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <NumericField control={control} name="deposit" label="Đặt cọc (số tháng)" kind="MONTHS" />
            {/* SEM-001 — MONTHS, not days. */}
            <NumericField control={control} name="rentFree" label="Miễn tiền thuê (tháng)" kind="MONTHS" />
            <NumericField control={control} name="escalationPercent" label="Tăng giá/năm (%)" kind="PERCENT" />
          </div>

          {rentFreeMonths > 2 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Miễn tiền thuê {rentFreeMonths} tháng (&gt; 2 tháng) — đề xuất sẽ cần Giám đốc TTTM phê duyệt.
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <NumericField control={control} name="paymentTermDays" label="Thanh toán (ngày)" kind="DAYS" />
            <NumericField control={control} name="depositLease" label={`Cọc thuê (${currency}) — 0 = tự tính`} kind="CURRENCY_AMOUNT" />
            <NumericField control={control} name="depositFitout" label={`Cọc thi công (${currency})`} kind="CURRENCY_AMOUNT" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumericField control={control} name="fitoutFee" label={`Phí thi công (${currency})`} kind="CURRENCY_AMOUNT" />
            <NumericField control={control} name="utilityFee" label={`Phí tiện ích/tháng (${currency})`} kind="CURRENCY_AMOUNT" />
            <NumericField control={control} name="afterHoursFee" label={`Phí ngoài giờ/giờ (${currency})`} kind="CURRENCY_AMOUNT" />
          </div>

          {monthlyTotal > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
              <span className="text-xs text-blue-600 dark:text-blue-300">Ước tính tổng tiền/tháng</span>
              <span className="font-bold text-blue-700 dark:text-blue-200">
                {formatMoneyWithCode(monthlyTotal, currency)}
              </span>
            </div>
          )}

          {/* ═══ C. Tiến độ & Bàn giao ═══ */}
          <SectionHeading>C. Tiến độ &amp; Bàn giao</SectionHeading>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ngày Bàn giao dự kiến"><Input {...register('handoverDate')} type="date" /></Field>
            <NumericField control={control} name="fitoutDays" label="TG Hoàn thiện nội thất (ngày)" kind="DAYS" />
            <Field label="Ngày Khai trương dự kiến"><Input {...register('openingDate')} type="date" /></Field>
          </div>

          {/* ═══ D. Điều khoản khác ═══ */}
          <SectionHeading>D. Điều khoản khác</SectionHeading>
          <Field label="Giờ hoạt động">
            <Input {...register('operatingHours')} placeholder="10:00–22:00 hàng ngày" />
          </Field>
          <Field label="Điều kiện đặc biệt (Mục 21)">
            <textarea {...register('specialConditions')}
              className="h-16 w-full resize-none rounded-md border bg-background p-2 text-sm"
              placeholder="Các điều khoản đặc biệt đã thỏa thuận..." />
          </Field>
          <Field label="Ghi chú">
            <textarea {...register('notes')}
              className="h-14 w-full resize-none rounded-md border bg-background p-2 text-sm"
              placeholder="Đề xuất lần đầu..." />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Đang tạo...' : 'Lập Tờ Trình Đề xuất'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
