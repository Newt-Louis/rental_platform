import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';

@Injectable()
export class CollectionKpiService {
  constructor(private prisma: PrismaService) {}

  async getKpis(months = 6, mallIds?: string[]) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    // Multi-currency (docs/program/MULTI_CURRENCY_ARCHITECTURE.md): dso/collectionRate/
    // totalBilled/totalCollected/outstandingAr are single VND-denominated figures -- scope to
    // VND, same convention as the dashboard's revenue KPIs, so a USD/MMK invoice is excluded
    // rather than silently summed in.
    const invoices = await this.prisma.invoice.findMany({
      where: {
        isActive: true,
        createdAt: { gte: start },
        status: { not: InvoiceStatus.CANCELLED },
        currencyCode: 'VND',
        ...(mallIds ? { OR: [{ mallId: { in: mallIds } }, { contract: { unit: { mallId: { in: mallIds } } } }, { billingParty: { mallId: { in: mallIds } } }] } : {}),
      },
      include: { payments: true },
    });

    let totalBilled = 0;
    let totalCollected = 0;
    let outstandingAr = 0;
    let weightedDays = 0;
    let paidCount = 0;

    for (const inv of invoices) {
      const adjustedTotal = Math.max(0, inv.totalAmount + inv.adjustmentAmount);
      const collected = Math.max(0, inv.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0) - inv.refundedAmount);
      totalBilled += adjustedTotal;
      totalCollected += collected;

      if ([InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE].includes(inv.status as any)) {
        outstandingAr += Math.max(0, adjustedTotal - collected);
      }

      if (inv.paidAt && inv.issuedAt) {
        const days = Math.max(
          0,
          Math.floor((new Date(inv.paidAt).getTime() - new Date(inv.issuedAt).getTime()) / 86400000),
        );
        weightedDays += days;
        paidCount++;
      }
    }

    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 1000) / 10 : 0;
    const dso = paidCount > 0 ? Math.round(weightedDays / paidCount) : 0;

    const agingTrend = await this.buildAgingTrend(months, mallIds);

    return {
      dso,
      collectionRate,
      totalBilled,
      totalCollected,
      outstandingAr,
      agingTrend,
    };
  }

  private async buildAgingTrend(months: number, mallIds?: string[]) {
    const trend: { period: string; current: number; overdue: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const invoices = await this.prisma.invoice.findMany({
        where: {
          isActive: true,
          createdAt: { lte: end },
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE, InvoiceStatus.PAID] },
          currencyCode: 'VND',
          ...(mallIds ? { OR: [{ mallId: { in: mallIds } }, { contract: { unit: { mallId: { in: mallIds } } } }, { billingParty: { mallId: { in: mallIds } } }] } : {}),
        },
        include: { payments: true },
      });

      let current = 0;
      let overdue = 0;
      for (const inv of invoices) {
        const collected = Math.max(0, inv.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0) - inv.refundedAmount);
        const balance = Math.max(0, inv.totalAmount + inv.adjustmentAmount) - collected;
        if (balance <= 0) continue;
        if (inv.status === InvoiceStatus.OVERDUE || new Date(inv.dueDate) < end) {
          overdue += balance;
        } else {
          current += balance;
        }
      }

      trend.push({ period, current, overdue });
    }

    return trend;
  }
}
