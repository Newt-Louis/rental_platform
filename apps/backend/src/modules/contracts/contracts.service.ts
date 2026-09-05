import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { ContractStatus, UnitStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { ContractEventsService } from './contract-events.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { BillingScheduleService } from '../billing/billing-schedule.service';
import { OutboxService } from '../../common/services/outbox.service';
import { OperationalMetricsService } from '../../common/services/operational-metrics.service';
import { validateContractFileUpload } from './contract-file-validation';

interface CurrentUser {
  id: string;
  role: string;
  tenantId?: string | null;
}

// Ma trận transition hợp lệ — chặn các bước nhảy vô lý (vd TERMINATED→DRAFT) khi đổi status
// qua PATCH /contracts/:id/status. Termination có luồng riêng (ContractTerminationService) nên
// không đi qua bảng này.
const CONTRACT_STATUS_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  // DRAFT→ACTIVE trực tiếp vẫn được phép: UI hiện tại không có bước thao tác riêng cho
  // PENDING_LEGAL/PENDING_SIGNATURE, hợp đồng thường được kích hoạt thẳng từ DRAFT.
  [ContractStatus.DRAFT]: [ContractStatus.PENDING_LEGAL, ContractStatus.ACTIVE],
  [ContractStatus.PENDING_LEGAL]: [ContractStatus.PENDING_SIGNATURE, ContractStatus.DRAFT],
  [ContractStatus.PENDING_SIGNATURE]: [ContractStatus.ACTIVE, ContractStatus.PENDING_LEGAL],
  [ContractStatus.ACTIVE]: [ContractStatus.EXPIRING, ContractStatus.EXPIRED, ContractStatus.TERMINATING],
  [ContractStatus.EXPIRING]: [ContractStatus.ACTIVE, ContractStatus.EXPIRED, ContractStatus.TERMINATING],
  [ContractStatus.EXPIRED]: [],
  [ContractStatus.TERMINATING]: [ContractStatus.TERMINATED, ContractStatus.ACTIVE],
  [ContractStatus.TERMINATED]: [],
};

const CONTRACT_PRE_ACTIVATION_STATUSES: ContractStatus[] = [
  ContractStatus.DRAFT,
  ContractStatus.PENDING_LEGAL,
  ContractStatus.PENDING_SIGNATURE,
];

// Field luôn sửa được trực tiếp, không ảnh hưởng tài chính/pháp lý của hợp đồng.
const CONTRACT_ALWAYS_EDITABLE_FIELDS = ['notes', 'managedById', 'operatingHours', 'periodicChargeTypes'];

