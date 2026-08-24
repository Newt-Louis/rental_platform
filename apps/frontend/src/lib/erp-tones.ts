// Canonical semantic tone palette for the ERP design system (docs/ux/02-ERP-DESIGN-SYSTEM.md).
// Every status badge / stat accent in the golden pages resolves to one of these tones instead
// of a page-local hard-coded Tailwind color string, so light/dark rendering and future palette
// changes happen in one place. Domain status -> tone mapping stays local to each page (only the
// page knows what "OVERDUE" means), but the tone -> class mapping is shared.
export type ERPTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

export const ERP_TONE_BADGE_CLASSES: Record<ERPTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300',
  brand: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300',
};

export const ERP_TONE_DOT_CLASSES: Record<ERPTone, string> = {
  neutral: 'bg-gray-300',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  brand: 'bg-blue-600',
};

export const ERP_TONE_ICON_CLASSES: Record<ERPTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  brand: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
};

export const ERP_TONE_TEXT_CLASSES: Record<ERPTone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-sky-700 dark:text-sky-400',
  success: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  danger: 'text-red-700 dark:text-red-400',
  brand: 'text-blue-700 dark:text-blue-400',
};
