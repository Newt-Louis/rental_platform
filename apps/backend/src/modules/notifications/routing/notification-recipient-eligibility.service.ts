import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MallAccessService } from '../../../common/services/mall-access.service';
import { PermissionsService } from '../../../common/services/permissions.service';
import { NotificationEventDefinition, NotificationResourceKind } from './notification-event-registry';

/**
 * NOTIF-ROUTE-01 -- configuration is never authorization.
 *
 * A configured recipient is only a CANDIDATE. This service proves, against live
 * data at the moment it is asked, that the candidate may actually receive the
 * business content of the event. It is called twice: when an administrator
 * saves a configuration (advisory, for immediate feedback) and again at send
 * time (authoritative), because access can be revoked in between.
 */

export type EligibilityReason =
  | 'USER_INACTIVE'
  | 'NO_EMAIL'
  | 'NO_MALL_ACCESS'
  | 'NO_MODULE_PERMISSION'
  | 'NO_ACTION_PERMISSION'
  | 'NO_RESOURCE_ACCESS'
  | 'NO_LEASE_TYPE_ACCESS'
  | 'EVENT_NOT_CONFIGURABLE'
  | 'RESOURCE_UNRESOLVED';

export interface EligibilityResult {
  userId: string;
  eligible: boolean;
  reasonCodes: EligibilityReason[];
  user?: { id: string; email: string; fullName: string; role: Role };
}

export interface EligibilityContext {
  /** Authoritative Mall of the business object; 'GLOBAL' for platform-wide events. */
  mallId: string;
  /** Id of the underlying business object, when the event has one. */
  resourceId?: string | null;
}

type Db = PrismaService | Prisma.TransactionClient;

export const GLOBAL_EVENT_SCOPE = 'GLOBAL';

@Injectable()
export class NotificationRecipientEligibilityService {
  private readonly logger = new Logger(NotificationRecipientEligibilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mallAccess: MallAccessService,
    private readonly permissions: PermissionsService,
  ) {}

