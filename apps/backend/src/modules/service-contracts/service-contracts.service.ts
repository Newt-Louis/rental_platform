import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceContractStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CreateServiceContractDto } from './dto/service-contract.dto';

const ALLOWED_TRANSITIONS: Record<ServiceContractStatus, ServiceContractStatus[]> = {
  DRAFT: ['PROPOSAL', 'UNDER_REVIEW', 'CANCELLED'], PROPOSAL: ['DRAFT', 'UNDER_REVIEW', 'PENDING_SIGNATURE', 'CANCELLED'], UNDER_REVIEW: ['DRAFT', 'PROPOSAL', 'PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['UNDER_REVIEW', 'ACTIVE', 'CANCELLED'], ACTIVE: ['EXPIRING', 'EXPIRED', 'TERMINATED'],
  EXPIRING: ['ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED'], EXPIRED: ['RENEWED'], TERMINATED: [], RENEWED: [], CANCELLED: [],
};

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
    const item = await this.prisma.serviceContract.findFirst({ where: { id, isDeleted: false }, include: { documents: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { dueDate: 'asc' }, include: { documents: true } }, checklist: { orderBy: { order: 'asc' } }, milestones: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }, renewals: true, parentContract: true } });
    if (!item) throw new NotFoundException('Không tìm thấy hợp đồng dịch vụ');
    return item;
  }

  async create(dto: CreateServiceContractDto, userId: string) {
    if (dto.startDate && dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    const { signedDate, startDate, endDate, totalValue, contractNumber, ...data } = dto;
    const finalContractNumber = contractNumber?.trim() || this.generateNumber();
    const duplicate = await this.prisma.serviceContract.findUnique({ where: { contractNumber: finalContractNumber }, select: { id: true } });
    if (duplicate) throw new ConflictException(`Số hợp đồng ${finalContractNumber} đã tồn tại. Vui lòng nhập số khác hoặc để trống để hệ thống tự sinh.`);
    const normalizedTotalValue = Number.isFinite(Number(totalValue)) ? Number(totalValue) : 0;
    return this.prisma.serviceContract.create({ data: { ...data, contractNumber: finalContractNumber, totalValue: normalizedTotalValue, signedDate: signedDate ? new Date(signedDate) : undefined, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, createdById: userId, events: { create: { eventType: 'CREATED', description: 'Tạo hợp đồng dịch vụ', userId } } } });
  }

  async update(id: string, dto: Partial<CreateServiceContractDto>, userId: string) {
    const before = await this.findOne(id);
    const { signedDate, startDate, endDate, totalValue, ...data } = dto;
    const updated = await this.prisma.serviceContract.update({ where: { id }, data: { ...data, totalValue: totalValue == null ? undefined : Number(totalValue), signedDate: signedDate ? new Date(signedDate) : undefined, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined } });
    await this.prisma.serviceContractEvent.create({ data: { contractId: id, eventType: 'UPDATED', oldValue: JSON.stringify(before), newValue: JSON.stringify(updated), userId } });
    return updated;
  }

  async updateStatus(id: string, status: ServiceContractStatus, description: string | undefined, userId: string) {
    const before = await this.findOne(id);
    if (before.status !== status && !ALLOWED_TRANSITIONS[before.status].includes(status)) throw new BadRequestException(`Không thể chuyển trạng thái từ ${before.status} sang ${status}`);
    return this.prisma.$transaction(async tx => {
      const item = await tx.serviceContract.update({ where: { id }, data: { status, terminatedDate: status === 'TERMINATED' ? new Date() : undefined } });
      await tx.serviceContractEvent.create({ data: { contractId: id, eventType: 'STATUS_CHANGED', description, oldValue: before.status, newValue: status, userId } });
      return item;
    });
  }

  async uploadDocument(id: string, file: Express.Multer.File, documentType: string, userId: string, paymentId?: string) {
    if (!file) throw new BadRequestException('Vui lòng chọn file');
    await this.findOne(id);
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

  async createPayment(contractId: string, body: any) { await this.findOne(contractId); return this.prisma.serviceContractPayment.create({ data: { contractId, milestone: body.milestone, dueDate: new Date(body.dueDate), amount: Number(body.amount), currency: body.currency || 'VND', reminderDays: Number(body.reminderDays ?? 7), periodType: body.periodType, periodNumber: body.periodNumber ? Number(body.periodNumber) : undefined, invoiceNumber: body.invoiceNumber, notes: body.notes } }); }
  async updatePayment(contractId: string, paymentId: string, body: any) { const paid = body.status === 'PAID'; return this.prisma.serviceContractPayment.update({ where: { id: paymentId }, data: { ...body, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, paidDate: paid ? new Date(body.paidDate || Date.now()) : body.status ? null : undefined, paidAmount: paid ? Number(body.paidAmount ?? body.amount) || undefined : undefined, reminderSentAt: body.dueDate || body.reminderDays ? null : undefined } }); }
  async deletePayment(contractId: string, paymentId: string) { await this.prisma.serviceContractPayment.deleteMany({ where: { id: paymentId, contractId } }); return { deleted: true }; }
  async recurringPayments(contractId: string, body: any) { const start = new Date(body.startDate); const rows = Array.from({ length: Number(body.count) }, (_, i) => { const due = new Date(start); body.frequency === 'ANNUALLY' ? due.setFullYear(due.getFullYear() + i) : due.setMonth(due.getMonth() + i * (body.frequency === 'QUARTERLY' ? 3 : 1)); return { contractId, milestone: `${body.milestonePrefix} ${i + 1}/${body.count}`, dueDate: due, amount: Number(body.amount), currency: body.currency || 'VND', periodType: body.frequency, periodNumber: i + 1, reminderDays: Number(body.reminderDays ?? 7), notes: body.notes }; }); await this.prisma.serviceContractPayment.createMany({ data: rows }); return this.prisma.serviceContractPayment.findMany({ where: { contractId }, orderBy: { dueDate: 'asc' } }); }

  async createChecklist(contractId: string, body: any) { return this.prisma.serviceContractChecklistItem.create({ data: { contractId, title: body.title, description: body.description, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, order: Number(body.order) || 0 } }); }
  async updateChecklist(contractId: string, itemId: string, body: any, userId: string) { return this.prisma.serviceContractChecklistItem.update({ where: { id: itemId }, data: { ...body, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, completedAt: body.isCompleted === true ? new Date() : body.isCompleted === false ? null : undefined, completedById: body.isCompleted === true ? userId : body.isCompleted === false ? null : undefined } }); }
  async deleteChecklist(contractId: string, itemId: string) { await this.prisma.serviceContractChecklistItem.deleteMany({ where: { id: itemId, contractId } }); return { deleted: true }; }

  async createMilestone(contractId: string, body: any) { return this.prisma.serviceContractMilestone.create({ data: { contractId, title: body.title, description: body.description, dueDate: body.dueDate ? new Date(body.dueDate) : undefined, order: Number(body.order) || 0 } }); }
  async updateMilestone(contractId: string, itemId: string, body: any, userId: string) { return this.prisma.serviceContractMilestone.update({ where: { id: itemId }, data: { ...body, dueDate: body.dueDate ? new Date(body.dueDate) : body.dueDate === null ? null : undefined, completedAt: body.status === 'DONE' ? new Date() : body.status ? null : undefined, completedById: body.status === 'DONE' ? userId : body.status ? null : undefined } }); }
  async deleteMilestone(contractId: string, itemId: string) { await this.prisma.serviceContractMilestone.deleteMany({ where: { id: itemId, contractId } }); return { deleted: true }; }

  async renew(id: string, body: any, userId: string) { const old = await this.findOne(id); return this.prisma.$transaction(async tx => { await tx.serviceContract.update({ where: { id }, data: { status: 'RENEWED' } }); const created = await tx.serviceContract.create({ data: { contractNumber: body.contractNumber || this.generateNumber(), title: body.title || old.title, mallId: old.mallId, counterpartyName: old.counterpartyName, counterpartyTax: old.counterpartyTax, counterpartyEmail: old.counterpartyEmail, counterpartyPhone: old.counterpartyPhone, type: old.type, startDate: body.startDate ? new Date(body.startDate) : old.endDate, endDate: new Date(body.endDate), totalValue: Number(body.totalValue ?? old.totalValue), currency: old.currency, paymentDirection: old.paymentDirection, productName: old.productName, ownerId: old.ownerId, createdById: userId, parentContractId: id, notes: body.notes } }); await tx.serviceContractEvent.create({ data: { contractId: id, eventType: 'RENEWED', newValue: created.id, userId } }); return created; }); }
}
