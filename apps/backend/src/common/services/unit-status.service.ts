import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitHistoryType, UnitStatus } from '@prisma/client';

/** Allowed unit status transitions for automated leasing lifecycle */
const ALLOWED_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  [UnitStatus.VACANT]: [UnitStatus.BOOKING, UnitStatus.NEGOTIATING],
  [UnitStatus.BOOKING]: [UnitStatus.VACANT, UnitStatus.NEGOTIATING, UnitStatus.CONTRACTED],
  [UnitStatus.NEGOTIATING]: [UnitStatus.VACANT, UnitStatus.BOOKING, UnitStatus.CONTRACTED],
  [UnitStatus.CONTRACTED]: [UnitStatus.UNDER_FITOUT, UnitStatus.OCCUPIED, UnitStatus.VACANT],
  [UnitStatus.UNDER_FITOUT]: [UnitStatus.OCCUPIED, UnitStatus.VACANT],
  [UnitStatus.OCCUPIED]: [UnitStatus.VACANT, UnitStatus.UNDER_FITOUT],
};

/** Trạng thái mặt bằng đã cam kết cho một khách thuê chính thức — không nên nhận thêm booking mới chồng lên. */
const COMMITTED_STATUSES: UnitStatus[] = [UnitStatus.OCCUPIED, UnitStatus.CONTRACTED, UnitStatus.UNDER_FITOUT];

export interface UnitTransitionOptions {
  force?: boolean;
  userId?: string;
  reason?: string;
  tenantId?: string;
  leaseStartDate?: Date;
  leaseEndDate?: Date;
}

@Injectable()
export class UnitStatusService {
  constructor(private prisma: PrismaService) {}

  canTransition(from: UnitStatus, to: UnitStatus): boolean {
    if (from === to) return true;
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
  }

  isCommittedToTenant(status: UnitStatus): boolean {
    return COMMITTED_STATUSES.includes(status);
  }

  async transition(unitId: string, toStatus: UnitStatus, options: UnitTransitionOptions = {}) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');

    if (unit.status !== toStatus) {
      if (!options.force && !this.canTransition(unit.status, toStatus)) {
        throw new BadRequestException(
          `Invalid unit status transition: ${unit.status} → ${toStatus}`,
        );
      }
    }

    const data: Record<string, unknown> = { status: toStatus };
    if (options.tenantId !== undefined) data.tenantId = options.tenantId;
    if (options.leaseStartDate) data.leaseStartDate = options.leaseStartDate;
    if (options.leaseEndDate) data.leaseEndDate = options.leaseEndDate;

    if (toStatus === UnitStatus.VACANT) {
      data.tenantId = null;
      data.leaseStartDate = null;
      data.leaseEndDate = null;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.unit.update({ where: { id: unitId }, data }),
      this.prisma.unitHistory.create({
        data: {
          unitId,
          changeType: UnitHistoryType.STATUS_CHANGE,
          fieldName: 'status',
          oldValue: unit.status,
          newValue: toStatus,
          changedById: options.userId,
          notes: options.reason,
        },
      }),
    ]);

    return updated;
  }
}
