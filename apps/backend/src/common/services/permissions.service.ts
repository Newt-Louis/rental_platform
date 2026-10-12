import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MODULE_PERMISSION_DEFAULTS } from '../constants/module-permission-defaults';

const CACHE_TTL_MS = 30_000;
export const GLOBAL_MALL_KEY = 'GLOBAL';

type Tx = Prisma.TransactionClient | PrismaService;

export type PermissionAction = 'view' | 'create' | 'update' | 'delete';
export const PERMISSION_ACTIONS: PermissionAction[] = ['view', 'create', 'update', 'delete'];

/** HTTP verb -> the CRUD right it needs. POST counts as "create" even for search-style endpoints. */
export function actionForMethod(method?: string): PermissionAction {
  switch ((method ?? 'GET').toUpperCase()) {
    case 'POST': return 'create';
    case 'PUT':
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return 'view';
  }
}

export type ActionFlags = Record<PermissionAction, boolean>;
export type UserOverrideFlags = Record<PermissionAction, boolean | null>;

export interface MatrixCell {
  /** Roles with the VIEW right (module access). */
  roles: Role[];
  source: 'mall' | 'global';
  /** Per allowed role: its full CRUD flags. */
  actions: Record<string, ActionFlags>;
}

interface Cache {
  // "mallId::module" -> allowed roles for that exact key (includes the GLOBAL rows).
  allowedByKey: Map<string, Set<Role>>;
  // Every "mallId::module" with at least one row, regardless of allowed value --
  // needed to tell "nobody configured this" (fall through) apart from
  // "admin deliberately allowed zero roles" (deny everyone).
  configuredKeys: Set<string>;
  // "mallId::module::role" -> create/update/delete flags of that row.
  flagsByRow: Map<string, Pick<ActionFlags, 'create' | 'update' | 'delete'>>;
  // "userId::mallId::module" -> that user's tri-state override.
  userOverrides: Map<string, UserOverrideFlags>;
}

const cacheKey = (mallId: string, module: string) => `${mallId}::${module}`;

/**
 * DB-backed override for module-level role access (ModulePermission table),
 * so an ADMIN can flip who can reach a module from /admin?section=permissions
 * without a redeploy -- optionally scoped to a single Mall. Cached in memory
 * (whole table is a few hundred rows per mall) -- RolesGuard calls
 * getAllowedRoles() on every request, so this must never hit the DB per-request.
 * A write refreshes the cache immediately in this process; other instances
 * pick it up within CACHE_TTL_MS.
 *
 * Each row carries four rights: View (`allowed`), Create, Update, Delete. A
 * single user can also be given an override (UserModulePermission) that wins
 * over their role.
 *
 * Resolution order for getAllowedRoles(module, mallId):
 *   1. rows for (module, mallId) if that Mall has its own configuration
 *   2. rows for (module, GLOBAL) -- the shared default template
 *   3. null -- caller falls back to the static MODULE_ROLES rule
 */
@Injectable()
export class PermissionsService {
  private cache: Cache | null = null;
  private cachedAt = 0;

  constructor(private prisma: PrismaService) {}

  private async loadCache(): Promise<Cache> {
    if (this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cache;
    }
    const [rows, userRows] = await Promise.all([
      this.prisma.modulePermission.findMany(),
      this.prisma.userModulePermission.findMany(),
    ]);
    const allowedByKey = new Map<string, Set<Role>>();
    const configuredKeys = new Set<string>();
    const flagsByRow: Cache['flagsByRow'] = new Map();
    const userOverrides: Cache['userOverrides'] = new Map();
    for (const row of rows) {
      const key = cacheKey(row.mallId, row.module);
      configuredKeys.add(key);
      flagsByRow.set(`${key}::${row.role}`, { create: row.canCreate, update: row.canUpdate, delete: row.canDelete });
      if (!row.allowed) continue;
      if (!allowedByKey.has(key)) allowedByKey.set(key, new Set());
      allowedByKey.get(key)!.add(row.role);
    }
    for (const u of userRows) {
      userOverrides.set(`${u.userId}::${u.mallId}::${u.module}`, {
        view: u.canView, create: u.canCreate, update: u.canUpdate, delete: u.canDelete,
      });
    }
    this.cache = { allowedByKey, configuredKeys, flagsByRow, userOverrides };
    this.cachedAt = Date.now();
    return this.cache;
  }

