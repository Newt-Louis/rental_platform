import { useState, useEffect, Suspense } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/auth.store";
import { notificationsApi, approvalsApi } from "@/api";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ContentLoading } from "@/components/ui/content-loading";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  CheckSquare,
  File,
  Hammer,
  Ticket,
  Receipt,
  Cpu,
  Bot,
  PieChart,
  Settings,
  LogOut,
  Bell,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  TrendingUp,
  BarChart3,
  Home,
  Megaphone,
  Globe,
  Store,
  BookmarkCheck,
  GitBranch,
  UserCircle,
  ChevronDown,
  Sun,
  Moon,
  Menu,
  X,
  Warehouse,
  ParkingCircle,
  ScanLine,
  ShieldCheck,
  Car,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MallSelector } from "@/components/MallSelector";
import { MallContextModal } from "@/components/MallContextModal";
import { NotificationCenter } from "@/components/NotificationCenter";
import { TenantBottomNav } from "@/components/TenantBottomNav";
import { ErpProcessGuide } from "@/components/ErpProcessGuide";
import { NAV_GROUPS, TENANT_NAV, canAccessModule } from "@/lib/permissions";

const ICON_MAP: Record<string, React.ElementType> = {
  "/dashboard": LayoutDashboard,
  "/spaces": Building2,
  "/crm": Users,
  "/crm-overview": PieChart,
  "/deal-pipeline": GitBranch,
  "/pipeline-stats": TrendingUp,
  "/bookings": BookmarkCheck,
  "/proposals": FileText,
  "/approvals": CheckSquare,
  "/contracts": File,
  "/service-contracts": FileText,
  "/inventory": Warehouse,
  "/work-orders": CheckSquare,
  "/patrol": ShieldCheck,
  "/parking": Car,
  "/tenants": Store,
  "/fitout": Hammer,
  "/tickets": Ticket,
  "/sales": TrendingUp,
  "/billing": Receipt,
  "/sap": Cpu,
  "/reports": PieChart,
  "/analytics": BarChart3,
  "/ai": Bot,
  "/cross-mall": Globe,
  "/announcements": Megaphone,
  "/tenant-portal": ShoppingBag,
  "/audit-log": FileText,
  "/admin": Settings,
  "/parking-report": ParkingCircle,
  "/parking-transaction": ScanLine,
};

const SIDEBAR_COLLAPSED_KEY = "thiso-sidebar-collapsed";

