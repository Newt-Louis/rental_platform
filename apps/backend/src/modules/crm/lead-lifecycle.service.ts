import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CrmActorType,
  CrmBusinessEventType,
  CrmEventSourceModule,
  LeadStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CrmBusinessEventService,
  CrmEventActor,
} from './crm-business-event.service';

type LifecycleDb = PrismaService | Prisma.TransactionClient;

export interface LeadTransitionInput {
  leadId: string;
  targetStatus: LeadStatus;
  actor: CrmEventActor;
  sourceModule: CrmEventSourceModule;
  sourceEntityType?: string;
  sourceEntityId?: string;
  occurredAt: Date;
  reasonCode?: string;
  reason?: string;
  comment?: string;
  idempotencyKey: string;
  position?: number;
  preserveExistingWonValidation?: boolean;
}

@Injectable()
export class LeadLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: CrmBusinessEventService,
  ) {}

  private eventType(fromStatus: LeadStatus, toStatus: LeadStatus) {
    const terminalStatuses = new Set<LeadStatus>([LeadStatus.WON, LeadStatus.LOST]);
    if (toStatus === LeadStatus.WON) return CrmBusinessEventType.LEAD_WON;
    if (toStatus === LeadStatus.LOST) return CrmBusinessEventType.LEAD_LOST;
    if (
      terminalStatuses.has(fromStatus)
      && !terminalStatuses.has(toStatus)
    ) {
      return CrmBusinessEventType.LEAD_REOPENED;
    }
    return CrmBusinessEventType.LEAD_STATUS_CHANGED;
  }

  private async transitionInDb(input: LeadTransitionInput, db: LifecycleDb) {
    const replay = await db.crmBusinessEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: {
        id: true,
        leadId: true,
        toStatus: true,
        sourceModule: true,
        sourceEntityType: true,
        sourceEntityId: true,
      },
    });
    if (replay) {
      const sameMeaning = replay.leadId === input.leadId
        && replay.toStatus === input.targetStatus
        && replay.sourceModule === input.sourceModule
        && replay.sourceEntityType === (input.sourceEntityType ?? null)
        && replay.sourceEntityId === (input.sourceEntityId ?? null);
      if (!sameMeaning) {
        throw new ConflictException('Lifecycle idempotency key conflicts with another transition');
      }
      const lead = await db.lead.findUnique({ where: { id: input.leadId } });
      if (!lead) throw new NotFoundException('Lead not found');
      return { lead, eventId: replay.id, changed: false, replayed: true };
    }

    const current = await db.lead.findUnique({
      where: { id: input.leadId },
      include: input.preserveExistingWonValidation
        ? { proposals: { where: { status: { in: ['APPROVED', 'CONVERTED'] } }, select: { id: true }, take: 1 } }
        : undefined,
    });
    if (!current || !current.isActive || current.deletedAt) {
      throw new NotFoundException('Lead not found');
    }

    if (current.status === input.targetStatus) {
      if (input.position !== undefined && current.position !== input.position) {
        const repositioned = await db.lead.update({
          where: { id: input.leadId },
          data: { position: input.position },
        });
        return { lead: repositioned, eventId: null, changed: false, replayed: false };
      }
      return { lead: current, eventId: null, changed: false, replayed: false };
    }
    if (
      input.preserveExistingWonValidation
      && input.targetStatus === LeadStatus.WON
      && !(current as any).proposals?.length
    ) {
      throw new ConflictException(
        'Không thể chuyển Lead sang WON khi chưa có Proposal được duyệt hoặc chuyển đổi.',
      );
    }

    const lead = await db.lead.update({
      where: { id: input.leadId },
      data: {
        status: input.targetStatus,
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
    });
    const event = await this.events.append({
      leadId: input.leadId,
      eventType: this.eventType(current.status, input.targetStatus),
      occurredAt: input.occurredAt,
      actor: input.actor,
      sourceModule: input.sourceModule,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      fromStatus: current.status,
      toStatus: input.targetStatus,
      reasonCode: input.reasonCode,
      reason: input.reason,
      comment: input.comment,
      idempotencyKey: input.idempotencyKey,
    }, db);
    return { lead, eventId: event.id, changed: true, replayed: false };
  }

  async transition(input: LeadTransitionInput, tx?: Prisma.TransactionClient) {
    if (tx) return this.transitionInDb(input, tx);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (db) => this.transitionInDb(input, db),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2034'
          && attempt < 3
        ) continue;
        throw error;
      }
    }
    throw new ConflictException('Lead transition could not be serialized');
  }

  static userActor(userId: string): CrmEventActor {
    return { type: CrmActorType.USER, userId };
  }

  static systemActor(): CrmEventActor {
    return { type: CrmActorType.SYSTEM };
  }
}
