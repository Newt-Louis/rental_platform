import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { ContractStatus, UnitStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { ContractEventsService } from './contract-events.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface CurrentUser {
  id: string;
  role: string;
  tenantId?: string | null;
}

@Injectable()
export class ContractsService {
  constructor(
    private prisma: PrismaService,
    private events: ContractEventsService,
    private unitStatus: UnitStatusService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAll(query: {
    status?: ContractStatus;
    tenantId?: string;
    unitId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }, currentUser?: CurrentUser) {
    const { search, ...filters } = query;
    const page = Math.max(1, +query.page || 1);
    const limit = Math.max(1, +query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = { isActive: true, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (currentUser?.role === 'TENANT') {
      // Không tin tưởng tenantId client gửi lên — luôn ép theo tenant của người đăng nhập.
      where.tenantId = currentUser.tenantId ?? '__none__';
    } else if (filters.tenantId) {
      where.tenantId = filters.tenantId;
    }
    if (filters.unitId) where.unitId = filters.unitId;
    if (search) {
      where.OR = [
        { contractNumber: { contains: search, mode: 'insensitive' } },
        { tenant: { brandName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        skip,
        take: +limit,
        include: {
          tenant: { select: { id: true, brandName: true, companyName: true } },
          unit: { select: { id: true, code: true, name: true, floor: { select: { name: true } } } },
          managedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
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
          },
        },
        fitoutProject: { select: { id: true, status: true } },
        invoices: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
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

    const year = new Date().getFullYear();
    const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
    const contractNumber = `CTR-${year}-${rand}`;

    const contract = await this.prisma.contract.create({
      data: {
        contractNumber,
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        cam: dto.cam ?? 0,
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
    });

    await this.events.logEvent({
      contractId: contract.id,
      eventType: 'CONTRACT_CREATED',
      title: 'Contract created',
      afterValue: JSON.stringify({ contractNumber: contract.contractNumber, status: contract.status }),
      userId,
    });

    return contract;
  }

  async update(id: string, dto: Partial<CreateContractDto>, userId?: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.contract.update({ where: { id }, data: dto as any });

    await this.events.logEvent({
      contractId: id,
      eventType: 'CONTRACT_UPDATED',
      title: 'Contract updated',
      beforeValue: JSON.stringify(before),
      afterValue: JSON.stringify(updated),
      userId,
    });

    return updated;
  }

  async updateStatus(id: string, status: ContractStatus, userId?: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.contract.update({ where: { id }, data: { status } });

    await this.events.logEvent({
      contractId: id,
      eventType: 'STATUS_CHANGED',
      title: `Status changed to ${status}`,
      beforeValue: before.status,
      afterValue: status,
      userId,
    });

    if (status === ContractStatus.ACTIVE && before.status !== ContractStatus.ACTIVE) {
      const withProposal = await this.prisma.contract.findUnique({
        where: { id },
        include: { proposal: { select: { fitoutDays: true, handoverDate: true, openingDate: true } } },
      });
      this.eventEmitter.emit('contract.activated', {
        contractId: id,
        tenantId: updated.tenantId,
        unitId: updated.unitId,
        handoverDate: withProposal?.proposal?.handoverDate ?? null,
        openingDate: withProposal?.proposal?.openingDate ?? null,
      });
    }

    return updated;
  }

  async getExpiring(days = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    return this.prisma.contract.findMany({
      where: {
        isActive: true,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
        endDate: { lte: cutoff },
      },
      include: {
        tenant: { select: { id: true, brandName: true, contactEmail: true, contactPhone: true } },
        unit: { select: { id: true, code: true, name: true } },
      },
      orderBy: { endDate: 'asc' },
    });
  }

  async uploadFile(contractId: string, file: Express.Multer.File, uploadedById: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');

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

    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const abs = path.join(process.env.UPLOAD_DIR?.replace('/unit-media', '') ?? 'uploads', file.filePath.replace('/uploads/', ''));
      await fs.unlink(abs);
    } catch (_) { /* file may already be gone */ }

    await this.prisma.contractFile.delete({ where: { id: fileId } });
    return { deleted: true };
  }

  async signFile(contractId: string, fileId: string, signerName: string, signerRole: string, signedById: string) {
    const file = await this.prisma.contractFile.findFirst({ where: { id: fileId, contractId } });
    if (!file) throw new NotFoundException('Contract file not found');

    const signedAt = new Date();
    // SHA-256 hash: combines fileId + contractId + signer + timestamp for immutability
    const payload = `${fileId}:${contractId}:${signerName}:${signedById}:${signedAt.toISOString()}`;
    const sha256Hash = crypto.createHash('sha256').update(payload).digest('hex');
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
