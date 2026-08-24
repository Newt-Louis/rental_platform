import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ERPToolbarProps {
  children: ReactNode;
  className?: string;
}

/** Standard filter/action toolbar surface -- one bordered row instead of a bare flex-wrap. */
export function ERPToolbar({ children, className }: ERPToolbarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5', className)}>
      {children}
    </div>
  );
}
