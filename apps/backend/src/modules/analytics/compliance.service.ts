import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { summarizeOccupancyByLeaseTerm, summarizeShortBookingPipeline } from '../../common/utils/lease-term-analytics';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private prisma: PrismaService) {}

  async getMallPolicy(mallId: string) {
    return this.prisma.mallPolicy.findUnique({
      where: { mallId },
      include: { mall: { select: { name: true, code: true } } },
    });
  }

  async upsertMallPolicy(mallId: string, data: {
    policies: Record<string, any>;
    kpiTargets?: Record<string, any>;
  }) {
    return this.prisma.mallPolicy.upsert({
      where: { mallId },
      create: {
        mallId,
        policies: data.policies,
        kpiTargets: data.kpiTargets ?? {},
      },
      update: {
        policies: data.policies,
        kpiTargets: data.kpiTargets,
      },
    });
  }

  async requestExport(data: {
    exportType: string;
    mallId?: string;
    periodStart: Date;
    periodEnd: Date;
    requestedBy: string;
  }) {
    return this.prisma.complianceExport.create({
      data: {
        exportType: data.exportType,
        mallId: data.mallId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        requestedBy: data.requestedBy,
        status: 'PENDING',
      },
    });
  }

  async generateExport(exportId: string) {
    const exp = await this.getExport(exportId);
    if (!exp) return null;

    const data = await this.gatherExportData(exp);

    await this.prisma.complianceExport.update({
      where: { id: exportId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        filePath: `/exports/${exportId}.json`,
      },
    });

    return data;
  }

  async getExport(exportId: string) {
    return this.prisma.complianceExport.findUnique({ where: { id: exportId } });
  }

  private async gatherExportData(exp: any) {
    const where: any = {
      createdAt: { gte: exp.periodStart, lte: exp.periodEnd },
    };

    switch (exp.exportType) {
      case 'CONTRACTS':
        return this.prisma.contract.findMany({
          where: {
            ...where,
            ...(exp.mallId && { unit: { mallId: exp.mallId } }),
          },
          include: {
            tenant: { select: { brandName: true, taxCode: true } },
            unit: { select: { code: true } },
            amendments: true,
            events: { orderBy: { createdAt: 'asc' } },
          },
        });

      case 'INVOICES':
        return this.prisma.invoice.findMany({
          where: {
            ...where,
            ...(exp.mallId && {
              OR: [
                { mallId: exp.mallId },
                { billingParty: { mallId: exp.mallId } },
                { contract: { unit: { mallId: exp.mallId } } },
              ],
            }),
          },
          include: {
            tenant: { select: { brandName: true, taxCode: true } },
            contract: { select: { contractNumber: true } },
            payments: true,
          },
        });

      case 'APPROVALS':
        return this.prisma.approvalWorkflow.findMany({
          where: {
            ...where,
            ...(exp.mallId && {
              OR: [
                { proposal: { unit: { mallId: exp.mallId } } },
                { fitoutSubmittal: { project: { unit: { mallId: exp.mallId } } } },
              ],
            }),
          },
          include: {
            proposal: {
              select: {
                proposalNumber: true,
                tenant: { select: { companyName: true } },
              },
            },
            steps: {
              include: {
                approver: { select: { fullName: true } },
              },
            },
          },
        });

      case 'AUDIT_TRAIL':
        return {
          contractEvents: await this.prisma.contractEvent.findMany({
            where: {
              createdAt: { gte: exp.periodStart, lte: exp.periodEnd },
              ...(exp.mallId && { contract: { unit: { mallId: exp.mallId } } }),
            },
            include: {
              contract: { select: { contractNumber: true } },
            },
            orderBy: { createdAt: 'asc' },
          }),
          // SapIntegrationLog has no authoritative Mall field/relation. Never
          // guess ownership from payload/entity strings in a scoped export.
          sapLogs: exp.mallId
            ? []
            : await this.prisma.sapIntegrationLog.findMany({
                where: {
                  createdAt: { gte: exp.periodStart, lte: exp.periodEnd },
                },
                orderBy: { createdAt: 'asc' },
              }),
        };

      default:
        return null;
    }
  }

  async listExports(filters: { mallId?: string; status?: string; mallIds?: string[] | null }) {
    const where: any = {};
    if (filters.mallIds !== null && filters.mallIds !== undefined) {
      where.mallId = { in: filters.mallIds };
    } else if (filters.mallId) {
      where.mallId = filters.mallId;
    }
    if (filters.status) where.status = filters.status;

    return this.prisma.complianceExport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getMultiMallComparison(mallIds: string[] | null) {
    const malls = await this.prisma.mall.findMany({
      where: mallIds ? { isActive: true, id: { in: mallIds } } : { isActive: true },
      select: { id: true, name: true, code: true },
    });

    const comparison = [];

    for (const mall of malls) {
      const units = await this.prisma.unit.findMany({
        where: { mallId: mall.id, isActive: true },
      });
      const shortBookings = await this.prisma.slotBooking.findMany({
        where: { slot: { unit: { mallId: mall.id, leaseTermType: 'SHORT' } } },
        select: {
          status: true,
          installationStartDatetime: true,
          dismantlingEndDatetime: true,
          startDatetime: true,
          endDatetime: true,
          totalAmount: true,
          slot: { select: { id: true, unitId: true, area: true } },
        },
      });
      const occupancyByLeaseTerm = summarizeOccupancyByLeaseTerm(units, shortBookings);
      const shortPipeline = summarizeShortBookingPipeline(shortBookings);

      const totalUnits = units.length;
      const totalArea = units.reduce((s, u) => s + (u.areaNLA ?? 0), 0);
      const occupied = units.filter((u) => u.status === 'OCCUPIED');
      const occupiedArea = occupied.reduce((s, u) => s + (u.areaNLA ?? 0), 0);

      const contracts = await this.prisma.contract.count({
        where: { unit: { mallId: mall.id }, status: 'ACTIVE' },
      });

      const currentMonth = new Date();
      const period = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

      // Multi-currency: monthlyRevenue/revenuePerSqm are single VND-denominated figures --
      // scope to VND, same convention as the dashboard's revenue KPIs.
      const revenue = await this.prisma.invoice.aggregate({
        where: {
          contract: { unit: { mallId: mall.id } },
          period,
          status: { in: ['ISSUED', 'PAID', 'PARTIALLY_PAID'] },
          currencyCode: 'VND',
        },
        _sum: { subtotal: true },
      });

      const policy = await this.prisma.mallPolicy.findUnique({
        where: { mallId: mall.id },
      });

      comparison.push({
        mall: mall.name,
        code: mall.code,
        totalUnits,
        totalArea,
        occupiedUnits: occupied.length,
        occupancyRate: totalArea > 0 ? Math.round((occupiedArea / totalArea) * 1000) / 10 : 0,
        activeContracts: contracts,
        monthlyRevenue: revenue._sum.subtotal ?? 0,
        revenuePerSqm: occupiedArea > 0 ? (revenue._sum.subtotal ?? 0) / occupiedArea : 0,
        hasPolicy: !!policy,
        kpiTargets: policy?.kpiTargets ?? null,
        byLeaseTerm: {
          LONG: {
            ...occupancyByLeaseTerm.LONG,
            activeContracts: contracts,
            monthlyRevenue: revenue._sum.subtotal ?? 0,
            revenuePerSqm: occupancyByLeaseTerm.LONG.occupiedArea > 0
              ? (revenue._sum.subtotal ?? 0) / occupancyByLeaseTerm.LONG.occupiedArea
              : 0,
          },
          SHORT: {
            ...occupancyByLeaseTerm.SHORT,
            activeContracts: 0,
            monthlyRevenue: shortPipeline.revenue,
            revenuePerSqm: occupancyByLeaseTerm.SHORT.occupiedArea > 0
              ? shortPipeline.revenue / occupancyByLeaseTerm.SHORT.occupiedArea
              : 0,
            bookingStats: shortPipeline,
          },
        },
      });
    }

    return comparison;
  }
}
