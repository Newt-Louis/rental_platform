import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HandoverReadinessEventType, HandoverReadinessLifecycle, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';
import { EmailDeliveryService } from '../notifications/email-delivery.service';
import { HandoverReadinessService } from './handover-readiness.service';
import { HandoverReadinessNotifierService } from './handover-readiness-notifier.service';
import { NotificationRoutingService } from '../notifications/routing/notification-routing.service';
import { businessToday, dueReminderSlot, formatBusinessDate, HANDOVER_TIME_ZONE, isoWeekKey } from './handover-readiness.policy';

const include = {
  unit: { select: { id: true, code: true, name: true, status: true, isActive: true, floor: { select: { name: true } } } },
  mall: { select: { id: true, name: true } },
  projectOwner: { select: { id: true, fullName: true } },
  recordedBy: { select: { id: true, fullName: true } },
  confirmedBy: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.UnitHandoverReadinessInclude;

/**
 * Reminder policy (HANDOVER_POLICY): milestones D-30/D-14/D-7/D-3/D-1/D0 and,
 * once overdue, at most one reminder per week. Never a daily mail per Unit.
 *
 * Idempotency is layered:
 *  1. SchedulerLockService -- one instance runs the job at a time (Redis).
 *  2. REMINDER_SENT event dedupeKey `reminder:{id}:{slot}:{targetDate}` inserted
 *     with ON CONFLICT DO NOTHING inside the same transaction as the email
 *     intents -- a second instance / retry inserts nothing and sends nothing.
 *  3. EmailDelivery.eventKey `handover:{id}:{slot}:{targetDate}:{userId}`.
 * The target date is part of every key, so a date change starts a fresh
 * schedule identity automatically.
 */
@Injectable()
export class HandoverReadinessScheduler {
  private readonly logger = new Logger(HandoverReadinessScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerLock: SchedulerLockService,
    private readonly readiness: HandoverReadinessService,
    private readonly notifier: HandoverReadinessNotifierService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly routing: NotificationRoutingService,
  ) {}

  @Cron('5 8 * * *', { name: 'handover-readiness-reminders', timeZone: HANDOVER_TIME_ZONE })
  runDaily() {
    return this.schedulerLock.runExclusive('handover-readiness-reminders', 30 * 60_000, () => this.runReminders());
  }

  @Cron('15 8 * * 1', { name: 'handover-readiness-weekly-digest', timeZone: HANDOVER_TIME_ZONE })
  runWeekly() {
    return this.schedulerLock.runExclusive('handover-readiness-weekly-digest', 30 * 60_000, () => this.runWeeklyDigest());
  }

  async runReminders(now: Date = new Date()) {
    const today = businessToday(now);
    const rows = await this.prisma.unitHandoverReadiness.findMany({
      where: { lifecycleStatus: HandoverReadinessLifecycle.TRACKING, unit: { isActive: true } },
      include,
    });
    const evaluations = await this.readiness.evaluateRows(this.prisma, rows, today);
    let reminders = 0;
    let conflicts = 0;

    for (const row of rows) {
      const { evaluation } = evaluations.get(row.id)!;
      const slot = dueReminderSlot(evaluation.daysRemaining);
      const target = formatBusinessDate(row.targetReadyDate)!;
      try {
        await this.prisma.$transaction(async (tx) => {
          // Re-check under lock: the record may have been confirmed/cancelled/re-dated since the scan.
          await tx.$queryRaw`SELECT "id" FROM "UnitHandoverReadiness" WHERE "id" = ${row.id} FOR UPDATE`;
          const fresh = await tx.unitHandoverReadiness.findUniqueOrThrow({ where: { id: row.id }, include });
          if (fresh.lifecycleStatus !== HandoverReadinessLifecycle.TRACKING
            || fresh.targetReadyDate.getTime() !== row.targetReadyDate.getTime()) return;

          if (slot) {
            const inserted = await tx.unitHandoverReadinessEvent.createMany({
              data: [{
                readinessId: row.id,
                eventType: HandoverReadinessEventType.REMINDER_SENT,
                dedupeKey: `reminder:${row.id}:${slot.key}:${target}`,
                newDate: row.targetReadyDate,
                metadata: { slot: slot.key, daysRemaining: evaluation.daysRemaining, asOf: formatBusinessDate(today) },
              }],
              skipDuplicates: true,
            });
            if (inserted.count > 0) {
              await this.notifier.notify(
                tx,
                this.readiness.notifyContext(fresh, evaluation),
                { kind: 'REMINDER', slotKey: slot.key },
                `handover:${row.id}:${slot.key}:${target}`,
              );
              reminders++;
            }
          }
          if (await this.readiness.recordConflictIfNew(tx, fresh, evaluation)) conflicts++;
        }, { timeout: 30_000, maxWait: 10_000 });
      } catch (error) {
        this.logger.error(`Handover readiness reminder failed for ${row.id}: ${(error as Error).message}`);
      }
    }
    if (reminders || conflicts) this.logger.log(`Handover readiness: ${reminders} reminder(s), ${conflicts} new conflict(s)`);
    return { scanned: rows.length, reminders, conflicts };
  }

  /** One digest per Mall per ISO week, to that Mall's Mall Director / Leasing Manager only. */
  async runWeeklyDigest(now: Date = new Date()) {
    const today = businessToday(now);
    const weekKey = isoWeekKey(today);
    const malls = await this.prisma.unitHandoverReadiness.groupBy({
      by: ['mallId'],
      where: { lifecycleStatus: HandoverReadinessLifecycle.TRACKING, unit: { isActive: true } },
    });
    let sent = 0;
    for (const { mallId } of malls) {
      const mall = await this.prisma.mall.findUnique({ where: { id: mallId }, select: { name: true } });
      if (!mall) continue;
      const rows = await this.prisma.unitHandoverReadiness.findMany({
        where: { mallId, lifecycleStatus: HandoverReadinessLifecycle.TRACKING, unit: { isActive: true } },
        include,
      });
      const evaluations = await this.readiness.evaluateRows(this.prisma, rows, today);
      const kpis = this.readiness.kpis([...evaluations.values()].map((v) => v.evaluation));
      const recipients = await this.notifier.validRecipients(this.prisma, mallId, await this.notifier.mallManagerIds(this.prisma, mallId));
      // Admin-governed recipients for this Mall's digest, default = Mall managers.
      const plan = await this.routing.plan({
        eventKey: 'HANDOVER_READINESS_WEEKLY_DIGEST',
        mallId,
        resourceId: mallId,
        defaults: recipients.map((r) => ({ email: r.email, userId: r.id, fullName: r.fullName, keySuffix: r.id })),
      });
      if (plan.failClosed) {
        this.logger.error(`Weekly handover digest for ${mallId} withheld: configured recipients are no longer eligible`);
        continue;
      }
      const content = this.notifier.composeDigest(mall.name, weekKey, kpis);
      for (const r of plan.recipients) {
        await this.emailDelivery.enqueue(this.prisma, {
          eventKey: `handover-digest:${mallId}:${weekKey}:${r.keySuffix}`,
          eventType: 'HANDOVER_READINESS_WEEKLY_DIGEST',
          entityType: 'Mall',
          entityId: mallId,
          mallId,
          to: r.email,
          subject: content.subject,
          html: content.html,
        });
        sent++;
      }
    }
    return { malls: malls.length, sent, weekKey };
  }
}
