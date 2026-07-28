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
  [UnitStatus.MERGED]: [],
};

/** Trạng thái mặt bằng đã cam kết cho một khách thuê chính thức — không nên nhận thêm booking mới chồng lên. */
const COMMITTED_STATUSES: UnitStatus[] = [UnitStatus.OCCUPIED, UnitStatus.CONTRACTED, UnitStatus.UNDER_FITOUT];

/**
 * GAP #20 — Trạng thái bị khoá hoàn toàn, không nhận bất kỳ booking mới nào.
 * - NEGOTIATING: đang thương thảo nghiêm túc, không cho phép thêm khách khác xếp hàng.
 * - MERGED: mặt bằng đã bị gộp vào mặt bằng khác, không còn tồn tại độc lập.
 */
const LOCKED_FOR_BOOKING: UnitStatus[] = [
  UnitStatus.NEGOTIATING,
  UnitStatus.MERGED,
  ...COMMITTED_STATUSES,
];

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

  /** GAP #20 — true nếu unit hoàn toàn bị khoá, không nhận booking mới */
  isLockedForBooking(status: UnitStatus): boolean {
    return LOCKED_FOR_BOOKING.includes(status);
  }

  async transition(unitId: string, toStatus: UnitStatus, options: UnitTransitionOptions = {}) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');

    const isLowAvailabilityStatus = ([UnitStatus.VACANT, UnitStatus.BOOKING, UnitStatus.NEGOTIATING] as UnitStatus[])
      .includes(toStatus);
    if (unit.status !== toStatus && isLowAvailabilityStatus) {
      const liveContract = await this.prisma.contract.findFirst({
        where: {
          unitId,
          isActive: true,
          deletedAt: null,
          status: { notIn: ['EXPIRED', 'TERMINATED'] },
        },
        select: { contractNumber: true },
      });
      if (liveContract) {
        throw new BadRequestException(
          `Unit has live contract ${liveContract.contractNumber}; cannot transition to ${toStatus}`,
        );
      }
    }

    if (unit.status !== toStatus && toStatus === UnitStatus.BOOKING) {
      const activeBooking = await this.prisma.unitBooking.findFirst({
        where: { unitId, isActive: true, status: { in: ['ACTIVE', 'PENDING'] } },
        select: { id: true },
      });
      if (!activeBooking) {
        throw new BadRequestException('Cannot set BOOKING without an active booking');
      }
    }

    if (unit.status !== toStatus && toStatus === UnitStatus.VACANT) {
      const activeBooking = await this.prisma.unitBooking.findFirst({
        where: { unitId, isActive: true, status: { in: ['ACTIVE', 'PENDING'] } },
        select: { id: true },
      });
      if (activeBooking) {
        throw new BadRequestException('Cannot set VACANT while an active booking exists');
      }
    }

    if (unit.status !== toStatus && COMMITTED_STATUSES.includes(toStatus)) {
      const liveContract = await this.prisma.contract.findFirst({
        where: {
          unitId,
          isActive: true,
          deletedAt: null,
          status: { notIn: ['EXPIRED', 'TERMINATED'] },
        },
        select: { id: true },
      });
      if (!liveContract) {
        throw new BadRequestException(`Cannot set ${toStatus} without a live contract`);
      }
    }

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
      data.vacantSince = new Date();
    } else {
      data.vacantSince = null;
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
