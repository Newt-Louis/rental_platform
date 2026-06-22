/** Ma trận quyền — đồng bộ với backend `common/constants/role-permissions.ts` */

export type AppRole =
  | 'ADMIN'
  | 'CEO'
  | 'MALL_DIRECTOR'
  | 'LEASING_MANAGER'
  | 'LEASING_EXECUTIVE'
  | 'FINANCE'
  | 'LEGAL'
  | 'OPERATION'
  | 'TENANT';

export type RouteModule =
  | 'dashboard'
  | 'spaces'
  | 'crm'
  | 'deal-pipeline'
  | 'bookings'
  | 'proposals'
  | 'approvals'
  | 'contracts'
  | 'tenants'
  | 'fitout'
  | 'tickets'
  | 'sales'
  | 'billing'
  | 'sap'
  | 'reports'
  | 'analytics'
  | 'ai'
  | 'admin'
  | 'announcements'
  | 'tenant-portal'
  | 'cross-mall';

export const ROUTE_PERMISSIONS: Record<RouteModule, AppRole[]> = {
  dashboard: ['ADMIN', 'CEO', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'FINANCE', 'LEGAL', 'OPERATION'],
  spaces: ['ADMIN', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'FINANCE', 'LEGAL', 'OPERATION'],
  crm: ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR'],
  'deal-pipeline': ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR', 'CEO'],
  bookings: ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR'],
  proposals: ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR', 'CEO'],
  approvals: ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL', 'CEO'],
  contracts: ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL'],
  tenants: ['ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR', 'FINANCE', 'LEGAL'],
  fitout: ['ADMIN', 'OPERATION', 'LEASING_MANAGER', 'MALL_DIRECTOR'],
  tickets: ['ADMIN', 'OPERATION', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'TENANT'],
  sales: ['ADMIN', 'FINANCE', 'MALL_DIRECTOR', 'CEO', 'TENANT'],
  billing: ['ADMIN', 'FINANCE', 'MALL_DIRECTOR', 'TENANT'],
  sap: ['ADMIN', 'FINANCE'],
  reports: ['ADMIN', 'FINANCE', 'MALL_DIRECTOR', 'CEO', 'LEASING_MANAGER'],
  analytics: ['ADMIN', 'FINANCE', 'MALL_DIRECTOR', 'CEO', 'LEASING_MANAGER'],
  ai: ['ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR', 'CEO'],
  admin: ['ADMIN'],
  announcements: ['ADMIN', 'MALL_DIRECTOR', 'OPERATION', 'LEASING_MANAGER', 'TENANT'],
  'tenant-portal': ['TENANT', 'ADMIN', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'OPERATION'],
  'cross-mall': ['ADMIN', 'CEO'],
};

/** Map URL path segment → module key */
export const PATH_TO_MODULE: Record<string, RouteModule> = {
  dashboard: 'dashboard',
  spaces: 'spaces',
  crm: 'crm',
  'deal-pipeline': 'deal-pipeline',
  bookings: 'bookings',
  proposals: 'proposals',
  approvals: 'approvals',
  contracts: 'contracts',
  tenants: 'tenants',
  fitout: 'fitout',
  tickets: 'tickets',
  sales: 'sales',
  billing: 'billing',
  sap: 'sap',
  reports: 'reports',
  analytics: 'analytics',
  ai: 'ai',
  admin: 'admin',
  announcements: 'announcements',
  'tenant-portal': 'tenant-portal',
  'cross-mall': 'cross-mall',
};

export function canAccessModule(role: string | undefined, module: RouteModule): boolean {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  return ROUTE_PERMISSIONS[module]?.includes(role as AppRole) ?? false;
}

export function canAccessPath(role: string | undefined, path: string): boolean {
  const segment = path.replace(/^\//, '').split('/')[0] as RouteModule;
  const module = PATH_TO_MODULE[segment];
  if (!module) return true;
  return canAccessModule(role, module);
}

export const NAV_GROUPS = [
  {
    label: 'Tổng quan',
    items: [
      { label: 'Dashboard', path: '/dashboard', module: 'dashboard' as RouteModule },
      { label: 'Mặt bằng', path: '/spaces', module: 'spaces' as RouteModule },
    ],
  },
  {
    label: 'Quy trình bán hàng',
    items: [
      { label: 'CRM & Leads', path: '/crm', module: 'crm' as RouteModule },
      { label: 'Deal Pipeline', path: '/deal-pipeline', module: 'deal-pipeline' as RouteModule },
      { label: 'Booking', path: '/bookings', module: 'bookings' as RouteModule },
      { label: 'Đề xuất', path: '/proposals', module: 'proposals' as RouteModule },
      { label: 'Phê duyệt', path: '/approvals', module: 'approvals' as RouteModule },
      { label: 'Hợp đồng', path: '/contracts', module: 'contracts' as RouteModule },
      { label: 'Khách thuê', path: '/tenants', module: 'tenants' as RouteModule },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { label: 'Fitout', path: '/fitout', module: 'fitout' as RouteModule },
      { label: 'Ticket', path: '/tickets', module: 'tickets' as RouteModule },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      { label: 'Doanh thu', path: '/sales', module: 'sales' as RouteModule },
      { label: 'Billing & AR', path: '/billing', module: 'billing' as RouteModule },
      { label: 'SAP', path: '/sap', module: 'sap' as RouteModule },
    ],
  },
  {
    label: 'Phân tích',
    items: [
      { label: 'Báo cáo', path: '/reports', module: 'reports' as RouteModule },
      { label: 'Analytics', path: '/analytics', module: 'analytics' as RouteModule },
      { label: 'AI Assistant', path: '/ai', module: 'ai' as RouteModule },
      { label: 'Cross-Mall CEO', path: '/cross-mall', module: 'cross-mall' as RouteModule },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { label: 'Thông báo Mall', path: '/announcements', module: 'announcements' as RouteModule },
      { label: 'Tenant Portal', path: '/tenant-portal', module: 'tenant-portal' as RouteModule },
      { label: 'Quản trị', path: '/admin', module: 'admin' as RouteModule },
    ],
  },
];

export const TENANT_NAV = [
  { label: 'Tổng quan', path: '/tenant-portal', module: 'tenant-portal' as RouteModule },
  { label: 'Hóa đơn', path: '/billing', module: 'billing' as RouteModule },
  { label: 'Yêu cầu hỗ trợ', path: '/tickets', module: 'tickets' as RouteModule },
  { label: 'Doanh thu', path: '/sales', module: 'sales' as RouteModule },
  { label: 'Thông báo', path: '/announcements', module: 'announcements' as RouteModule },
];

export function getDefaultHomePath(role: string | undefined): string {
  if (role === 'TENANT') return '/tenant-portal';
  return '/dashboard';
}
