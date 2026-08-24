import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'dropdown',
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        // Also applies to a decorative label span next to the real <select> — hide it so
        // the month/year text doesn't show twice.
        caption_label: 'sr-only',
        dropdown_root: 'relative inline-flex items-center',
        dropdowns: 'flex items-center gap-1.5',
        months_dropdown:
          'h-7 rounded-md border border-border bg-transparent px-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
        years_dropdown:
          'h-7 rounded-md border border-border bg-transparent px-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          'absolute left-1 top-0 h-7 w-7 bg-transparent p-0 flex items-center justify-center',
          'rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground',
          'disabled:pointer-events-none disabled:opacity-50 transition-colors',
        ),
        button_next: cn(
          'absolute right-1 top-0 h-7 w-7 bg-transparent p-0 flex items-center justify-center',
          'rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground',
          'disabled:pointer-events-none disabled:opacity-50 transition-colors',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center',
        week: 'flex w-full mt-2',
        day: cn(
          'relative p-0 text-center text-sm rounded-md text-foreground',
          '[&:has([aria-selected].day-range-end)]:rounded-r-md',
          '[&:has([aria-selected].day-range-start)]:rounded-l-md',
          '[&:has([aria-selected])]:bg-accent',
          'focus-within:relative focus-within:z-20',
        ),
        day_button: cn(
          'h-9 w-9 p-0 font-normal rounded-md transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          'aria-selected:opacity-100',
        ),
        range_start: 'day-range-start',
        range_end: 'day-range-end',
        selected: cn(
          'bg-gray-900 text-white hover:bg-gray-900 hover:text-white',
          'focus:bg-gray-900 focus:text-white rounded-md',
          'dark:bg-indigo-500 dark:hover:bg-indigo-500 dark:focus:bg-indigo-500',
        ),
        today: 'bg-accent text-accent-foreground font-semibold',
        outside: 'day-outside text-muted-foreground/50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground',
        disabled: 'text-muted-foreground/50 opacity-50',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground rounded-none',
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
