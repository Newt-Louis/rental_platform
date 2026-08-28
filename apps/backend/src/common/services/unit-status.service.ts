import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, UnitHistoryType, UnitStatus } from '@prisma/client';

/** Either the top-level PrismaService or an interactive-transaction client
 * (`prisma.$transaction(async (tx) => ...)`). Lets callers that need this
 * transition to be atomic with their own other writes (e.g. Proposal→Contract,
 * docs/security/... data-integrity hardening) pass their `tx` through instead
 * of this service opening a second, independent transaction. */
type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

/** Allowed unit status transitions for automated leasing lifecycle */
const ALLOWED_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  [UnitStatus.VACANT]: [UnitStatus.OFFERING, UnitStatus.BOOKING, UnitStatus.NEGOTIATING],
  [UnitStatus.OFFERING]: [UnitStatus.VACANT, UnitStatus.BOOKING, UnitStatus.NEGOTIATING],
  [UnitStatus.BOOKING]: [UnitStatus.VACANT, UnitStatus.OFFERING, UnitStatus.NEGOTIATING, UnitStatus.CONTRACTED],
  [UnitStatus.NEGOTIATING]: [UnitStatus.VACANT, UnitStatus.OFFERING, UnitStatus.BOOKING, UnitStatus.CONTRACTED],
  // CONTRACTED→LIQUIDATED and UNDER_FITOUT→LIQUIDATED: a Contract goes ACTIVE (and is
  // therefore terminable via ContractTerminationService.initiate) as soon as the Unit
  // reaches CONTRACTED — long before fit-out finishes and the Unit ever reaches OCCUPIED.
  // Termination-during-fitout (e.g. tenant default before opening) must be representable.
  [UnitStatus.CONTRACTED]: [UnitStatus.UNDER_FITOUT, UnitStatus.OCCUPIED, UnitStatus.VACANT, UnitStatus.LIQUIDATED],
  [UnitStatus.UNDER_FITOUT]: [UnitStatus.OCCUPIED, UnitStatus.VACANT, UnitStatus.LIQUIDATED],
  [UnitStatus.OCCUPIED]: [UnitStatus.VACANT, UnitStatus.UNDER_FITOUT, UnitStatus.LIQUIDATED],
  // LIQUIDATED can resolve back to whichever of the three committed states it came from
  // (contract-termination cancel restores the captured pre-termination status) or to VACANT
  // once termination completes.
  [UnitStatus.LIQUIDATED]: [UnitStatus.CONTRACTED, UnitStatus.UNDER_FITOUT, UnitStatus.OCCUPIED, UnitStatus.VACANT],
  [UnitStatus.MERGED]: [],
};

/** Trạng thái mặt bằng đã cam kết cho một khách thuê chính thức — không nên nhận thêm booking mới chồng lên.
 * LIQUIDATED nằm trong nhóm này vì hợp đồng vẫn còn hiệu lực (đang TERMINATING) cho tới khi complete(). */
const COMMITTED_STATUSES: UnitStatus[] = [
  UnitStatus.OCCUPIED,
  UnitStatus.CONTRACTED,
  UnitStatus.UNDER_FITOUT,
  UnitStatus.LIQUIDATED,
];

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
  /**
   * CR-101 Phase 3E / INV-AUTH-006 — the Mall the caller's own already-validated
   * business entity belongs to (e.g. a Booking's current unit.mallId before a
   * unit reassignment). When provided, must match the target Unit's actual
   * mallId or the transition is denied before any mutation. Never populate this
   * from unvalidated client input — only from a value the caller itself derived
   * from a trusted, already-persisted record. Omit when the caller has no prior
   * entity to compare against (e.g. creating a brand-new Booking/Contract
   * against `unitId` directly — there is nothing to be inconsistent with yet).
   */
  expectedMallId?: string;
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

  async transition(
    unitId: string,
    toStatus: UnitStatus,
    options: UnitTransitionOptions = {},
    client: PrismaClientOrTx = this.prisma,
  ) {
    const unit = await client.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');

    // INV-AUTH-006 — entity integrity, not user-role policy: the caller's own
    // already-validated business entity must belong to the same Mall as the
    // Unit it's about to mutate. Checked first, before any other validation or
    // write, so a mismatch never leaves a partial side effect (history, queue
    // promotion, etc.) behind.
    if (options.expectedMallId && options.expectedMallId !== unit.mallId) {
      throw new ForbiddenException(
        'Unit does not belong to the expected mall for this operation',
      );
    }

    const isLowAvailabilityStatus = ([UnitStatus.VACANT, UnitStatus.OFFERING, UnitStatus.BOOKING, UnitStatus.NEGOTIATING] as UnitStatus[])
      .includes(toStatus);
    if (unit.status !== toStatus && isLowAvailabilityStatus) {
      const liveContract = await client.contract.findFirst({
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
      const activeBooking = await client.unitBooking.findFirst({
        where: { unitId, isActive: true, status: { in: ['ACTIVE', 'PENDING'] } },
        select: { id: true },
      });
      if (!activeBooking) {
        throw new BadRequestException('Cannot set BOOKING without an active booking');
      }
    }

    if (unit.status !== toStatus && toStatus === UnitStatus.VACANT) {
      const activeBooking = await client.unitBooking.findFirst({
        where: { unitId, isActive: true, status: { in: ['ACTIVE', 'PENDING'] } },
        select: { id: true },
      });
      if (activeBooking) {
        throw new BadRequestException('Cannot set VACANT while an active booking exists');
      }
    }

    if (unit.status !== toStatus && COMMITTED_STATUSES.includes(toStatus)) {
      const liveContract = await client.contract.findFirst({
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

    const historyEntry = {
      unitId,
      changeType: UnitHistoryType.STATUS_CHANGE,
      fieldName: 'status',
      oldValue: unit.status,
      newValue: toStatus,
      changedById: options.userId,
      notes: options.reason,
    };

    // When called with an outer `tx` (an interactive transaction we're already
    // inside — e.g. Proposal→Contract), just run both writes on it: they're
    // already atomic with the caller's other writes, and Prisma doesn't
    // support opening a nested $transaction on a transaction client. The
    // standalone (`client === this.prisma`) case keeps its own transaction,
    // unchanged from before this method became composable.
    if (client === this.prisma) {
      const [updated] = await this.prisma.$transaction([
        this.prisma.unit.update({ where: { id: unitId }, data }),
        this.prisma.unitHistory.create({ data: historyEntry }),
      ]);
      return updated;
    }

    const updated = await client.unit.update({ where: { id: unitId }, data });
    await client.unitHistory.create({ data: historyEntry });
    return updated;
  }
}
