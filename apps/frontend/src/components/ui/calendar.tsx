import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          'absolute left-1 top-0 h-7 w-7 bg-transparent p-0 flex items-center justify-center',
          'rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-900',
          'disabled:pointer-events-none disabled:opacity-50 transition-colors',
        ),
        button_next: cn(
          'absolute right-1 top-0 h-7 w-7 bg-transparent p-0 flex items-center justify-center',
          'rounded-md border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-900',
          'disabled:pointer-events-none disabled:opacity-50 transition-colors',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-gray-400 rounded-md w-9 font-normal text-[0.8rem] text-center',
        week: 'flex w-full mt-2',
        day: cn(
          'relative p-0 text-center text-sm rounded-md',
          '[&:has([aria-selected].day-range-end)]:rounded-r-md',
          '[&:has([aria-selected].day-range-start)]:rounded-l-md',
          '[&:has([aria-selected])]:bg-gray-100',
          'focus-within:relative focus-within:z-20',
        ),
        day_button: cn(
          'h-9 w-9 p-0 font-normal rounded-md transition-colors',
          'hover:bg-gray-100 hover:text-gray-900',
          'aria-selected:opacity-100',
        ),
        range_start: 'day-range-start',
        range_end: 'day-range-end',
        selected: cn(
          'bg-gray-900 text-white hover:bg-gray-900 hover:text-white',
          'focus:bg-gray-900 focus:text-white rounded-md',
        ),
        today: 'bg-gray-100 text-gray-900 font-semibold',
        outside: 'day-outside text-gray-300 aria-selected:bg-gray-100/50 aria-selected:text-gray-400',
        disabled: 'text-gray-300 opacity-50',
        range_middle: 'aria-selected:bg-gray-100 aria-selected:text-gray-900 rounded-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left'
            ? <ChevronLeft size={16} />
            : <ChevronRight size={16} />,
      }}
      {...props}
    />
  );
}
