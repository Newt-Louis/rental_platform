import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationRecipientType, NotificationRoutingMode, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MallAccessService } from '../../../common/services/mall-access.service';
import { PermissionsService } from '../../../common/services/permissions.service';
import { EmailService } from '../email.service';
import { emailSubject, esc, renderEmail } from '../email-design-system';
import {
  allowedRoutingModes,
  findNotificationEvent,
  isConfigurable,
  NOTIFICATION_EVENTS,
  NotificationEventDefinition,
} from './notification-event-registry';
import { GLOBAL_EVENT_SCOPE, NotificationRecipientEligibilityService } from './notification-recipient-eligibility.service';

export const NOTIFICATION_ROUTING_PERMISSIONS = {
  view: 'notification-routing-view',
  manage: 'notification-routing-manage',
  test: 'notification-routing-test',
} as const;

export type RoutingAction = keyof typeof NOTIFICATION_ROUTING_PERMISSIONS;

export interface RoutingActor {
  id: string;
  role: Role | string;
  email?: string;
}

export interface UpsertRoutingInput {
  mode: NotificationRoutingMode;
  recipients: Array<{ userId: string; recipientType: NotificationRecipientType }>;
  expectedVersion?: number;
}

/**
 * Admin-facing governance of notification recipients. Every decision here is
 * only about WHO MAY BE A CANDIDATE -- the send path re-proves eligibility
 * (NOTIF-ROUTE-01), so a mistake in this screen cannot leak business data to
 * someone who could not already open it in the app.
 */
@Injectable()
export class NotificationRoutingConfigService {
  private readonly logger = new Logger(NotificationRoutingConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mallAccess: MallAccessService,
    private readonly permissions: PermissionsService,
    private readonly eligibility: NotificationRecipientEligibilityService,
    private readonly email: EmailService,
  ) {}

  // ─── Authorization ─────────────────────────────────────────────────────────

  /** Mall scope is resolved from the stored config for mutations, never from the body. */
  private async assertAuthority(actor: RoutingActor, action: RoutingAction, mallScope: string): Promise<void> {
    if (actor.role === Role.TENANT) throw new ForbiddenException('Không có quyền');
    const isAdmin = actor.role === Role.ADMIN;

    // GLOBAL-scope events are platform configuration: Mall Director never edits them.
    if (mallScope === GLOBAL_EVENT_SCOPE && !isAdmin) {
      throw new ForbiddenException({ code: 'NOTIF_ROUTING_GLOBAL_FORBIDDEN', message: 'Chỉ quản trị hệ thống mới cấu hình sự kiện toàn hệ thống.' });
    }
    // Test-send is deliberately narrower than manage: ADMIN unless explicitly granted.
    if (action === 'test' && !isAdmin) {
      const granted = await this.permissions.getAllowedRoles(NOTIFICATION_ROUTING_PERMISSIONS.test, mallScope);
      if (!granted?.has(actor.role as Role)) {
        throw new ForbiddenException({ code: 'NOTIF_ROUTING_TEST_FORBIDDEN', message: 'Bạn không có quyền gửi thử.' });
      }
    }
    if (isAdmin) return;

    if (mallScope !== GLOBAL_EVENT_SCOPE) {
      await this.mallAccess.assertMallAccess(actor.id, actor.role, mallScope);
    }
    const permission = action === 'view' ? NOTIFICATION_ROUTING_PERMISSIONS.view : NOTIFICATION_ROUTING_PERMISSIONS.manage;
    const granted = await this.permissions.getAllowedRoles(permission, mallScope);
    if (!granted?.has(actor.role as Role)) {
      throw new ForbiddenException({ code: 'NOTIF_ROUTING_FORBIDDEN', message: 'Bạn không có quyền cấu hình người nhận thông báo.' });
    }
  }

  private eventOrThrow(eventKey: string): NotificationEventDefinition {
    const event = findNotificationEvent(eventKey);
    // Unknown keys fail closed: a client cannot invent an event (CR 33).
    if (!event) throw new BadRequestException({ code: 'NOTIF_EVENT_UNKNOWN', message: 'Sự kiện không tồn tại trong danh mục.' });
    return event;
  }

