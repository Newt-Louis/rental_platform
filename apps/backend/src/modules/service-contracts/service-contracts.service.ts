import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceContractStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  CreateChecklistItemDto,
  CreateMilestoneDto,
  CreateRecurringPaymentsDto,
  CreateServiceContractDto,
  CreateServiceContractPaymentDto,
  RenewServiceContractDto,
  UpdateChecklistItemDto,
  UpdateMilestoneDto,
  UpdateServiceContractDto,
  UpdateServiceContractPaymentDto,
} from './dto/service-contract.dto';

const ALLOWED_TRANSITIONS: Record<ServiceContractStatus, ServiceContractStatus[]> = {
  DRAFT: ['PROPOSAL', 'UNDER_REVIEW', 'CANCELLED'], PROPOSAL: ['DRAFT', 'UNDER_REVIEW', 'PENDING_SIGNATURE', 'CANCELLED'], UNDER_REVIEW: ['DRAFT', 'PROPOSAL', 'PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['UNDER_REVIEW', 'ACTIVE', 'CANCELLED'], ACTIVE: ['EXPIRING', 'EXPIRED', 'TERMINATED'],
  EXPIRING: ['ACTIVE', 'EXPIRED', 'TERMINATED'], EXPIRED: [], TERMINATED: [], RENEWED: [], CANCELLED: [],
};
const DOCUMENT_TYPES = ['CONTRACT', 'APPENDIX', 'INVOICE', 'PAYMENT_PROOF', 'OTHER'];

@Injectable()
export class ServiceContractsService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  async findAll(query: any, mallIds?: string[]) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Prisma.ServiceContractWhereInput = { isDeleted: false };
    if (query.mallId) where.mallId = query.mallId; else if (mallIds) where.mallId = { in: mallIds };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.paymentDirection) where.paymentDirection = query.paymentDirection;
    const now = new Date();
    const alertDays = Math.min(365, Math.max(1, Number(query.alertDays) || 30));
    const horizon = new Date(now.getTime() + alertDays * 86400000);
    if (query.alert === 'EXPIRING') { where.endDate = { gte: now, lte: horizon }; where.status = { in: ['ACTIVE', 'EXPIRING'] }; }
    if (query.alert === 'PAYMENT_DUE') where.payments = { some: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now, lte: horizon } } };
    if (query.alert === 'OVERDUE') where.payments = { some: { OR: [{ status: 'OVERDUE' }, { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } }] } };
    if (query.search) where.OR = [
      { contractNumber: { contains: query.search, mode: 'insensitive' } },
      { title: { contains: query.search, mode: 'insensitive' } },
      { counterpartyName: { contains: query.search, mode: 'insensitive' } },
    ];
    const [data, total] = await Promise.all([
      this.prisma.serviceContract.findMany({ where, include: { _count: { select: { documents: true } } }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.serviceContract.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const item = await this.prisma.serviceContract.findFirst({ where: { id, isDeleted: false }, include: { billingParty: true, documents: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { dueDate: 'asc' }, include: { documents: true } }, checklist: { orderBy: { order: 'asc' } }, milestones: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }, renewals: true, parentContract: true } });
    if (!item) throw new NotFoundException('Không tìm thấy hợp đồng dịch vụ');
    return item;
  }

  async create(dto: CreateServiceContractDto, userId: string) {
    if (dto.startDate && dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    const { signedDate, startDate, endDate, totalValue, contractNumber, counterpartyAddress, ...data } = dto;
    const finalContractNumber = contractNumber?.trim() || this.generateNumber();
    const duplicate = await this.prisma.serviceContract.findUnique({ where: { contractNumber: finalContractNumber }, select: { id: true } });
    if (duplicate) throw new ConflictException(`Số hợp đồng ${finalContractNumber} đã tồn tại. Vui lòng nhập số khác hoặc để trống để hệ thống tự sinh.`);
    const normalizedTotalValue = Number.isFinite(Number(totalValue)) ? Number(totalValue) : 0;
    return this.prisma.$transaction(async tx => {
      const existingParty = data.paymentDirection === 'RECEIVABLE' && data.counterpartyTax
        ? await tx.billingParty.findFirst({ where: { mallId: data.mallId, taxCode: data.counterpartyTax, isActive: true } })
        : null;
      const party = data.paymentDirection === 'RECEIVABLE'
        ? existingParty || await tx.billingParty.create({ data: { mallId: data.mallId, name: data.counterpartyName, taxCode: data.counterpartyTax, email: data.counterpartyEmail, phone: data.counterpartyPhone, address: counterpartyAddress } })
        : null;
      return tx.serviceContract.create({ data: { ...data, contractNumber: finalContractNumber, totalValue: normalizedTotalValue, signedDate: signedDate ? new Date(signedDate) : undefined, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, createdById: userId, billingPartyId: party?.id, events: { create: { eventType: 'CREATED', description: 'Tạo hợp đồng dịch vụ', userId } } } });
    });
  }

  async update(id: string, dto: UpdateServiceContractDto, userId: string) {
    const before = await this.findOne(id);
    const { signedDate, startDate, endDate, totalValue, counterpartyAddress, ...data } = dto;
    if (data.contractNumber && data.contractNumber !== before.contractNumber) {
      const duplicate = await this.prisma.serviceContract.findUnique({ where: { contractNumber: data.contractNumber }, select: { id: true } });
      if (duplicate) throw new ConflictException(`Số hợp đồng ${data.contractNumber} đã tồn tại`);
    }
    const effectiveStartDate = startDate ? new Date(startDate) : before.startDate;
    const effectiveEndDate = endDate ? new Date(endDate) : before.endDate;
    if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    const updated = await this.prisma.$transaction(async tx => {
      let billingPartyId = before.billingPartyId;
      if (billingPartyId) await tx.billingParty.update({ where: { id: billingPartyId }, data: { name: data.counterpartyName, taxCode: data.counterpartyTax, email: data.counterpartyEmail, phone: data.counterpartyPhone, address: counterpartyAddress } });
      else if (data.paymentDirection === 'RECEIVABLE') {
        const taxCode = data.counterpartyTax || before.counterpartyTax;
        const existingParty = taxCode ? await tx.billingParty.findFirst({ where: { mallId: before.mallId, taxCode, isActive: true } }) : null;
        billingPartyId = (existingParty || await tx.billingParty.create({ data: { mallId: before.mallId, name: data.counterpartyName || before.counterpartyName, taxCode, email: data.counterpartyEmail, phone: data.counterpartyPhone, address: counterpartyAddress } })).id;
      }
      return tx.serviceContract.update({ where: { id }, data: { ...data, totalValue: totalValue == null ? undefined : Number(totalValue), signedDate: signedDate ? new Date(signedDate) : undefined, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, billingPartyId } });
    });
    const changedFields = Object.keys(dto);
    const oldValues = Object.fromEntries(changedFields.map(key => [key, key === 'counterpartyAddress' ? before.billingParty?.address : before[key]]));
    const newValues = Object.fromEntries(changedFields.map(key => [key, key === 'counterpartyAddress' ? counterpartyAddress : updated[key]]));
    await this.prisma.serviceContractEvent.create({ data: { contractId: id, eventType: 'UPDATED', description: `Cập nhật: ${changedFields.join(', ')}`, oldValue: JSON.stringify(oldValues), newValue: JSON.stringify(newValues), userId } });
    return updated;
  }

  async updateStatus(id: string, status: ServiceContractStatus, description: string | undefined, userId: string) {
    const before = await this.findOne(id);
    if (before.status === status) return before;
    if (before.status !== status && !ALLOWED_TRANSITIONS[before.status].includes(status)) throw new BadRequestException(`Không thể chuyển trạng thái từ ${before.status} sang ${status}`);
    return this.prisma.$transaction(async tx => {
      const item = await tx.serviceContract.update({ where: { id }, data: { status, terminatedDate: status === 'TERMINATED' ? new Date() : undefined } });
      await tx.serviceContractEvent.create({ data: { contractId: id, eventType: 'STATUS_CHANGED', description, oldValue: before.status, newValue: status, userId } });
      return item;
    });
  }

  async uploadDocument(id: string, file: Express.Multer.File, documentType: string, userId: string, paymentId?: string) {
    if (!file) throw new BadRequestException('Vui lòng chọn file');
    if (!DOCUMENT_TYPES.includes(documentType)) throw new BadRequestException('Loại tài liệu không hợp lệ');
    if (['INVOICE', 'PAYMENT_PROOF'].includes(documentType) && !paymentId) throw new BadRequestException('Chứng từ thanh toán phải gắn với một kỳ thanh toán');
    await this.findOne(id);
    if (paymentId) {
      const payment = await this.prisma.serviceContractPayment.findFirst({ where: { id: paymentId, contractId: id }, select: { id: true } });
      if (!payment) throw new BadRequestException('Kỳ thanh toán không thuộc hợp đồng này');
    }
    const latest = await this.prisma.serviceContractDocument.aggregate({ where: { contractId: id, documentType }, _max: { version: true } });
    const saved = await this.storage.saveFile(file, `service-contracts/${id}`);
    return this.prisma.serviceContractDocument.create({ data: { contractId: id, fileName: saved.fileName, filePath: saved.filePath, fileSize: file.size, mimeType: file.mimetype, documentType, paymentId, version: (latest._max.version || 0) + 1, uploadedById: userId } });
  }

  async deleteDocument(id: string, documentId: string) {
    const doc = await this.prisma.serviceContractDocument.findFirst({ where: { id: documentId, contractId: id } });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu');
    await this.storage.deleteFile(doc.filePath);
    await this.prisma.serviceContractDocument.delete({ where: { id: documentId } });
    return { deleted: true };
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.serviceContractEvent.create({ data: { contractId: id, eventType: 'DELETED', userId } });
    return this.prisma.serviceContract.update({ where: { id }, data: { isDeleted: true } });
  }

  async stats(mallIds?: string[]) {
    const where: Prisma.ServiceContractWhereInput = { isDeleted: false, ...(mallIds ? { mallId: { in: mallIds } } : {}) };
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    const [total, grouped, expiringSoon, value] = await Promise.all([
      this.prisma.serviceContract.count({ where }), this.prisma.serviceContract.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.serviceContract.count({ where: { ...where, endDate: { gte: new Date(), lte: soon }, status: { in: ['ACTIVE', 'PENDING_SIGNATURE', 'EXPIRING'] } } }),
      this.prisma.serviceContract.aggregate({ where, _sum: { totalValue: true } }),
    ]);
    return { total, expiringSoon, totalValue: value._sum.totalValue || 0, byStatus: Object.fromEntries(grouped.map(x => [x.status, x._count])) };
  }

  generateNumber(mallCode = 'MALL') { return `HD-${mallCode}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`; }

  async createPayment(contractId: string, body: CreateServiceContractPaymentDto) {
    const contract = await this.findOne(contractId);
    const subtotal = Number(body.subtotal ?? body.amount ?? 0);
    if (!Number.isFinite(subtotal) || subtotal <= 0) throw new BadRequestException('Số tiền kỳ thanh toán phải lớn hơn 0');
    const vatRate = Number(body.vatRate ?? contract.defaultVatRate);
    const vatAmount = subtotal * vatRate / 100;
    const dueDate = new Date(body.dueDate);
    const invoicePlannedDate = body.invoicePlannedDate
      ? new Date(body.invoicePlannedDate)
      : new Date(dueDate.getTime() - contract.invoiceLeadDays * 86400000);
    return this.prisma.serviceContractPayment.create({ data: {
      contractId, milestone: body.milestone, dueDate, amount: subtotal + vatAmount,
      subtotal, vatRate, vatAmount, totalAmount: subtotal + vatAmount, invoicePlannedDate,
      currency: body.currency || 'VND', reminderDays: Number(body.reminderDays ?? 7),
      periodType: body.periodType, periodNumber: body.periodNumber ? Number(body.periodNumber) : undefined,
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
      invoiceNumber: body.invoiceNumber, notes: body.notes,
    } });
  }

  async alerts(mallIds?: string[], days = 30) {
    const now = new Date(); const horizon = new Date(now.getTime() + Math.min(365, Math.max(1, days)) * 86400000);
    const contractWhere: Prisma.ServiceContractWhereInput = { isDeleted: false, status: { in: ['ACTIVE', 'EXPIRING'] }, ...(mallIds ? { mallId: { in: mallIds } } : {}) };
    const paymentBase: Prisma.ServiceContractPaymentWhereInput = { contract: contractWhere };
    const [expiring, receivableDue, payableDue, overdue] = await Promise.all([
      this.prisma.serviceContract.count({ where: { ...contractWhere, endDate: { gte: now, lte: horizon } } }),
      this.prisma.serviceContractPayment.count({ where: { ...paymentBase, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now, lte: horizon }, contract: { ...contractWhere, paymentDirection: 'RECEIVABLE' } } }),
      this.prisma.serviceContractPayment.count({ where: { ...paymentBase, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now, lte: horizon }, contract: { ...contractWhere, paymentDirection: 'PAYABLE' } } }),
      this.prisma.serviceContractPayment.count({ where: { ...paymentBase, OR: [{ status: 'OVERDUE' }, { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } }] } }),
    ]);
    return { days, expiring, receivableDue, payableDue, overdue };
  }
  async updatePayment(contractId: string, paymentId: string, body: UpdateServiceContractPaymentDto) {
    const current = await this.prisma.serviceContractPayment.findFirst({ where: { id: paymentId, contractId } });
    if (!current) throw new NotFoundException('Không tìm thấy kỳ thanh toán');
    const changesFinancialData = body.status !== undefined || body.amount !== undefined || body.paidAmount !== undefined || body.paidDate !== undefined || body.dueDate !== undefined;
    if (current.invoiceId && changesFinancialData) throw new BadRequestException('Kỳ thu đã chuyển sang Billing; vui lòng cập nhật trên hóa đơn');
    const paid = body.status === 'PAID';
    return this.prisma.serviceContractPayment.update({ where: { id: paymentId }, data: {
      milestone: body.milestone,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      amount: body.amount,
      status: body.status,
      notes: body.notes,
      reminderDays: body.reminderDays,
      paidDate: paid ? new Date(body.paidDate || Date.now()) : body.status ? null : undefined,
      paidAmount: paid ? Number(body.paidAmount ?? body.amount ?? current.amount) : body.status ? null : body.paidAmount,
      reminderSentAt: body.dueDate || body.reminderDays !== undefined ? null : undefined,
    } });
  }

  async deletePayment(contractId: string, paymentId: string) {
    const current = await this.prisma.serviceContractPayment.findFirst({ where: { id: paymentId, contractId }, select: { id: true, invoiceId: true } });
    if (!current) throw new NotFoundException('Không tìm thấy kỳ thanh toán');
    if (current.invoiceId) throw new BadRequestException('Không thể xóa kỳ thu đã chuyển sang Billing');
    await this.prisma.serviceContractPayment.delete({ where: { id: paymentId } });
    return { deleted: true };
  }

  async recurringPayments(contractId: string, body: CreateRecurringPaymentsDto) {
    const contract = await this.findOne(contractId); const start = new Date(body.startDate);
    const subtotal = Number(body.subtotal ?? body.amount ?? 0); const vatRate = Number(body.vatRate ?? contract.defaultVatRate); const vatAmount = subtotal * vatRate / 100;
    if (!Number.isFinite(subtotal) || subtotal <= 0) throw new BadRequestException('Số tiền mỗi kỳ phải lớn hơn 0');
    const rows = Array.from({ length: Number(body.count) }, (_, i) => { const due = new Date(start); body.frequency === 'ANNUALLY' ? due.setFullYear(due.getFullYear() + i) : due.setMonth(due.getMonth() + i * (body.frequency === 'QUARTERLY' ? 3 : 1)); const planned = new Date(due.getTime() - contract.invoiceLeadDays * 86400000); return { contractId, milestone: `${body.milestonePrefix} ${i + 1}/${body.count}`, dueDate: due, invoicePlannedDate: planned, amount: subtotal + vatAmount, subtotal, vatRate, vatAmount, totalAmount: subtotal + vatAmount, currency: body.currency || 'VND', periodType: body.frequency, periodNumber: i + 1, reminderDays: Number(body.reminderDays ?? 7), notes: body.notes }; });
    await this.prisma.serviceContractPayment.createMany({ data: rows }); return this.prisma.serviceContractPayment.findMany({ where: { contractId }, orderBy: { dueDate: 'asc' } });
  }

  async transferPaymentToBilling(contractId: string, paymentId: string, userId: string) {
    const contract = await this.findOne(contractId);
    if (contract.paymentDirection !== 'RECEIVABLE') throw new BadRequestException('Chỉ hợp đồng phải thu mới được chuyển sang Billing');
    if (!contract.billingPartyId) throw new BadRequestException('Hợp đồng chưa có đối tượng công nợ');
    const payment = contract.payments.find(item => item.id === paymentId);
    if (!payment) throw new NotFoundException('Không tìm thấy kỳ thu');
    if (payment.invoiceId) return this.prisma.invoice.findUnique({ where: { id: payment.invoiceId }, include: { lines: true } });
    const subtotal = payment.subtotal || payment.amount;
    const vatRate = payment.vatRate ?? contract.defaultVatRate;
    const vatAmount = payment.vatAmount || subtotal * vatRate / 100;
    const totalAmount = payment.totalAmount || subtotal + vatAmount;
    const period = payment.periodStart
      ? `${payment.periodStart.getFullYear()}-${String(payment.periodStart.getMonth() + 1).padStart(2, '0')}`
      : `${payment.dueDate.getFullYear()}-${String(payment.dueDate.getMonth() + 1).padStart(2, '0')}`;
    try {
      return await this.prisma.$transaction(async tx => {
        const invoice = await tx.invoice.create({ data: {
          invoiceNumber: `SC-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`,
          billingPartyId: contract.billingPartyId, sourceType: 'SERVICE_CONTRACT', sourceId: contract.id,
          period, type: 'SERVICE_CONTRACT', subtotal, vatRate, vatAmount, totalAmount,
          dueDate: payment.dueDate, notes: `${contract.contractNumber} - ${payment.milestone}`,
          lines: { create: { type: 'SERVICE_CONTRACT', description: `${contract.title} - ${payment.milestone}`, qty: 1, unitPrice: subtotal, amount: subtotal } },
        } });
        await tx.serviceContractPayment.update({ where: { id: payment.id }, data: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, billingStatus: 'INVOICE_DRAFT', transferredToBillingAt: new Date(), billingError: null } });
        await tx.serviceContractEvent.create({ data: { contractId, eventType: 'TRANSFERRED_TO_BILLING', description: `Chuyển kỳ thu ${payment.milestone} sang hóa đơn ${invoice.invoiceNumber}`, userId } });
        return invoice;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const current = await this.prisma.serviceContractPayment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
        if (current?.invoice) return current.invoice;
      }
      throw error;
    }
  }

  async createChecklist(contractId: string, body: CreateChecklistItemDto) { return this.prisma.serviceContractChecklistItem.create({ data: { contractId, title: body.title, description: body.description, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, order: Number(body.order) || 0 } }); }
  async updateChecklist(contractId: string, itemId: string, body: UpdateChecklistItemDto, userId: string) {
    const current = await this.prisma.serviceContractChecklistItem.findFirst({ where: { id: itemId, contractId }, select: { id: true } });
    if (!current) throw new NotFoundException('Không tìm thấy công việc của hợp đồng');
    return this.prisma.serviceContractChecklistItem.update({ where: { id: itemId }, data: { title: body.title, description: body.description, order: body.order, isCompleted: body.isCompleted, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, completedAt: body.isCompleted === true ? new Date() : body.isCompleted === false ? null : undefined, completedById: body.isCompleted === true ? userId : body.isCompleted === false ? null : undefined } });
  }
  async deleteChecklist(contractId: string, itemId: string) { await this.prisma.serviceContractChecklistItem.deleteMany({ where: { id: itemId, contractId } }); return { deleted: true }; }

  async createMilestone(contractId: string, body: CreateMilestoneDto) { return this.prisma.serviceContractMilestone.create({ data: { contractId, title: body.title, description: body.description, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, order: Number(body.order) || 0 } }); }
  async updateMilestone(contractId: string, itemId: string, body: UpdateMilestoneDto, userId: string) {
    const current = await this.prisma.serviceContractMilestone.findFirst({ where: { id: itemId, contractId }, select: { id: true } });
    if (!current) throw new NotFoundException('Không tìm thấy mốc của hợp đồng');
    return this.prisma.serviceContractMilestone.update({ where: { id: itemId }, data: { title: body.title, description: body.description, order: body.order, status: body.status, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, completedAt: body.status === 'DONE' ? new Date() : body.status ? null : undefined, completedById: body.status === 'DONE' ? userId : body.status ? null : undefined } });
  }
  async deleteMilestone(contractId: string, itemId: string) { await this.prisma.serviceContractMilestone.deleteMany({ where: { id: itemId, contractId } }); return { deleted: true }; }

  async renew(id: string, body: RenewServiceContractDto, userId: string) {
    const old = await this.findOne(id);
    if (!['EXPIRING', 'EXPIRED'].includes(old.status)) throw new BadRequestException('Chỉ hợp đồng sắp hết hạn hoặc đã hết hạn mới được gia hạn');
    const startDate = body.startDate ? new Date(body.startDate) : old.endDate;
    const endDate = new Date(body.endDate);
    if (!startDate || endDate <= startDate) throw new BadRequestException('Ngày kết thúc hợp đồng gia hạn phải sau ngày bắt đầu');
    const contractNumber = body.contractNumber?.trim() || this.generateNumber();
    const duplicate = await this.prisma.serviceContract.findUnique({ where: { contractNumber }, select: { id: true } });
    if (duplicate) throw new ConflictException(`Số hợp đồng ${contractNumber} đã tồn tại`);
    return this.prisma.$transaction(async tx => {
      await tx.serviceContract.update({ where: { id }, data: { status: 'RENEWED' } });
      let billingPartyId = old.billingPartyId;
      if (old.paymentDirection === 'RECEIVABLE' && !billingPartyId) billingPartyId = (await tx.billingParty.create({ data: { mallId: old.mallId, name: old.counterpartyName, taxCode: old.counterpartyTax, email: old.counterpartyEmail, phone: old.counterpartyPhone } })).id;
      const created = await tx.serviceContract.create({ data: {
        contractNumber, title: body.title || old.title, mallId: old.mallId,
        counterpartyName: old.counterpartyName, counterpartyTax: old.counterpartyTax,
        counterpartyEmail: old.counterpartyEmail, counterpartyPhone: old.counterpartyPhone,
        type: old.type, startDate, endDate, totalValue: Number(body.totalValue ?? old.totalValue),
        currency: old.currency, paymentDirection: old.paymentDirection, billingPartyId,
        invoiceLeadDays: old.invoiceLeadDays, defaultVatRate: old.defaultVatRate,
        paymentTermDays: old.paymentTermDays, productName: old.productName, ownerId: old.ownerId,
        createdById: userId, parentContractId: id, notes: body.notes,
        events: { create: { eventType: 'CREATED', description: `Gia hạn từ hợp đồng ${old.contractNumber}`, userId } },
      } });
      await tx.serviceContractEvent.create({ data: { contractId: id, eventType: 'RENEWED', newValue: created.id, userId } });
      return created;
    });
  }
}
