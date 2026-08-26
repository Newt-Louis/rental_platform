import * as React from 'react';
import { format } from 'date-fns';
import { vi as viDateFns, enUS as enDateFns } from 'date-fns/locale';
import { vi as viDayPicker } from 'react-day-picker/locale';
import type { DateRange } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import { CalendarDays, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  /** ISO date string ('yyyy-MM-dd'), or — when showTime is set — an ISO datetime string ('yyyy-MM-ddTHH:mm') */
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Opt-in: renders two independent 'from'/'to' datetime inputs instead of the single-calendar range picker. */
  showTime?: boolean;
}

function toIso(d: Date | undefined): string {
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}

function fromIso(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? undefined : d;
}

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  placeholder,
  className,
  showTime = false,
}: DateRangePickerProps) {
  const { t, i18n } = useTranslation('common');
  const dateFnsLocale = i18n.language?.startsWith('vi') ? viDateFns : enDateFns;
  const effectivePlaceholder = placeholder ?? t('dateRangePicker.placeholder');

  if (showTime) {
    return <DateTimeRangeInputs from={from} to={to} onFromChange={onFromChange} onToChange={onToChange} className={className} />;
  }

  const [open, setOpen] = React.useState(false);

  const range: DateRange = {
    from: fromIso(from),
    to: fromIso(to),
  };

  const hasValue = !!(from || to);

  const label = React.useMemo(() => {
    if (!from && !to) return null;
    const f = from ? format(new Date(from + 'T00:00:00'), 'dd/MM/yyyy', { locale: dateFnsLocale }) : '...';
    const t2 = to ? format(new Date(to + 'T00:00:00'), 'dd/MM/yyyy', { locale: dateFnsLocale }) : '...';
    return from === to ? f : `${f} – ${t2}`;
  }, [from, to, dateFnsLocale]);

  function handleSelect(r: DateRange | undefined) {
    onFromChange(toIso(r?.from));
    onToChange(toIso(r?.to));
    // only close when a proper range (two distinct dates) is fully selected
    if (r?.from && r?.to && r.from.getTime() !== r.to.getTime()) setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onFromChange('');
    onToChange('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 justify-start text-left font-normal gap-2 min-w-[200px]',
            !hasValue && 'text-gray-400',
            className,
          )}
        >
          <CalendarDays size={15} className="shrink-0 text-gray-400" />
          <span className="flex-1 truncate text-sm">{label ?? effectivePlaceholder}</span>
          {hasValue && (
            <span
              role="button"
              aria-label={t('dateRangePicker.clear')}
              onClick={handleClear}
              className="ml-auto text-gray-400 hover:text-gray-600 rounded p-0.5"
            >
              <X size={13} />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          numberOfMonths={2}
          defaultMonth={range.from ?? new Date()}
          locale={viDayPicker}
        />
      </PopoverContent>
    </Popover>
  );
}

// Two independent 'from'/'to' datetime-local inputs — simpler than steering a single
// range-select calendar across wide gaps. Each field is editable directly, validated from < to.
function DateTimeRangeInputs({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  className?: string;
}) {
  const { t } = useTranslation('common');
  const invalid = !!(from && to && from >= to);
  // <input type="datetime-local"> requires a full 'yyyy-MM-ddTHH:mm' value — a bare
  // date-only default (from callers that haven't been touched yet) would just render blank.
  const fromValue = from && !from.includes('T') ? `${from}T00:00` : from;
  const toValue = to && !to.includes('T') ? `${to}T23:59` : to;

  return (
    <div className={cn('flex w-fit flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <span className="w-8 text-xs text-gray-500">{t('labels.from')}</span>
        <input
          type="datetime-local"
          value={fromValue}
          onChange={(e) => onFromChange(e.target.value)}
          className={cn(
            'h-9 flex-1 rounded-md border px-2 text-sm',
            invalid ? 'border-red-400 focus:border-red-500' : 'border-slate-200',
          )}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-8 text-xs text-gray-500">{t('labels.to')}</span>
        <input
          type="datetime-local"
          value={toValue}
          onChange={(e) => onToChange(e.target.value)}
          className={cn(
            'h-9 flex-1 rounded-md border px-2 text-sm',
            invalid ? 'border-red-400 focus:border-red-500' : 'border-slate-200',
          )}
        />
      </div>
      {(from || to) && (
        <button
          type="button"
          onClick={() => {
            onFromChange('');
            onToChange('');
          }}
          className="self-start text-xs text-gray-400 hover:text-gray-600"
        >
          {t('dateRangePicker.clear')}
        </button>
      )}
      {invalid && <p className="text-xs text-red-500">{t('dateRangePicker.invalidRange')}</p>}
    </div>
  );
}
