import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ERP_TONE_BADGE_CLASSES, type ERPTone } from '@/lib/erp-tones';

interface ERPStatusBadgeProps {
  tone: ERPTone;
  children: ReactNode;
  className?: string;
}

/** Canonical status pill for ERP tables/headers -- flat, bordered, tone-driven. */
export function ERPStatusBadge({ tone, children, className }: ERPStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
        ERP_TONE_BADGE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