function SidebarNavLink({
  to,
  icon: Icon,
  label,
  collapsed,
  iconSize = 17,
  badge,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  iconSize?: number;
  badge?: React.ReactNode;
}) {
  const link = (
    <NavLink
      to={to}
      aria-label={label}
      style={{ display: "block" }}
      className={({ isActive }) =>
        cn(
          "block px-4 py-3 text-sm transition-colors",
          isActive
            ? collapsed
              ? "bg-white/10 text-white"
              : "bg-white/10 text-white border-l-2"
            : collapsed
              ? "text-gray-400 hover:text-white"
              : "text-gray-400 hover:text-white",
        )
      }
    >
      <span className="flex items-center gap-4">
        <Icon size={iconSize} className="shrink-0" />
        {!collapsed && <span className="truncate flex-1">{label}</span>}
        {!collapsed && badge}
      </span>
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation("nav");
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close drawer whenever user navigates
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore (private mode / storage disabled)
    }
  }, [collapsed]);
  const isTenant = user?.role === "TENANT";
  const role = user?.role;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const { data: unreadData } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: notificationsApi.getUnreadCount,
    refetchInterval: 30_000,
    select: (r: any) => r?.count ?? r?.data?.count ?? 0,
  });
  const unreadCount: number = unreadData ?? 0;

  const { data: pendingApprovalCount } = useQuery({
    queryKey: ["approvals-pending-nav"],
    queryFn: () => approvalsApi.pending(),
    refetchInterval: 60_000,
    enabled: !isTenant && canAccessModule(role, "approvals"),
    select: (r: any) => {
      const items = Array.isArray(r) ? r : (r?.data ?? []);
      return items.length;
    },
  });

  const filteredNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessModule(role, item.module)),
  })).filter((g) => g.items.length > 0);

  const filteredTenantNav = TENANT_NAV.filter((item) =>
    canAccessModule(role, item.module),
  );

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Full-width header */}
      <header className="h-14 shrink-0 z-50 bg-card border-b border-border shadow-md flex items-center px-3 md:px-6 gap-2 md:gap-4">
        {/* Logo + sidebar toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label={t("ui.openMenu")}
          >
            <Menu size={18} />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors hidden md:block"
            title={collapsed ? t("ui.expandSidebar") : t("ui.collapseSidebar")}
            aria-label={collapsed ? t("ui.expandNav") : t("ui.collapseNav")}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <img
            src="/logo.png"
            alt="THISO"
            className="h-8 w-auto hidden md:block"
          />
        </div>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Mall selector */}
        <div className="flex items-center gap-4">
          {!isTenant && <MallSelector />}
        </div>

        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {!isTenant && canAccessModule(role, "ai") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/ai")}
              className="hidden sm:flex gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Bot size={15} />
              AI
            </Button>
          )}

          <LanguageSwitcher />

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={toggleTheme}
            title={theme === "light" ? t("ui.darkMode") : t("ui.lightMode")}
            aria-label={
              theme === "light" ? t("ui.enableDark") : t("ui.enableLight")
            }
          >
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="relative text-muted-foreground hover:text-foreground"
            onClick={() => setNotifOpen(true)}
            aria-label={
              unreadCount > 0
                ? t("ui.notificationsUnread", { count: unreadCount })
                : t("ui.notifications")
            }
          >
            <Bell size={15} />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 py-0 text-[10px] bg-red-500 text-white border-0 rounded-full flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 ml-1 pl-2 border-l border-border cursor-pointer select-none rounded-md px-2 py-1 hover:bg-muted transition-colors">
                <div className="relative">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-gray-600 text-white text-xs">
                      {user?.fullName?.charAt(0) ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  {user?.role === "ADMIN" && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-background border border-border">
                      <ShieldCheck size={9} className="text-blue-600" />
                    </span>
                  )}
                  {isTenant && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-background border border-border">
                      <Store size={9} className="text-emerald-600" />
                    </span>
                  )}
                </div>
                <div className="hidden lg:block text-sm font-medium text-foreground">
                  {user?.fullName}
                </div>
                <ChevronDown size={13} className="text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-3 py-2">
                <div className="text-sm font-medium text-foreground truncate">
                  {user?.fullName}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate("/profile")}
                className="gap-2 cursor-pointer"
              >
                <UserCircle size={15} />
                {t("ui.accountInfo")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <LogOut size={15} />
                {t("ui.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Body: pl-0 để sidebar sát viền trái, gap-4 và p-4 cho phần còn lại */}
      <div className="flex flex-1 overflow-hidden pt-4 pr-4 pb-4 gap-4">
        {/* Mobile backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar — sát viền trái, bo góc phải */}
        <aside
          aria-label={t("ui.mainNav")}
          aria-modal={mobileSidebarOpen || undefined}
          role={mobileSidebarOpen ? "dialog" : undefined}
          className={cn(
            "flex flex-col bg-gray-900 text-white overflow-hidden transition-all duration-300",
            // Mobile: fixed drawer overlay
            "fixed inset-y-0 left-0 z-50 w-64",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
            // Desktop: static in flex flow, collapsible
            "md:relative md:translate-x-0 md:z-auto md:shrink-0 md:rounded-r-xl",
            collapsed ? "md:w-16" : "md:w-60",
          )}
        >
          {/* Mobile drawer header */}
          <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
            <img src="/logo.png" alt="THISO" className="h-7 w-auto" />
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              aria-label={t("ui.closeMenu")}
            >
              <X size={16} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 scrollbar-hide">
           <TooltipProvider delayDuration={0} skipDelayDuration={0}>
            {isTenant
              ? filteredTenantNav.map((item) => {
                  const Icon = ICON_MAP[item.path] ?? Home;
                  return (
                    <SidebarNavLink
                      key={item.path}
                      to={item.path}
                      icon={Icon}
                      iconSize={18}
                      collapsed={collapsed}
                      label={t(`items.${item.module}`, item.label)}
                    />
                  );
                })
              : filteredNavGroups.map((group) => (
                  <div key={group.label}>
                    {!collapsed && (
                      <div className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t(`groups.${group.key}`, group.label)}
                      </div>
                    )}
                    {group.items.map((item) => {
                      const Icon = ICON_MAP[item.path] ?? LayoutDashboard;
                      const showApprovalBadge =
                        item.module === "approvals" &&
                        (pendingApprovalCount ?? 0) > 0;
                      return (
                        <SidebarNavLink
                          key={item.path}
                          to={item.path}
                          icon={Icon}
                          collapsed={collapsed}
                          label={t(`items.${item.module}`, item.label)}
                          badge={
                            showApprovalBadge ? (
                              <Badge className="h-4 min-w-4 px-1 py-0 text-[10px] bg-amber-500 text-white border-0">
                                {pendingApprovalCount}
                              </Badge>
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </div>
                ))}
          </TooltipProvider>
          </nav>

          <div className="border-t border-gray-700 p-4">
            <div
              className={cn(
                "flex items-center gap-2",
                collapsed && "justify-center",
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-gray-600 text-white text-xs">
                  {user?.fullName?.charAt(0) ?? "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {user?.fullName}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {isTenant ? t("ui.tenantRole") : user?.role}
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
                {t("ui.logout")}
              </Button>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main
          className={cn(
            "relative flex-1 overflow-auto rounded-xl bg-card",
            isTenant && "pb-20 md:pb-6",
          )}
        >
          {!isTenant && (
            <div className="px-4 lg:px-6">
              <ErpProcessGuide />
            </div>
          )}
          <Suspense fallback={<ContentLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {isTenant && <TenantBottomNav />}
      <NotificationCenter open={notifOpen} onOpenChange={setNotifOpen} />
      {!isTenant && <MallContextModal />}
    </div>
  );
}
