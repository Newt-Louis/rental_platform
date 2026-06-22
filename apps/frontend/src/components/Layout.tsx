import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { notificationsApi, approvalsApi } from '@/api';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Building2, Users, FileText, CheckSquare, File,
  Hammer, Ticket, Receipt, Cpu, Bot, PieChart,
  Settings, LogOut, Bell, ChevronLeft, ChevronRight, ShoppingBag,
  TrendingUp, BarChart3, Home, Megaphone, Globe, Store, BookmarkCheck, GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MallSelector } from '@/components/MallSelector';
import { NotificationCenter } from '@/components/NotificationCenter';
import { TenantBottomNav } from '@/components/TenantBottomNav';
import {
  NAV_GROUPS,
  TENANT_NAV,
  canAccessModule,
} from '@/lib/permissions';

const ICON_MAP: Record<string, React.ElementType> = {
  '/dashboard': LayoutDashboard,
  '/spaces': Building2,
  '/crm': Users,
  '/deal-pipeline': GitBranch,
  '/bookings': BookmarkCheck,
  '/proposals': FileText,
  '/approvals': CheckSquare,
  '/contracts': File,
  '/tenants': Store,
  '/fitout': Hammer,
  '/tickets': Ticket,
  '/sales': TrendingUp,
  '/billing': Receipt,
  '/sap': Cpu,
  '/reports': PieChart,
  '/analytics': BarChart3,
  '/ai': Bot,
  '/cross-mall': Globe,
  '/announcements': Megaphone,
  '/tenant-portal': ShoppingBag,
  '/admin': Settings,
};

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const isTenant = user?.role === 'TENANT';
  const role = user?.role;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: notificationsApi.getUnreadCount,
    refetchInterval: 30_000,
    select: (r: any) => r?.count ?? r?.data?.count ?? 0,
  });
  const unreadCount: number = unreadData ?? 0;

  const { data: pendingApprovalCount } = useQuery({
    queryKey: ['approvals-pending-nav'],
    queryFn: approvalsApi.pending,
    refetchInterval: 60_000,
    enabled: !isTenant && canAccessModule(role, 'approvals'),
    select: (r: any) => {
      const items = Array.isArray(r) ? r : r?.data ?? [];
      return items.length;
    },
  });

  const filteredNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessModule(role, item.module)),
  })).filter((g) => g.items.length > 0);

  const filteredTenantNav = TENANT_NAV.filter((item) => canAccessModule(role, item.module));

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside
        className={cn(
          'flex flex-col bg-gray-900 text-white transition-all duration-300 shrink-0',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          {!collapsed && (
            <div>
              <div className="text-sm font-bold text-white tracking-widest">THISO</div>
              <div className="text-xs text-gray-400">
                {isTenant ? 'Cổng Khách thuê' : 'Leasing Platform'}
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {isTenant ? (
            filteredTenantNav.map((item) => {
              const Icon = ICON_MAP[item.path] ?? Home;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-white/10 text-white border-l-2 border-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                    )
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
            })
          ) : (
            filteredNavGroups.map((group) => (
              <div key={group.label}>
                {!collapsed && (
                  <div className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {group.label}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = ICON_MAP[item.path] ?? LayoutDashboard;
                  const showApprovalBadge =
                    item.module === 'approvals' && (pendingApprovalCount ?? 0) > 0;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-white/10 text-white border-l-2 border-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                        )
                      }
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={17} className="shrink-0" />
                      {!collapsed && (
                        <span className="truncate flex-1">{item.label}</span>
                      )}
                      {!collapsed && showApprovalBadge && (
                        <Badge className="h-4 min-w-4 px-1 py-0 text-[10px] bg-amber-500 text-white border-0">
                          {pendingApprovalCount}
                        </Badge>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))
          )}
        </nav>

        <div className="border-t border-gray-700 p-3">
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-gray-600 text-white text-xs">
                {user?.fullName?.charAt(0) ?? 'U'}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{user?.fullName}</div>
                <div className="text-xs text-gray-400 truncate">
                  {isTenant ? 'Khách thuê' : user?.role}
                </div>
              </div>
            )}
          </div>
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-gray-400 hover:text-white hover:bg-gray-800 justify-start gap-2"
              onClick={handleLogout}
            >
              <LogOut size={14} />
              Đăng xuất
            </Button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">THISO {isTenant ? 'Mall' : 'Leasing'}</div>
            {!isTenant && (
              <>
                <div className="w-px h-4 bg-gray-200" />
                <MallSelector />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isTenant && canAccessModule(role, 'ai') && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/ai')} className="gap-1.5 text-gray-500 hover:text-gray-900">
                <Bot size={15} />
                AI
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="relative text-gray-500 hover:text-gray-900"
              onClick={() => setNotifOpen(true)}
            >
              <Bell size={15} />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 py-0 text-[10px] bg-red-500 text-white border-0 rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Badge>
              )}
            </Button>

            <div className="flex items-center gap-2 ml-1 pl-2 border-l border-gray-100">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-gray-600 text-white text-xs">
                  {user?.fullName?.charAt(0) ?? 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm font-medium text-gray-700">{user?.fullName}</div>
              {user?.role === 'ADMIN' && (
                <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium">Admin</span>
              )}
              {isTenant && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Tenant</span>
              )}
            </div>
          </div>
        </header>

        <main className={cn('flex-1 overflow-auto p-6', isTenant && 'pb-20 md:pb-6')}>
          <Outlet />
        </main>
      </div>

      {isTenant && <TenantBottomNav />}
      <NotificationCenter open={notifOpen} onOpenChange={setNotifOpen} />
    </div>
  );
}
