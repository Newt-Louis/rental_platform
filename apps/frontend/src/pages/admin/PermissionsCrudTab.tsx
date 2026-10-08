import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Info, RotateCcw, Save } from 'lucide-react';
import { permissionsApi, spacesApi, usersApi } from '@/api';
import { PERMISSION_ACTIONS, type ActionFlags, type PermissionAction } from '@/api/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { getApiErrorMessage } from '@/lib/api-error';
import { NAV_GROUPS, ROUTE_PERMISSIONS, type AppRole } from '@/lib/permissions';
import { adminRoleTranslationKey } from './adminPresentation';

// ADMIN bypasses every guard and TENANT is outside the staff matrix, so neither is configurable here.
const CONFIGURABLE_ROLES: AppRole[] = [
  'CEO', 'MALL_DIRECTOR', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'FINANCE', 'LEGAL', 'OPERATION', 'FITOUT_BASIC_TEAM',
];

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((item) => [item.module, item.label])),
);
const MODULES = Object.keys(ROUTE_PERMISSIONS).map((module) => ({ module, label: MODULE_LABELS[module] ?? module }));

const ACTION_LABEL: Record<PermissionAction, [string, string]> = {
  view: ['actions.view', 'Xem'],
  create: ['actions.create', 'Tạo'],
  update: ['actions.update', 'Sửa'],
  delete: ['actions.delete', 'Xóa'],
};

const NONE: ActionFlags = { view: false, create: false, update: false, delete: false };

type SubjectMode = 'role' | 'user';
/** Unsaved edits: module -> the flags the admin changed (only differences from what is saved). */
type Draft = Record<string, Partial<ActionFlags>>;

