import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';
import { calculatePenaltyInterest } from './penalty-interest.util';
import * as crypto from 'crypto';

@Injectable()
export class PenaltyInterestService {
  constructor(private prisma: PrismaService) {}

  async listPolicies() {
    return this.prisma.penaltyInterestPolicy.findMany({ orderBy: { code: 'asc' } });
  }

  async runPenaltyCalculation(asOf: Date = new Date()) {
    const policy = await this.prisma.penaltyInterestPolicy.findFirst({
      where: { isActive: true },
    });
    if (!policy) return { created: 0, details: [] };

    const invoices = await this.prisma.invoice.findMany({
      where: {
        isActive: true,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        dueDate: { lt: asOf },
        type: { not: 'PENALTY' },
      },
      include: { payments: true },
    });

    const details: { invoiceId: string; penaltyInvoiceId: string; amount: number }[] = [];
    let created = 0;

    for (const invoice of invoices) {
      const paid = invoice.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0);
      const outstanding = invoice.totalAmount - paid;
      if (outstanding <= 0) continue;

      const { penaltyAmount, daysOverdue } = calculatePenaltyInterest({
        principal: outstanding,
        dueDate: invoice.dueDate,
        asOf,
        policy: { annualRate: policy.annualRate, graceDays: policy.graceDays },
      });

      if (penaltyAmount <= 0) continue;

      const existing = await this.prisma.invoice.findFirst({
        where: {
          contractId: invoice.contractId,
          type: 'PENALTY',
          period: `${invoice.period}-PENALTY`,
          isActive: true,
        },
      });
      if (existing) continue;

      const year = asOf.getFullYear();
      const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
      const vatRate = 0;
      const penaltyInvoice = await this.prisma.invoice.create({
        data: {
          invoiceNumber: `PEN-${year}-${rand}`,
          contractId: invoice.contractId,
          tenantId: invoice.tenantId,
          period: `${invoice.period}-PENALTY`,
          type: 'PENALTY',
          status: InvoiceStatus.DRAFT,
          subtotal: penaltyAmount,
          vatRate,
          vatAmount: 0,
          totalAmount: penaltyAmount,
          dueDate: asOf,
          notes: `Penalty interest for ${invoice.invoiceNumber} (${daysOverdue} days overdue)`,
          lines: {
            create: [{
              type: 'PENALTY',
              description: `Late payment penalty — ${daysOverdue} days @ ${policy.annualRate}% p.a.`,
              qty: 1,
              unitPrice: penaltyAmount,
              amount: penaltyAmount,
              order: 0,
            }],
          },
        },
      });

      created++;
      details.push({ invoiceId: invoice.id, penaltyInvoiceId: penaltyInvoice.id, amount: penaltyAmount });
    }

    return { created, details };
  }
}
