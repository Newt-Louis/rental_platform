import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStatus, InvoiceStatus, Prisma } from '@prisma/client';
import {
  generateBillingPeriods,
  periodsDueForInvoicing,
} from './billing-schedule.util';

@Injectable()
export class BillingScheduleService {
  constructor(private prisma: PrismaService) {}

  async buildScheduleForContract(contractId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');
    if (!contract.isActive) throw new BadRequestException('Contract is not active');

    const periods = generateBillingPeriods({
      startDate: contract.startDate,
      endDate: contract.endDate,
      rent: contract.rent,
      cam: contract.cam,
      rentFree: contract.rentFree,
      escalationPercent: contract.escalationPercent,
      paymentTerm: contract.paymentTerm,
      billingCycle: contract.billingCycle,
    });

    const existingEntries = await this.prisma.billingScheduleEntry.findMany({ where: { contractId } });
    const existingByPeriod = new Map(existingEntries.map((entry) => [entry.period, entry]));
    const generatedPeriods = new Set(periods.map((period) => period.period));
    const results = [];
    for (const period of periods) {
      const existing = existingByPeriod.get(period.period);
      if (existing?.invoiceId || existing?.status === 'INVOICED') {
        results.push(existing);
        continue;
      }
      const entry = await this.prisma.billingScheduleEntry.upsert({
        where: {
          contractId_period: { contractId, period: period.period },
        },
        create: {
          contractId,
          period: period.period,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          rentAmount: period.rentAmount,
          camAmount: period.camAmount,
          subtotal: period.subtotal,
          dueDate: period.dueDate,
          status: period.skipped ? 'SKIPPED' : 'PENDING',
        },
        update: {
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          rentAmount: period.rentAmount,
          camAmount: period.camAmount,
          subtotal: period.subtotal,
          dueDate: period.dueDate,
        },
      });
      results.push(entry);
    }

    await this.prisma.billingScheduleEntry.deleteMany({
      where: {
        contractId,
        invoiceId: null,
        status: { in: ['PENDING', 'SKIPPED'] },
        period: { notIn: Array.from(generatedPeriods) },
      },
    });

    return { contractId, periodsGenerated: results.length, entries: results };
  }

  async getSchedule(contractId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');

    const entries = await this.prisma.billingScheduleEntry.findMany({
      where: { contractId },
      orderBy: { period: 'asc' },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            payments: { where: { reversedAt: null }, select: { amount: true } },
          },
        },
      },
    });

    // Đính kèm số tiền đã thu thực tế của từng kỳ — để FE hiện "đã thu X / tổng Y" ngay trên
    // thẻ kỳ thay vì phải mở từng hóa đơn để cộng payments thủ công.
    return entries.map((entry) => ({
      ...entry,
      invoice: entry.invoice
        ? {
            ...entry.invoice,
            collectedAmount: entry.invoice.payments.reduce((sum, p) => sum + p.amount, 0),
          }
        : null,
    }));
  }

  async generateDueInvoices(asOf: Date = new Date(), mallIds?: string[]) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        ...(mallIds ? { unit: { mallId: { in: mallIds } } } : {}),
      },
      include: { unit: true, tenant: true },
    });

    const config = await this.prisma.billingConfig.findFirst();
    let created = 0;
    const details: { contractId: string; period: string; invoiceId: string }[] = [];

    for (const contract of contracts) {
      await this.buildScheduleForContract(contract.id);

      const pending = await this.prisma.billingScheduleEntry.findMany({
        where: { contractId: contract.id, status: 'PENDING', invoiceId: null },
        orderBy: { period: 'asc' },
      });

      const due = periodsDueForInvoicing(
        pending.map((p) => ({
          period: p.period,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          rentAmount: p.rentAmount,
          camAmount: p.camAmount,
          subtotal: p.subtotal,
          dueDate: p.dueDate,
          skipped: false,
        })),
        asOf,
      );

      for (const period of due) {
        const scheduleRow = pending.find((p) => p.period === period.period);
        if (!scheduleRow) continue;

        const invoiceNumber = `INV-SCHEDULE-${scheduleRow.id}`;
        const vatRate = 10;
        const vatAmount = scheduleRow.subtotal * (vatRate / 100);
        const totalAmount = scheduleRow.subtotal + vatAmount;

        let invoice;
        try {
          invoice = await this.prisma.$transaction(async (tx) => {
            const createdInvoice = await tx.invoice.create({
              data: {
            invoiceNumber,
            contractId: contract.id,
            tenantId: contract.tenantId,
            mallId: contract.unit.mallId,
            counterpartyName: contract.tenant.companyName,
            counterpartyTaxCode: contract.tenant.taxCode,
            period: scheduleRow.period,
            type: 'MONTHLY_RENT',
            status: InvoiceStatus.DRAFT,
            subtotal: scheduleRow.subtotal,
            vatRate,
            vatAmount,
            totalAmount,
            dueDate: scheduleRow.dueDate,
            sourceType: 'LEASE_CONTRACT',
            sourceId: scheduleRow.id,
            notes: `Auto-generated from billing schedule ${scheduleRow.period}`,
            lines: {
              create: [
                {
                  type: 'RENT',
                  description: `Base rent - ${scheduleRow.period}`,
                  qty: 1,
                  unitPrice: scheduleRow.rentAmount,
                  amount: scheduleRow.rentAmount,
                  order: 0,
                },
                {
                  type: 'CAM',
                  description: `CAM - ${scheduleRow.period}`,
                  qty: 1,
                  unitPrice: scheduleRow.camAmount,
                  amount: scheduleRow.camAmount,
                  order: 1,
                },
              ],
            },
              },
            });
            if (config?.autoIssueInvoices) {
              await tx.invoice.update({
                where: { id: createdInvoice.id },
                data: { status: InvoiceStatus.ISSUED, issuedAt: asOf },
              });
            }
            await tx.billingScheduleEntry.update({
              where: { id: scheduleRow.id },
              data: { status: 'INVOICED', invoiceId: createdInvoice.id },
            });
            return createdInvoice;
          }, { isolationLevel: 'Serializable' });
        } catch (error) {
          const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
          if (!duplicate) throw error;
          const existingInvoice = await this.prisma.invoice.findUnique({ where: { invoiceNumber } });
          if (!existingInvoice) throw error;
          await this.prisma.billingScheduleEntry.update({
            where: { id: scheduleRow.id },
            data: { status: 'INVOICED', invoiceId: existingInvoice.id },
          });
          invoice = existingInvoice;
        }

        created++;
        details.push({ contractId: contract.id, period: scheduleRow.period, invoiceId: invoice.id });
      }
    }

    return { created, details };
  }

  async getConfig() {
    let config = await this.prisma.billingConfig.findFirst();
    if (!config) {
      config = await this.prisma.billingConfig.create({ data: {} });
    }
    return config;
  }

  async updateConfig(data: { autoIssueInvoices?: boolean; notifyTenantOnIssue?: boolean }) {
    const config = await this.getConfig();
    return this.prisma.billingConfig.update({
      where: { id: config.id },
      data,
    });
  }
}
