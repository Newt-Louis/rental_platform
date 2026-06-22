import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ScenarioTerms {
  area?: number;
  term?: number;
  rentPerSqm?: number;
  camPerSqm?: number;
  deposit?: number;
  rentFree?: number;
  escalation?: number;
  discount?: number;
}

@Injectable()
export class ProposalScenarioService {
  constructor(private prisma: PrismaService) {}

  async listScenarios(proposalId: string) {
    return this.prisma.proposalScenario.findMany({
      where: { proposalId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createScenario(proposalId: string, dto: { name: string; description?: string; terms: ScenarioTerms }) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const terms = this.computeTerms(dto.terms);
    const score = this.scoreScenario(terms);

    return this.prisma.proposalScenario.create({
      data: {
        proposalId,
        name: dto.name,
        description: dto.description,
        terms,
        score,
      },
    });
  }

  async updateScenario(id: string, dto: Partial<{ name: string; description: string; terms: ScenarioTerms }>) {
    const existing = await this.prisma.proposalScenario.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Scenario not found');

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.terms) {
      updateData.terms = this.computeTerms(dto.terms);
      updateData.score = this.scoreScenario(updateData.terms);
    }

    return this.prisma.proposalScenario.update({ where: { id }, data: updateData });
  }

  async deleteScenario(id: string) {
    const existing = await this.prisma.proposalScenario.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Scenario not found');
    return this.prisma.proposalScenario.delete({ where: { id } });
  }

  async selectScenario(proposalId: string, scenarioId: string) {
    const scenario = await this.prisma.proposalScenario.findFirst({
      where: { id: scenarioId, proposalId },
    });
    if (!scenario) throw new NotFoundException('Scenario not found for this proposal');

    await this.prisma.proposalScenario.updateMany({
      where: { proposalId },
      data: { isSelected: false },
    });

    return this.prisma.proposalScenario.update({
      where: { id: scenarioId },
      data: { isSelected: true },
    });
  }

  private computeTerms(raw: ScenarioTerms): Record<string, number> {
    const area = raw.area ?? 0;
    const rentPerSqm = raw.rentPerSqm ?? 0;
    const camPerSqm = raw.camPerSqm ?? 0;
    const discount = raw.discount ?? 0;
    const term = raw.term ?? 12;
    const deposit = raw.deposit ?? 3;
    const rentFree = raw.rentFree ?? 0;
    const escalation = raw.escalation ?? 0;

    const baseRent = area * rentPerSqm;
    const cam = area * camPerSqm;
    const monthlyRent = (baseRent + cam) * (1 - discount / 100);
    const depositAmount = monthlyRent * deposit;
    const totalValue = monthlyRent * (term - rentFree);

    return { area, rentPerSqm, camPerSqm, discount, term, deposit, rentFree, escalation, monthlyRent, depositAmount, totalValue };
  }

  private scoreScenario(terms: Record<string, number>): number {
    const revenueScore = Math.min(100, (terms.monthlyRent / 10_000_000) * 20);
    const termScore = Math.min(30, terms.term / 2);
    const discountPenalty = terms.discount * 2;
    const rentFreePenalty = terms.rentFree * 1.5;
    return Math.max(0, Math.min(100, revenueScore + termScore - discountPenalty - rentFreePenalty));
  }
}
