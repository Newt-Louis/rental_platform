import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStatus, InvoiceStatus } from '@prisma/client';
import * as crypto from 'crypto';
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

    const results = [];
    for (const period of periods) {
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

    return { contractId, periodsGenerated: results.length, entries: results };
  }

  async getSchedule(contractId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');

    return this.prisma.billingScheduleEntry.findMany({
      where: { contractId },
      orderBy: { period: 'asc' },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
      },
    });
  }

  async generateDueInvoices(asOf: Date = new Date()) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
      },
    });

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

        const year = asOf.getFullYear();
        const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
        const invoiceNumber = `INV-${year}-${rand}`;
        const vatRate = 10;
        const vatAmount = scheduleRow.subtotal * (vatRate / 100);
        const totalAmount = scheduleRow.subtotal + vatAmount;

        const invoice = await this.prisma.invoice.create({
          data: {
            invoiceNumber,
            contractId: contract.id,
            tenantId: contract.tenantId,
            period: scheduleRow.period,
            type: 'MONTHLY_RENT',
            status: InvoiceStatus.DRAFT,
            subtotal: scheduleRow.subtotal,
            vatRate,
            vatAmount,
            totalAmount,
            dueDate: scheduleRow.dueDate,
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

        const config = await this.prisma.billingConfig.findFirst();
        if (config?.autoIssueInvoices) {
          await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.ISSUED, issuedAt: asOf },
          });
        }

        await this.prisma.billingScheduleEntry.update({
          where: { id: scheduleRow.id },
          data: { status: 'INVOICED', invoiceId: invoice.id },
        });

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
