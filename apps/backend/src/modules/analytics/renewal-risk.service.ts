import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStatus, InvoiceStatus } from '@prisma/client';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

@Injectable()
export class RenewalRiskService {
  private readonly logger = new Logger(RenewalRiskService.name);

  constructor(private prisma: PrismaService) {}

  async calculateRiskScore(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        tenant: true,
        invoices: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
        unit: { select: { category: true } },
      },
    });

    if (!contract) return null;

    const now = new Date();
    const daysToExpiry = Math.floor(
      (contract.endDate.getTime() - now.getTime()) / 86400000,
    );

    const factors: Record<string, { score: number; weight: number; reason: string }> = {};

    factors.daysToExpiry = {
      score: daysToExpiry <= 30 ? 100 : daysToExpiry <= 60 ? 70 : daysToExpiry <= 90 ? 40 : 10,
      weight: 0.25,
      reason: `${daysToExpiry} days to expiry`,
    };

    const overdueInvoices = contract.invoices.filter(
      (i) => i.status === InvoiceStatus.OVERDUE,
    );
    const overdueRatio = contract.invoices.length > 0
      ? overdueInvoices.length / contract.invoices.length
      : 0;
    factors.paymentHistory = {
      score: overdueRatio > 0.3 ? 90 : overdueRatio > 0.1 ? 50 : 10,
      weight: 0.25,
      reason: `${Math.round(overdueRatio * 100)}% overdue invoices`,
    };

    const tickets = await this.prisma.ticket.count({
      where: { tenantId: contract.tenantId, isActive: true },
    });
    factors.ticketVolume = {
      score: tickets > 10 ? 70 : tickets > 5 ? 40 : 10,
      weight: 0.15,
      reason: `${tickets} support tickets`,
    };

    const salesData = await this.prisma.salesTurnover.findMany({
      where: { tenantId: contract.tenantId },
      orderBy: { period: 'desc' },
      take: 6,
    });
    let salesTrend = 0;
    if (salesData.length >= 3) {
      const recent = salesData.slice(0, 3).reduce((s, d) => s + d.netSales, 0) / 3;
      const older = salesData.slice(3, 6).reduce((s, d) => s + d.netSales, 0) / Math.min(3, salesData.length - 3);
      salesTrend = older > 0 ? ((recent - older) / older) * 100 : 0;
    }
    factors.salesTrend = {
      score: salesTrend < -20 ? 80 : salesTrend < 0 ? 50 : 20,
      weight: 0.2,
      reason: `${Math.round(salesTrend)}% sales trend`,
    };

    const contractDurationYears = contract.term / 12;
    factors.tenureLength = {
      score: contractDurationYears < 1 ? 60 : contractDurationYears < 2 ? 30 : 10,
      weight: 0.15,
      reason: `${contractDurationYears.toFixed(1)} year term`,
    };

    const totalScore = Object.values(factors).reduce(
      (sum, f) => sum + f.score * f.weight,
      0,
    );
    const riskLevel: RiskLevel =
      totalScore >= 70 ? 'CRITICAL' : totalScore >= 50 ? 'HIGH' : totalScore >= 30 ? 'MEDIUM' : 'LOW';

    const recommendations: string[] = [];
    if (daysToExpiry <= 60) recommendations.push('Schedule renewal discussion urgently');
    if (overdueRatio > 0.2) recommendations.push('Address payment issues before renewal');
    if (salesTrend < -10) recommendations.push('Review tenant business performance');
    if (tickets > 5) recommendations.push('Resolve outstanding service issues');

    const result = await this.prisma.renewalRiskScore.upsert({
      where: { contractId },
      create: {
        contractId,
        riskScore: Math.round(totalScore),
        riskLevel,
        factors: factors as object,
        daysToExpiry,
        recommendation: recommendations.join('; ') || null,
      },
      update: {
        riskScore: Math.round(totalScore),
        riskLevel,
        factors: factors as object,
        daysToExpiry,
        calculatedAt: new Date(),
        recommendation: recommendations.join('; ') || null,
      },
    });

    return result;
  }

  @Cron('0 2 * * *', { name: 'renewal-risk-calc', timeZone: 'Asia/Ho_Chi_Minh' })
  async recalculateAllRisks() {
    this.logger.log('Recalculating renewal risks...');

    const contracts = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
      },
      select: { id: true },
    });

    for (const contract of contracts) {
      await this.calculateRiskScore(contract.id);
    }

    this.logger.log(`Recalculated risk for ${contracts.length} contracts`);
  }

  async getRiskDashboard(mallId?: string) {
    const where: any = {
      contract: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
      },
    };
    if (mallId) {
      where.contract.unit = { mallId };
    }

    const scores = await this.prisma.renewalRiskScore.findMany({
      where,
      include: {
        contract: {
          select: {
            contractNumber: true,
            endDate: true,
            rent: true,
            tenant: { select: { brandName: true } },
            unit: { select: { code: true } },
          },
        },
      },
      orderBy: { riskScore: 'desc' },
    });

    const byLevel = {
      CRITICAL: scores.filter((s) => s.riskLevel === 'CRITICAL'),
      HIGH: scores.filter((s) => s.riskLevel === 'HIGH'),
      MEDIUM: scores.filter((s) => s.riskLevel === 'MEDIUM'),
      LOW: scores.filter((s) => s.riskLevel === 'LOW'),
    };

    const atRiskRevenue = [...byLevel.CRITICAL, ...byLevel.HIGH].reduce(
      (sum, s) => sum + (s.contract.rent ?? 0),
      0,
    );

    return {
      summary: {
        total: scores.length,
        critical: byLevel.CRITICAL.length,
        high: byLevel.HIGH.length,
        medium: byLevel.MEDIUM.length,
        low: byLevel.LOW.length,
        atRiskMonthlyRevenue: atRiskRevenue,
      },
      topRisks: scores.slice(0, 10).map((s) => ({
        contractNumber: s.contract.contractNumber,
        tenant: s.contract.tenant.brandName,
        unit: s.contract.unit.code,
        riskScore: s.riskScore,
        riskLevel: s.riskLevel,
        daysToExpiry: s.daysToExpiry,
        recommendation: s.recommendation,
      })),
    };
  }
}
