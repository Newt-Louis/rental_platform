import type { Role, User } from '@/types';

const GLOBAL_ACCESS_ROLES: Role[] = ['ADMIN', 'CEO'];

export type MallAccessDisplay =
  | { kind: 'global' }
  | { kind: 'not-applicable' }
  | { kind: 'unassigned' }
  | { kind: 'malls'; malls: { id: string; name: string }[] };

export function getMallAccessDisplay(
  user: Pick<User, 'role' | 'mallAccess'>,
): MallAccessDisplay {
  if (GLOBAL_ACCESS_ROLES.includes(user.role)) return { kind: 'global' };
  if (user.role === 'TENANT') return { kind: 'not-applicable' };

  const malls = (user.mallAccess ?? []).map((access) => access.mall);
  if (malls.length === 0) return { kind: 'unassigned' };
  return { kind: 'malls', malls };
}
