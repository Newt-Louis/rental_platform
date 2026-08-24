import type { ElementType, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ERP_TONE_ICON_CLASSES, type ERPTone } from '@/lib/erp-tones';
import { ERPStatusBadge } from './ERPStatusBadge';

interface ERPStatCardProps {
  label: string;
  value: ReactNode;
  /** Full-precision value for a native tooltip when `value` is compact/abbreviated. */
  valueTitle?: string;
  helpText?: ReactNode;
  icon?: ElementType;
  tone?: ERPTone;
  badge?: { label: string; tone?: ERPTone };
  to?: string;
  onClick?: () => void;
  selected?: boolean;
  size?: 'default' | 'compact';
  className?: string;
}

/**
 * Flat ERP KPI tile. Replaces the page-local gradient/hover-lift stat cards and
 * filter-tile buttons scattered across Dashboard/Bookings/Billing with one
 * component (docs/ux/02-ERP-DESIGN-SYSTEM.md, docs/ux/08-COMPONENT-ARCHITECTURE.md).
 */
export function ERPStatCard({
  label, value, valueTitle, helpText, icon: Icon, tone = 'brand', badge, to, onClick, selected, size = 'default', className,
}: ERPStatCardProps) {
  const navigate = useNavigate();
  const interactive = !!(to || onClick);
  const handleActivate = () => {
    if (onClick) onClick();
    else if (to) navigate(to);
  };
  const compact = size === 'compact';

  return (
    <div
      className={cn(
        'rounded-lg border bg-card text-left transition-colors',
        compact ? 'p-3' : 'p-4',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        interactive && 'cursor-pointer hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handleActivate : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); }
      } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-semibold uppercase tracking-wide text-muted-foreground', compact ? 'text-[10px]' : 'text-[11px]')}>
            {label}
          </p>
          <p
            className={cn('mt-1.5 font-semibold leading-none tabular-nums text-foreground', compact ? 'text-lg' : 'text-2xl')}
            title={valueTitle}
          >
            {value}
          </p>
          {helpText && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{helpText}</p>}
        </div>
        {Icon && (
          <div className={cn('flex shrink-0 items-center justify-center rounded-md', compact ? 'h-7 w-7' : 'h-9 w-9', ERP_TONE_ICON_CLASSES[tone])}>
            <Icon size={compact ? 14 : 16} />
          </div>
        )}
      </div>
      {badge && (
        <div className="mt-3 border-t border-border pt-2.5">
          <ERPStatusBadge tone={badge.tone ?? 'neutral'}>{badge.label}</ERPStatusBadge>
        </div>
      )}
    </div>
  );
}
