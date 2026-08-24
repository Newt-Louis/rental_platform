import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { EmailService } from '../notifications/email.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private prisma: PrismaService, private emailService: EmailService) {}

  async findAll(query: PaginationDto & { category?: string; mallIds?: string[]; tenancyStatus?: string; leaseTermType?: string }) {
    const { page = 1, limit = 20, search, category } = query;
    const skip = (+page - 1) * +limit;

    const where: any = { isActive: true, deletedAt: null };
    if (category) where.category = category;
    const scopeAnd: any[] = [];
    if (query.mallIds) scopeAnd.push({ OR: [
      { contracts: { some: { isActive: true, unit: { mallId: { in: query.mallIds } } } } },
      { proposals: { some: { isActive: true, unit: { mallId: { in: query.mallIds } } } } },
      { occupiedUnits: { some: { mallId: { in: query.mallIds } } } },
    ] });
    if (query.leaseTermType) scopeAnd.push({ contracts: { some: {
      isActive: true, deletedAt: null, unit: { leaseTermType: query.leaseTermType },
    } } });
    const activeContractScope: any = { isActive: true, deletedAt: null, status: { in: ['ACTIVE', 'EXPIRING'] } };
    const summaryWhere: any = { ...where, ...(scopeAnd.length ? { AND: scopeAnd } : {}) };
    if (query.tenancyStatus === 'ACTIVE_CONTRACT') scopeAnd.push({ contracts: { some: activeContractScope } });
    if (query.tenancyStatus === 'NO_ACTIVE_CONTRACT') scopeAnd.push({ NOT: { contracts: { some: activeContractScope } } });
    if (scopeAnd.length) where.AND = scopeAnd;
    if (search) {
      where.OR = [
        { brandName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total, activeCount] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: +limit,
        include: {
          contracts: {
            where: activeContractScope,
            select: { id: true, status: true, unit: { select: { leaseTermType: true } } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: { contracts: true, tickets: true, invoices: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.count({ where: { AND: [summaryWhere, { contracts: { some: activeContractScope } }] } }),
    ]);

    const summaryTotal = await this.prisma.tenant.count({ where: summaryWhere });
    return {
      data, total, activeCount, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
      summary: { total: summaryTotal, activeContract: activeCount, noActiveContract: Math.max(0, summaryTotal - activeCount) },
    };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        occupiedUnits: {
          include: {
            floor: { select: { name: true, level: true } },
            zone: { select: { name: true, code: true } },
          },
        },
        contracts: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            unit: { select: { code: true, name: true } },
          },
        },
        invoices: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        tickets: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { contracts: true, tickets: true, invoices: true, leads: true },
        },
        portalUsers: {
          where: { deletedAt: null },
          select: {
            id: true, email: true, fullName: true, isActive: true,
            mustChangePassword: true, inviteExpiresAt: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    if (dto.taxCode) {
      const existing = await this.prisma.tenant.findUnique({ where: { taxCode: dto.taxCode } });
      if (existing) throw new ConflictException('Tax code already exists');
    }

    const email = dto.contactEmail?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email liên hệ là bắt buộc để tự động tạo tài khoản Tenant Portal');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser && (existingUser.role !== Role.TENANT || existingUser.tenantId)) {
      throw new ConflictException('Email đã được sử dụng bởi một tài khoản khác');
    }

    const invitation = this.createInvitation();
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const tenantData = { ...dto, contactEmail: email, isPortalUser: true };

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({ data: tenantData });
      const portalUserData = {
        fullName: dto.contactName?.trim() || dto.brandName,
        phone: dto.contactPhone,
        role: Role.TENANT,
        tenantId: created.id,
        isActive: true,
        deletedAt: null,
        password: randomPassword,
        inviteTokenHash: invitation.tokenHash,
        inviteExpiresAt: invitation.expiresAt,
        mustChangePassword: true,
      };

      if (existingUser) {
        await tx.user.update({ where: { id: existingUser.id }, data: portalUserData });
      } else {
        await tx.user.create({ data: { email, ...portalUserData } });
      }
      return created;
    });

    const emailSent = await this.sendPortalInvitation(email, invitation.rawToken, dto.contactName || dto.brandName);
    return { ...tenant, portalAccount: { email, emailSent, activationExpiresAt: invitation.expiresAt } };
  }

  async update(id: string, dto: Partial<CreateTenantDto>) {
    await this.findOne(id);
    const { isPortalUser: _legacyPortalFlag, ...tenantData } = dto;
    return this.prisma.tenant.update({ where: { id }, data: tenantData });
  }

  async resetPortalPassword(id: string) {
    const { tenant, portalUser } = await this.getPortalAccount(id);
    const invitation = this.createInvitation();
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    await this.prisma.user.update({
      where: { id: portalUser.id },
      data: {
        password: randomPassword,
        inviteTokenHash: invitation.tokenHash,
        inviteExpiresAt: invitation.expiresAt,
        mustChangePassword: true,
        isActive: true,
      },
    });
    const emailSent = await this.sendPortalInvitation(portalUser.email, invitation.rawToken, tenant.contactName || tenant.brandName, true);
    return { email: portalUser.email, emailSent, activationExpiresAt: invitation.expiresAt };
  }

  async createPortalAccount(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { portalUsers: { where: { deletedAt: null }, take: 1 } },
    });
    if (!tenant || tenant.deletedAt) throw new NotFoundException(`Tenant ${id} not found`);
    if (tenant.portalUsers.length) throw new ConflictException('Khách thuê đã có tài khoản Tenant Portal');

    const email = tenant.contactEmail?.trim().toLowerCase();
    if (!email) throw new BadRequestException('Vui lòng cập nhật email liên hệ trước khi tạo tài khoản Portal');
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser && (existingUser.role !== Role.TENANT || existingUser.tenantId)) {
      throw new ConflictException('Email đã được sử dụng bởi một tài khoản khác');
    }

    const invitation = this.createInvitation();
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const portalUserData = {
      fullName: tenant.contactName?.trim() || tenant.brandName,
      phone: tenant.contactPhone,
      role: Role.TENANT,
      tenantId: tenant.id,
      isActive: true,
      deletedAt: null,
      password: randomPassword,
      inviteTokenHash: invitation.tokenHash,
      inviteExpiresAt: invitation.expiresAt,
      mustChangePassword: true,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id }, data: { isPortalUser: true, contactEmail: email } });
      if (existingUser) await tx.user.update({ where: { id: existingUser.id }, data: portalUserData });
      else await tx.user.create({ data: { email, ...portalUserData } });
    });
    const emailSent = await this.sendPortalInvitation(email, invitation.rawToken, tenant.contactName || tenant.brandName);
    return { email, emailSent, activationExpiresAt: invitation.expiresAt };
  }

  async setPortalPassword(id: string, newPassword: string) {
    const { portalUser } = await this.getPortalAccount(id);
    await this.prisma.user.update({
      where: { id: portalUser.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        inviteTokenHash: null,
        inviteExpiresAt: null,
        mustChangePassword: false,
        isActive: true,
      },
    });
    return { email: portalUser.email, passwordUpdated: true };
  }

  async remove(id: string) {
    await this.findOne(id);
    const activeContracts = await this.prisma.contract.count({
      where: { tenantId: id, isActive: true, deletedAt: null, status: { notIn: ['EXPIRED', 'TERMINATED'] } },
    });
    if (activeContracts > 0) throw new BadRequestException('Cannot delete a tenant with active contracts');
    await this.prisma.tenant.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: 'Tenant deleted successfully' };
  }

  private createInvitation() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    return {
      rawToken,
      tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    };
  }

  private async getPortalAccount(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { portalUsers: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!tenant || tenant.deletedAt) throw new NotFoundException(`Tenant ${id} not found`);
    const portalUser = tenant.portalUsers[0];
    if (!portalUser) throw new BadRequestException('Khách thuê chưa có tài khoản Tenant Portal');
    return { tenant, portalUser };
  }

  private async sendPortalInvitation(email: string, token: string, contactName: string, isReset = false) {
    const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/activate?token=${encodeURIComponent(token)}`;
    try {
      const result = await this.emailService.sendMail({
        to: email,
        subject: isReset ? '[THISO] Đặt lại mật khẩu Tenant Portal' : '[THISO] Kích hoạt tài khoản Tenant Portal',
        html: `<div style="font-family:Arial;max-width:600px;margin:auto"><h2>THISO Tenant Portal</h2><p>Xin chào ${contactName},</p><p>${isReset ? 'Quản trị viên đã yêu cầu đặt lại mật khẩu tài khoản của Quý khách.' : 'Tài khoản Portal của Quý khách đã được tạo tự động.'}</p><p><a href="${portalUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px">${isReset ? 'Đặt mật khẩu mới' : 'Kích hoạt tài khoản'}</a></p><p>Liên kết có hiệu lực trong 72 giờ.</p></div>`,
      });
      return !('skipped' in result);
    } catch (error) {
      this.logger.warn(`Không thể gửi email Tenant Portal đến ${email}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }
}
