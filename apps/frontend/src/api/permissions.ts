import api from '@/lib/axios';
import { AppRole } from '@/lib/permissions';

export interface ModulePermissionCell {
  roles: AppRole[];
  source: 'mall' | 'global';
}

export const permissionsApi = {
  getEffective: (mallId?: string | null): Promise<{ modules: string[] }> =>
    api.get('/permissions/effective', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  getMatrix: (mallId?: string | null): Promise<Record<string, ModulePermissionCell>> =>
    api.get('/permissions/matrix', { params: mallId ? { mallId } : undefined }).then((r) => r.data),
  updateCell: (data: { module: string; role: AppRole; allowed: boolean; mallId?: string | null }) =>
    api.patch('/permissions/matrix', data).then((r) => r.data),
  resetToDefault: (mallId?: string | null) =>
    api.post('/permissions/matrix/reset', mallId ? { mallId } : {}).then((r) => r.data),
};
