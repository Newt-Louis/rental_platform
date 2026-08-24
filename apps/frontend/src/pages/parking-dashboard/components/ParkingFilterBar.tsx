import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { parkingDashboardApi } from '@/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { cn } from '@/lib/utils';

export type TimeRangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function presetToRange(preset: TimeRangePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const today = toIso(now);
  switch (preset) {
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { startDate: toIso(y), endDate: toIso(y) };
    }
    case '7d': {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { startDate: toIso(start), endDate: today };
    }
    case '30d': {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { startDate: toIso(start), endDate: today };
    }
    case 'today':
    default:
      return { startDate: today, endDate: today };
  }
}

interface ParkingFilterBarProps {
  parkingCode: string;
  onParkingCodeChange: (code: string) => void;
  preset: TimeRangePreset;
  onPresetChange: (preset: TimeRangePreset) => void;
  startDate: string;
  endDate: string;
  onCustomRangeChange: (startDate: string, endDate: string) => void;
}

export function ParkingFilterBar({
  parkingCode,
  onParkingCodeChange,
  preset,
  onPresetChange,
  startDate,
  endDate,
  onCustomRangeChange,
}: ParkingFilterBarProps) {
  const { t } = useTranslation('parking');

  const { data: tenantsRes } = useQuery({
    queryKey: ['parking-tenants'],
    queryFn: () => parkingDashboardApi.getTenants(),
  });
  const tenants: { parkingCode: string; name: string }[] = tenantsRes?.data ?? tenantsRes ?? [];

  const presets: { value: TimeRangePreset; label: string }[] = [
    { value: 'today', label: t('report.presetToday', 'Hôm nay') },
    { value: 'yesterday', label: t('report.presetYesterday', 'Hôm qua') },
    { value: '7d', label: t('report.preset7d', '7 ngày qua') },
    { value: '30d', label: t('report.preset30d', '30 ngày qua') },
    { value: 'custom', label: t('report.presetCustom', 'Tùy chỉnh') },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select value={parkingCode} onValueChange={onParkingCodeChange}>
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue placeholder={t('report.selectTenant', 'Chọn bãi đỗ')} />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((tenant) => (
            <SelectItem key={tenant.parkingCode} value={tenant.parkingCode}>
              {tenant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1">
        {presets.map((p) => (
          <Button
            key={p.value}
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'h-7 px-2.5 text-xs',
              preset === p.value && 'bg-indigo-600 text-white hover:bg-indigo-600 hover:text-white',
            )}
            onClick={() => onPresetChange(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {preset === 'custom' && (
        <DateRangePicker
          from={startDate}
          to={endDate}
          onFromChange={(v) => onCustomRangeChange(v, endDate)}
          onToChange={(v) => onCustomRangeChange(startDate, v)}
        />
      )}
    </div>
  );
}
