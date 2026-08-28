import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoneyCompact } from '@/lib/currency';
import { SERIES_COLORS } from './chartColors';
import type { MonthlyBucket } from '@/api';

function fmtVnd(n: number) {
  return formatMoneyCompact(n, 'VND');
}

interface RevenueBreakdownCardProps {
  title: string;
  bucket: MonthlyBucket | undefined;
  isLoading: boolean;
}

export function RevenueBreakdownCard({ title, bucket, isLoading }: RevenueBreakdownCardProps) {
  const { t } = useTranslation('parking');

  const rows = [
    { key: 'cash', label: t('report.cash', 'Tiền Mặt'), value: bucket?.cash ?? 0, color: SERIES_COLORS.cash },
    { key: 'online', label: t('report.online', 'Online'), value: bucket?.online ?? 0, color: SERIES_COLORS.online },
    { key: 'voucher', label: t('report.voucher', 'Voucher'), value: bucket?.voucher ?? 0, color: SERIES_COLORS.voucher },
  ];

  return (
    <Card>
      <CardHeader className="space-y-0 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                  {row.label}
                </span>
                <span className="font-medium" style={{ color: row.color }}>{fmtVnd(row.value)}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
              <span className="font-medium text-gray-700">{t('report.total', 'Tổng')}</span>
              <span className="font-bold" style={{ color: SERIES_COLORS.total }}>{fmtVnd(bucket?.total ?? 0)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
