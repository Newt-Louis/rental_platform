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
import { getServiceContractDateWindow, SERVICE_CONTRACT_EXPIRING_DAYS } from './service-contract-expiry';

// Chỉ được sửa trực tiếp khi hợp đồng chưa vào hiệu lực; từ ACTIVE trở đi phải khóa vì đã ràng buộc pháp lý/tài chính.
const EDITABLE_STATUSES: ServiceContractStatus[] = ['DRAFT', 'PROPOSAL', 'UNDER_REVIEW', 'PENDING_SIGNATURE'];
const ALLOWED_TRANSITIONS: Record<ServiceContractStatus, ServiceContractStatus[]> = {
  DRAFT: ['PROPOSAL', 'UNDER_REVIEW', 'CANCELLED'], PROPOSAL: ['DRAFT', 'UNDER_REVIEW', 'PENDING_SIGNATURE', 'CANCELLED'], UNDER_REVIEW: ['DRAFT', 'PROPOSAL', 'PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['UNDER_REVIEW', 'ACTIVE', 'CANCELLED'], ACTIVE: ['TERMINATED'],
  EXPIRING: ['TERMINATED'], EXPIRED: [], TERMINATED: [], RENEWED: [], CANCELLED: [],
};
const DOCUMENT_TYPES = ['CONTRACT', 'APPENDIX', 'INVOICE', 'PAYMENT_PROOF', 'OTHER'];

@Injectable()
export class ServiceContractsService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  private buildWhere(query: any, mallIds?: string[]): Prisma.ServiceContractWhereInput {
    const where: Prisma.ServiceContractWhereInput = { isDeleted: false };
    if (query.mallId) where.mallId = query.mallId; else if (mallIds) where.mallId = { in: mallIds };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.serviceCategory) where.serviceCategory = query.serviceCategory;
    if (query.valueBasis) where.valueBasis = query.valueBasis;
    if (query.paymentDirection) where.paymentDirection = query.paymentDirection;
    const now = new Date();
    const alertDays = Math.min(365, Math.max(1, Number(query.alertDays) || 30));
    const horizon = new Date(now.getTime() + alertDays * 86400000);
    const { today, expiringThrough } = getServiceContractDateWindow(now);
    if (query.alert === 'EXPIRING') { where.endDate = { gte: today, lte: expiringThrough }; where.status = { in: ['ACTIVE', 'EXPIRING'] }; }
    if (query.alert === 'PAYMENT_DUE') where.payments = { some: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now, lte: horizon } } };
    if (query.alert === 'OVERDUE') where.payments = { some: { OR: [{ status: 'OVERDUE' }, { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } }] } };
    if (query.search) where.OR = [
      { contractNumber: { contains: query.search, mode: 'insensitive' } },
      { title: { contains: query.search, mode: 'insensitive' } },
      { counterpartyName: { contains: query.search, mode: 'insensitive' } },
    ];
    return where;
  }

  async findAll(query: any, mallIds?: string[]) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where = this.buildWhere(query, mallIds);
    const [data, total] = await Promise.all([
      this.prisma.serviceContract.findMany({ where, include: { _count: { select: { documents: true } } }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.serviceContract.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async exportExcel(query: any, mallIds?: string[]) {
    const where = this.buildWhere(query, mallIds);
    const contracts = await this.prisma.serviceContract.findMany({
      where,
      include: {
        payments: { orderBy: { dueDate: 'asc' } },
        _count: { select: { documents: true } },
      },
      orderBy: [{ mallId: 'asc' }, { endDate: 'asc' }, { contractNumber: 'asc' }],
    });
    const malls = await this.prisma.mall.findMany({
      where: { id: { in: Array.from(new Set(contracts.map(contract => contract.mallId))) } },
      select: { id: true, code: true, name: true },
    });
    const mallById = new Map(malls.map(mall => [mall.id, mall]));
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'THISO Leasing Platform';
    workbook.created = new Date();
    const statusLabels: Record<string, string> = {
      DRAFT: 'Nháp', PROPOSAL: 'Đề xuất', UNDER_REVIEW: 'Đang duyệt', PENDING_SIGNATURE: 'Chờ ký',
      ACTIVE: 'Hiệu lực', EXPIRING: 'Sắp hết hạn', EXPIRED: 'Hết hạn', TERMINATED: 'Đã chấm dứt',
      RENEWED: 'Đã gia hạn', CANCELLED: 'Đã hủy',
    };
    const categoryLabels: Record<string, string> = {
      CLEANING: 'Vệ sinh', SECURITY: 'An ninh / bảo vệ', MAINTENANCE: 'Bảo trì', TECHNICAL: 'Kỹ thuật',
      IT_SOFTWARE: 'CNTT / phần mềm', CONSULTING: 'Tư vấn', INSURANCE: 'Bảo hiểm', CONSTRUCTION: 'Xây dựng',
      LABOR_SUPPLY: 'Cung ứng nhân sự', MARKETING: 'Marketing / truyền thông', PARKING: 'Bãi xe',
      LANDSCAPING: 'Cảnh quan', PEST_CONTROL: 'Kiểm soát côn trùng', WASTE_MANAGEMENT: 'Thu gom / xử lý chất thải',
      UTILITIES: 'Điện, nước và tiện ích', OTHER: 'Dịch vụ khác',
    };
    const valueBasisLabels: Record<string, string> = {
      ONE_TIME: 'Trọn gói / một lần', MONTHLY: 'Theo tháng', QUARTERLY: 'Theo quý', ANNUAL: 'Theo năm',
      PROJECT: 'Theo dự án', OTHER: 'Cơ sở khác',
    };
    const paymentStatusLabels: Record<string, string> = {
      PENDING: 'Chờ thanh toán', PARTIAL: 'Thanh toán một phần', PAID: 'Đã thanh toán',
      OVERDUE: 'Quá hạn', CANCELLED: 'Đã hủy',
    };

    const contractSheet = workbook.addWorksheet('Hợp đồng', { views: [{ state: 'frozen', ySplit: 1 }] });
    contractSheet.columns = [
      { header: 'STT', key: 'index', width: 7 }, { header: 'Mall', key: 'mall', width: 26 },
      { header: 'Số HĐ pháp lý', key: 'contractNumber', width: 22 }, { header: 'Tên hợp đồng', key: 'title', width: 34 },
      { header: 'Đối tác', key: 'counterpartyName', width: 30 }, { header: 'Mã số thuế', key: 'counterpartyTax', width: 18 },
      { header: 'Loại HĐ', key: 'type', width: 18 }, { header: 'Nhóm dịch vụ', key: 'serviceCategory', width: 27 },
      { header: 'Mô tả dịch vụ', key: 'productName', width: 32 }, { header: 'Trạng thái', key: 'status', width: 20 },
      { header: 'Chiều thanh toán', key: 'paymentDirection', width: 20 }, { header: 'Ngày ký', key: 'signedDate', width: 15 },
      { header: 'Ngày bắt đầu', key: 'startDate', width: 15 }, { header: 'Ngày kết thúc', key: 'endDate', width: 15 },
      { header: 'Giá trị HĐ', key: 'totalValue', width: 20 }, { header: 'Cơ sở giá trị', key: 'valueBasis', width: 22 },
      { header: 'Tiền tệ', key: 'currency', width: 12 }, { header: 'Số tài liệu', key: 'documents', width: 14 },
      { header: 'Số kỳ thanh toán', key: 'payments', width: 18 }, { header: 'Ghi chú', key: 'notes', width: 32 },
      { header: 'Ngày tạo', key: 'createdAt', width: 20 }, { header: 'Cập nhật lúc', key: 'updatedAt', width: 20 },
    ];
    contracts.forEach((contract, index) => contractSheet.addRow({
      index: index + 1, mall: mallById.has(contract.mallId) ? `${mallById.get(contract.mallId)?.code} — ${mallById.get(contract.mallId)?.name}` : contract.mallId,
      contractNumber: contract.contractNumber,
      title: contract.title, counterpartyName: contract.counterpartyName, counterpartyTax: contract.counterpartyTax,
      type: contract.type, serviceCategory: categoryLabels[contract.serviceCategory] ?? contract.serviceCategory,
      productName: contract.productName, status: statusLabels[contract.status] ?? contract.status,
      paymentDirection: contract.paymentDirection === 'RECEIVABLE' ? 'Phải thu' : 'Phải trả',
      signedDate: contract.signedDate, startDate: contract.startDate, endDate: contract.endDate,
      totalValue: contract.totalValue, valueBasis: valueBasisLabels[contract.valueBasis] ?? contract.valueBasis,
      currency: contract.currency, documents: contract._count.documents, payments: contract.payments.length,
      notes: contract.notes, createdAt: contract.createdAt, updatedAt: contract.updatedAt,
    }));

    const paymentSheet = workbook.addWorksheet('Lịch thanh toán', { views: [{ state: 'frozen', ySplit: 1 }] });
    paymentSheet.columns = [
      { header: 'STT', key: 'index', width: 7 }, { header: 'Mall', key: 'mall', width: 26 },
      { header: 'Số HĐ pháp lý', key: 'contractNumber', width: 22 }, { header: 'Đối tác', key: 'counterpartyName', width: 30 },
      { header: 'Chiều thanh toán', key: 'paymentDirection', width: 20 }, { header: 'Đợt thanh toán', key: 'milestone', width: 28 },
      { header: 'Ngày đến hạn', key: 'dueDate', width: 16 }, { header: 'Giá trị trước VAT', key: 'subtotal', width: 20 },
      { header: 'VAT (%)', key: 'vatRate', width: 12 }, { header: 'Tiền VAT', key: 'vatAmount', width: 18 },
      { header: 'Tổng giá trị', key: 'totalAmount', width: 20 }, { header: 'Đã thanh toán', key: 'paidAmount', width: 20 },
      { header: 'Tiền tệ', key: 'currency', width: 12 }, { header: 'Trạng thái', key: 'status', width: 22 },
      { header: 'Số hóa đơn', key: 'invoiceNumber', width: 20 }, { header: 'Ghi chú', key: 'notes', width: 30 },
    ];
    let paymentIndex = 0;
    for (const contract of contracts) for (const payment of contract.payments) paymentSheet.addRow({
      index: ++paymentIndex, mall: mallById.has(contract.mallId) ? `${mallById.get(contract.mallId)?.code} — ${mallById.get(contract.mallId)?.name}` : contract.mallId,
      contractNumber: contract.contractNumber, counterpartyName: contract.counterpartyName,
      paymentDirection: contract.paymentDirection === 'RECEIVABLE' ? 'Phải thu' : 'Phải trả', milestone: payment.milestone,
      dueDate: payment.dueDate, subtotal: payment.subtotal, vatRate: payment.vatRate, vatAmount: payment.vatAmount,
      totalAmount: payment.totalAmount ?? payment.amount, paidAmount: payment.paidAmount, currency: payment.currency,
      status: paymentStatusLabels[payment.status] ?? payment.status, invoiceNumber: payment.invoiceNumber, notes: payment.notes,
    });
    for (const sheet of [contractSheet, paymentSheet]) {
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
      sheet.getRow(1).height = 24;
      sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      sheet.eachRow((row, rowNumber) => { if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true }; });
    }
    for (const key of ['signedDate', 'startDate', 'endDate']) contractSheet.getColumn(key).numFmt = 'dd/mm/yyyy';
    for (const key of ['createdAt', 'updatedAt']) contractSheet.getColumn(key).numFmt = 'dd/mm/yyyy hh:mm';
    contractSheet.getColumn('totalValue').numFmt = '#,##0.00';
    paymentSheet.getColumn('dueDate').numFmt = 'dd/mm/yyyy';
    for (const key of ['subtotal', 'vatAmount', 'totalAmount', 'paidAmount']) paymentSheet.getColumn(key).numFmt = '#,##0.00';
    return workbook.xlsx.writeBuffer();
  }

  async findOne(id: string) {
    const item = await this.prisma.serviceContract.findFirst({ where: { id, isDeleted: false }, include: { billingParty: true, documents: { orderBy: { createdAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' } }, payments: { orderBy: { dueDate: 'asc' }, include: { documents: true } }, checklist: { orderBy: { order: 'asc' } }, milestones: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }, renewals: true, parentContract: true } });
    if (!item) throw new NotFoundException('Không tìm thấy hợp đồng dịch vụ');
    return item;
  }

  async create(dto: CreateServiceContractDto, userId: string) {
    if (!dto.startDate || !dto.endDate) throw new BadRequestException('Ngày bắt đầu và ngày kết thúc là bắt buộc');
    if (new Date(dto.endDate) < new Date(dto.startDate)) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    const { signedDate, startDate, endDate, totalValue, contractNumber, counterpartyAddress, ...data } = dto;
    const finalContractNumber = contractNumber.trim();
    if (!finalContractNumber) throw new BadRequestException('Vui lòng nhập số hợp đồng pháp lý');
    const duplicate = await this.prisma.serviceContract.findUnique({ where: { contractNumber: finalContractNumber }, select: { id: true } });
    if (duplicate) throw new ConflictException(`Số hợp đồng ${finalContractNumber} đã tồn tại. Vui lòng kiểm tra và nhập đúng số hợp đồng pháp lý.`);
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
    if (!EDITABLE_STATUSES.includes(before.status)) throw new BadRequestException('Hợp đồng đã hiệu lực hoặc đã kết thúc, không thể chỉnh sửa trực tiếp');
    const { signedDate, startDate, endDate, totalValue, counterpartyAddress, ...data } = dto;
    if (data.contractNumber && data.contractNumber !== before.contractNumber) {
      const duplicate = await this.prisma.serviceContract.findUnique({ where: { contractNumber: data.contractNumber }, select: { id: true } });
      if (duplicate) throw new ConflictException(`Số hợp đồng ${data.contractNumber} đã tồn tại`);
    }
    const effectiveStartDate = startDate ? new Date(startDate) : before.startDate;
    const effectiveEndDate = endDate ? new Date(endDate) : before.endDate;
    if (!effectiveStartDate || !effectiveEndDate) throw new BadRequestException('Ngày bắt đầu và ngày kết thúc là bắt buộc');
    if (effectiveEndDate < effectiveStartDate) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
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
    if (status === 'EXPIRING' || status === 'EXPIRED') throw new BadRequestException('Trạng thái sắp hết hạn và hết hạn được hệ thống tự động cập nhật theo ngày kết thúc');
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
    const { today, expiringThrough } = getServiceContractDateWindow();
    const [total, grouped, categories, valueBases, expiringSoon, valueByCurrency] = await Promise.all([
      this.prisma.serviceContract.count({ where }), this.prisma.serviceContract.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.serviceContract.groupBy({ by: ['serviceCategory'], where, _count: true }),
      this.prisma.serviceContract.groupBy({ by: ['valueBasis'], where, _count: true }),
      this.prisma.serviceContract.count({ where: { ...where, endDate: { gte: today, lte: expiringThrough }, status: { in: ['ACTIVE', 'EXPIRING'] } } }),
      // Money Domain Consolidation (INV-CUR-001): ServiceContract.totalValue is
      // currency-aware (VND/USD/MMK) -- group by currency instead of a blind
      // _sum, same pattern as CR-110's reports/renewal-risk fixes.
      this.prisma.serviceContract.groupBy({ by: ['currency'], where, _sum: { totalValue: true } }),
    ]);
    return {
      total,
      expiringSoon,
      totalValueByCurrency: Object.fromEntries(valueByCurrency.map(x => [x.currency, x._sum.totalValue || 0])),
      byStatus: Object.fromEntries(grouped.map(x => [x.status, x._count])),
      byServiceCategory: Object.fromEntries(categories.map(x => [x.serviceCategory, x._count])),
      byValueBasis: Object.fromEntries(valueBases.map(x => [x.valueBasis, x._count])),
    };
  }

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
      currency: body.currency || contract.currency, reminderDays: Number(body.reminderDays ?? 7),
      periodType: body.periodType, periodNumber: body.periodNumber ? Number(body.periodNumber) : undefined,
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
      invoiceNumber: body.invoiceNumber, notes: body.notes,
    } });
  }

  async alerts(mallIds?: string[], days = 30) {
    const now = new Date(); const horizon = new Date(now.getTime() + Math.min(365, Math.max(1, days)) * 86400000);
    const { today, expiringThrough } = getServiceContractDateWindow(now);
    const accessibleContracts: Prisma.ServiceContractWhereInput = { isDeleted: false, ...(mallIds ? { mallId: { in: mallIds } } : {}) };
    const activeContractWhere: Prisma.ServiceContractWhereInput = { ...accessibleContracts, status: { in: ['ACTIVE', 'EXPIRING'] } };
    const paymentBase: Prisma.ServiceContractPaymentWhereInput = { contract: activeContractWhere };
    const [expiring, receivableDue, payableDue, overdue] = await Promise.all([
      this.prisma.serviceContract.count({ where: { ...accessibleContracts, status: { in: ['ACTIVE', 'EXPIRING'] }, endDate: { gte: today, lte: expiringThrough } } }),
      this.prisma.serviceContractPayment.count({ where: { ...paymentBase, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now, lte: horizon }, contract: { ...activeContractWhere, paymentDirection: 'RECEIVABLE' } } }),
      this.prisma.serviceContractPayment.count({ where: { ...paymentBase, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now, lte: horizon }, contract: { ...activeContractWhere, paymentDirection: 'PAYABLE' } } }),
      this.prisma.serviceContractPayment.count({ where: { ...paymentBase, OR: [{ status: 'OVERDUE' }, { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: now } }] } }),
    ]);
    return { days, expiryDays: SERVICE_CONTRACT_EXPIRING_DAYS, expiring, receivableDue, payableDue, overdue };
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
    const rows = Array.from({ length: Number(body.count) }, (_, i) => { const due = new Date(start); body.frequency === 'ANNUALLY' ? due.setFullYear(due.getFullYear() + i) : due.setMonth(due.getMonth() + i * (body.frequency === 'QUARTERLY' ? 3 : 1)); const planned = new Date(due.getTime() - contract.invoiceLeadDays * 86400000); return { contractId, milestone: `${body.milestonePrefix} ${i + 1}/${body.count}`, dueDate: due, invoicePlannedDate: planned, amount: subtotal + vatAmount, subtotal, vatRate, vatAmount, totalAmount: subtotal + vatAmount, currency: body.currency || contract.currency, periodType: body.frequency, periodNumber: i + 1, reminderDays: Number(body.reminderDays ?? 7), notes: body.notes }; });
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
    if (!body.startDate || !body.endDate) throw new BadRequestException('Ngày bắt đầu và ngày kết thúc hợp đồng gia hạn là bắt buộc');
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (endDate <= startDate) throw new BadRequestException('Ngày kết thúc hợp đồng gia hạn phải sau ngày bắt đầu');
    const contractNumber = body.contractNumber.trim();
    if (!contractNumber) throw new BadRequestException('Vui lòng nhập số hợp đồng pháp lý của hợp đồng gia hạn');
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
        paymentTermDays: old.paymentTermDays, serviceCategory: old.serviceCategory,
        valueBasis: old.valueBasis, productName: old.productName, ownerId: old.ownerId,
        createdById: userId, parentContractId: id, notes: body.notes,
        events: { create: { eventType: 'CREATED', description: `Gia hạn từ hợp đồng ${old.contractNumber}`, userId } },
      } });
      await tx.serviceContractEvent.create({ data: { contractId: id, eventType: 'RENEWED', newValue: created.id, userId } });
      return created;
    });
  }
}
