import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { EmailService, TrackedEmailOptions } from '../notifications/email.service';
import { appUrl, emailSubject } from '../notifications/email-design-system';
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

    const prepared = await this.prisma.$transaction(async (tx) => {
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
      const mail = this.portalInvitationMail(
        email,
        invitation.rawToken,
        dto.contactName || dto.brandName,
        false,
        created.id,
        `portal-activation:${created.id}:${Date.now()}`,
      );
      const delivery = await this.emailService.prepareTrackedDelivery(tx, mail);
      return { tenant: created, mail, deliveryId: delivery.id };
    });

    const emailSent = (await this.sendPreparedPortalInvitation(prepared.mail, prepared.deliveryId)).sent;
    return { ...prepared.tenant, portalAccount: { email, emailSent, activationExpiresAt: invitation.expiresAt } };
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

    const mail = this.portalInvitationMail(
      portalUser.email,
      invitation.rawToken,
      tenant.contactName || tenant.brandName,
      true,
      tenant.id,
      `portal-reset:${tenant.id}:${Date.now()}`,
    );
    const deliveryId = await this.prisma.$transaction(async (tx) => {
      const delivery = await this.emailService.prepareTrackedDelivery(tx, mail);
      await tx.user.update({
        where: { id: portalUser.id },
        data: {
          password: randomPassword,
          inviteTokenHash: invitation.tokenHash,
          inviteExpiresAt: invitation.expiresAt,
          mustChangePassword: true,
          isActive: true,
        },
      });
      return delivery.id;
    });
    const emailSent = (await this.sendPreparedPortalInvitation(mail, deliveryId)).sent;
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

    const prepared = await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id }, data: { isPortalUser: true, contactEmail: email } });
      if (existingUser) await tx.user.update({ where: { id: existingUser.id }, data: portalUserData });
      else await tx.user.create({ data: { email, ...portalUserData } });
      const mail = this.portalInvitationMail(
        email,
        invitation.rawToken,
        tenant.contactName || tenant.brandName,
        false,
        tenant.id,
        `portal-activation:${tenant.id}:${Date.now()}`,
      );
      const delivery = await this.emailService.prepareTrackedDelivery(tx, mail);
      return { mail, deliveryId: delivery.id };
    });
    const emailSent = (await this.sendPreparedPortalInvitation(prepared.mail, prepared.deliveryId)).sent;
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

  async reissuePortalActivation(
    tenantId: string,
    originalDeliveryId: string,
    operationId: string,
    mallId?: string,
  ) {
    const { tenant, portalUser } = await this.getPortalAccount(tenantId);
    if (!portalUser.mustChangePassword) {
      throw new BadRequestException('TÃ i khoáº£n Tenant Portal Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t');
    }
    const normalizedOperationId = operationId?.trim();
    if (!normalizedOperationId || normalizedOperationId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalizedOperationId)) {
      throw new BadRequestException('A valid Idempotency-Key is required');
    }
    const invitation = this.createInvitation();
    const eventKey = `portal-activation:${tenant.id}:reissue:${normalizedOperationId}`;
    const mail = this.portalInvitationMail(
      portalUser.email,
      invitation.rawToken,
      tenant.contactName || tenant.brandName,
      false,
      tenant.id,
      eventKey,
      originalDeliveryId,
      mallId,
    );
    let deliveryId: string;
    try {
      deliveryId = await this.prisma.$transaction(async (tx) => {
        const delivery = await this.emailService.prepareTrackedDelivery(tx, mail);
        await tx.user.update({
          where: { id: portalUser.id },
          data: { inviteTokenHash: invitation.tokenHash, inviteExpiresAt: invitation.expiresAt },
        });
        return delivery.id;
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const existing = await this.prisma.emailDelivery.findUnique({ where: { eventKey } });
      if (!existing) throw error;
      return { sent: existing.status === 'SENT', deliveryId: existing.id, created: false, duplicate: true };
    }
    return { ...(await this.sendPreparedPortalInvitation(mail, deliveryId)), created: true };
  }

  private portalInvitationMail(
    email: string,
    token: string,
    contactName: string,
    isReset: boolean,
    tenantId: string,
    eventKey: string,
    originalDeliveryId?: string,
    mallId?: string,
  ): TrackedEmailOptions {
    const portalUrl = appUrl(`/activate?token=${encodeURIComponent(token)}`);
    return {
        to: email,
        delivery: { eventKey, eventType: isReset ? 'PASSWORD_RESET' : 'TENANT_ACTIVATION', entityType: 'Tenant', entityId: tenantId, mallId, originalDeliveryId, resendOfId: originalDeliveryId },
        subject: emailSubject(
          isReset ? 'Đặt lại mật khẩu Tenant Portal' : 'Kích hoạt tài khoản Tenant Portal',
        ),
        html: this.emailService.portalInvitationHtml({ contactName, portalUrl, isReset }),
      };
  }

  private async sendPreparedPortalInvitation(mail: TrackedEmailOptions, deliveryId: string) {
    const email = Array.isArray(mail.to) ? mail.to.join(',') : mail.to;
    try {
      const result = await this.emailService.sendMail({ ...mail, preparedDeliveryId: deliveryId });
      return {
        sent: 'messageId' in result && Boolean(result.messageId),
        deliveryId: result.deliveryId ?? deliveryId,
      };
    } catch (error) {
      this.logger.warn(`Không thể gửi email Tenant Portal đến ${email}: ${error instanceof Error ? error.message : error}`);
      return { sent: false, deliveryId: (error as Error & { deliveryId?: string }).deliveryId ?? deliveryId };
    }
  }
}