// Field tài chính/thời hạn/đối tượng hợp đồng — chỉ sửa trực tiếp được khi hợp đồng chưa ACTIVE
// (còn đang soạn thảo). Sau khi ACTIVE, mọi thay đổi phải đi qua workflow Amendment để có
// audit trail và đồng bộ billing schedule.
const CONTRACT_AMENDMENT_ONLY_FIELDS = [
  'tenantId', 'unitId', 'type', 'proposalId', 'startDate', 'endDate', 'term',
  'rent', 'cam', 'deposit', 'currencyCode', 'billingCycle', 'paymentTerm', 'rentFree', 'escalationPercent',
  'depositLease', 'depositFitout', 'fitoutFee', 'utilityFee', 'afterHoursFee',
];

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private prisma: PrismaService,
    private events: ContractEventsService,
    private unitStatus: UnitStatusService,
    private billingScheduleService: BillingScheduleService,
    private outbox: OutboxService,
    private metrics: OperationalMetricsService,
  ) {}

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        if (error?.code !== 'P2034' || attempt === 3) throw error;
      }
    }
    throw new Error('Serializable transaction retry exhausted');
  }

  async getActivationReadiness(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, isActive: true, deletedAt: true } },
        unit: { select: { id: true, isActive: true, status: true } },
        proposal: {
          select: {
            handoverDate: true,
            openingDate: true,
          },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    const missing: string[] = [];
    if (!contract.isActive || contract.deletedAt) missing.push('Contract record is inactive');
    if (!contract.tenant.isActive || contract.tenant.deletedAt) missing.push('Tenant is inactive');
    if (!contract.unit.isActive) missing.push('Unit is inactive');
    if (contract.unit.status !== UnitStatus.CONTRACTED) {
      missing.push(`Unit must be CONTRACTED before activation (current: ${contract.unit.status})`);
    }
    if (!(contract.startDate instanceof Date) || !(contract.endDate instanceof Date)) {
      missing.push('Contract start and end dates are required');
    } else if (contract.endDate <= contract.startDate) {
      missing.push('Contract end date must be after start date');
    }
    if (contract.rent < 0 || contract.cam < 0 || contract.deposit < 0) {
      missing.push('Contract financial amounts cannot be negative');
    }
    if (contract.paymentTerm < 0) missing.push('Payment term cannot be negative');

    return {
      ready: missing.length === 0,
      missing,
      contract,
    };
  }

  async findAll(query: {
    status?: ContractStatus;
    leaseTermType?: string;
    type?: string;
    tenantId?: string;
    unitId?: string;
    floorId?: string;
    search?: string;
    startDateFrom?: string;
    startDateTo?: string;
    page?: number;
    limit?: number;
    mallIds?: string[];
  }, currentUser?: CurrentUser) {
    const { search, ...filters } = query;
    const page = Math.max(1, +query.page || 1);
    const limit = Math.max(1, +query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = { isActive: true, deletedAt: null };
    if (filters.status === 'PRE_ACTIVE' as any) where.status = { in: [ContractStatus.DRAFT, ContractStatus.PENDING_LEGAL, ContractStatus.PENDING_SIGNATURE] };
    else if (filters.status === 'ENDED' as any) where.status = { in: [ContractStatus.EXPIRED, ContractStatus.TERMINATING, ContractStatus.TERMINATED] };
    else if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (currentUser?.role === 'TENANT') {
      // Không tin tưởng tenantId client gửi lên — luôn ép theo tenant của người đăng nhập.
      where.tenantId = currentUser.tenantId ?? '__none__';
    } else if (filters.tenantId) {
      where.tenantId = filters.tenantId;
    }
    if (filters.unitId) where.unitId = filters.unitId;
    if (query.mallIds || filters.floorId || filters.leaseTermType) where.unit = {
      ...(query.mallIds ? { mallId: { in: query.mallIds } } : {}),
      ...(filters.floorId ? { floorId: filters.floorId } : {}),
      ...(filters.leaseTermType ? { leaseTermType: filters.leaseTermType } : {}),
    };
    if (query.startDateFrom || query.startDateTo) {
      where.startDate = {};
      if (query.startDateFrom) where.startDate.gte = new Date(query.startDateFrom);
      if (query.startDateTo) where.startDate.lte = new Date(query.startDateTo + 'T23:59:59');
    }
    if (search) {
      where.OR = [
        { contractNumber: { contains: search, mode: 'insensitive' } },
        { tenant: { brandName: { contains: search, mode: 'insensitive' } } },
        { unit: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const summaryWhere = { ...where };
    delete summaryWhere.status;
    const [data, total, groupedStatuses] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        skip,
        take: +limit,
        include: {
          tenant: { select: { id: true, brandName: true, companyName: true } },
          unit: { select: { id: true, code: true, name: true, leaseTermType: true, floor: { select: { id: true, name: true, level: true } } } },
          managedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contract.count({ where }),
      this.prisma.contract.groupBy({ by: ['status'], where: summaryWhere, _count: { _all: true } }),
    ]);

    const byStatus = Object.fromEntries(Object.values(ContractStatus).map((value) => [value, 0]));
    groupedStatuses.forEach((row: any) => { byStatus[row.status] = row._count._all; });
    return {
      data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
      summary: { total: groupedStatuses.reduce((sum: number, row: any) => sum + row._count._all, 0), byStatus },
    };
  }

  async findOne(id: string, currentUser?: CurrentUser) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        tenant: true,
        unit: { include: { floor: true, zone: true } },
        managedBy: { select: { id: true, fullName: true, email: true } },
        files: true,
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            leadId: true,
            lead: { select: { id: true, brandName: true, contactName: true, status: true } },
            bookingId: true,
            booking: { select: { id: true, bookingNumber: true, status: true } },
          },
        },
        fitoutProject: { select: { id: true, status: true } },
        invoices: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
        // Cross-module handoff visibility (docs/audit/11-INFORMATION-FLOW.md):
        // Fitout project creation and billing schedule generation already run
        // automatically on contract activation (see FitoutService.
        // handleContractActivated / ContractsService.updateStatus), but the
        // detail screen never surfaced that this had happened — `take: 1` is
        // enough to answer "does a schedule exist yet", not to list it.
        billingSchedule: { select: { id: true }, take: 1 },
      },
    });

    if (!contract) throw new NotFoundException('Contract not found');

    if (currentUser?.role === 'TENANT' && contract.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('Bạn không có quyền xem hợp đồng này');
    }

    return contract;
  }

  async create(dto: CreateContractDto, userId?: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit) throw new NotFoundException('Unit không tồn tại');

    // Chặn sớm trước khi ghi dữ liệu — tránh tạo Contract rồi mới phát hiện transition trạng thái
    // unit không hợp lệ (cùng lớp bug đã sửa ở BookingService.create/SlotsService.createBooking).
    if (!this.unitStatus.canTransition(unit.status, UnitStatus.CONTRACTED)) {
      throw new BadRequestException(
        `Không thể tạo hợp đồng: mặt bằng đang ở trạng thái ${unit.status}, không thể chuyển sang CONTRACTED.`,
      );
    }

    // Một mặt bằng chỉ nên có một hợp đồng còn hiệu lực tại một thời điểm — tránh 2 hợp đồng
    // sống song song trên cùng unit (dẫn đến ghi đè tenantId/lease dates âm thầm khi transition
    // tới cùng trạng thái CONTRACTED lần thứ hai).
    const existingActiveContract = await this.prisma.contract.findFirst({
      where: {
        unitId: dto.unitId,
        isActive: true,
        deletedAt: null,
        status: { notIn: [ContractStatus.EXPIRED, ContractStatus.TERMINATED] },
      },
    });
    if (existingActiveContract) {
      throw new BadRequestException(
        `Mặt bằng này đã có hợp đồng đang hiệu lực (${existingActiveContract.contractNumber}). Cần chấm dứt hợp đồng cũ trước khi tạo hợp đồng mới.`,
      );
    }

    // Currency propagation invariant (docs/program/MULTI_CURRENCY_ARCHITECTURE.md):
    // a Contract created from a Proposal always takes the Proposal's currency —
    // never the client's — so the currency chosen when the deal was negotiated
    // can't silently drift when the contract document is issued. This is
    // resolved server-side and placed after the `...dto` spread below so it
    // structurally wins over anything the client sent.
    let resolvedCurrencyCode = dto.currencyCode ?? 'VND';
    if (dto.proposalId) {
      const proposal = await this.prisma.proposal.findUnique({
        where: { id: dto.proposalId },
        select: { rentCurrency: true },
      });
      if (proposal) resolvedCurrencyCode = proposal.rentCurrency;
    }

    const year = new Date().getFullYear();
    const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
    const contractNumber = `CTR-${year}-${rand}`;

    return this.serializable(async (tx) => {
      const currentUnit = await tx.unit.findUnique({ where: { id: dto.unitId } });
      if (!currentUnit) throw new NotFoundException('Unit không tồn tại');
      if (!this.unitStatus.canTransition(currentUnit.status, UnitStatus.CONTRACTED)) {
        throw new BadRequestException(
          `Không thể tạo hợp đồng: mặt bằng đang ở trạng thái ${currentUnit.status}, không thể chuyển sang CONTRACTED.`,
        );
      }
      const concurrentContract = await tx.contract.findFirst({
        where: {
          unitId: dto.unitId,
          isActive: true,
          deletedAt: null,
          status: { notIn: [ContractStatus.EXPIRED, ContractStatus.TERMINATED] },
        },
      });
      if (concurrentContract) {
        throw new BadRequestException(
          `Mặt bằng này đã có hợp đồng đang hiệu lực (${concurrentContract.contractNumber}). Cần chấm dứt hợp đồng cũ trước khi tạo hợp đồng mới.`,
        );
      }

      const contract = await tx.contract.create({
        data: {
          contractNumber,
          ...dto,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          cam: dto.cam ?? 0,
          currencyCode: resolvedCurrencyCode,
          billingCycle: dto.billingCycle ?? 'MONTHLY',
          paymentTerm: dto.paymentTerm ?? 30,
          rentFree: dto.rentFree ?? 0,
          escalationPercent: dto.escalationPercent ?? 0,
        },
        include: {
          tenant: { select: { id: true, brandName: true } },
          unit: { select: { id: true, code: true, name: true } },
        },
      });

      await this.unitStatus.transition(dto.unitId, UnitStatus.CONTRACTED, {
        userId,
        reason: `Contract ${contractNumber} created`,
        tenantId: dto.tenantId,
        leaseStartDate: new Date(dto.startDate),
        leaseEndDate: new Date(dto.endDate),
      }, tx);

      await this.events.logEvent({
        contractId: contract.id,
        eventType: 'CONTRACT_CREATED',
        title: 'Contract created',
        afterValue: JSON.stringify({ contractNumber: contract.contractNumber, status: contract.status }),
        userId,
      }, tx);

      return contract;
    });
  }

  async update(id: string, dto: Partial<CreateContractDto>, userId?: string) {
    const before = await this.findOne(id);

    const isPreActivation = CONTRACT_PRE_ACTIVATION_STATUSES.includes(before.status);
    const allowedKeys = new Set([
      ...CONTRACT_ALWAYS_EDITABLE_FIELDS,
      ...(isPreActivation ? CONTRACT_AMENDMENT_ONLY_FIELDS : []),
    ]);
    const rejectedKeys = Object.keys(dto).filter((key) => !allowedKeys.has(key));
    if (rejectedKeys.length) {
      throw new BadRequestException(
        isPreActivation
          ? `Không thể sửa trực tiếp các trường: ${rejectedKeys.join(', ')}`
          : `Hợp đồng đã ${before.status} — không thể sửa trực tiếp các trường: ${rejectedKeys.join(', ')}. Vui lòng tạo phụ lục (amendment).`,
      );
    }

    if (dto.unitId && dto.unitId !== before.unitId) {
      const conflict = await this.prisma.contract.findFirst({
        where: {
          id: { not: id },
          unitId: dto.unitId,
          isActive: true,
          deletedAt: null,
          status: { notIn: [ContractStatus.EXPIRED, ContractStatus.TERMINATED] },
        },
      });
      if (conflict) {
        throw new BadRequestException(
          `Mặt bằng này đã có hợp đồng đang hiệu lực (${conflict.contractNumber}).`,
        );
      }
    }

    // Billing Add-in: Phụ thu Phí Quản Lý chỉ áp dụng HĐT Văn phòng (Mall.leaseCategory = OFFICE) —
    // chặn sớm ở đây thay vì để BillingAddInService âm thầm tính phụ thu cho hợp đồng TTTM.
    if (dto.periodicChargeTypes?.includes('MANAGEMENT_FEE_SURCHARGE')) {
      const targetUnitId = dto.unitId ?? before.unitId;
      const unit = await this.prisma.unit.findUnique({ where: { id: targetUnitId }, select: { mall: { select: { leaseCategory: true } } } });
      if (unit?.mall.leaseCategory !== 'OFFICE') {
        throw new BadRequestException('Phụ thu Phí Quản Lý (MANAGEMENT_FEE_SURCHARGE) chỉ áp dụng cho hợp đồng thuộc Mall có leaseCategory = OFFICE.');
      }
    }

    const data: Record<string, unknown> = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({ where: { id }, data: data as any });

      await this.events.logEvent({
        contractId: id,
        eventType: 'CONTRACT_UPDATED',
        title: 'Contract updated',
        beforeValue: JSON.stringify(before),
        afterValue: JSON.stringify(updated),
        userId,
      }, tx);

      return updated;
    });
  }

  /**
   * Phase 3 hardening (docs/program/02-E2E-WORKFLOW.md, backlog #5): activation used to
   * commit `Contract.status = ACTIVE` in one transaction, then call
   * `buildScheduleForContract` afterwards, outside it — a throw there left the contract
   * ACTIVE with no billing schedule and no automatic recovery. Status change, event,
   * outbox-enqueue, and billing-schedule generation now happen inside one Serializable
   * transaction: either the contract activates *with* a schedule, or neither happens.
   */
  async updateStatus(id: string, status: ContractStatus, userId?: string) {
    const readiness = status === ContractStatus.ACTIVE
      ? await this.getActivationReadiness(id)
      : null;
    if (readiness && !readiness.ready) {
      throw new BadRequestException({
        message: 'Contract is not ready for activation',
        missing: readiness.missing,
      });
    }

    const before = readiness?.contract ?? await this.findOne(id);
    if (before.status !== status) {
      const allowed = CONTRACT_STATUS_TRANSITIONS[before.status] ?? [];
      if (!allowed.includes(status)) {
        throw new BadRequestException(`Không thể chuyển hợp đồng từ ${before.status} sang ${status}.`);
      }
    }

    const startedAt = Date.now();
    if (status === ContractStatus.ACTIVE) {
      this.logger.log(JSON.stringify({ event: 'contract.activation.started', contractId: id, actorId: userId ?? null }));
    }
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Re-read inside the transaction: closes the race window between the pre-checks
        // above and here. Under Serializable isolation, two concurrent activations of the
        // same contract resolve to one winner; the loser gets a P2034 conflict, caught below.
        const current = await tx.contract.findUniqueOrThrow({ where: { id } });

        const contract = current.status === status
          ? current
          : await tx.contract.update({ where: { id }, data: { status } });

        if (current.status !== status) {
          await tx.contractEvent.create({
            data: {
              contractId: id,
              eventType: 'STATUS_CHANGED',
              title: `Status changed to ${status}`,
              beforeValue: current.status,
              afterValue: status,
              userId,
            },
          });
        }

        if (status === ContractStatus.ACTIVE) {
          // Idempotent by design: also re-run on a same-status call (e.g. a manual retry
          // after a prior failure here), not just on the first DRAFT→ACTIVE transition —
          // so "activate again" is a safe, effective way to recover a contract that ended
          // up ACTIVE with an incomplete billing schedule under the old, non-atomic path.
          await this.outbox.enqueue(tx, {
            eventKey: `contract:${id}:activated`,
            eventName: 'contract.activated',
            aggregateType: 'CONTRACT',
            aggregateId: id,
            payload: {
              contractId: id,
              tenantId: contract.tenantId,
              unitId: contract.unitId,
              handoverDate: readiness?.contract.proposal?.handoverDate ?? null,
              openingDate: readiness?.contract.proposal?.openingDate ?? null,
            },
          });
          await this.billingScheduleService.buildScheduleForContract(id, tx);
        }

        return contract;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (status === ContractStatus.ACTIVE) {
        this.logger.log(JSON.stringify({
          event: 'contract.activation.completed',
          contractId: id,
          actorId: userId ?? null,
          durationMs: Date.now() - startedAt,
        }));
      }
      return result;
    } catch (error: any) {
      // Lost a concurrent-activation race: the winning transaction already moved the
      // contract to `status`. Resolve to that outcome instead of surfacing a raw
      // serialization error — same idempotent-retry pattern used in
      // ProposalsService.createContractFromProposal for its P2002 case.
      if (error?.code === 'P2034') {
        const winner = await this.prisma.contract.findUnique({ where: { id } });
        if (winner?.status === status) {
          this.metrics.increment('duplicate_transition_blocked_total');
          return winner;
        }
      }
      if (status === ContractStatus.ACTIVE) {
        this.metrics.increment('contract_activation_failure_total');
        this.logger.warn(JSON.stringify({
          event: 'contract.activation.failed',
          contractId: id,
          actorId: userId ?? null,
          durationMs: Date.now() - startedAt,
          error: error?.message ?? String(error),
        }));
      }
      throw error;
    }
  }

  /**
   * Tự động chuyển ACTIVE→EXPIRING (còn ≤90 ngày) và ACTIVE/EXPIRING→EXPIRED (đã qua endDate).
   * Gọi từ ContractExpiryStatusScheduler mỗi ngày — trước đây không có gì thực hiện việc này,
   * khiến hợp đồng hết hạn vẫn giữ status ACTIVE vô thời hạn.
   */
  async autoTransitionExpiryStatuses(): Promise<{ toExpiring: number; toExpired: number }> {
    const now = new Date();
    const expiringThreshold = new Date(now);
    expiringThreshold.setDate(expiringThreshold.getDate() + 90);

    const toExpiring = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: ContractStatus.ACTIVE,
        endDate: { gte: now, lte: expiringThreshold },
      },
      select: { id: true },
    });
    for (const c of toExpiring) {
      await this.updateStatus(c.id, ContractStatus.EXPIRING);
    }

    const toExpired = await this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        endDate: { lt: now },
      },
      select: { id: true },
    });
    for (const c of toExpired) {
      await this.updateStatus(c.id, ContractStatus.EXPIRED);
    }

    return { toExpiring: toExpiring.length, toExpired: toExpired.length };
  }

  async getExpiring(days = 90, mallIds?: string[], leaseTermType?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    return this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        endDate: { gte: today, lte: cutoff },
        ...(leaseTermType ? { unit: { leaseTermType: leaseTermType as any } } : {}),
        ...(mallIds ? { OR: [
          { unit: { mallId: { in: mallIds } } },
          { unit: { floor: { mallId: { in: mallIds } } } },
        ] } : {}),
      },
      include: {
        tenant: { select: { id: true, brandName: true, contactEmail: true, contactPhone: true } },
        unit: { select: { id: true, code: true, name: true, leaseTermType: true } },
      },
      orderBy: { endDate: 'asc' },
    });
  }

  async uploadFile(contractId: string, file: Express.Multer.File, uploadedById: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');
    validateContractFileUpload(file);

    const fs = await import('fs/promises');
    const path = await import('path');
    const dir = path.join(process.env.UPLOAD_DIR?.replace('/unit-media', '') ?? 'uploads', 'contracts', contractId);
    await fs.mkdir(dir, { recursive: true });

    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const dest = path.join(dir, safeName);
    await fs.writeFile(dest, file.buffer);

    const filePath = `/uploads/contracts/${contractId}/${safeName}`;
    return this.prisma.contractFile.create({
      data: {
        contractId,
        fileName: file.originalname,
        filePath,
        fileType: file.mimetype,
        fileSize: file.size,
        uploadedById,
      },
    });
  }

  async listFiles(contractId: string) {
    return this.prisma.contractFile.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteFile(contractId: string, fileId: string) {
    const file = await this.prisma.contractFile.findFirst({ where: { id: fileId, contractId } });
    if (!file) throw new NotFoundException('File not found');
    if (file.signedAt) {
      throw new BadRequestException('Không thể xóa tài liệu đã ký điện tử.');
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const abs = path.join(process.env.UPLOAD_DIR?.replace('/unit-media', '') ?? 'uploads', file.filePath.replace('/uploads/', ''));
      await fs.unlink(abs);
    } catch (_) { /* file may already be gone */ }

    await this.prisma.contractFile.delete({ where: { id: fileId } });
    return { deleted: true };
  }

  private async hashFileOnDisk(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const abs = path.join(process.env.UPLOAD_DIR?.replace('/unit-media', '') ?? 'uploads', filePath.replace('/uploads/', ''));
    const bytes = await fs.readFile(abs);
    return crypto.createHash('sha256').update(bytes).digest('hex');
  }

  async signFile(contractId: string, fileId: string, signerName: string, signerRole: string, signedById: string) {
    const file = await this.prisma.contractFile.findFirst({ where: { id: fileId, contractId } });
    if (!file) throw new NotFoundException('Contract file not found');
    if (file.signedAt) {
      throw new BadRequestException('Tài liệu đã được ký trước đó — không thể ký lại hoặc ghi đè chữ ký.');
    }

    // Hash tính từ nội dung byte thực của file (không phải từ metadata) — nếu file vật lý bị
    // thay thế sau khi ký, verifySignature() dưới đây sẽ phát hiện sai lệch hash.
    const sha256Hash = await this.hashFileOnDisk(file.filePath);
    const signedAt = new Date();
    const verifyCode = crypto.randomBytes(8).toString('hex').toUpperCase();

    return this.prisma.contractFile.update({
      where: { id: fileId },
      data: { sha256Hash, signedAt, signerName, signerRole, verifyCode },
    });
  }

  async verifySignature(verifyCode: string) {
    const file = await this.prisma.contractFile.findUnique({
      where: { verifyCode },
      include: { contract: { select: { id: true, contractNumber: true, tenantId: true } } },
    });
    if (!file) {
      return { valid: false, message: 'Mã xác thực không tồn tại hoặc đã hết hiệu lực' };
    }

    let currentHash: string | null = null;
    try {
      currentHash = await this.hashFileOnDisk(file.filePath);
    } catch {
      currentHash = null;
    }
    if (currentHash !== file.sha256Hash) {
      return {
        valid: false,
        message: 'Nội dung tài liệu đã bị thay đổi sau khi ký hoặc không đọc được file gốc — chữ ký không còn hợp lệ',
      };
    }

    return {
      valid: true,
      fileName: file.fileName,
      contractNumber: file.contract.contractNumber,
      signerName: file.signerName,
      signerRole: file.signerRole,
      signedAt: file.signedAt,
      sha256Hash: file.sha256Hash,
      verifyCode: file.verifyCode,
      message: 'Tài liệu hợp lệ — chữ ký điện tử đã được xác thực',
    };
  }
}
