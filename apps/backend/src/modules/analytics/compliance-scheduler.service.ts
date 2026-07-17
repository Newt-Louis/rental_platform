import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ComplianceService } from './compliance.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';

const EXPORT_TYPES = ['CONTRACTS', 'INVOICES', 'APPROVALS', 'AUDIT_TRAIL'];

const DEFAULT_RETENTION: Record<string, number> = {
  CONTRACTS: 3650, // 10 years
  INVOICES: 2555,  // 7 years
  APPROVALS: 1825, // 5 years
  AUDIT_TRAIL: 2555,
  FITOUT_DOCS: 3650,
  PAYMENTS: 2555,
};

@Injectable()
export class ComplianceSchedulerService {
  private readonly logger = new Logger(ComplianceSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private complianceService: ComplianceService,
    private schedulerLock: SchedulerLockService,
  ) {}

  // Run on 2nd of every month at 6:00 AM — generate compliance exports for previous month
  @Cron('0 6 2 * *', {
    name: 'compliance-monthly-reports',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async generateMonthlyReports() {
    return this.schedulerLock.runExclusive(
      'compliance-monthly-reports',
      6 * 60 * 60_000,
      () => this.generateMonthlyReportsUnlocked(),
    );
  }

  private async generateMonthlyReportsUnlocked() {
    this.logger.log('Running monthly compliance report generation...');

    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const malls = await this.prisma.mall.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    let created = 0;
    for (const mall of malls) {
      for (const exportType of EXPORT_TYPES) {
        try {
          // Check if already exists for this period+mall+type
          const existing = await this.prisma.complianceExport.findFirst({
            where: {
              mallId: mall.id,
              exportType,
              periodStart: { gte: prevMonth },
              periodEnd: { lte: prevMonthEnd },
            },
          });
          if (existing) continue;

          const exp = await this.complianceService.requestExport({
            exportType,
            mallId: mall.id,
            periodStart: prevMonth,
            periodEnd: prevMonthEnd,
            requestedBy: 'system-cron',
          });

          await this.complianceService.generateExport(exp.id);
          created++;
        } catch (e: any) {
          this.logger.error(`Failed to generate ${exportType} for mall ${mall.name}: ${e?.message}`);
        }
      }
    }

    this.logger.log(`Monthly compliance reports done — created ${created} exports`);
  }

  // Apply retention policy — purge expired compliance exports
  @Cron('0 3 1 * *', {
    name: 'compliance-retention-purge',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async applyRetentionPolicies() {
    return this.schedulerLock.runExclusive(
      'compliance-retention-purge',
      6 * 60 * 60_000,
      () => this.applyRetentionPoliciesUnlocked(),
    );
  }

  private async applyRetentionPoliciesUnlocked() {
    this.logger.log('Applying document retention policies...');

    const malls = await this.prisma.mall.findMany({
      where: { isActive: true },
      include: { mallPolicy: true },
    });

    let purged = 0;
    for (const mall of malls) {
      const retention: Record<string, number> = (mall.mallPolicy?.policies as any)?.retentionDays ?? DEFAULT_RETENTION;

      for (const [exportType, days] of Object.entries(retention)) {
        if (!EXPORT_TYPES.includes(exportType)) continue;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const deleted = await this.prisma.complianceExport.deleteMany({
          where: {
            mallId: mall.id,
            exportType,
            status: 'COMPLETED',
            completedAt: { lt: cutoff },
          },
        });
        purged += deleted.count;
      }
    }

    this.logger.log(`Retention policy applied — purged ${purged} expired exports`);
  }

  getDefaultRetentionPolicy() {
    return DEFAULT_RETENTION;
  }

  async getMallRetentionPolicy(mallId: string) {
    const policy = await this.prisma.mallPolicy.findUnique({ where: { mallId } });
    const retentionDays: Record<string, number> = (policy?.policies as any)?.retentionDays ?? DEFAULT_RETENTION;
    return { mallId, retentionDays, isDefault: !policy };
  }

  async updateRetentionPolicy(mallId: string, retentionDays: Record<string, number>) {
    const existing = await this.prisma.mallPolicy.findUnique({ where: { mallId } });
    const currentPolicies = (existing?.policies ?? {}) as Record<string, any>;

    return this.prisma.mallPolicy.upsert({
      where: { mallId },
      create: {
        mallId,
        policies: { ...currentPolicies, retentionDays },
        kpiTargets: {},
      },
      update: {
        policies: { ...currentPolicies, retentionDays },
      },
    });
  }
}
