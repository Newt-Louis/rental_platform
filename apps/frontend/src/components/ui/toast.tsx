import * as React from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Toast, dismissToast } from './use-toast';

interface ToastProps {
  toast: Toast;
}

export function ToastItem({ toast }: ToastProps) {
  const { id, title, description, variant = 'default' } = toast;

  const icons = {
    default: <Info className="h-5 w-5 text-gray-500" />,
    destructive: <AlertCircle className="h-5 w-5 text-red-500" />,
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
  };

  const borderColors = {
    default: 'border-l-indigo-500',
    destructive: 'border-l-red-500',
    success: 'border-l-green-500',
  };

  return (
    <div
      className={cn(
        'flex w-80 items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-lg border-l-4',
        borderColors[variant]
      )}
    >
      <div className="mt-0.5 shrink-0">{icons[variant]}</div>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold text-gray-900">{title}</p>}
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => dismissToast(id)}
        className="shrink-0 rounded-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
