import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AmendmentStatus, AmendmentType } from '@prisma/client';
import * as crypto from 'crypto';
import { ContractEventsService } from './contract-events.service';
import { BillingScheduleService } from '../billing/billing-schedule.service';
import { formatMoney } from '../../common/utils/format-money';

// Field hợp đồng được phép thay đổi qua Amendment — không cho amend tenantId/unitId/status/...
// (những field này ảnh hưởng workflow riêng: tạo hợp đồng mới, termination, activation).
const AMENDABLE_CONTRACT_FIELDS = new Set([
  'rent', 'cam', 'deposit', 'currencyCode', 'depositLease', 'depositFitout', 'fitoutFee',
  'utilityFee', 'afterHoursFee', 'operatingHours', 'billingCycle', 'paymentTerm',
  'rentFree', 'escalationPercent', 'startDate', 'endDate', 'term', 'notes',
]);
const AMENDMENT_DATE_FIELDS = new Set(['startDate', 'endDate']);
// Field nào đổi thì lịch thu tiền (billing schedule) đã sinh trước đó phải build lại.
const BILLING_RELEVANT_FIELDS = new Set([
  'rent', 'cam', 'currencyCode', 'billingCycle', 'paymentTerm', 'rentFree', 'escalationPercent', 'startDate', 'endDate',
]);

@Injectable()
export class ContractTemplatesService {
  constructor(private prisma: PrismaService) {}

  async listTemplates() {
    return this.prisma.contractTemplate.findMany({
      where: { isActive: true },
      include: { clauses: { orderBy: { order: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(data: {
    code: string;
    name: string;
    contractType?: string;
    content: string;
    clauses?: { code: string; title: string; content: string; order?: number; isRequired?: boolean }[];
  }) {
    const template = await this.prisma.contractTemplate.create({
      data: {
        code: data.code,
        name: data.name,
        contractType: (data.contractType as any) ?? 'LEASE_AGREEMENT',
        content: data.content,
      },
    });

    if (data.clauses?.length) {
      await this.prisma.contractClause.createMany({
        data: data.clauses.map((c, i) => ({
          templateId: template.id,
          code: c.code,
          title: c.title,
          content: c.content,
          order: c.order ?? i,
          isRequired: c.isRequired ?? true,
        })),
      });
    }

    return this.findTemplate(template.id);
  }

  async findTemplate(id: string) {
    const template = await this.prisma.contractTemplate.findUnique({
      where: { id },
      include: { clauses: { orderBy: { order: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async renderForContract(contractId: string, templateId: string) {
    const [contract, template] = await Promise.all([
      this.prisma.contract.findUnique({
        where: { id: contractId },
        include: { tenant: true, unit: { select: { code: true } } },
      }),
      this.findTemplate(templateId),
    ]);
    if (!contract) throw new NotFoundException('Contract not found');

    const vars: Record<string, string> = {
      contractNumber: contract.contractNumber,
      tenantName: contract.tenant.brandName,
      companyName: contract.tenant.companyName,
      unitCode: contract.unit?.code ?? contract.unitId,
      rent: formatMoney(contract.rent, contract.currencyCode),
      cam: formatMoney(contract.cam, contract.currencyCode),
      startDate: contract.startDate.toLocaleDateString('vi-VN'),
      endDate: contract.endDate.toLocaleDateString('vi-VN'),
      term: String(contract.term),
    };

    const replace = (text: string) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);

    return {
      templateId: template.id,
      contractId,
      content: replace(template.content),
      clauses: template.clauses.map((c) => ({
        ...c,
        content: replace(c.content),
      })),
    };
  }
}

@Injectable()
export class ContractAmendmentsService {
  constructor(
    private prisma: PrismaService,
    private events: ContractEventsService,
    private billingScheduleService: BillingScheduleService,
  ) {}

  private generateNumber() {
    const year = new Date().getFullYear();
    const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
    return `AMD-${year}-${rand}`;
  }

  async list(contractId: string) {
    return this.prisma.contractAmendment.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(contractId: string, data: {
    type: AmendmentType;
    effectiveDate: string;
    changes: Record<string, unknown>;
    reason?: string;
    createdById?: string;
  }) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contract not found');

    const invalidKeys = Object.keys(data.changes).filter((key) => !AMENDABLE_CONTRACT_FIELDS.has(key));
    if (invalidKeys.length) {
      throw new BadRequestException(`Không thể amend các trường: ${invalidKeys.join(', ')}`);
    }

    return this.prisma.contractAmendment.create({
      data: {
        contractId,
        amendmentNumber: this.generateNumber(),
        type: data.type,
        effectiveDate: new Date(data.effectiveDate),
        changes: data.changes as object,
        reason: data.reason,
        createdById: data.createdById,
      },
    });
  }

  async submit(amendmentId: string) {
    const amendment = await this.prisma.contractAmendment.findUnique({ where: { id: amendmentId } });
    if (!amendment) throw new NotFoundException('Amendment not found');
    if (amendment.status !== AmendmentStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT amendments can be submitted');
    }

    return this.prisma.contractAmendment.update({
      where: { id: amendmentId },
      data: { status: AmendmentStatus.SUBMITTED, submittedAt: new Date() },
    });
  }

  async approve(amendmentId: string, userId?: string) {
    const amendment = await this.prisma.contractAmendment.findUnique({
      where: { id: amendmentId },
      include: { contract: true },
    });
    if (!amendment) throw new NotFoundException('Amendment not found');
    if (amendment.status !== AmendmentStatus.SUBMITTED) {
      throw new BadRequestException('Amendment must be SUBMITTED');
    }

    const changes = amendment.changes as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};

    // Whitelist tường minh — tránh amendment ghi đè field không dự tính (status, tenantId,
    // unitId...) chỉ vì tên field đó trùng với 1 property trên Contract.
    for (const [key, value] of Object.entries(changes)) {
      if (AMENDABLE_CONTRACT_FIELDS.has(key)) {
        before[key] = (amendment.contract as any)[key];
        updateData[key] = AMENDMENT_DATE_FIELDS.has(key) ? new Date(value as string) : value;
      }
    }

    if (amendment.type === AmendmentType.RENEWAL) {
      updateData.type = 'RENEWAL';
    }

    await this.prisma.contract.update({
      where: { id: amendment.contractId },
      data: updateData as any,
    });

    // Rebuild lịch thu tiền nếu amendment đổi field ảnh hưởng billing (rent/cam/kỳ hạn...) —
    // trước đây approve() chỉ cập nhật bảng Contract, các kỳ đã sinh vẫn dùng giá cũ.
    if (Object.keys(updateData).some((key) => BILLING_RELEVANT_FIELDS.has(key))) {
      await this.billingScheduleService.buildScheduleForContract(amendment.contractId);
    }

    const updated = await this.prisma.contractAmendment.update({
      where: { id: amendmentId },
      data: { status: AmendmentStatus.APPLIED, approvedAt: new Date() },
    });

    await this.events.logEvent({
      contractId: amendment.contractId,
      eventType: 'AMENDMENT_APPLIED',
      title: `Amendment ${amendment.amendmentNumber} applied`,
      description: amendment.reason ?? undefined,
      beforeValue: JSON.stringify(before),
      afterValue: JSON.stringify(changes),
      userId,
    });

    return updated;
  }
}
