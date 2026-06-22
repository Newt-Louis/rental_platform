import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

import { UnitStatusService } from '../../common/services/unit-status.service';

@Injectable()
export class ContractTerminationService {
  constructor(
    private prisma: PrismaService,
    private unitStatus: UnitStatusService,
  ) {}

  async getByContract(contractId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');

    return this.prisma.contractTermination.findUnique({
      where: { contractId },
      include: { contract: { select: { id: true, contractNumber: true, status: true, endDate: true } } },
    });
  }

  async initiate(contractId: string, dto: {
    initiatedBy: string;
    reason: string;
    effectiveDate: string;
    noticePeriodDays?: number;
    depositRefund?: number;
    penaltyAmount?: number;
    notes?: string;
  }, createdById: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');
    if (!['ACTIVE', 'EXPIRING'].includes(contract.status)) {
      throw new BadRequestException('Contract must be ACTIVE or EXPIRING to initiate termination');
    }

    const existing = await this.prisma.contractTermination.findUnique({ where: { contractId } });
    if (existing && existing.status !== 'CANCELLED') {
      throw new BadRequestException('Termination already exists for this contract');
    }

    const termination = await this.prisma.contractTermination.upsert({
      where: { contractId },
      create: {
        contractId,
        initiatedBy: dto.initiatedBy,
        reason: dto.reason,
        effectiveDate: new Date(dto.effectiveDate),
        noticePeriodDays: dto.noticePeriodDays ?? 60,
        depositRefund: dto.depositRefund,
        penaltyAmount: dto.penaltyAmount,
        notes: dto.notes,
        createdById,
        status: 'INITIATED',
      },
      update: {
        initiatedBy: dto.initiatedBy,
        reason: dto.reason,
        effectiveDate: new Date(dto.effectiveDate),
        noticePeriodDays: dto.noticePeriodDays ?? 60,
        depositRefund: dto.depositRefund,
        penaltyAmount: dto.penaltyAmount,
        notes: dto.notes,
        status: 'INITIATED',
      },
      include: { contract: { select: { id: true, contractNumber: true } } },
    });

    await this.prisma.contract.update({ where: { id: contractId }, data: { status: 'TERMINATING' as any } });

    return termination;
  }

  async update(contractId: string, dto: {
    handoverDate?: string;
    handoverCondition?: string;
    utilityFinalRead?: Record<string, unknown>;
    accessCardReturn?: boolean;
    signageRemoved?: boolean;
    keysReturned?: boolean;
    notes?: string;
    status?: string;
  }) {
    const term = await this.prisma.contractTermination.findUnique({ where: { contractId } });
    if (!term) throw new NotFoundException('Termination not found');

    const data: any = { ...dto };
    if (dto.handoverDate) data.handoverDate = new Date(dto.handoverDate);
    if (dto.status) data.status = dto.status;

    return this.prisma.contractTermination.update({ where: { contractId }, data });
  }

  async complete(contractId: string) {
    const term = await this.prisma.contractTermination.findUnique({ where: { contractId } });
    if (!term) throw new NotFoundException('Termination not found');
    if (term.status === 'COMPLETED') throw new BadRequestException('Already completed');

    const checklist = [term.accessCardReturn, term.signageRemoved, term.keysReturned];
    if (checklist.some((c) => !c)) {
      throw new BadRequestException('All handover checklist items must be completed before finalizing');
    }

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { unitId: true },
    });

    const [termination] = await this.prisma.$transaction([
      this.prisma.contractTermination.update({
        where: { contractId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      }),
      this.prisma.contract.update({ where: { id: contractId }, data: { status: 'TERMINATED' as any } }),
    ]);

    if (contract) {
      await this.unitStatus.transition(contract.unitId, UnitStatus.VACANT, {
        reason: `Contract ${contractId} terminated`,
      });
    }

    return termination;
  }

  async cancel(contractId: string) {
    const term = await this.prisma.contractTermination.findUnique({ where: { contractId } });
    if (!term) throw new NotFoundException('Termination not found');
    if (term.status === 'COMPLETED') throw new BadRequestException('Cannot cancel a completed termination');

    await this.prisma.$transaction([
      this.prisma.contractTermination.update({ where: { contractId }, data: { status: 'CANCELLED' } }),
      this.prisma.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE' as any } }),
    ]);

    return { message: 'Termination cancelled' };
  }
}
