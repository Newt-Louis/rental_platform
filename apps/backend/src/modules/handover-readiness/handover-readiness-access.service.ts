import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MallAccessService } from '../../common/services/mall-access.service';
import { PermissionsService } from '../../common/services/permissions.service';
import { MODULE_ROLES } from '../../common/constants/role-permissions';

export type HandoverAction = 'view' | 'manage' | 'riskManage' | 'confirm' | 'reopen';

/** DB-backed ModulePermission keys (kebab-case, same convention as `proposal-send-external`). */
export const HANDOVER_PERMISSION_MODULES: Record<HandoverAction, string> = {
  view: 'handover-readiness-view',
  manage: 'handover-readiness-manage',
  riskManage: 'handover-readiness-risk-manage',
  confirm: 'handover-readiness-confirm',
  reopen: 'handover-readiness-reopen',
};

const STATIC_FALLBACK: Record<HandoverAction, readonly Role[]> = {
  view: MODULE_ROLES.handoverReadinessView,
  manage: MODULE_ROLES.handoverReadinessManage,
  riskManage: MODULE_ROLES.handoverReadinessRiskManage,
  confirm: MODULE_ROLES.handoverReadinessConfirm,
  reopen: MODULE_ROLES.handoverReadinessReopen,
};

export interface HandoverActor {
  id: string;
  role: Role | string;
}

export interface HandoverCapabilities {
  view: boolean;
  manage: boolean;
  riskManage: boolean;
  confirm: boolean;
  reopen: boolean;
}

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Authorization for the handover-readiness lifecycle. Every decision is
 * (authoritative Mall, action) -- the Mall always comes from the readiness row
 * or its Unit, never from the client.
 *
 * ADMIN is NOT granted by an implicit bypass here: ModulePermission never
 * stores ADMIN rows, so ADMIN's authority per action is exactly the static
 * MODULE_ROLES list above (which excludes `confirm`). TENANT is always denied
 * even though MallAccessService lets TENANT past the Mall check.
 */
@Injectable()
export class HandoverReadinessAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mallAccess: MallAccessService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Role-level grant for (action, Mall) -- no Mall-membership check. */
  async roleGranted(role: Role | string, action: HandoverAction, mallId: string): Promise<boolean> {
    if (role === Role.TENANT) return false;
    if (role === Role.ADMIN) return STATIC_FALLBACK[action].includes(Role.ADMIN);
    const configured = await this.permissions.getAllowedRoles(HANDOVER_PERMISSION_MODULES[action], mallId);
    return configured ? configured.has(role as Role) : STATIC_FALLBACK[action].includes(role as Role);
  }

  private async hasMallAccess(actor: HandoverActor, mallId: string): Promise<boolean> {
    if (actor.role === Role.TENANT) return false;
    try {
      await this.mallAccess.assertMallAccess(actor.id, actor.role, mallId);
      return true;
    } catch {
      return false;
    }
  }

  async can(actor: HandoverActor, action: HandoverAction, mallId: string): Promise<boolean> {
    if (!(await this.hasMallAccess(actor, mallId))) return false;
    return this.roleGranted(actor.role, action, mallId);
  }

  async assert(actor: HandoverActor, action: HandoverAction, mallId: string): Promise<void> {
    if (!(await this.hasMallAccess(actor, mallId))) {
      throw new ForbiddenException({ code: 'HANDOVER_MALL_FORBIDDEN', message: 'Bạn không có quyền truy cập Mall này.' });
    }
    if (!(await this.roleGranted(actor.role, action, mallId))) {
      throw new ForbiddenException({
        code: 'HANDOVER_ACTION_FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này với theo dõi bàn giao mặt bằng.',
        action: HANDOVER_PERMISSION_MODULES[action],
      });
    }
  }

  async capabilities(actor: HandoverActor, mallId: string): Promise<HandoverCapabilities> {
    const mall = await this.hasMallAccess(actor, mallId);
    const grant = async (action: HandoverAction) => mall && this.roleGranted(actor.role, action, mallId);
    return {
      view: await grant('view'),
      manage: await grant('manage'),
      riskManage: await grant('riskManage'),
      confirm: await grant('confirm'),
      reopen: await grant('reopen'),
    };
  }

  /**
   * Malls on which the actor holds `action`. `null` = every Mall (only an
   * unrestricted-Mall role that holds the action, i.e. ADMIN for view).
   */
  async authorizedMallIds(actor: HandoverActor, action: HandoverAction, requestedMallId?: string | null): Promise<string[] | null> {
    if (actor.role === Role.TENANT) throw new ForbiddenException('Không có quyền truy cập');
    const accessible = await this.mallAccess.getAccessibleMallIds(actor.id, actor.role);
    if (accessible === null) {
      if (!STATIC_FALLBACK[action].includes(actor.role as Role)) {
        throw new ForbiddenException({ code: 'HANDOVER_ACTION_FORBIDDEN', message: 'Bạn không có quyền xem theo dõi bàn giao mặt bằng.' });
      }
      return requestedMallId ? [requestedMallId] : null;
    }
    const candidates = requestedMallId ? accessible.filter((id) => id === requestedMallId) : accessible;
    if (requestedMallId && candidates.length === 0) {
      throw new ForbiddenException({ code: 'HANDOVER_MALL_FORBIDDEN', message: 'Bạn không có quyền truy cập Mall này.' });
    }
    const authorized: string[] = [];
    for (const mallId of candidates) {
      if (await this.roleGranted(actor.role, action, mallId)) authorized.push(mallId);
    }
    if (requestedMallId && authorized.length === 0) {
      throw new ForbiddenException({ code: 'HANDOVER_ACTION_FORBIDDEN', message: 'Bạn không có quyền xem theo dõi bàn giao mặt bằng.' });
    }
    return authorized;
  }

  /**
   * Whether a (possibly different) user may receive/see readiness data for a
   * Mall: active account, real Mall access, and the `view` action. Used for
   * followers, project owners and every email recipient -- no cross-Mall leak.
   */
  async userCanView(userId: string, mallId: string, db: Db = this.prisma): Promise<{ ok: boolean; user?: { id: string; email: string; fullName: string; role: Role } }> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, deletedAt: true },
    });
    if (!user || !user.isActive || user.deletedAt || user.role === Role.TENANT) return { ok: false };
    if (user.role !== Role.ADMIN) {
      const access = await db.userMallAccess.findFirst({ where: { userId, mallId, isActive: true }, select: { id: true } });
      if (!access) return { ok: false };
    }
    if (!(await this.roleGranted(user.role, 'view', mallId))) return { ok: false };
    return { ok: true, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } };
  }
}
