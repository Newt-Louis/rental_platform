import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-gray-900 text-white',
        secondary: 'border-transparent bg-gray-100 text-gray-800',
        destructive: 'border-transparent bg-red-600 text-white',
        outline: 'text-gray-700 border-gray-300',
        success: 'border-transparent bg-green-100 text-green-800',
        warning: 'border-transparent bg-amber-100 text-amber-800',
        blue: 'border-transparent bg-blue-100 text-blue-800',
        purple: 'border-transparent bg-purple-100 text-purple-800',
        sky: 'border-transparent bg-sky-100 text-sky-800',
        indigo: 'border-transparent bg-indigo-100 text-indigo-800',
        violet: 'border-transparent bg-violet-100 text-violet-800',
        orange: 'border-transparent bg-orange-100 text-orange-800',
        slate: 'border-transparent bg-slate-100 text-slate-700',
        yellow: 'border-transparent bg-yellow-100 text-yellow-800',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'blue' | 'purple' | 'sky' | 'indigo' | 'violet' | 'orange' | 'slate' | 'yellow';
}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
