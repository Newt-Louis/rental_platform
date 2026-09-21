import { Injectable, Logger } from '@nestjs/common';
import { NotificationRoutingMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  findNotificationEvent,
  NotificationEventDefinition,
} from './notification-event-registry';
import {
  EligibilityReason,
  GLOBAL_EVENT_SCOPE,
  NotificationRecipientEligibilityService,
} from './notification-recipient-eligibility.service';

type Db = PrismaService | Prisma.TransactionClient;

/** A recipient a producer resolved by its own existing rule. */
export interface DefaultRecipient {
  email: string;
  userId?: string | null;
  fullName?: string | null;
  /**
   * The producer's own per-recipient part of its EmailDelivery eventKey. Kept
   * byte-identical while the event runs on DEFAULT routing, so upgrading this
   * feature cannot re-send mail that already went out (CR-120 idempotency).
   */
  keySuffix?: string;
}

/** One planned delivery: who receives it, in what capacity, under which key. */
export interface PlannedRecipient extends DefaultRecipient {
  kind: 'TO' | 'CC';
  keySuffix: string;
}

export interface RoutingPlan {
  eventKey: string;
  mode: NotificationRoutingMode;
  overridden: boolean;
  failClosed: boolean;
  recipients: PlannedRecipient[];
  diagnostics: RoutedRecipients['diagnostics'];
}

export interface RoutedRecipients {
  eventKey: string;
  mode: NotificationRoutingMode;
  to: DefaultRecipient[];
  cc: DefaultRecipient[];
  /**
   * True when the event is configured REPLACE but no configured recipient is
   * still eligible. The caller must NOT send: falling back to the default
   * recipients would send business mail to people the administrator
   * deliberately routed it away from (CR section 7).
   */
  failClosed: boolean;
  diagnostics: Array<{ userId: string; eligible: boolean; reasonCodes: EligibilityReason[] }>;
}

const norm = (email: string) => email.trim().toLowerCase();

/**
 * The single routing boundary shared by all three delivery mechanisms in the
 * platform (queued `EmailDeliveryService.enqueue`, direct `EmailService.sendMail`
 * and the one direct `EmailDelivery` row written by the external proposal send).
 *
 * Producers keep resolving their own default recipients; they hand that list to
 * `route()` and send whatever comes back. Nothing here invents a recipient.
 */
@Injectable()
export class NotificationRoutingService {
  private readonly logger = new Logger(NotificationRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: NotificationRecipientEligibilityService,
  ) {}

  async route(
    params: {
      eventKey: string;
      mallId?: string | null;
      resourceId?: string | null;
      defaults: DefaultRecipient[];
    },
    db: Db = this.prisma,
  ): Promise<RoutedRecipients> {
    const event = findNotificationEvent(params.eventKey);
    const mallScope = params.mallId || GLOBAL_EVENT_SCOPE;
    const base: RoutedRecipients = {
      eventKey: params.eventKey,
      mode: NotificationRoutingMode.DEFAULT,
      to: dedupe(params.defaults),
      cc: [],
      failClosed: false,
      diagnostics: [],
    };

    // Unknown key: keep today's behaviour and say so loudly. Configuration for
    // an unregistered event is impossible, so there is nothing to apply.
    if (!event) {
      this.logger.warn(`Unknown notification eventKey "${params.eventKey}" -- default recipients used`);
      return base;
    }
    // A workflow approver is never rerouted, whatever a stale row might say.
    if (event.category === 'WORKFLOW_APPROVER' || !event.active) return base;

    const config = await db.notificationEventRoutingConfig.findUnique({
      where: { eventKey_mallId: { eventKey: event.eventKey, mallId: mallScope } },
      include: { recipients: true },
    });
    if (!config || config.mode === NotificationRoutingMode.DEFAULT || config.recipients.length === 0) return base;

    // Defensive: REPLACE on a Group B event can only come from a row that
    // bypassed the service layer. The external TO stays authoritative.
    const mode = event.category === 'EXTERNAL_BUSINESS_RECIPIENT' && config.mode === NotificationRoutingMode.REPLACE
      ? NotificationRoutingMode.DEFAULT_PLUS_CC
      : config.mode;

    const ctx = { mallId: mallScope, resourceId: params.resourceId ?? null };
    const results = await this.eligibility.evaluateMany(config.recipients.map((r) => r.userId), event, ctx, db);
    const byUser = new Map(results.map((r) => [r.userId, r]));
    const diagnostics = results.map((r) => ({ userId: r.userId, eligible: r.eligible, reasonCodes: r.reasonCodes }));

    const eligibleOf = (type: 'TO' | 'CC'): DefaultRecipient[] =>
      config.recipients
        .filter((r) => r.recipientType === type)
        .map((r) => byUser.get(r.userId))
        .filter((r): r is NonNullable<typeof r> => !!r?.eligible && !!r.user?.email)
        .map((r) => ({ email: r.user!.email, userId: r.user!.id, fullName: r.user!.fullName }));

    if (mode === NotificationRoutingMode.REPLACE) {
      const to = dedupe(eligibleOf('TO'));
      if (to.length === 0) {
        this.logger.error(
          `Routing ${event.eventKey} (${mallScope}) is REPLACE but no configured recipient is eligible -- mail withheld`,
        );
        return { ...base, mode, to: [], cc: [], failClosed: true, diagnostics };
      }
      return { ...base, mode, to, cc: dedupeAgainst(eligibleOf('CC'), to), diagnostics };
    }

    // DEFAULT_PLUS_CC -- defaults keep the TO, configured users are added as CC
    // and never duplicated into an address already receiving the mail.
    const to = dedupe(params.defaults);
    return { ...base, mode, to, cc: dedupeAgainst(eligibleOf('CC'), to), diagnostics };
  }

