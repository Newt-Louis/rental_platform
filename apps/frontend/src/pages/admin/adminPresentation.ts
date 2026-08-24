export const ADMIN_ROLE_KEYS: Record<string, string> = {
  ADMIN: 'users.roles.ADMIN',
  CEO: 'users.roles.CEO',
  MALL_DIRECTOR: 'users.roles.MALL_DIRECTOR',
  LEASING_MANAGER: 'users.roles.LEASING_MANAGER',
  LEASING_EXECUTIVE: 'users.roles.LEASING_EXECUTIVE',
  FINANCE: 'users.roles.FINANCE',
  LEGAL: 'users.roles.LEGAL',
  OPERATION: 'users.roles.OPERATION',
  TENANT: 'users.roles.TENANT',
};

export function adminRoleTranslationKey(role: string) {
  return ADMIN_ROLE_KEYS[role] ?? role;
}

export function accountStatusTranslationKey(isActive: boolean) {
  return isActive ? 'users.statusActive' : 'users.statusLocked';
}
