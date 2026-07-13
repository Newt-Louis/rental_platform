import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function Sheet({ open, onClose, title, subtitle, children, className }: SheetProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'fixed right-0 top-0 z-50 h-full w-[560px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
          className,
        )}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 shrink-0">
          <div>
            {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

export function SheetSection({ label, children, className, id, action }: { label: string; children: React.ReactNode; className?: string; id?: string; action?: React.ReactNode }) {
  return (
    <div id={id} className={cn('rounded-xl p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold tracking-wider opacity-60">{label}</div>
        {action}
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

export function SheetRow({ label, value, icon: Icon }: { label: string; value?: React.ReactNode; icon?: React.ComponentType<any> }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-black/5 last:border-0">
      {Icon && <Icon size={15} className="text-gray-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-400 mb-0.5">{label}</div>
        <div className="text-sm font-medium text-gray-900 break-words">{value ?? '—'}</div>
      </div>
    </div>
  );
}
