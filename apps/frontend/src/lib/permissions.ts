/** Ma trận quyền — đồng bộ với backend `common/constants/role-permissions.ts` */

export type AppRole =
  | "ADMIN"
  | "CEO"
  | "MALL_DIRECTOR"
  | "LEASING_MANAGER"
  | "LEASING_EXECUTIVE"
  | "FINANCE"
  | "LEGAL"
  | "OPERATION"
  | "TENANT";

export type RouteModule =
  | "dashboard"
  | "spaces"
  | "crm"
  | "crm-overview"
  | "deal-pipeline"
  | "pipeline-stats"
  | "bookings"
  | "proposals"
  | "approvals"
  | "contracts"
  | "service-contracts"
  | "inventory"
  | "work-orders"
  | "tenants"
  | "fitout"
  | "tickets"
  | "sales"
  | "billing"
  | "sap"
  | "reports"
  | "analytics"
  | "ai"
  | "admin"
  | "announcements"
  | "tenant-portal"
  | "cross-mall"
  | "audit-log";

export const ROUTE_PERMISSIONS: Record<RouteModule, AppRole[]> = {
  dashboard: [
    "ADMIN",
    "CEO",
    "MALL_DIRECTOR",
    "LEASING_MANAGER",
    "LEASING_EXECUTIVE",
    "FINANCE",
    "LEGAL",
    "OPERATION",
  ],
  spaces: [
    "ADMIN",
    "MALL_DIRECTOR",
    "LEASING_MANAGER",
    "LEASING_EXECUTIVE",
    "FINANCE",
    "LEGAL",
    "OPERATION",
  ],
  crm: ["ADMIN", "LEASING_MANAGER", "LEASING_EXECUTIVE", "MALL_DIRECTOR"],
  "crm-overview": [
    "ADMIN",
    "LEASING_MANAGER",
    "LEASING_EXECUTIVE",
    "MALL_DIRECTOR",
  ],
  "deal-pipeline": [
    "ADMIN",
    "LEASING_MANAGER",
    "LEASING_EXECUTIVE",
    "MALL_DIRECTOR",
    "CEO",
  ],
  "pipeline-stats": [
    "ADMIN",
    "LEASING_MANAGER",
    "LEASING_EXECUTIVE",
    "MALL_DIRECTOR",
    "CEO",
  ],
  bookings: ["ADMIN", "LEASING_MANAGER", "LEASING_EXECUTIVE", "MALL_DIRECTOR"],
  proposals: [
    "ADMIN",
    "LEASING_MANAGER",
    "LEASING_EXECUTIVE",
    "MALL_DIRECTOR",
    "CEO",
  ],
  approvals: [
    "ADMIN",
    "LEASING_MANAGER",
    "MALL_DIRECTOR",
    "FINANCE",
    "LEGAL",
    "CEO",
    "OPERATION",
  ],
  contracts: [
    "ADMIN",
    "LEASING_MANAGER",
    "MALL_DIRECTOR",
    "FINANCE",
    "LEGAL",
    "TENANT",
  ],
  "service-contracts": [
    "ADMIN",
    "CEO",
    "LEASING_MANAGER",
    "MALL_DIRECTOR",
    "FINANCE",
    "LEGAL",
    "OPERATION",
  ],
  inventory: ["ADMIN", "CEO", "MALL_DIRECTOR", "FINANCE", "OPERATION"],
  "work-orders": [
    "ADMIN",
    "CEO",
    "MALL_DIRECTOR",
    "OPERATION",
    "LEASING_MANAGER",
  ],
  tenants: [
    "ADMIN",
    "LEASING_MANAGER",
    "LEASING_EXECUTIVE",
    "MALL_DIRECTOR",
    "FINANCE",
    "LEGAL",
  ],
  fitout: ["ADMIN", "OPERATION", "LEASING_MANAGER", "MALL_DIRECTOR", "TENANT"],
  tickets: ["ADMIN", "OPERATION", "MALL_DIRECTOR", "LEASING_MANAGER", "TENANT"],
  sales: ["ADMIN", "FINANCE", "MALL_DIRECTOR", "CEO", "TENANT"],
  billing: ["ADMIN", "FINANCE", "MALL_DIRECTOR", "TENANT"],
  sap: ["ADMIN", "FINANCE"],
  reports: ["ADMIN", "FINANCE", "MALL_DIRECTOR", "CEO", "LEASING_MANAGER"],
  analytics: ["ADMIN", "FINANCE", "MALL_DIRECTOR", "CEO", "LEASING_MANAGER"],
  ai: ["ADMIN", "LEASING_MANAGER", "MALL_DIRECTOR", "CEO"],
  admin: ["ADMIN"],
  announcements: [
    "ADMIN",
    "MALL_DIRECTOR",
    "OPERATION",
    "LEASING_MANAGER",
    "TENANT",
  ],
  "tenant-portal": [
    "TENANT",
    "ADMIN",
    "MALL_DIRECTOR",
    "LEASING_MANAGER",
    "LEASING_EXECUTIVE",
    "OPERATION",
  ],
  "cross-mall": ["ADMIN", "CEO"],
  "audit-log": ["ADMIN", "CEO"],
};

