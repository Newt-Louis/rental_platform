import { cn } from '@/lib/utils';
import { formatMoneyAmount, type CurrencyCode } from '@/lib/currency';

interface ERPAmountProps {
  amount?: number | null;
  currencyCode?: CurrencyCode;
  tone?: 'default' | 'success' | 'danger' | 'muted';
  strong?: boolean;
  title?: string;
  className?: string;
}

const TONE_CLASS: Record<NonNullable<ERPAmountProps['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-emerald-700 dark:text-emerald-400',
  danger: 'text-red-700 dark:text-red-400',
  muted: 'text-muted-foreground',
};

/**
 * Transaction-table money cell. Always full precision (formatMoneyAmount) --
 * never abbreviated -- per the Table Standard (docs/ux/04-TABLE-STANDARD.md).
 * Pair with a separate Currency column; this renders the numeric amount only.
 */
export function ERPAmount({ amount, currencyCode = 'VND', tone = 'default', strong, title, className }: ERPAmountProps) {
  return (
    <span className={cn('tabular-nums whitespace-nowrap', strong && 'font-semibold', TONE_CLASS[tone], className)} title={title}>
      {formatMoneyAmount(amount, currencyCode)}
    </span>
  );
}
