import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ERPSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

/** Flat bordered content section -- the ERP replacement for ad hoc Card-in-card nesting. */
export function ERPSection({ title, description, actions, children, className, noPadding }: ERPSectionProps) {
  return (
    <section className={cn('rounded-lg border border-border bg-card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? undefined : 'p-4'}>{children}</div>
    </section>
  );
}