  async evaluate(
    userId: string,
    event: NotificationEventDefinition,
    ctx: EligibilityContext,
    db: Db = this.prisma,
  ): Promise<EligibilityResult> {
    const reasons: EligibilityReason[] = [];

    if (event.category === 'WORKFLOW_APPROVER') {
      return { userId, eligible: false, reasonCodes: ['EVENT_NOT_CONFIGURABLE'] };
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, deletedAt: true },
    });
    if (!user || !user.isActive || user.deletedAt) {
      return { userId, eligible: false, reasonCodes: ['USER_INACTIVE'] };
    }
    if (!user.email) reasons.push('NO_EMAIL');
    // TENANT accounts are counterparties, never internal recipients.
    if (user.role === Role.TENANT || !event.eligibleRoles.includes(user.role)) {
      reasons.push('NO_MODULE_PERMISSION');
    }

    const mallOk = await this.hasMallAccess(user, ctx.mallId, db);
    if (!mallOk) reasons.push('NO_MALL_ACCESS');

    if (event.requiredActionPermission && !(await this.hasActionPermission(user.role, event.requiredActionPermission, ctx.mallId, event))) {
      reasons.push('NO_ACTION_PERMISSION');
    }

    // Resource-level containment: Mall membership alone is not enough (CR 35).
    if (mallOk) {
      const resource = await this.checkResource(user, event, ctx, db);
      if (resource) reasons.push(resource);
    }

    return {
      userId,
      eligible: reasons.length === 0,
      reasonCodes: reasons,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }

  async evaluateMany(
    userIds: string[],
    event: NotificationEventDefinition,
    ctx: EligibilityContext,
    db: Db = this.prisma,
  ): Promise<EligibilityResult[]> {
    const out: EligibilityResult[] = [];
    for (const id of userIds) out.push(await this.evaluate(id, event, ctx, db));
    return out;
  }

  private async hasMallAccess(user: { id: string; role: Role }, mallId: string, db: Db): Promise<boolean> {
    if (mallId === GLOBAL_EVENT_SCOPE) return user.role === Role.ADMIN;
    if (user.role === Role.ADMIN) return true;
    const access = await db.userMallAccess.findFirst({ where: { userId: user.id, mallId, isActive: true }, select: { id: true } });
    return !!access;
  }

  private async hasActionPermission(role: Role, permission: string, mallId: string, event: NotificationEventDefinition): Promise<boolean> {
    if (role === Role.ADMIN) return event.eligibleRoles.includes(Role.ADMIN);
    const configured = await this.permissions.getAllowedRoles(permission, mallId === GLOBAL_EVENT_SCOPE ? null : mallId);
    // No row at any tier: fall back to the event's own role list rather than
    // failing open on an unconfigured permission.
    return configured ? configured.has(role) : event.eligibleRoles.includes(role);
  }

  /**
   * The business object must itself be reachable by the candidate. Returns a
   * reason code when it is not; `null` when the check passes.
   *
   * An event that declares a resource but cannot resolve it fails CLOSED
   * (RESOURCE_UNRESOLVED) -- a deleted or cross-Mall object must never become
   * "no restriction" (CR 8, CR 46).
   */
  private async checkResource(
    user: { id: string; role: Role },
    event: NotificationEventDefinition,
    ctx: EligibilityContext,
    db: Db,
  ): Promise<EligibilityReason | null> {
    if (event.resourceKind === 'MALL') return null;
    if (!ctx.resourceId) return 'RESOURCE_UNRESOLVED';

    const resourceMallId = await this.resolveResourceMall(event.resourceKind, ctx.resourceId, db);
    if (!resourceMallId) return 'RESOURCE_UNRESOLVED';
    if (resourceMallId !== ctx.mallId) return 'NO_RESOURCE_ACCESS';
    if (!(await this.hasMallAccess(user, resourceMallId, db))) return 'NO_RESOURCE_ACCESS';
    return null;
  }

  /** Mall of the business object, from the object's own ownership chain. */
  private async resolveResourceMall(kind: NotificationResourceKind, id: string, db: Db): Promise<string | null> {
    const unitMall = (unit?: { mallId: string | null; floor?: { mallId: string } | null } | null) =>
      unit?.mallId ?? unit?.floor?.mallId ?? null;
    switch (kind) {
      case 'FITOUT_PROJECT': {
        const row = await db.fitoutProject.findUnique({ where: { id }, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } });
        return unitMall(row?.unit);
      }
      case 'FITOUT_SUBMITTAL': {
        const row = await db.fitoutSubmittal.findUnique({ where: { id }, select: { project: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } } });
        return unitMall(row?.project?.unit);
      }
      case 'CONTRACT': {
        const row = await db.contract.findUnique({ where: { id }, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } });
        return unitMall(row?.unit);
      }
      case 'PROPOSAL': {
        const row = await db.proposal.findUnique({ where: { id }, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } });
        return unitMall(row?.unit);
      }
      case 'UNIT_BOOKING': {
        const row = await db.unitBooking.findUnique({ where: { id }, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } });
        return unitMall(row?.unit);
      }
      case 'TICKET': {
        const row = await db.ticket.findUnique({ where: { id }, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } });
        return unitMall(row?.unit);
      }
      case 'UNIT_HANDOVER_READINESS': {
        const row = await db.unitHandoverReadiness.findUnique({ where: { id }, select: { mallId: true } });
        return row?.mallId ?? null;
      }
      case 'INVOICE': {
        const row = await db.invoice.findUnique({
          where: { id },
          select: { mallId: true, contract: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } }, billingParty: { select: { mallId: true } } },
        });
        return row?.mallId ?? unitMall(row?.contract?.unit) ?? row?.billingParty?.mallId ?? null;
      }
      case 'TENANT': {
        const row = await db.tenant.findUnique({
          where: { id },
          select: {
            contracts: { where: { isActive: true }, take: 1, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } },
            proposals: { where: { isActive: true }, take: 1, select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } },
          },
        });
        return unitMall(row?.contracts[0]?.unit ?? row?.proposals[0]?.unit);
      }
      case 'MALL':
        return id;
      default:
        return null;
    }
  }
}
