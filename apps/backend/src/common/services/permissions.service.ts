import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MODULE_PERMISSION_DEFAULTS } from '../constants/module-permission-defaults';

const CACHE_TTL_MS = 30_000;
export const GLOBAL_MALL_KEY = 'GLOBAL';

type Tx = Prisma.TransactionClient | PrismaService;

interface Cache {
  // "mallId::module" -> allowed roles for that exact key (includes the GLOBAL rows).
  allowedByKey: Map<string, Set<Role>>;
  // Every "mallId::module" with at least one row, regardless of allowed value --
  // needed to tell "nobody configured this" (fall through) apart from
  // "admin deliberately allowed zero roles" (deny everyone).
  configuredKeys: Set<string>;
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
    const rows = await this.prisma.modulePermission.findMany();
    const allowedByKey = new Map<string, Set<Role>>();
    const configuredKeys = new Set<string>();
    for (const row of rows) {
      const key = cacheKey(row.mallId, row.module);
      configuredKeys.add(key);
      if (!row.allowed) continue;
      if (!allowedByKey.has(key)) allowedByKey.set(key, new Set());
      allowedByKey.get(key)!.add(row.role);
    }
    this.cache = { allowedByKey, configuredKeys };
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
  async getMatrix(mallId?: string | null): Promise<Record<string, { roles: Role[]; source: 'mall' | 'global' }>> {
    const { allowedByKey, configuredKeys } = await this.loadCache();
    const modules = new Set<string>();
    for (const key of configuredKeys) modules.add(key.split('::')[1]);

    const matrix: Record<string, { roles: Role[]; source: 'mall' | 'global' }> = {};
    for (const module of modules) {
      const mallKey = mallId && mallId !== GLOBAL_MALL_KEY ? cacheKey(mallId, module) : null;
      if (mallKey && configuredKeys.has(mallKey)) {
        matrix[module] = { roles: Array.from(allowedByKey.get(mallKey) ?? []), source: 'mall' };
        continue;
      }
      const globalKey = cacheKey(GLOBAL_MALL_KEY, module);
      matrix[module] = { roles: Array.from(allowedByKey.get(globalKey) ?? []), source: 'global' };
    }
    return matrix;
  }

  async setAllowed(module: string, role: Role, allowed: boolean, updatedById: string, mallId: string = GLOBAL_MALL_KEY): Promise<void> {
    await this.prisma.modulePermission.upsert({
      where: { module_role_mallId: { module, role, mallId } },
      create: { module, role, mallId, allowed, updatedById },
      update: { allowed, updatedById },
    });
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
  /**
   * Wipes every ModulePermission row for one scope (a Mall, or the Global
   * template when mallId is omitted) and recreates it from
   * MODULE_PERMISSION_DEFAULTS, undoing whatever an admin customized there --
   * "Reset to default" in the admin UI. Scoped strictly to the target mallId:
   * resetting a Mall never touches Global, and resetting Global never touches
   * any Mall's own overrides (each Mall keeps its customizations even if they
   * were only ever copied from Global at creation time).
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

  async seedDefaultsForMall(mallId: string, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    const globalRows = await client.modulePermission.findMany({ where: { mallId: GLOBAL_MALL_KEY } });
    if (globalRows.length === 0) return;
    await client.modulePermission.createMany({
      data: globalRows.map((row) => ({ module: row.module, role: row.role, mallId, allowed: row.allowed })),
      skipDuplicates: true,
    });
    this.invalidate();
  }
}