  private scopeFor(event: NotificationEventDefinition, mallId?: string | null): string {
    if (event.scope === 'GLOBAL') return GLOBAL_EVENT_SCOPE;
    if (!mallId || mallId === GLOBAL_EVENT_SCOPE) {
      throw new BadRequestException({ code: 'NOTIF_MALL_REQUIRED', message: 'Sự kiện này cần chọn Mall cụ thể.' });
    }
    return mallId;
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  /** The registry plus the live configuration and eligibility of each configured recipient. */
  async listEvents(actor: RoutingActor, mallId?: string | null) {
    const mallScope = mallId || GLOBAL_EVENT_SCOPE;
    await this.assertAuthority(actor, 'view', mallScope);

    const configs = await this.prisma.notificationEventRoutingConfig.findMany({
      where: { mallId: mallScope },
      include: { recipients: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } } },
    });
    const byKey = new Map(configs.map((c) => [c.eventKey, c]));

    const items = [];
    // Retired/blocked events stay in the registry for inventory completeness but
    // are not offered in the screen -- promising a setting that does not route
    // would be worse than not showing it.
    for (const event of NOTIFICATION_EVENTS.filter((e) => e.active)) {
      const scope = event.scope === 'GLOBAL' ? GLOBAL_EVENT_SCOPE : mallScope;
      const config = event.scope === 'GLOBAL' ? undefined : byKey.get(event.eventKey);
      const recipients = [];
      for (const r of config?.recipients ?? []) {
        const check = await this.eligibility.evaluate(r.userId, event, { mallId: scope, resourceId: null });
        recipients.push({
          userId: r.userId,
          fullName: r.user.fullName,
          email: r.user.email,
          role: r.user.role,
          recipientType: r.recipientType,
          // RESOURCE_UNRESOLVED here only means "no specific object to check
          // yet" -- it is re-evaluated per object at send time.
          eligible: check.eligible || check.reasonCodes.every((c) => c === 'RESOURCE_UNRESOLVED'),
          reasonCodes: check.reasonCodes.filter((c) => c !== 'RESOURCE_UNRESOLVED'),
        });
      }
      items.push({
        eventKey: event.eventKey,
        displayNameVi: event.displayNameVi,
        descriptionVi: event.descriptionVi,
        defaultRecipientRuleVi: event.defaultRecipientRuleVi,
        category: event.category,
        scope: event.scope,
        configurable: isConfigurable(event),
        allowedModes: allowedRoutingModes(event),
        requiredActionPermission: event.requiredActionPermission ?? null,
        eligibleRoles: event.eligibleRoles,
        transport: event.transport,
        producer: event.producer,
        mode: config?.mode ?? NotificationRoutingMode.DEFAULT,
        version: config?.version ?? null,
        updatedAt: config?.updatedAt ?? null,
        updatedById: config?.updatedById ?? null,
        recipients,
      });
    }
    return { mallId: mallScope, items };
  }

  /** Users that may be picked for an event in a Mall, with their eligibility. */
  async candidates(actor: RoutingActor, eventKey: string, mallId?: string | null) {
    const event = this.eventOrThrow(eventKey);
    if (!event.active) return [];
    const mallScope = this.scopeFor(event, mallId);
    await this.assertAuthority(actor, 'view', mallScope);
    if (!isConfigurable(event)) return [];

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: { in: event.eligibleRoles.length ? event.eligibleRoles : [Role.ADMIN] },
        ...(mallScope === GLOBAL_EVENT_SCOPE ? {} : { OR: [{ role: Role.ADMIN }, { mallAccess: { some: { mallId: mallScope, isActive: true } } }] }),
      },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
      take: 300,
    });
    const out = [];
    for (const u of users) {
      const check = await this.eligibility.evaluate(u.id, event, { mallId: mallScope, resourceId: null });
      out.push({
        ...u,
        eligible: check.eligible || check.reasonCodes.every((c) => c === 'RESOURCE_UNRESOLVED'),
        reasonCodes: check.reasonCodes.filter((c) => c !== 'RESOURCE_UNRESOLVED'),
      });
    }
    return out;
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async upsert(actor: RoutingActor, eventKey: string, mallId: string | null | undefined, input: UpsertRoutingInput) {
    const event = this.eventOrThrow(eventKey);
    const mallScope = this.scopeFor(event, mallId);
    await this.assertAuthority(actor, 'manage', mallScope);

    if (!isConfigurable(event) || !event.active) {
      throw new ForbiddenException({
        code: 'NOTIF_EVENT_NOT_CONFIGURABLE',
        message: isConfigurable(event)
          ? 'Sự kiện này không cho phép cấu hình người nhận (thư chứa liên kết kích hoạt riêng cho khách).'
          : 'Người nhận của sự kiện này do Chính sách phê duyệt quyết định, không cấu hình tại đây.',
      });
    }
    if (!allowedRoutingModes(event).includes(input.mode)) {
      throw new ForbiddenException({
        code: 'NOTIF_MODE_NOT_ALLOWED',
        message: event.category === 'EXTERNAL_BUSINESS_RECIPIENT'
          ? 'Sự kiện gửi cho khách/đối tác chỉ cho phép thêm người nhận CC nội bộ, không thay thế người nhận chính.'
          : 'Chế độ định tuyến không hợp lệ cho sự kiện này.',
      });
    }

    const recipients = dedupeRecipients(input.recipients);
    if (input.mode === NotificationRoutingMode.DEFAULT && recipients.length > 0) {
      throw new BadRequestException({ code: 'NOTIF_DEFAULT_WITH_RECIPIENTS', message: 'Chế độ mặc định không nhận danh sách người nhận.' });
    }
    if (input.mode !== NotificationRoutingMode.DEFAULT && recipients.length === 0) {
      throw new BadRequestException({
        code: 'NOTIF_RECIPIENTS_REQUIRED',
        message: 'Cần ít nhất một người nhận. Nếu muốn quay về mặc định, hãy chọn chế độ mặc định.',
      });
    }
    if (event.category === 'EXTERNAL_BUSINESS_RECIPIENT' && recipients.some((r) => r.recipientType === NotificationRecipientType.TO)) {
      throw new ForbiddenException({ code: 'NOTIF_TO_NOT_ALLOWED', message: 'Không thể thay người nhận chính của email gửi khách/đối tác.' });
    }
    if (input.mode === NotificationRoutingMode.REPLACE && !recipients.some((r) => r.recipientType === NotificationRecipientType.TO)) {
      throw new BadRequestException({ code: 'NOTIF_REPLACE_NEEDS_TO', message: 'Chế độ thay thế cần ít nhất một người nhận chính.' });
    }

    // Configuration-time validation (advisory but blocking a clearly invalid save).
    const invalid = [];
    for (const r of recipients) {
      const check = await this.eligibility.evaluate(r.userId, event, { mallId: mallScope, resourceId: null });
      const blocking = check.reasonCodes.filter((c) => c !== 'RESOURCE_UNRESOLVED');
      if (blocking.length) invalid.push({ userId: r.userId, reasonCodes: blocking });
    }
    if (invalid.length) {
      throw new BadRequestException({
        code: 'NOTIF_RECIPIENT_INELIGIBLE',
        message: 'Có người nhận không đủ điều kiện nhận email của sự kiện này.',
        details: invalid,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the row first: without it two administrators both read the same
      // version, both pass the check and the later write silently wins.
      await tx.$queryRaw`SELECT "id" FROM "NotificationEventRoutingConfig" WHERE "eventKey" = ${event.eventKey} AND "mallId" = ${mallScope} FOR UPDATE`;
      const existing = await tx.notificationEventRoutingConfig.findUnique({
        where: { eventKey_mallId: { eventKey: event.eventKey, mallId: mallScope } },
        include: { recipients: true },
      });
      if (existing && input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
        throw new ConflictException({ code: 'NOTIF_ROUTING_STALE', message: 'Cấu hình vừa được người khác thay đổi. Vui lòng tải lại.' });
      }
      const before = existing
        ? { mode: existing.mode, recipients: existing.recipients.map((r) => `${r.recipientType}:${r.userId}`).sort() }
        : { mode: NotificationRoutingMode.DEFAULT, recipients: [] as string[] };

      const config = existing
        ? await tx.notificationEventRoutingConfig.update({
          where: { id: existing.id },
          data: { mode: input.mode, updatedById: actor.id, version: { increment: 1 } },
        })
        : await tx.notificationEventRoutingConfig.create({
          data: { eventKey: event.eventKey, mallId: mallScope, mode: input.mode, createdById: actor.id, updatedById: actor.id },
        });

      await tx.notificationEventRecipient.deleteMany({ where: { routingConfigId: config.id } });
      if (recipients.length) {
        await tx.notificationEventRecipient.createMany({
          data: recipients.map((r) => ({ routingConfigId: config.id, userId: r.userId, recipientType: r.recipientType, addedById: actor.id })),
        });
      }

      const after = { mode: input.mode, recipients: recipients.map((r) => `${r.recipientType}:${r.userId}`).sort() };
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'NOTIFICATION_ROUTING_UPDATE',
          entityType: 'NotificationEventRoutingConfig',
          entityId: config.id,
          oldValue: JSON.stringify({ eventKey: event.eventKey, mallId: mallScope, ...before }),
          newValue: JSON.stringify({
            eventKey: event.eventKey,
            mallId: mallScope,
            ...after,
            added: after.recipients.filter((r) => !before.recipients.includes(r)),
            removed: before.recipients.filter((r) => !after.recipients.includes(r)),
          }),
        },
      });
      return config;
    });

    return this.getOne(actor, event.eventKey, mallScope, result.id);
  }

  /** Back to the producer's own rule: the row is removed, history stays in the audit log. */
  async reset(actor: RoutingActor, eventKey: string, mallId?: string | null) {
    const event = this.eventOrThrow(eventKey);
    const mallScope = this.scopeFor(event, mallId);
    await this.assertAuthority(actor, 'manage', mallScope);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.notificationEventRoutingConfig.findUnique({
        where: { eventKey_mallId: { eventKey: event.eventKey, mallId: mallScope } },
        include: { recipients: true },
      });
      if (!existing) return;
      await tx.notificationEventRecipient.deleteMany({ where: { routingConfigId: existing.id } });
      await tx.notificationEventRoutingConfig.delete({ where: { id: existing.id } });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'NOTIFICATION_ROUTING_RESET',
          entityType: 'NotificationEventRoutingConfig',
          entityId: existing.id,
          oldValue: JSON.stringify({ eventKey: event.eventKey, mallId: mallScope, mode: existing.mode, recipients: existing.recipients.map((r) => `${r.recipientType}:${r.userId}`) }),
          newValue: JSON.stringify({ eventKey: event.eventKey, mallId: mallScope, mode: 'DEFAULT', recipients: [] }),
        },
      });
    });
    return { eventKey: event.eventKey, mallId: mallScope, mode: NotificationRoutingMode.DEFAULT };
  }

  private async getOne(actor: RoutingActor, eventKey: string, mallScope: string, _configId: string) {
    const list = await this.listEvents(actor, mallScope);
    return list.items.find((i) => i.eventKey === eventKey)!;
  }

  // ─── Test send ─────────────────────────────────────────────────────────────

  /**
   * Sends a clearly-marked [TEST] email to the CONFIGURED INTERNAL recipients
   * only. It never touches business state, never renders real business content
   * and, for Group B, never reaches the customer address (CR 26/27).
   */
  async sendTest(actor: RoutingActor, eventKey: string, mallId?: string | null) {
    const event = this.eventOrThrow(eventKey);
    const mallScope = this.scopeFor(event, mallId);
    await this.assertAuthority(actor, 'test', mallScope);
    if (!isConfigurable(event)) {
      throw new ForbiddenException({ code: 'NOTIF_EVENT_NOT_CONFIGURABLE', message: 'Sự kiện này không cấu hình người nhận nên không có gì để gửi thử.' });
    }

    const config = await this.prisma.notificationEventRoutingConfig.findUnique({
      where: { eventKey_mallId: { eventKey: event.eventKey, mallId: mallScope } },
      include: { recipients: true },
    });

    const targets: Array<{ email: string; userId: string; fullName: string }> = [];
    const diagnostics = [];
    for (const r of config?.recipients ?? []) {
      const check = await this.eligibility.evaluate(r.userId, event, { mallId: mallScope, resourceId: null });
      const blocking = check.reasonCodes.filter((c) => c !== 'RESOURCE_UNRESOLVED');
      diagnostics.push({ userId: r.userId, eligible: blocking.length === 0, reasonCodes: blocking });
      if (blocking.length === 0 && check.user?.email) targets.push({ email: check.user.email, userId: check.user.id, fullName: check.user.fullName });
    }
    // Nothing configured yet: the test goes to the administrator who asked for
    // it, so the button is still useful without touching anyone else.
    if (targets.length === 0 && actor.email) targets.push({ email: actor.email, userId: actor.id, fullName: 'Quản trị viên' });
    if (targets.length === 0) throw new NotFoundException('Không có người nhận hợp lệ để gửi thử.');

    const mall = mallScope === GLOBAL_EVENT_SCOPE ? null : await this.prisma.mall.findUnique({ where: { id: mallScope }, select: { name: true } });
    const html = renderEmail({
      severity: 'INFO',
      eyebrow: 'Kiểm thử cấu hình người nhận',
      title: `[TEST] ${event.displayNameVi}`,
      description: 'Đây là email kiểm thử cấu hình người nhận. Không có dữ liệu nghiệp vụ thật và không có thao tác nghiệp vụ nào được thực hiện.',
      info: {
        title: 'Cấu hình đang kiểm thử',
        rows: [
          { label: 'Sự kiện', value: event.displayNameVi },
          { label: 'Mall', value: mall?.name ?? 'Toàn hệ thống' },
          { label: 'Chế độ', value: config?.mode ?? 'DEFAULT' },
          { label: 'Quy tắc mặc định', value: event.defaultRecipientRuleVi },
          { label: 'Người gửi thử', value: actor.email ?? actor.id },
        ],
      },
      note: `Nếu bạn nhận được thư này ngoài mong đợi, hãy báo quản trị viên kiểm tra lại cấu hình người nhận của sự kiện <strong>${esc(event.displayNameVi)}</strong>.`,
    });

    const results = [];
    for (const target of targets) {
      const result = await this.email.sendMail({
        to: target.email,
        subject: emailSubject(`[TEST] ${event.displayNameVi}`),
        html,
      });
      results.push({ userId: target.userId, email: target.email, skipped: 'skipped' in result ? result.skipped : false });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'NOTIFICATION_ROUTING_TEST_SEND',
        entityType: 'NotificationEventRoutingConfig',
        entityId: config?.id ?? `${event.eventKey}:${mallScope}`,
        newValue: JSON.stringify({ eventKey: event.eventKey, mallId: mallScope, recipients: results, diagnostics }),
      },
    });
    return { eventKey: event.eventKey, mallId: mallScope, sentTo: results, diagnostics };
  }
}

function dedupeRecipients(list: Array<{ userId: string; recipientType: NotificationRecipientType }>) {
  const seen = new Set<string>();
  const out: Array<{ userId: string; recipientType: NotificationRecipientType }> = [];
  for (const r of list ?? []) {
    if (!r?.userId) continue;
    const key = `${r.recipientType}:${r.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  // A user listed as both TO and CC receives once, as TO.
  const toUsers = new Set(out.filter((r) => r.recipientType === NotificationRecipientType.TO).map((r) => r.userId));
  return out.filter((r) => r.recipientType === NotificationRecipientType.TO || !toUsers.has(r.userId));
}

export type { Prisma };
