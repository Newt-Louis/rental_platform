import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { X } from 'lucide-react';

export interface TransactionFilterState {
  startDate: string;
  endDate: string;
  search: string;
  laneId: string;
  promotionUsed: boolean;
  paymentStatus: string;
  invoiceStatus: string;
}

interface TransactionFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  value: TransactionFilterState;
  onChange: (value: TransactionFilterState) => void;
  onApply: () => void;
}

export function TransactionFilterDrawer({ open, onClose, value, onChange, onApply }: TransactionFilterDrawerProps) {
  const { t } = useTranslation('parking');
  if (!open) return null;

  const set = (patch: Partial<TransactionFilterState>) => onChange({ ...value, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-sm overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('transaction.filterDrawer.title', 'Bộ lọc nâng cao')}</h3>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">{t('transaction.dateRange', 'Khoảng ngày')} *</Label>
            <DateRangePicker
              className="w-full"
              from={value.startDate}
              to={value.endDate}
              onFromChange={(v) => set({ startDate: v })}
              onToChange={(v) => set({ endDate: v })}
              showTime
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">
              {t('transaction.filterDrawer.search', 'Tìm nhanh (biển số / thẻ / hóa đơn / mã đặt chỗ)')}
            </Label>
            <Input value={value.search} onChange={(e) => set({ search: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">{t('transaction.filterDrawer.laneId', 'Làn (Lane ID)')}</Label>
            <Input
              type="number"
              value={value.laneId}
              onChange={(e) => set({ laneId: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">
              {t('transaction.filterDrawer.paymentStatus', 'Trạng thái thanh toán (phân tách bằng dấu phẩy)')}
            </Label>
            <Input value={value.paymentStatus} onChange={(e) => set({ paymentStatus: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">
              {t('transaction.filterDrawer.invoiceStatus', 'Trạng thái hóa đơn (phân tách bằng dấu phẩy)')}
            </Label>
            <Input value={value.invoiceStatus} onChange={(e) => set({ invoiceStatus: e.target.value })} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.promotionUsed}
              onCheckedChange={(checked) => set({ promotionUsed: checked === true })}
            />
            {t('transaction.filterDrawer.promotionUsed', 'Chỉ hiển thị giao dịch có khuyến mãi')}
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            {t('transaction.filterDrawer.cancel', 'Hủy')}
          </Button>
          <Button onClick={onApply} disabled={!value.startDate || !value.endDate}>
            {t('transaction.filterDrawer.apply', 'Áp dụng')}
          </Button>
        </div>
      </div>
    </div>
  );
}
