import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UnitStatus, ContractStatus } from '@prisma/client';
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

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.contract.findUnique({ where: { id: contractId } });
      if (!current) throw new NotFoundException('Contract not found');
      if (!['ACTIVE', 'EXPIRING'].includes(current.status)) {
        throw new BadRequestException('Contract must be ACTIVE or EXPIRING to initiate termination');
      }
      const currentTermination = await tx.contractTermination.findUnique({ where: { contractId } });
      if (currentTermination && currentTermination.status !== 'CANCELLED') {
        throw new BadRequestException('Termination already exists for this contract');
      }

      const termination = await tx.contractTermination.upsert({
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
      await tx.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.TERMINATING },
      });
      return termination;
    });
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

    // Whitelist tường minh — dto đến từ @Body() any ở controller nên không có ValidationPipe
    // nào lọc field lạ; nếu spread thẳng "...dto" thì client có thể ghi đè initiatedBy,
    // penaltyAmount, createdById... Chỉ COMPLETED/CANCELLED mới hợp lệ qua complete()/cancel()
    // (có kiểm tra checklist/transaction riêng), nên ở đây chỉ cho set INITIATED/IN_PROGRESS.
    const data: Record<string, unknown> = {};
    if (dto.handoverDate !== undefined) data.handoverDate = new Date(dto.handoverDate);
    if (dto.handoverCondition !== undefined) data.handoverCondition = dto.handoverCondition;
    if (dto.utilityFinalRead !== undefined) data.utilityFinalRead = dto.utilityFinalRead;
    if (dto.accessCardReturn !== undefined) data.accessCardReturn = dto.accessCardReturn;
    if (dto.signageRemoved !== undefined) data.signageRemoved = dto.signageRemoved;
    if (dto.keysReturned !== undefined) data.keysReturned = dto.keysReturned;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.status !== undefined) {
      if (!['INITIATED', 'IN_PROGRESS'].includes(dto.status)) {
        throw new BadRequestException(
          'status chỉ nhận INITIATED hoặc IN_PROGRESS ở đây — dùng /termination/complete hoặc /termination/cancel để hoàn tất/hủy.',
        );
      }
      data.status = dto.status;
    }

    return this.prisma.contractTermination.update({ where: { contractId }, data });
  }

  async complete(contractId: string) {
    return this.prisma.$transaction(async (tx) => {
      const term = await tx.contractTermination.findUnique({ where: { contractId } });
      if (!term) throw new NotFoundException('Termination not found');
      if (term.status === 'COMPLETED') throw new BadRequestException('Already completed');

      const checklist = [term.accessCardReturn, term.signageRemoved, term.keysReturned];
      if (checklist.some((c) => !c)) {
        throw new BadRequestException('All handover checklist items must be completed before finalizing');
      }
      const contract = await tx.contract.findUnique({
        where: { id: contractId },
        select: { unitId: true },
      });
      if (!contract) throw new NotFoundException('Contract not found');

      const termination = await tx.contractTermination.update({
        where: { contractId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await tx.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.TERMINATED },
      });
      await this.unitStatus.transition(contract.unitId, UnitStatus.VACANT, {
        reason: `Contract ${contractId} terminated`,
      }, tx);
      return termination;
    });
  }

  async cancel(contractId: string) {
    const term = await this.prisma.contractTermination.findUnique({ where: { contractId } });
    if (!term) throw new NotFoundException('Termination not found');
    if (term.status === 'COMPLETED') throw new BadRequestException('Cannot cancel a completed termination');

    // Hợp đồng có thể đã ở EXPIRING (không chỉ ACTIVE) trước khi initiate() chuyển sang
    // TERMINATING — khôi phục đúng theo endDate thay vì luôn set cứng ACTIVE.
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, select: { endDate: true } });
    const now = new Date();
    const expiringThreshold = new Date(now);
    expiringThreshold.setDate(expiringThreshold.getDate() + 90);
    const restoredStatus = !contract || contract.endDate < now
      ? ContractStatus.EXPIRED
      : contract.endDate <= expiringThreshold
      ? ContractStatus.EXPIRING
      : ContractStatus.ACTIVE;

    await this.prisma.$transaction([
      this.prisma.contractTermination.update({ where: { contractId }, data: { status: 'CANCELLED' } }),
      this.prisma.contract.update({ where: { id: contractId }, data: { status: restoredStatus } }),
    ]);

    return { message: 'Termination cancelled' };
  }
}