export function PermissionsCrudTab() {
  const { t } = useTranslation('admin');
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<SubjectMode>('role');
  const [scope, setScope] = useState('GLOBAL');
  const [role, setRole] = useState<AppRole>('LEASING_MANAGER');
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const deferredSearch = useDeferredValue(search);
  const mallId = scope === 'GLOBAL' ? undefined : scope;

  const { data: mallsData } = useQuery({ queryKey: ['malls'], queryFn: spacesApi.listMalls });
  const malls: any[] = mallsData?.data ?? mallsData ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users', 'permission-picker', deferredSearch],
    queryFn: () => usersApi.listUsers({ limit: 20, isActive: true, ...(deferredSearch ? { search: deferredSearch } : {}) }),
    enabled: mode === 'user',
  });
  const users: any[] = (usersData?.data ?? []).filter((u: any) => u.role !== 'ADMIN' && u.role !== 'TENANT');

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ['permissions-matrix', scope],
    queryFn: () => permissionsApi.getMatrix(mallId),
    enabled: mode === 'role',
  });
  const { data: userPerms, isLoading: userLoading } = useQuery({
    queryKey: ['permissions-user', userId, scope],
    queryFn: () => permissionsApi.getUserPermissions(userId, mallId),
    enabled: mode === 'user' && !!userId,
  });

  // Edits belong to one subject + scope; switching any of them starts clean.
  const subjectKey = `${mode}|${scope}|${role}|${userId}`;
  useEffect(() => setDraft({}), [subjectKey]);

  const dirtyModules = useMemo(() => Object.keys(draft).filter((m) => Object.keys(draft[m]).length > 0), [draft]);
  const dirty = dirtyModules.length > 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['permissions-matrix'] });
    qc.invalidateQueries({ queryKey: ['permissions-user'] });
    qc.invalidateQueries({ queryKey: ['permissions-effective'] });
    qc.invalidateQueries({ queryKey: ['permissions-effective-actions'] });
  };
  const onError = (error: unknown) =>
    toast({ title: t('permissions.toastError'), description: getApiErrorMessage(error), variant: 'destructive' });

  const saveMutation = useMutation({
    mutationFn: () => {
      const changes = dirtyModules.map((module) => ({ module, ...draft[module] }));
      return mode === 'role'
        ? permissionsApi.saveRoleBatch({ role, mallId, changes })
        : permissionsApi.saveUserBatch(userId, { mallId, changes });
    },
    onSuccess: () => {
      refresh();
      setDraft({});
      toast({ title: t('permissionsCrud.toastSaved') });
    },
    onError,
  });
  const clearMutation = useMutation({
    mutationFn: () => permissionsApi.clearUserPermissions(userId, mallId),
    onSuccess: () => { refresh(); setDraft({}); toast({ title: t('permissionsCrud.toastCleared') }); },
    onError,
  });

  const isLoading = mode === 'role' ? matrixLoading : !!userId && userLoading;
  const busy = saveMutation.isPending || clearMutation.isPending;

  const savedFlags = (module: string): ActionFlags =>
    (mode === 'role' ? matrix?.[module]?.actions?.[role] : userPerms?.effective?.[module]) ?? NONE;
  const flagsFor = (module: string): ActionFlags => ({ ...savedFlags(module), ...draft[module] });

  const setFlags = (module: string, next: Partial<ActionFlags>) => {
    const saved = savedFlags(module);
    setDraft((prev) => {
      const merged = { ...prev[module], ...next };
      // Drop anything equal to the saved value so "dirty" means a real change.
      for (const a of PERMISSION_ACTIONS) if (merged[a] === saved[a]) delete merged[a];
      return { ...prev, [module]: merged };
    });
  };

  const toggle = (module: string, action: PermissionAction) => {
    const current = flagsFor(module);
    const value = !current[action];
    // Without View the other rights are meaningless: turning View off clears them.
    setFlags(module, action === 'view' && !value
      ? { view: false, create: false, update: false, delete: false }
      : { [action]: value });
  };

  const setRow = (module: string, value: boolean) =>
    setFlags(module, { view: value, create: value, update: value, delete: value });

  const overrideCount = Object.keys(userPerms?.overrides ?? {}).length;

  const changeSubject = (apply: () => void) => {
    if (dirty && !window.confirm(t('permissionsCrud.discardConfirm'))) return;
    apply();
  };

  return (
    <div>
      <div className="mb-3 flex items-start gap-2 border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>{t('permissionsCrud.note')}</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={t('permissionsCrud.subject')} className="inline-flex overflow-hidden rounded-md border text-sm">
          {(['role', 'user'] as SubjectMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => changeSubject(() => setMode(m))}
              className={`px-3 py-1.5 ${mode === m ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t(m === 'role' ? 'permissionsCrud.byRole' : 'permissionsCrud.byUser')}
            </button>
          ))}
        </div>

        <select
          value={scope}
          onChange={(e) => changeSubject(() => setScope(e.target.value))}
          className="h-9 rounded-md border bg-white px-3 text-sm"
          aria-label={t('permissionsCrud.scope')}
        >
          <option value="GLOBAL">{t('permissions.scopeGlobal')}</option>
          {malls.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        {mode === 'role' ? (
          <select
            value={role}
            onChange={(e) => changeSubject(() => setRole(e.target.value as AppRole))}
            className="h-9 rounded-md border bg-white px-3 text-sm"
            aria-label={t('permissionsCrud.pickRole')}
          >
            {CONFIGURABLE_ROLES.map((r) => <option key={r} value={r}>{t(adminRoleTranslationKey(r))}</option>)}
          </select>
        ) : (
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('permissionsCrud.searchUser')}
              className="h-9 w-52"
            />
            <select
              value={userId}
              onChange={(e) => changeSubject(() => setUserId(e.target.value))}
              className="h-9 min-w-56 rounded-md border bg-white px-3 text-sm"
              aria-label={t('permissionsCrud.pickUser')}
            >
              <option value="">{t('permissionsCrud.pickUser')}</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.fullName} — {t(adminRoleTranslationKey(u.role))}</option>
              ))}
            </select>
            {userId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || overrideCount === 0}
                onClick={() => clearMutation.mutate()}
              >
                <RotateCcw size={14} className="mr-1.5" />
                {t('permissionsCrud.clearOverrides')}
              </Button>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">{t('permissionsCrud.unsaved', { count: dirtyModules.length })}</span>}
          <Button type="button" variant="outline" size="sm" disabled={!dirty || busy} onClick={() => setDraft({})}>
            {t('permissionsCrud.cancel')}
          </Button>
          <Button type="button" size="sm" disabled={!dirty || busy} onClick={() => saveMutation.mutate()}>
            <Save size={14} className="mr-1.5" />
            {t('permissionsCrud.save')}
          </Button>
        </div>
      </div>

      {mode === 'user' && !userId ? (
        <p className="py-10 text-center text-sm text-gray-500">{t('permissionsCrud.pickUserHint')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-40 border-b border-r bg-gray-50 px-3 py-2.5 text-left font-medium text-gray-600">
                  {t('permissions.feature')}
                </th>
                {PERMISSION_ACTIONS.map((a) => (
                  <th key={a} className="w-20 border-b border-r bg-gray-50 px-2 py-2.5 text-center font-medium text-gray-600">
                    {t(`permissionsCrud.${ACTION_LABEL[a][0]}`, { defaultValue: ACTION_LABEL[a][1] })}
                  </th>
                ))}
                <th className="w-24 border-b bg-gray-50 px-2 py-2.5 text-center font-medium text-gray-600">{t('permissionsCrud.selectAll')}</th>
              </tr>
            </thead>
            <tbody>
              {MODULES.map(({ module, label }, i) => {
                const flags = flagsFor(module);
                const changed = Object.keys(draft[module] ?? {}).length > 0;
                const override = mode === 'user' ? userPerms?.overrides?.[module] : undefined;
                return (
                  <tr
                    key={module}
                    data-crud-permission={module}
                    className={changed ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                  >
                    <td className="sticky left-0 border-b border-r bg-inherit px-3 py-2 font-medium text-gray-700">{label}</td>
                    {PERMISSION_ACTIONS.map((action) => {
                      const actionLabel = t(`permissionsCrud.${ACTION_LABEL[action][0]}`, { defaultValue: ACTION_LABEL[action][1] });
                      const overridden = override?.[action] != null;
                      // Create/Update/Delete only mean something while View is on.
                      const disabled = isLoading || busy || (action !== 'view' && !flags.view);
                      return (
                        <td key={action} className="border-b border-r px-2 py-2 text-center">
                          <label className="inline-flex items-center justify-center gap-1">
                            <input
                              type="checkbox"
                              checked={flags[action]}
                              disabled={disabled}
                              onChange={() => toggle(module, action)}
                              aria-label={`${label} — ${actionLabel}`}
                              className="h-4 w-4 accent-slate-900 disabled:opacity-40"
                            />
                            {overridden && (
                              <span title={t('permissionsCrud.overridden')}>
                                <CheckCircle2 size={11} className="text-amber-500" />
                              </span>
                            )}
                          </label>
                        </td>
                      );
                    })}
                    <td className="border-b px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={PERMISSION_ACTIONS.every((a) => flags[a])}
                        disabled={isLoading || busy}
                        onChange={(e) => setRow(module, e.target.checked)}
                        aria-label={`${label} — ${t('permissionsCrud.selectAll')}`}
                        className="h-4 w-4 accent-slate-900 disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
