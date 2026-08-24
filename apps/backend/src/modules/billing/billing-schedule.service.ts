import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStatus, InvoiceStatus, Prisma } from '@prisma/client';
import {
  generateBillingPeriods,
  periodsDueForInvoicing,
} from './billing-schedule.util';
import { OperationalMetricsService } from '../../common/services/operational-metrics.service';
import { BillingService } from './billing.service';

// Accepts either the app-wide PrismaService or a `tx` client handed in by a
// caller's own `$transaction` (e.g. ContractsService.updateStatus activating
// a contract) — lets schedule generation join the caller's transaction
// instead of always committing as a separate, later write.
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class BillingScheduleService {
  private readonly logger = new Logger(BillingScheduleService.name);

  constructor(
    private prisma: PrismaService,
    private metrics: OperationalMetricsService,
    private billingService: BillingService,
  ) {}

  async buildScheduleForContract(contractId: string, client: Db = this.prisma) {
    try {
      return await this.buildScheduleForContractUnsafe(contractId, client);
    } catch (error) {
      this.metrics.increment('billing_schedule_generation_failure_total');
      throw error;
    }
  }

  private async buildScheduleForContractUnsafe(contractId: string, client: Db) {
    const contract = await client.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');
    if (!contract.isActive) throw new BadRequestException('Contract is not active');
    // Phase 4 hardening (docs/program/RELIABILITY_BACKLOG.md item 10): the manual rebuild
    // endpoint (POST /billing/schedule/:contractId/build) had no guard beyond the isActive
    // soft-delete flag — it would happily regenerate the full period set through the
    // contract's original endDate for a DRAFT, TERMINATING, TERMINATED, or EXPIRED contract,
    // resurrecting future billing periods that should stay dormant. Restrict schedule
    // (re)generation to the same operationally-billable statuses generateDueInvoices()
    // already requires, so a terminated contract's billing schedule can never be reopened
    // through this path — closing the actual exploitable gap without needing to truncate or
    // reclassify existing schedule rows (which would require distinguishing "skipped because
    // terminated" from "skipped because rent-free", not supported by the current schema).
    if (contract.status !== ContractStatus.ACTIVE && contract.status !== ContractStatus.EXPIRING) {
      throw new BadRequestException(
        `Cannot build a billing schedule for a contract with status ${contract.status}. Only ACTIVE or EXPIRING contracts are billable.`,
      );
    }

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

    const existingEntries = await client.billingScheduleEntry.findMany({ where: { contractId } });
    const existingByPeriod = new Map(existingEntries.map((entry) => [entry.period, entry]));
    const generatedPeriods = new Set(periods.map((period) => period.period));
    const results = [];
    for (const period of periods) {
      const existing = existingByPeriod.get(period.period);
      if (existing?.invoiceId || existing?.status === 'INVOICED') {
        results.push(existing);
        continue;
      }
      const entry = await client.billingScheduleEntry.upsert({
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
          currencyCode: contract.currencyCode,
          dueDate: period.dueDate,
          status: period.skipped ? 'SKIPPED' : 'PENDING',
        },
        update: {
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          rentAmount: period.rentAmount,
          camAmount: period.camAmount,
          subtotal: period.subtotal,
          currencyCode: contract.currencyCode,
          dueDate: period.dueDate,
        },
      });
      results.push(entry);
    }

    await client.billingScheduleEntry.deleteMany({
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
      try {
        await this.buildScheduleForContract(contract.id);
      } catch (error: any) {
        // Backbone Consolidation Gate finding D (docs/program/06-BACKBONE-CONCURRENCY.md):
        // this call was never guarded — a contract that transitions out of ACTIVE/EXPIRING
        // (e.g. termination) between this function's initial fetch and this line now hits
        // buildScheduleForContract's Phase 4 status guard and throws. Uncaught, that would
        // abort the whole batch for every contract still left in the loop, not just this
        // one. Skip this contract and keep processing the rest — a single mid-run
        // termination must not silently stop invoice generation for unrelated contracts.
        this.logger.warn(`generateDueInvoices: skipping contract ${contract.id} — buildScheduleForContract failed: ${error?.message ?? error}`);
        continue;
      }

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
            currencyCode: contract.currencyCode,
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
              // Phase 4: notifyTenantOnIssue must apply the same way regardless of whether
              // an invoice was issued manually (BillingService.issueInvoice) or
              // automatically here — same event ("an invoice was issued"), same flag.
              await this.billingService.enqueueInvoiceIssuedNotification(tx, createdInvoice);
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