  private invalidate() {
    this.cache = null;
  }

  /** null means "no configuration at any tier" -- caller should fall back to a static rule. */
  async getAllowedRoles(module: string, mallId?: string | null): Promise<Set<Role> | null> {
    const { allowedByKey, configuredKeys } = await this.loadCache();
    if (mallId && mallId !== GLOBAL_MALL_KEY) {
      const mallKey = cacheKey(mallId, module);
      if (configuredKeys.has(mallKey)) return allowedByKey.get(mallKey) ?? new Set();
    }
    const globalKey = cacheKey(GLOBAL_MALL_KEY, module);
    if (configuredKeys.has(globalKey)) return allowedByKey.get(globalKey) ?? new Set();
    return null;
  }

  /** The tier ("mallId") whose rows govern this module for this Mall, or null if unconfigured. */
  private resolveTier(configuredKeys: Set<string>, module: string, mallId?: string | null): string | null {
    if (mallId && mallId !== GLOBAL_MALL_KEY && configuredKeys.has(cacheKey(mallId, module))) return mallId;
    if (configuredKeys.has(cacheKey(GLOBAL_MALL_KEY, module))) return GLOBAL_MALL_KEY;
    return null;
  }

  /**
   * Role-level create/update/delete right (the view right is getAllowedRoles).
   * true when the module is unconfigured or the row predates the CRUD matrix.
   */
  async isRoleActionAllowed(role: Role, module: string, action: PermissionAction, mallId?: string | null): Promise<boolean> {
    if (action === 'view') return true;
    const { configuredKeys, flagsByRow } = await this.loadCache();
    const tier = this.resolveTier(configuredKeys, module, mallId);
    if (!tier) return true;
    const flags = flagsByRow.get(`${tier}::${module}::${role}`);
    return flags ? flags[action] : true;
  }

  /**
   * A user's own override for one action: true/false when explicitly set, null
   * to fall through to the role matrix. A Mall-specific row wins over GLOBAL,
   * and an explicit "no view" denies every action.
   */
  async getUserDecision(userId: string | undefined, module: string, action: PermissionAction, mallId?: string | null): Promise<boolean | null> {
    if (!userId) return null;
    const { userOverrides } = await this.loadCache();
    const tiers = mallId && mallId !== GLOBAL_MALL_KEY ? [mallId, GLOBAL_MALL_KEY] : [GLOBAL_MALL_KEY];
    for (const tier of tiers) {
      const flags = userOverrides.get(`${userId}::${tier}::${module}`);
      if (!flags) continue;
      if (flags[action] !== null) return flags[action];
      if (flags.view === false) return false;
    }
    return null;
  }

  async getUserOverrides(userId: string, mallId?: string | null): Promise<Record<string, UserOverrideFlags>> {
    const rows = await this.prisma.userModulePermission.findMany({
      where: { userId, mallId: mallId ?? GLOBAL_MALL_KEY },
    });
    return Object.fromEntries(rows.map((r) => [r.module, {
      view: r.canView, create: r.canCreate, update: r.canUpdate, delete: r.canDelete,
    }]));
  }

  /** value null clears that one override (inherit from role); a row with every flag null is deleted. */
  async setUserOverride(
    userId: string, module: string, action: PermissionAction, value: boolean | null,
    updatedById: string, mallId: string = GLOBAL_MALL_KEY,
  ): Promise<void> {
    await this.setUserRights(userId, [{ module, flags: { [action]: value } }], updatedById, mallId);
  }

