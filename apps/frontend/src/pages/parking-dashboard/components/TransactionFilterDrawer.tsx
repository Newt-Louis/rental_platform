import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { X } from 'lucide-react';

export type PromotionTypeFilter = '' | 'NONE' | 'BILL' | 'VOUCHER';

export interface TransactionFilterState {
  startDate: string;
  endDate: string;
  search: string;
  laneId: string;
  promotionType: PromotionTypeFilter;
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
              {t('transaction.filterDrawer.search', 'Tìm nhanh (biển số / mã voucher)')}
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

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">
              {t('transaction.filterDrawer.promotionType', 'Loại khuyến mãi')}
            </Label>
            <Select
              value={value.promotionType || 'ALL'}
              onValueChange={(v) => set({ promotionType: v === 'ALL' ? '' : (v as PromotionTypeFilter) })}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('transaction.filterDrawer.promotionTypeAll', 'Tất cả')}</SelectItem>
                <SelectItem value="NONE">{t('transaction.filterDrawer.promotionTypeNone', 'Không khuyến mãi')}</SelectItem>
                <SelectItem value="BILL">{t('transaction.filterDrawer.promotionTypeBill', 'Khuyến mãi hóa đơn')}</SelectItem>
                <SelectItem value="VOUCHER">{t('transaction.filterDrawer.promotionTypeVoucher', 'Khuyến mãi voucher')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
