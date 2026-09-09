import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
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

  async getFitoutArchive(
    tenantId: string | undefined,
    query: { search?: string; page?: number; limit?: number } = {},
    mallIds?: string[],
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const search = query.search?.trim().slice(0, 120);

    if (tenantId) {
      const tenantScope: any = { id: tenantId, deletedAt: null };
      if (mallIds) {
        tenantScope.OR = [
          { fitoutProjects: { some: { unit: { mallId: { in: mallIds } } } } },
          { contracts: { some: { isActive: true, deletedAt: null, unit: { mallId: { in: mallIds } } } } },
          { proposals: { some: { isActive: true, unit: { mallId: { in: mallIds } } } } },
          { occupiedUnits: { some: { mallId: { in: mallIds } } } },
        ];
      }
      const tenant = await this.prisma.tenant.findFirst({ where: tenantScope, select: { id: true } });
      if (!tenant) throw new ForbiddenException('Tenant is outside the authorized Fitout dossier scope');
    }

    const projectScope: any = {};
    if (tenantId) projectScope.tenantId = tenantId;
    if (mallIds) projectScope.unit = { mallId: { in: mallIds } };
    const completedScope: any = {
      project: projectScope,
      status: { in: ['APPROVED', 'PUBLISHED'] },
    };

    // UnifiedDocument and EntityComment are polymorphic and have no Prisma relation.
    // Resolve the authorized completed-submittal IDs FIRST, then search those IDs only;
    // this prevents exact Mall-B filenames/comments from becoming a search inference channel.
    const authorizedSubmittalIds = search
      ? (await this.prisma.fitoutSubmittal.findMany({
          where: completedScope,
          select: { id: true },
        })).map((submittal) => submittal.id)
      : [];

    const matchingDocumentEntityIds = search && authorizedSubmittalIds.length
      ? (await this.prisma.unifiedDocument.findMany({
          where: {
            entityType: 'FITOUT_SUBMITTAL',
            entityId: { in: authorizedSubmittalIds },
            isActive: true,
            fileName: { contains: search, mode: 'insensitive' },
          },
          select: { entityId: true },
          distinct: ['entityId'],
        })).map((document) => document.entityId)
      : [];
    const matchingCommentEntityIds = search && authorizedSubmittalIds.length
      ? (await this.prisma.entityComment.findMany({
          where: {
            entityType: 'FITOUT_SUBMITTAL',
            entityId: { in: authorizedSubmittalIds },
            OR: [
              { body: { contains: search, mode: 'insensitive' } },
              { author: { fullName: { contains: search, mode: 'insensitive' } } },
            ],
          },
          select: { entityId: true },
          distinct: ['entityId'],
        })).map((comment) => comment.entityId)
      : [];

    const where: any = { ...completedScope };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { stageCode: { contains: search, mode: 'insensitive' } },
        { submittedBy: { fullName: { contains: search, mode: 'insensitive' } } },
        { formType: { code: { contains: search, mode: 'insensitive' } } },
        { formType: { name: { contains: search, mode: 'insensitive' } } },
        { project: { status: { contains: search, mode: 'insensitive' } } },
        { project: { contract: { contractNumber: { contains: search, mode: 'insensitive' } } } },
        { project: { unit: { code: { contains: search, mode: 'insensitive' } } } },
        { project: { unit: { name: { contains: search, mode: 'insensitive' } } } },
        { workflow: { steps: { some: { OR: [
          { stepName: { contains: search, mode: 'insensitive' } },
          { comment: { contains: search, mode: 'insensitive' } },
          { approver: { fullName: { contains: search, mode: 'insensitive' } } },
        ] } } } },
        ...(matchingDocumentEntityIds.length ? [{ id: { in: matchingDocumentEntityIds } }] : []),
        ...(matchingCommentEntityIds.length ? [{ id: { in: matchingCommentEntityIds } }] : []),
      ];
    }

    const [submittals, total] = await Promise.all([
      this.prisma.fitoutSubmittal.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          revisionNo: true,
          status: true,
          stageCode: true,
          submittedAt: true,
          updatedAt: true,
          formType: { select: { id: true, code: true, name: true, category: true } },
          submittedBy: { select: { id: true, fullName: true } },
          project: {
            select: {
              id: true,
              tenant: { select: { id: true, brandName: true } },
              contract: { select: { id: true, contractNumber: true } },
              unit: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  mallId: true,
                  floor: { select: { id: true, name: true, level: true } },
                },
              },
            },
          },
          workflow: {
            select: {
              id: true,
              status: true,
              steps: {
                orderBy: { stepOrder: 'asc' },
                select: {
                  id: true,
                  stepOrder: true,
                  stepName: true,
                  approverRole: true,
                  status: true,
                  comment: true,
                  decidedAt: true,
                  approver: { select: { id: true, fullName: true } },
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { revisionNo: 'desc' }],
      }),
      this.prisma.fitoutSubmittal.count({ where }),
    ]);

    const [attachments, comments] = submittals.length
      ? await Promise.all([
        this.prisma.unifiedDocument.findMany({
          where: {
            entityType: 'FITOUT_SUBMITTAL',
            entityId: { in: submittals.map((submittal) => submittal.id) },
            isActive: true,
          },
          select: {
            id: true,
            entityId: true,
            category: true,
            documentType: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            version: true,
            isLatest: true,
            uploadedAt: true,
            retentionYear: true,
          },
          orderBy: [{ entityId: 'asc' }, { version: 'desc' }, { uploadedAt: 'desc' }],
        }),
        this.prisma.entityComment.findMany({
          where: {
            entityType: 'FITOUT_SUBMITTAL',
            entityId: { in: submittals.map((submittal) => submittal.id) },
          },
          select: {
            id: true,
            entityId: true,
            body: true,
            createdAt: true,
            author: { select: { id: true, fullName: true } },
          },
          orderBy: [{ entityId: 'asc' }, { createdAt: 'asc' }],
        }),
      ])
      : [[], []];

    const attachmentsBySubmittal = new Map<string, Omit<(typeof attachments)[number], 'entityId'>[]>();
    for (const { entityId, ...attachment } of attachments) {
      const items = attachmentsBySubmittal.get(entityId) ?? [];
      items.push(attachment);
      attachmentsBySubmittal.set(entityId, items);
    }
    const commentsBySubmittal = new Map<string, Omit<(typeof comments)[number], 'entityId'>[]>();
    for (const { entityId, ...comment } of comments) {
      const items = commentsBySubmittal.get(entityId) ?? [];
      items.push(comment);
      commentsBySubmittal.set(entityId, items);
    }

    return {
      data: submittals.map((submittal) => {
        const { tenant, ...project } = submittal.project;
        return {
          ...submittal,
          project,
          ...(!tenantId ? { tenant } : {}),
          attachments: attachmentsBySubmittal.get(submittal.id) ?? [],
          comments: commentsBySubmittal.get(submittal.id) ?? [],
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
