import { NavLink } from 'react-router-dom';
import { Home, Receipt, Ticket, TrendingUp, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { path: '/tenant-portal', label: 'Tổng quan', icon: Home, end: true },
  { path: '/billing', label: 'Hóa đơn', icon: Receipt },
  { path: '/tickets', label: 'Hỗ trợ', icon: Ticket },
  { path: '/sales', label: 'Doanh thu', icon: TrendingUp },
  { path: '/announcements', label: 'TB', icon: Megaphone },
];

/** Bottom navigation for tenant mobile / PWA */
export function TenantBottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-slate-900 border-t border-slate-700 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-stretch h-14">
        {ITEMS.map(({ path, label, icon: Icon, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] transition-colors',
                isActive ? 'text-white' : 'text-slate-400',
              )
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
