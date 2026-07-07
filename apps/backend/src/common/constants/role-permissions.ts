import { Role } from '@prisma/client';

/** Ma trận quyền theo module — đồng bộ với frontend `lib/permissions.ts` */
export const MODULE_ROLES = {
  dashboard: [
    Role.ADMIN,
    Role.CEO,
    Role.MALL_DIRECTOR,
    Role.LEASING_MANAGER,
    Role.LEASING_EXECUTIVE,
    Role.FINANCE,
    Role.LEGAL,
    Role.OPERATION,
  ],
  spaces: [
    Role.ADMIN,
    Role.MALL_DIRECTOR,
    Role.LEASING_MANAGER,
    Role.LEASING_EXECUTIVE,
    Role.FINANCE,
    Role.LEGAL,
    Role.OPERATION,
  ],
  crm: [Role.ADMIN, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR],
  booking: [Role.ADMIN, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR],
  proposals: [Role.ADMIN, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR, Role.CEO],
  approvals: [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.FINANCE, Role.LEGAL, Role.CEO, Role.OPERATION],
  contracts: [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.FINANCE, Role.LEGAL],
  tenants: [
    Role.ADMIN,
    Role.LEASING_MANAGER,
    Role.LEASING_EXECUTIVE,
    Role.MALL_DIRECTOR,
    Role.FINANCE,
    Role.LEGAL,
  ],
  fitout: [Role.ADMIN, Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR],
  tickets: [Role.ADMIN, Role.OPERATION, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.TENANT],
  sales: [Role.ADMIN, Role.FINANCE, Role.MALL_DIRECTOR, Role.CEO, Role.TENANT],
  // Xếp hạng theo tenant, tình trạng tuân thủ nộp báo cáo, duyệt/từ chối — lộ dữ liệu tên/doanh thu của
  // các khách thuê khác nên KHÔNG cho TENANT dù module chung có.
  salesStaff: [Role.ADMIN, Role.FINANCE, Role.MALL_DIRECTOR, Role.CEO],
  billing: [Role.ADMIN, Role.FINANCE, Role.MALL_DIRECTOR, Role.TENANT],
  // Các endpoint quản trị billing (tạo/sửa hóa đơn, dunning, đối soát, cấu hình...) — KHÔNG cho TENANT dù module chung có.
  billingStaff: [Role.ADMIN, Role.FINANCE, Role.MALL_DIRECTOR],
  sap: [Role.ADMIN, Role.FINANCE],
  reports: [Role.ADMIN, Role.FINANCE, Role.MALL_DIRECTOR, Role.CEO, Role.LEASING_MANAGER],
  analytics: [Role.ADMIN, Role.FINANCE, Role.MALL_DIRECTOR, Role.CEO, Role.LEASING_MANAGER],
  ai: [Role.ADMIN, Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.CEO],
  admin: [Role.ADMIN],
  branding: [Role.ADMIN],
  announcements: [Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER, Role.TENANT],
  categories: [Role.ADMIN],
  categoriesRead: [
    Role.ADMIN,
    Role.MALL_DIRECTOR,
    Role.LEASING_MANAGER,
    Role.LEASING_EXECUTIVE,
    Role.FINANCE,
    Role.LEGAL,
  ],
  slots: [Role.ADMIN, Role.LEASING_MANAGER, Role.LEASING_EXECUTIVE, Role.MALL_DIRECTOR],
  crossMall: [Role.ADMIN, Role.CEO],
  notifications: [
    Role.ADMIN,
    Role.CEO,
    Role.MALL_DIRECTOR,
    Role.LEASING_MANAGER,
    Role.LEASING_EXECUTIVE,
    Role.FINANCE,
    Role.LEGAL,
    Role.OPERATION,
    Role.TENANT,
  ],
  tenantPortal: [Role.TENANT],
  // Nhật ký hệ thống (ai đã sửa gì) — công cụ tuân thủ, giới hạn ADMIN/CEO.
  auditLog: [Role.ADMIN, Role.CEO],
} as const satisfies Record<string, Role[]>;

export type ModuleKey = keyof typeof MODULE_ROLES;
