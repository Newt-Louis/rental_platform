import * as React from 'react';
import { format } from 'date-fns';
import { vi as viDateFns } from 'date-fns/locale';
import { vi as viDayPicker } from 'react-day-picker/locale';
import type { DateRange } from 'react-day-picker';
import { CalendarDays, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  /** ISO date string or empty string */
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  placeholder?: string;
  className?: string;
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
  placeholder = 'Chọn khoảng ngày',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const range: DateRange = {
    from: fromIso(from),
    to: fromIso(to),
  };

  const hasValue = !!(from || to);

  const label = React.useMemo(() => {
    if (!from && !to) return null;
    const f = from ? format(new Date(from + 'T00:00:00'), 'dd/MM/yyyy', { locale: viDateFns }) : '...';
    const t = to ? format(new Date(to + 'T00:00:00'), 'dd/MM/yyyy', { locale: viDateFns }) : '...';
    return from === to ? f : `${f} – ${t}`;
  }, [from, to]);

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
          <span className="flex-1 truncate text-sm">{label ?? placeholder}</span>
          {hasValue && (
            <span
              role="button"
              aria-label="Xóa ngày"
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
