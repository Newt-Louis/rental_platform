import api from '@/lib/axios';
import { AppRole } from '@/lib/permissions';

export type PermissionAction = 'view' | 'create' | 'update' | 'delete';
export const PERMISSION_ACTIONS: PermissionAction[] = ['view', 'create', 'update', 'delete'];

export type ActionFlags = Record<PermissionAction, boolean>;
/** true = grant, false = deny, null = inherit from the user's role. */
export type UserOverrideFlags = Record<PermissionAction, boolean | null>;

export interface ModulePermissionCell {
  /** Roles with the View right. */
  roles: AppRole[];
  source: 'mall' | 'global';
  /** Full View/Create/Update/Delete flags for every role in `roles`. */
  actions: Record<string, ActionFlags>;
}

export interface UserPermissions {
  role: AppRole;
  overrides: Record<string, UserOverrideFlags>;
  effective: Record<string, ActionFlags>;
}

const scopeParams = (mallId?: string | null) => (mallId ? { mallId } : undefined);

export const permissionsApi = {
  getEffective: (mallId?: string | null): Promise<{ modules: string[] }> =>
    api.get('/permissions/effective', { params: scopeParams(mallId) }).then((r) => r.data),
  getEffectiveActions: (mallId?: string | null): Promise<Record<string, ActionFlags>> =>
    api.get('/permissions/effective-actions', { params: scopeParams(mallId) }).then((r) => r.data),
  getMatrix: (mallId?: string | null): Promise<Record<string, ModulePermissionCell>> =>
    api.get('/permissions/matrix', { params: scopeParams(mallId) }).then((r) => r.data),
  updateCell: (data: { module: string; role: AppRole; allowed: boolean; action?: PermissionAction; mallId?: string | null }) =>
    api.patch('/permissions/matrix', data).then((r) => r.data),
  resetToDefault: (mallId?: string | null) =>
    api.post('/permissions/matrix/reset', mallId ? { mallId } : {}).then((r) => r.data),

  /** Save many modules for one role in one request; a flag left out is unchanged. */
  saveRoleBatch: (data: {
    role: AppRole; mallId?: string | null;
    changes: Array<{ module: string } & Partial<ActionFlags>>;
  }) => api.patch('/permissions/matrix/batch', data).then((r) => r.data),
  saveUserBatch: (userId: string, data: {
    mallId?: string | null;
    changes: Array<{ module: string } & Partial<UserOverrideFlags>>;
  }) => api.patch(`/permissions/users/${userId}/batch`, data).then((r) => r.data),

  getUserPermissions: (userId: string, mallId?: string | null): Promise<UserPermissions> =>
    api.get(`/permissions/users/${userId}`, { params: scopeParams(mallId) }).then((r) => r.data),
  updateUserPermission: (
    userId: string,
    data: { module: string; action: PermissionAction; value: boolean | null; mallId?: string | null },
  ) => api.patch(`/permissions/users/${userId}`, data).then((r) => r.data),
  clearUserPermissions: (userId: string, mallId?: string | null) =>
    api.delete(`/permissions/users/${userId}`, { params: scopeParams(mallId) }).then((r) => r.data),
};