  /**
   * What a producer should actually send.
   *
   * A configured CC recipient receives their own copy rather than appearing in
   * a CC header on the counterparty's email: the tenant never sees internal
   * addresses, each person keeps an idempotent delivery key of their own, and a
   * failed copy retries without re-sending the customer's mail.
   */
  async plan(
    params: { eventKey: string; mallId?: string | null; resourceId?: string | null; defaults: DefaultRecipient[] },
    db: Db = this.prisma,
  ): Promise<RoutingPlan> {
    const routed = await this.route(params, db);
    const overridden = routed.mode !== NotificationRoutingMode.DEFAULT;
    const identity = (r: DefaultRecipient) => r.userId ?? norm(r.email).replace(/[^a-z0-9]+/g, '-');
    const recipients: PlannedRecipient[] = [
      // Only REPLACE re-keys the TO recipients. Under DEFAULT_PLUS_CC the TO
      // list IS the producer's default list, so it must keep the producer's own
      // keys -- re-keying would make every already-sent mail look new and send
      // it again the moment an administrator adds a CC.
      ...routed.to.map((r) => ({
        ...r,
        kind: 'TO' as const,
        keySuffix: routed.mode === NotificationRoutingMode.REPLACE ? `routed:to:${identity(r)}` : r.keySuffix ?? identity(r),
      })),
      ...routed.cc.map((r) => ({ ...r, kind: 'CC' as const, keySuffix: `routed:cc:${identity(r)}` })),
    ];
    return {
      eventKey: params.eventKey,
      mode: routed.mode,
      overridden,
      failClosed: routed.failClosed,
      recipients: routed.failClosed ? [] : recipients,
      diagnostics: routed.diagnostics,
    };
  }

  /** Convenience for producers that only need plain address lists. */
  async routeAddresses(
    params: { eventKey: string; mallId?: string | null; resourceId?: string | null; defaults: DefaultRecipient[] },
    db: Db = this.prisma,
  ): Promise<{ to: string[]; cc?: string[]; failClosed: boolean; routed: RoutedRecipients }> {
    const routed = await this.route(params, db);
    return {
      to: routed.to.map((r) => r.email),
      cc: routed.cc.length ? routed.cc.map((r) => r.email) : undefined,
      failClosed: routed.failClosed,
      routed,
    };
  }
}

function dedupe(list: DefaultRecipient[]): DefaultRecipient[] {
  const seen = new Set<string>();
  const out: DefaultRecipient[] = [];
  for (const r of list) {
    if (!r?.email) continue;
    const key = norm(r.email);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function dedupeAgainst(list: DefaultRecipient[], already: DefaultRecipient[]): DefaultRecipient[] {
  const taken = new Set(already.map((r) => norm(r.email)));
  return dedupe(list).filter((r) => !taken.has(norm(r.email)));
}

export type { NotificationEventDefinition };
