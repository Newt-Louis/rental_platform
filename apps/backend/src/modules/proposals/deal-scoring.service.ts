import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateDealScore } from './deal-scoring.util';

@Injectable()
export class DealScoringService {
  constructor(private prisma: PrismaService) {}

  async listCriteria() {
    return this.prisma.dealScoreCriterion.findMany({ orderBy: { code: 'asc' } });
  }

  async upsertCriterion(data: {
    code: string;
    name: string;
    fieldSource: string;
    weight?: number;
    minScore?: number;
    maxScore?: number;
    isActive?: boolean;
  }) {
    return this.prisma.dealScoreCriterion.upsert({
      where: { code: data.code },
      create: {
        code: data.code,
        name: data.name,
        fieldSource: data.fieldSource,
        weight: data.weight ?? 1,
        minScore: data.minScore ?? 0,
        maxScore: data.maxScore ?? 100,
        isActive: data.isActive ?? true,
      },
      update: {
        name: data.name,
        fieldSource: data.fieldSource,
        weight: data.weight,
        minScore: data.minScore,
        maxScore: data.maxScore,
        isActive: data.isActive,
      },
    });
  }

  async scoreProposal(proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { tenant: true, unit: true },
    });
    if (!proposal) throw new Error('Proposal not found');

    const customer = proposal.tenantId
      ? await this.prisma.customer.findFirst({ where: { tenantId: proposal.tenantId } })
      : null;

    const criteria = await this.prisma.dealScoreCriterion.findMany({
      where: { isActive: true },
    });

    const result = calculateDealScore(criteria, {
      customerRating: customer?.rating ?? 3,
      brandStrength: customer?.rating ? customer.rating * 20 : 60,
      financialCapacity: customer?.budgetMax
        ? Math.min(100, (customer.budgetMax / 1_000_000_000) * 100)
        : 50,
      industryFit: proposal.unit?.category === customer?.preferredCategory ? 90 : 65,
      discountPct: proposal.discount ?? 0,
      rentFreeDays: proposal.rentFree ?? 0,
    });

    return this.prisma.proposalDealScore.upsert({
      where: { proposalId },
      create: {
        proposalId,
        totalScore: result.totalScore,
        grade: result.grade,
        breakdown: result.breakdown as object,
      },
      update: {
        totalScore: result.totalScore,
        grade: result.grade,
        breakdown: result.breakdown as object,
      },
    });
  }
}