/** Map URL path segment → module key */
export const PATH_TO_MODULE: Record<string, RouteModule> = {
  dashboard: "dashboard",
  spaces: "spaces",
  crm: "crm",
  "crm-overview": "crm-overview",
  "deal-pipeline": "deal-pipeline",
  "pipeline-stats": "pipeline-stats",
  bookings: "bookings",
  proposals: "proposals",
  approvals: "approvals",
  contracts: "contracts",
  "service-contracts": "service-contracts",
  inventory: "inventory",
  "work-orders": "work-orders",
  tenants: "tenants",
  fitout: "fitout",
  tickets: "tickets",
  sales: "sales",
  billing: "billing",
  sap: "sap",
  reports: "reports",
  analytics: "analytics",
  ai: "ai",
  admin: "admin",
  announcements: "announcements",
  "tenant-portal": "tenant-portal",
  "cross-mall": "cross-mall",
  "audit-log": "audit-log",
};

export function canAccessModule(
  role: string | undefined,
  module: RouteModule,
): boolean {
  if (!role) return false;
  if (role === "ADMIN") return true;
  return ROUTE_PERMISSIONS[module]?.includes(role as AppRole) ?? false;
}

export function canAccessPath(role: string | undefined, path: string): boolean {
  const segment = path.replace(/^\//, "").split("/")[0] as RouteModule;
  const module = PATH_TO_MODULE[segment];
  if (!module) return false;
  return canAccessModule(role, module);
}

export const NAV_GROUPS = [
  {
    key: "overview",
    label: "Tổng quan",
    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        module: "dashboard" as RouteModule,
      },
      { label: "Mặt bằng", path: "/spaces", module: "spaces" as RouteModule },
    ],
  },
  {
    key: "salesProcess",
    // Chỉ giữ lại các bước hành động tuần tự thật của quy trình cho thuê 1 mặt bằng cụ thể
    // (Booking → Đề xuất → Phê duyệt → Hợp đồng → Khách thuê). CRM (chăm sóc lead trước khi
    // chọn mặt bằng) và Deal Pipeline (dashboard tổng hợp chỉ để xem, không thao tác) đã tách
    // ra 2 nhóm riêng bên dưới để không gây nhầm lẫn đây là các bước phải làm tuần tự.
    label: "Quy trình bán hàng",
    items: [
      {
        label: "Booking",
        path: "/bookings",
        module: "bookings" as RouteModule,
      },
      {
        label: "Đề xuất",
        path: "/proposals",
        module: "proposals" as RouteModule,
      },
      {
        label: "Phê duyệt",
        path: "/approvals",
        module: "approvals" as RouteModule,
      },
      {
        label: "Hợp đồng",
        path: "/contracts",
        module: "contracts" as RouteModule,
      },
      {
        label: "Khách thuê",
        path: "/tenants",
        module: "tenants" as RouteModule,
      },
      {
        label: "Thống kê",
        path: "/pipeline-stats",
        module: "pipeline-stats" as RouteModule,
      },
    ],
  },
  {
    key: "crm",
    // CRM quản lý quan hệ khách hàng tiềm năng TRƯỚC KHI chọn mặt bằng cụ thể — một giai đoạn
    // khác về bản chất so với quy trình bán hàng theo mặt bằng ở trên.
    label: "Khách hàng tiềm năng (CRM)",
    items: [
      {
        label: "Điều hành CRM",
        path: "/crm-overview",
        module: "crm-overview" as RouteModule,
      },
      { label: "Xử lý Lead", path: "/crm", module: "crm" as RouteModule },
    ],
  },
  {
    key: "operations",
    label: "Vận hành",
    items: [
      {
        label: "Hợp đồng dịch vụ",
        path: "/service-contracts",
        module: "service-contracts" as RouteModule,
      },
      {
        label: "Kho vận hành",
        path: "/inventory",
        module: "inventory" as RouteModule,
      },
      {
        label: "Điều phối công việc",
        path: "/work-orders",
        module: "work-orders" as RouteModule,
      },
      { label: "Fitout", path: "/fitout", module: "fitout" as RouteModule },
      { label: "Ticket", path: "/tickets", module: "tickets" as RouteModule },
    ],
  },
  {
    key: "finance",
    label: "Tài chính",
    items: [
      { label: "Doanh thu", path: "/sales", module: "sales" as RouteModule },
      {
        label: "Billing & AR",
        path: "/billing",
        module: "billing" as RouteModule,
      },
      { label: "SAP", path: "/sap", module: "sap" as RouteModule },
    ],
  },
  {
    key: "analytics",
    label: "Phân tích",
    items: [
      // Deal Pipeline là dashboard tổng hợp Lead→Booking→Đề xuất→Duyệt→Hợp đồng chỉ để xem
      // (không tạo/sửa/duyệt gì ở đây) — đúng bản chất là một báo cáo, không phải bước thao tác.
      {
        label: "Deal Pipeline",
        path: "/deal-pipeline",
        module: "deal-pipeline" as RouteModule,
      },
      { label: "Báo cáo", path: "/reports", module: "reports" as RouteModule },
      {
        label: "Analytics",
        path: "/analytics",
        module: "analytics" as RouteModule,
      },
      { label: "AI Assistant", path: "/ai", module: "ai" as RouteModule },
      {
        label: "Cross-Mall CEO",
        path: "/cross-mall",
        module: "cross-mall" as RouteModule,
      },
    ],
  },
  {
    key: "system",
    label: "Hệ thống",
    items: [
      {
        label: "Thông báo Mall",
        path: "/announcements",
        module: "announcements" as RouteModule,
      },
      {
        label: "Tenant Portal",
        path: "/tenant-portal",
        module: "tenant-portal" as RouteModule,
      },
      {
        label: "Nhật ký hệ thống",
        path: "/audit-log",
        module: "audit-log" as RouteModule,
      },
      { label: "Quản trị", path: "/admin", module: "admin" as RouteModule },
    ],
  },
];

export const TENANT_NAV = [
  {
    label: "Tổng quan",
    path: "/tenant-portal",
    module: "tenant-portal" as RouteModule,
  },
  { label: "Hóa đơn", path: "/billing", module: "billing" as RouteModule },
  {
    label: "Yêu cầu hỗ trợ",
    path: "/tickets",
    module: "tickets" as RouteModule,
  },
  { label: "Doanh thu", path: "/sales", module: "sales" as RouteModule },
  {
    label: "Thông báo",
    path: "/announcements",
    module: "announcements" as RouteModule,
  },
];

export function getDefaultHomePath(role: string | undefined): string {
  if (role === "TENANT") return "/tenant-portal";
  return "/dashboard";
}
