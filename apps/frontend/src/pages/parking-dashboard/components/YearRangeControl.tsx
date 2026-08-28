import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface YearRangeControlProps {
  fromYear: number;
  toYear: number;
  onChange: (fromYear: number, toYear: number) => void;
}

export function YearRangeControl({ fromYear, toYear, onChange }: YearRangeControlProps) {
  const { t } = useTranslation('parking');
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear - 14 + i);

  function handleFromChange(v: string) {
    const next = Number(v);
    onChange(next, next > toYear ? next : toYear);
  }

  function handleToChange(v: string) {
    const next = Number(v);
    onChange(next < fromYear ? next : fromYear, next);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">{t('report.fromYear', 'Từ năm')}</span>
        <Select value={String(fromYear)} onValueChange={handleFromChange}>
          <SelectTrigger className="h-8 w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">{t('report.toYear', 'Đến năm')}</span>
        <Select value={String(toYear)} onValueChange={handleToChange}>
          <SelectTrigger className="h-8 w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
