import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ContractEventsService {
  constructor(private prisma: PrismaService) {}

  async logEvent(opts: {
    contractId: string;
    eventType: string;
    title: string;
    description?: string;
    beforeValue?: string;
    afterValue?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }, client: PrismaClientOrTx = this.prisma) {
    return client.contractEvent.create({
      data: {
        contractId: opts.contractId,
        eventType: opts.eventType,
        title: opts.title,
        description: opts.description,
        beforeValue: opts.beforeValue,
        afterValue: opts.afterValue,
        userId: opts.userId,
        metadata: opts.metadata as object | undefined,
      },
    });
  }

  async getTimeline(contractId: string) {
    return this.prisma.contractEvent.findMany({
      where: { contractId },
      include: { user: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