  /** Many module overrides for one user in a single transaction; a flag left out is not touched. */
  async setUserRights(
    userId: string, changes: Array<{ module: string; flags: Partial<UserOverrideFlags> }>,
    updatedById: string, mallId: string = GLOBAL_MALL_KEY,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const { module, flags } of changes) {
        const data: Prisma.UserModulePermissionUncheckedUpdateInput = { updatedById };
        if (flags.view !== undefined) data.canView = flags.view;
        if (flags.create !== undefined) data.canCreate = flags.create;
        if (flags.update !== undefined) data.canUpdate = flags.update;
        if (flags.delete !== undefined) data.canDelete = flags.delete;
        const where = { userId_module_mallId: { userId, module, mallId } };
        const row = await tx.userModulePermission.upsert({
          where,
          create: { userId, module, mallId, ...(data as Prisma.UserModulePermissionUncheckedCreateInput) },
          update: data,
        });
        if (row.canView === null && row.canCreate === null && row.canUpdate === null && row.canDelete === null) {
          await tx.userModulePermission.delete({ where });
        }
      }
    });
    this.invalidate();
  }

  async clearUserOverrides(userId: string, mallId: string = GLOBAL_MALL_KEY): Promise<void> {
    await this.prisma.userModulePermission.deleteMany({ where: { userId, mallId } });
    this.invalidate();
  }

  /** Full CRUD flags for one user, for the frontend: the role matrix with the user's overrides applied. */
  async getEffectiveActions(user: { id: string; role: Role }, mallId?: string | null): Promise<Record<string, ActionFlags>> {
    const { configuredKeys, userOverrides } = await this.loadCache();
    const modules = new Set<string>();
    for (const key of configuredKeys) modules.add(key.split('::')[1]);
    for (const key of userOverrides.keys()) modules.add(key.split('::')[2]);
    const out: Record<string, ActionFlags> = {};
    for (const module of modules) {
      const roles = await this.getAllowedRoles(module, mallId);
      const roleView = !!roles?.has(user.role);
      const flags = {} as ActionFlags;
      for (const action of PERMISSION_ACTIONS) {
        const override = await this.getUserDecision(user.id, module, action, mallId);
        flags[action] = override ?? (roleView && (await this.isRoleActionAllowed(user.role, module, action, mallId)));
      }
      out[module] = flags;
    }
    return out;
  }

  async getEffectiveModules(role: Role, mallId?: string | null): Promise<string[]> {
    const { configuredKeys } = await this.loadCache();
    const modules = new Set<string>();
    for (const key of configuredKeys) {
      const [, module] = key.split('::');
      modules.add(module);
    }
    const effective: string[] = [];
    for (const module of modules) {
      const roles = await this.getAllowedRoles(module, mallId);
      if (roles?.has(role)) effective.push(module);
    }
    return effective;
  }

  /**
   * Full matrix for the admin UI, scoped to one Mall (or the Global template
   * when mallId is omitted). Every module that has any configuration at
   * either tier is included, with `source` telling the UI whether the shown
   * roles are this Mall's own override or inherited from Global.
   */
  async getMatrix(mallId?: string | null): Promise<Record<string, MatrixCell>> {
    const { allowedByKey, configuredKeys, flagsByRow } = await this.loadCache();
    const modules = new Set<string>();
    for (const key of configuredKeys) modules.add(key.split('::')[1]);

    const cell = (module: string, tier: string, source: 'mall' | 'global'): MatrixCell => {
      const roles = Array.from(allowedByKey.get(cacheKey(tier, module)) ?? []);
      return {
        roles,
        source,
        actions: Object.fromEntries(roles.map((role) => {
          const f = flagsByRow.get(`${tier}::${module}::${role}`);
          return [role, { view: true, create: f?.create ?? true, update: f?.update ?? true, delete: f?.delete ?? true }];
        })),
      };
    };

    const matrix: Record<string, MatrixCell> = {};
    for (const module of modules) {
      if (mallId && mallId !== GLOBAL_MALL_KEY && configuredKeys.has(cacheKey(mallId, module))) {
        matrix[module] = cell(module, mallId, 'mall');
      } else {
        matrix[module] = cell(module, GLOBAL_MALL_KEY, 'global');
      }
    }
    return matrix;
  }

  /**
   * Sets one right for one role. `action` defaults to 'view' (module access).
   * Create/Update/Delete only apply while the role also has View.
   */
  async setAllowed(
    module: string, role: Role, allowed: boolean, updatedById: string,
    mallId: string = GLOBAL_MALL_KEY, action: PermissionAction = 'view',
  ): Promise<void> {
    await this.setRoleRights(role, [{ module, flags: { [action]: allowed } }], updatedById, mallId);
  }

  /**
   * Applies many module changes for one role in a single transaction (the
   * admin UI's "Save"). A flag left out is not touched; a role with no row yet
   * has no View right unless `view: true` is in the change.
   */
  async setRoleRights(
    role: Role, changes: Array<{ module: string; flags: Partial<ActionFlags> }>,
    updatedById: string, mallId: string = GLOBAL_MALL_KEY,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const { module, flags } of changes) {
        // A Mall with no rows of its own inherits Global; writing a single row
        // would silently make it "configured" and deny every other role. Fork
        // the Global rows for this module first.
        if (mallId !== GLOBAL_MALL_KEY) {
          const own = await tx.modulePermission.count({ where: { module, mallId } });
          if (own === 0) {
            const globalRows = await tx.modulePermission.findMany({ where: { module, mallId: GLOBAL_MALL_KEY } });
            if (globalRows.length > 0) {
              await tx.modulePermission.createMany({
                data: globalRows.map((r) => ({
                  module, role: r.role, mallId, allowed: r.allowed,
                  canCreate: r.canCreate, canUpdate: r.canUpdate, canDelete: r.canDelete, updatedById,
                })),
                skipDuplicates: true,
              });
            }
          }
        }
        const data: Prisma.ModulePermissionUncheckedUpdateInput = { updatedById };
        if (flags.view !== undefined) data.allowed = flags.view;
        if (flags.create !== undefined) data.canCreate = flags.create;
        if (flags.update !== undefined) data.canUpdate = flags.update;
        if (flags.delete !== undefined) data.canDelete = flags.delete;
        await tx.modulePermission.upsert({
          where: { module_role_mallId: { module, role, mallId } },
          create: { module, role, mallId, ...(data as Prisma.ModulePermissionUncheckedCreateInput), allowed: flags.view ?? false },
          update: data,
        });
      }
    });
    this.invalidate();
  }

  /**
   * Wipes every ModulePermission row for one scope (a Mall, or the Global
   * template when mallId is omitted) and recreates it from
   * MODULE_PERMISSION_DEFAULTS, undoing whatever an admin customized there --
   * "Reset to default" in the admin UI. Scoped strictly to the target mallId:
   * resetting a Mall never touches Global, and resetting Global never touches
   * any Mall's own overrides (each Mall keeps its customizations even if they
   * were only ever copied from Global at creation time). Per-user overrides are
   * not touched.
   */
  async resetToDefault(mallId?: string | null): Promise<void> {
    const targetMallId = mallId ?? GLOBAL_MALL_KEY;
    await this.prisma.$transaction([
      this.prisma.modulePermission.deleteMany({ where: { mallId: targetMallId } }),
      this.prisma.modulePermission.createMany({
        data: MODULE_PERMISSION_DEFAULTS.flatMap(({ module, roles }) =>
          roles.map((role) => ({ module, role, mallId: targetMallId, allowed: true })),
        ),
      }),
    ]);
    this.invalidate();
  }

  /**
   * Copies every GLOBAL row into a fresh set of rows for `mallId`, so a newly
   * created (or reactivated) Mall starts with a full, editable copy of
   * today's default permissions instead of relying silently on fallback.
   * skipDuplicates makes this safe to call unconditionally -- re-running it
   * on a Mall that already has rows (including admin-customized ones) never
   * overwrites them.
   */
  async seedDefaultsForMall(mallId: string, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    const globalRows = await client.modulePermission.findMany({ where: { mallId: GLOBAL_MALL_KEY } });
    if (globalRows.length === 0) return;
    await client.modulePermission.createMany({
      data: globalRows.map((row) => ({
        module: row.module, role: row.role, mallId, allowed: row.allowed,
        canCreate: row.canCreate, canUpdate: row.canUpdate, canDelete: row.canDelete,
      })),
      skipDuplicates: true,
    });
    this.invalidate();
  }
}
