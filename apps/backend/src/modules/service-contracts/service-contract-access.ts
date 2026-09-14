import { Role, ServiceContractSharePermission } from '@prisma/client';

/**
 * Ai được vào module hợp đồng dịch vụ. Đọc là quyền nền: bất kỳ ai qua được
 * cửa vai trò này đều thấy toàn bộ hợp đồng thuộc Mall mà họ được cấp quyền —
 * chia sẻ không phải thứ mở khoá việc nhìn thấy dữ liệu.
 */
export const SERVICE_CONTRACT_VIEW_ROLES: Role[] = [
  Role.ADMIN,
  Role.CEO,
  Role.MALL_DIRECTOR,
  Role.LEASING_MANAGER,
  Role.FINANCE,
  Role.LEGAL,
  Role.OPERATION,
];

/**
 * Trần quyền: chỉ những vai trò này mới có khả năng sửa/xoá, và cũng chỉ khi
 * được người tạo chia sẻ đúng mức. Vai trò không tự cấp quyền ghi cho ai.
 */
export const SERVICE_CONTRACT_EDIT_ROLES: Role[] = [
  Role.ADMIN,
  Role.MALL_DIRECTOR,
  Role.LEASING_MANAGER,
  Role.LEGAL,
  Role.OPERATION,
];

/** DELETE bao gồm EDIT, EDIT bao gồm READ — so sánh bằng thứ hạng, không bằng tập hợp. */
const RANK: Record<ServiceContractSharePermission, number> = {
  [ServiceContractSharePermission.READ]: 1,
  [ServiceContractSharePermission.EDIT]: 2,
  [ServiceContractSharePermission.DELETE]: 3,
};

export function outranks(
  held: ServiceContractSharePermission,
  required: ServiceContractSharePermission,
): boolean {
  return RANK[held] >= RANK[required];
}

function lower(
  a: ServiceContractSharePermission,
  b: ServiceContractSharePermission,
): ServiceContractSharePermission {
  return RANK[a] <= RANK[b] ? a : b;
}

/**
 * Mức cao nhất mà vai trò cho phép, bất kể được chia sẻ tới đâu. Một FINANCE
 * được chia sẻ mức DELETE vẫn chỉ đọc được, vì FINANCE không nằm trong nhóm
 * được sửa. Chia sẻ không bao giờ nới rộng được vai trò.
 */
export function roleCeiling(role: Role | undefined): ServiceContractSharePermission {
  return role && SERVICE_CONTRACT_EDIT_ROLES.includes(role)
    ? ServiceContractSharePermission.DELETE
    : ServiceContractSharePermission.READ;
}

export interface ServiceContractAccessInput {
  role: Role | undefined;
  userId: string;
  /** ServiceContract.createdById — người tạo, cũng là người duy nhất được chia sẻ. */
  createdById: string;
  /** Bản ghi chia sẻ của chính người này, nếu có. */
  share?: { permission: ServiceContractSharePermission } | null;
}

/**
 * Quyền hiệu lực trên MỘT hợp đồng, chạy SAU khi RolesGuard và MallAccessGuard
 * đã cho qua. Công thức: min(trần vai trò, mức được chia sẻ), với hai lối tắt —
 * ADMIN là super-admin toàn hệ thống, và người tạo toàn quyền trên hồ sơ mình
 * lập ra.
 */
export function resolveServiceContractPermission({
  role,
  userId,
  createdById,
  share,
}: ServiceContractAccessInput): ServiceContractSharePermission {
  if (role === Role.ADMIN) return ServiceContractSharePermission.DELETE;
  if (userId === createdById) return ServiceContractSharePermission.DELETE;
  // Không có bản ghi chia sẻ vẫn đọc được: đọc là quyền nền của cả Mall.
  const granted = share?.permission ?? ServiceContractSharePermission.READ;
  return lower(granted, roleCeiling(role));
}

/** Chỉ người tạo (và ADMIN) mới được cấp/thu hồi chia sẻ — không có chia sẻ nối đuôi. */
export function canManageShares(role: Role | undefined, userId: string, createdById: string): boolean {
  return role === Role.ADMIN || userId === createdById;
}
