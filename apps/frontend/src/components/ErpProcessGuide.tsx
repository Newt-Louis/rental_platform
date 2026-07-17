import { Check, ChevronRight } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { canAccessModule, type RouteModule } from '@/lib/permissions';
import { useAuthStore } from '@/store/auth.store';

const STEPS = [
  { label: 'Khách hàng', path: '/crm', module: 'crm' },
  { label: 'Giữ mặt bằng', path: '/bookings', module: 'bookings' },
  { label: 'Đề xuất thuê', path: '/proposals', module: 'proposals' },
  { label: 'Phê duyệt', path: '/approvals', module: 'approvals' },
  { label: 'Hợp đồng', path: '/contracts', module: 'contracts' },
  { label: 'Fitout', path: '/fitout', module: 'fitout' },
  { label: 'Vận hành', path: '/tickets', module: 'tickets' },
  { label: 'Thu phí', path: '/billing', module: 'billing' },
] satisfies { label: string; path: string; module: RouteModule }[];

export function ErpProcessGuide() {
  const role = useAuthStore((state) => state.user?.role);
  const { pathname } = useLocation();
  const visible = STEPS.filter((step) => canAccessModule(role, step.module));
  const activeIndex = visible.findIndex((step) => pathname.startsWith(step.path));

  if (visible.length < 2 || activeIndex < 0) return null;

  return (
    <nav aria-label="Quy trình ERP" className="mb-3 overflow-x-auto rounded-lg border bg-card px-3 py-2">
      <ol className="flex min-w-max items-center gap-1">
        {visible.map((step, index) => {
          const active = index === activeIndex;
          const completed = index < activeIndex;
          return (
            <li key={step.path} className="flex items-center">
              <NavLink
                to={step.path}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  active && 'bg-primary text-primary-foreground',
                  !active && 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-[10px]',
                  active && 'border-primary-foreground/40',
                  completed && !active && 'border-emerald-500 bg-emerald-50 text-emerald-700',
                )}>
                  {completed ? <Check size={11} /> : index + 1}
                </span>
                {step.label}
              </NavLink>
              {index < visible.length - 1 && <ChevronRight size={13} className="mx-0.5 text-muted-foreground/50" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
