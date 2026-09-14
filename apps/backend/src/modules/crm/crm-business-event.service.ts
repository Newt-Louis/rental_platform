import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  CrmActorType,
  CrmBusinessEventType,
  CrmEventScope,
  CrmEventSourceModule,
  LeadStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const CRM_EVENT_LEDGER_ACTIVATION_AT =
  process.env.CRM_EVENT_LEDGER_ACTIVATION_AT ?? '2026-09-12T00:00:00.000Z';

type CrmDb = PrismaService | Prisma.TransactionClient;

export interface CrmEventActor {
  type: CrmActorType;
  userId?: string;
}

export interface AppendCrmBusinessEventInput {
  leadId: string;
  eventType: CrmBusinessEventType;
  occurredAt: Date;
  actor: CrmEventActor;
  sourceModule: CrmEventSourceModule;
  sourceEntityType?: string;
  sourceEntityId?: string;
  fromStatus?: LeadStatus;
  toStatus?: LeadStatus;
  reasonCode?: string;
  reason?: string;
  comment?: string;
  metadata?: Prisma.InputJsonValue;
  idempotencyKey: string;
}

export interface CrmEventReadScope {
  userId: string;
  role: Role;
  mallIds?: string[];
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value instanceof Date ? value.toISOString() : value;
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

@Injectable()
export class CrmBusinessEventService {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendCrmBusinessEventInput, db: CrmDb = this.prisma) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException('CRM event idempotencyKey is required');
    }
    if (input.actor.type === CrmActorType.USER && !input.actor.userId) {
      throw new BadRequestException('USER CRM event requires actor userId');
    }
    if (input.actor.type === CrmActorType.SYSTEM && input.actor.userId) {
      throw new BadRequestException('SYSTEM CRM event cannot claim a user actor');
    }

    const lead = await db.lead.findUnique({
      where: { id: input.leadId },
      select: { id: true, mallId: true, customerId: true },
    });
    if (!lead) throw new BadRequestException('CRM event Lead does not exist');

    const scope = lead.mallId
      ? CrmEventScope.MALL
      : CrmEventScope.GLOBAL_UNASSIGNED;
    const payload = {
      leadId: lead.id,
      customerId: lead.customerId,
      mallId: lead.mallId,
      scope,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      actorType: input.actor.type,
      actorUserId: input.actor.type === CrmActorType.USER ? input.actor.userId : null,
      sourceModule: input.sourceModule,
      sourceEntityType: input.sourceEntityType ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      reasonCode: input.reasonCode ?? null,
      reason: input.reason ?? null,
      comment: input.comment ?? null,
      metadataJson: input.metadata ?? Prisma.JsonNull,
    };
    const payloadHash = hashPayload(payload);
    const existing = await db.crmBusinessEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException('CRM event idempotency key conflicts with another payload');
      }
      return existing;
    }

    try {
      return await db.crmBusinessEvent.create({
        data: {
          ...payload,
          metadataJson: input.metadata ?? Prisma.JsonNull,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const winner = await db.crmBusinessEvent.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (winner?.payloadHash === payloadHash) return winner;
        throw new ConflictException('CRM event idempotency key conflicts with another payload');
      }
      throw error;
    }
  }

  async listForLead(
    leadId: string,
    scope: CrmEventReadScope,
    options: { limit?: number; cursor?: string } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const accessWhere: Prisma.CrmBusinessEventWhereInput = scope.role === Role.ADMIN
      ? {}
      : {
          scope: CrmEventScope.MALL,
          mallId: { in: scope.mallIds ?? [] },
        };

    let cursorWhere: Prisma.CrmBusinessEventWhereInput = {};
    if (options.cursor) {
      const cursor = await this.prisma.crmBusinessEvent.findFirst({
        where: { id: options.cursor, leadId, ...accessWhere },
        select: { id: true, occurredAt: true },
      });
      if (!cursor) throw new BadRequestException('Invalid CRM timeline cursor');
      cursorWhere = {
        OR: [
          { occurredAt: { lt: cursor.occurredAt } },
          { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
        ],
      };
    }

    const rows = await this.prisma.crmBusinessEvent.findMany({
      where: { leadId, ...accessWhere, ...cursorWhere },
      select: {
        id: true,
        eventType: true,
        occurredAt: true,
        recordedAt: true,
        actorType: true,
        actor: { select: { id: true, fullName: true, role: true } },
        sourceModule: true,
        sourceEntityType: true,
        sourceEntityId: true,
        fromStatus: true,
        toStatus: true,
        reasonCode: true,
        reason: true,
        mallId: true,
        scope: true,
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      data: page.map((event) => ({
        ...event,
        comment: null,
        commentStatus: 'WITHHELD_PENDING_BC_028' as const,
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      historicalCoverage: 'PARTIAL' as const,
      coverageStartedAt: CRM_EVENT_LEDGER_ACTIVATION_AT,
      coverageMessage: `Không đủ dữ liệu lịch sử trước ${CRM_EVENT_LEDGER_ACTIVATION_AT}`,
    };
  }

}
