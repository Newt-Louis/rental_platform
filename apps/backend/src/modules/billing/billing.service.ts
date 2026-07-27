import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

interface CurrentUser {
  id: string;
  role: string;
  tenantId?: string | null;
}

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async getPendingReceivables(query: {
    mallId?: string;
    sourceType?: string;
    search?: string;
  }, mallIds?: string[]) {
    const now = new Date();
    const search = query.search?.trim();
    const includeLease = !query.sourceType || query.sourceType === 'LEASE_CONTRACT';
    const includeService = !query.sourceType || query.sourceType === 'SERVICE_CONTRACT';

    const leaseWhere: Prisma.BillingScheduleEntryWhereInput = {
      status: 'PENDING',
      invoiceId: null,
      contract: {
        isActive: true,
        status: { in: ['ACTIVE', 'EXPIRING'] },
        ...(mallIds ? { unit: { mallId: { in: mallIds } } } : {}),
        ...(search ? { OR: [
          { contractNumber: { contains: search, mode: 'insensitive' } },
          { tenant: { brandName: { contains: search, mode: 'insensitive' } } },
        ] } : {}),
      },
    };
    const serviceWhere: Prisma.ServiceContractPaymentWhereInput = {
      invoiceId: null,
      billingStatus: 'SCHEDULED',
      status: { in: ['PENDING', 'PARTIAL'] },
      contract: {
        isDeleted: false,
        paymentDirection: 'RECEIVABLE',
        status: { in: ['ACTIVE', 'EXPIRING'] },
        ...(mallIds ? { mallId: { in: mallIds } } : {}),
        ...(search ? { OR: [
          { contractNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { counterpartyName: { contains: search, mode: 'insensitive' } },
        ] } : {}),
      },
    };

    const [leaseRows, serviceRows] = await Promise.all([
      includeLease ? this.prisma.billingScheduleEntry.findMany({
        where: leaseWhere,
        take: 200,
        orderBy: { dueDate: 'asc' },
        include: { contract: { select: {
          id: true, contractNumber: true,
          tenant: { select: { id: true, brandName: true } },
          unit: { select: { mallId: true, code: true } },
        } } },
      }) : [],
      includeService ? this.prisma.serviceContractPayment.findMany({
        where: serviceWhere,
        take: 200,
        orderBy: { dueDate: 'asc' },
        include: { contract: { select: {
          id: true, contractNumber: true, title: true, mallId: true,
          counterpartyName: true, counterpartyTax: true, defaultVatRate: true,
          billingParty: { select: { id: true, name: true, taxCode: true } },
        } } },
      }) : [],
    ]);

    const timing = (dueDate: Date, plannedDate?: Date | null) => {
      const target = plannedDate || dueDate;
      const days = Math.floor((target.getTime() - now.getTime()) / 86400000);
      return {
        daysUntilInvoice: days,
        daysInvoiceOverdue: Math.max(0, -days),
        isDueForInvoice: days <= 0,
      };
    };
    const lease = leaseRows.map((row) => ({
      id: row.id,
      sourceType: 'LEASE_CONTRACT',
      contractId: row.contractId,
      contractNumber: row.contract.contractNumber,
      counterpartyName: row.contract.tenant.brandName,
      taxCode: null,
      mallId: row.contract.unit.mallId,
      unitCode: row.contract.unit.code,
      period: row.period,
      milestone: `Tiền thuê & CAM ${row.period}`,
      subtotal: row.subtotal,
      vatRate: 10,
      totalAmount: row.subtotal * 1.1,
      invoicePlannedDate: row.dueDate,
      dueDate: row.dueDate,
      ...timing(row.dueDate),
    }));
    const service = serviceRows.map((row) => {
      const subtotal = row.subtotal ?? row.amount;
      const vatRate = row.vatRate ?? row.contract.defaultVatRate;
      return {
        id: row.id,
        sourceType: 'SERVICE_CONTRACT',
        contractId: row.contractId,
        contractNumber: row.contract.contractNumber,
        counterpartyName: row.contract.billingParty?.name || row.contract.counterpartyName,
        taxCode: row.contract.billingParty?.taxCode || row.contract.counterpartyTax,
        mallId: row.contract.mallId,
        unitCode: null,
        period: row.periodStart
          ? `${row.periodStart.getFullYear()}-${String(row.periodStart.getMonth() + 1).padStart(2, '0')}`
          : null,
        milestone: row.milestone,
        subtotal,
        vatRate,
        totalAmount: row.totalAmount ?? subtotal * (1 + vatRate / 100),
        invoicePlannedDate: row.invoicePlannedDate || row.dueDate,
        dueDate: row.dueDate,
        ...timing(row.dueDate, row.invoicePlannedDate),
      };
    });
    const data = [...lease, ...service].sort((a, b) =>
      new Date(a.invoicePlannedDate).getTime() - new Date(b.invoicePlannedDate).getTime());
    const dueRows = data.filter((row) => row.isDueForInvoice);
    return {
      data,
      total: data.length,
      summary: {
        count: data.length,
        amount: data.reduce((sum, row) => sum + row.totalAmount, 0),
        dueCount: dueRows.length,
        dueAmount: dueRows.reduce((sum, row) => sum + row.totalAmount, 0),
        bySource: {
          LEASE_CONTRACT: { count: lease.length, amount: lease.reduce((sum, row) => sum + row.totalAmount, 0) },
          SERVICE_CONTRACT: { count: service.length, amount: service.reduce((sum, row) => sum + row.totalAmount, 0) },
        },
      },
    };
  }

  async createInvoiceFromPending(sourceType: string, id: string, userId: string, mallIds?: string[]) {
    if (sourceType === 'LEASE_CONTRACT') {
      const row = await this.prisma.billingScheduleEntry.findFirst({
        where: { id, ...(mallIds ? { contract: { unit: { mallId: { in: mallIds } } } } : {}) },
        include: { contract: true, invoice: true },
      });
      if (!row) throw new NotFoundException('Không tìm thấy kỳ thu hợp đồng thuê');
      if (row.invoice) return row.invoice;
      if (row.status !== 'PENDING') throw new BadRequestException('Kỳ thu không còn ở trạng thái chờ xuất hóa đơn');
      const vatRate = 10;
      return this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({ data: {
          // A deterministic source key prevents duplicate invoices when a request is retried.
          invoiceNumber: `INV-SCHEDULE-${row.id}`,
          contractId: row.contractId,
          tenantId: row.contract.tenantId,
          sourceType: 'LEASE_CONTRACT',
          sourceId: row.contractId,
          period: row.period,
          type: 'MONTHLY_RENT',
          subtotal: row.subtotal,
          vatRate,
          vatAmount: row.subtotal * vatRate / 100,
          totalAmount: row.subtotal * (1 + vatRate / 100),
          dueDate: row.dueDate,
          notes: `Tạo từ lịch thu ${row.period}`,
          lines: { create: [
            { type: 'RENT', description: `Tiền thuê - ${row.period}`, qty: 1, unitPrice: row.rentAmount, amount: row.rentAmount, order: 0 },
            { type: 'CAM', description: `Phí CAM - ${row.period}`, qty: 1, unitPrice: row.camAmount, amount: row.camAmount, order: 1 },
          ] },
        } });
        await tx.billingScheduleEntry.update({ where: { id }, data: { status: 'INVOICED', invoiceId: invoice.id } });
        return invoice;
      });
    }

    if (sourceType === 'SERVICE_CONTRACT') {
      const payment = await this.prisma.serviceContractPayment.findFirst({
        where: { id, ...(mallIds ? { contract: { mallId: { in: mallIds } } } : {}) },
        include: { invoice: true, contract: true },
      });
      if (!payment) throw new NotFoundException('Không tìm thấy kỳ thu hợp đồng dịch vụ');
      if (payment.invoice) return payment.invoice;
      if (payment.contract.paymentDirection !== 'RECEIVABLE') throw new BadRequestException('Đây không phải hợp đồng phải thu');
      if (!payment.contract.billingPartyId) throw new BadRequestException('Hợp đồng chưa có đối tượng công nợ');
      const subtotal = payment.subtotal ?? payment.amount;
      const vatRate = payment.vatRate ?? payment.contract.defaultVatRate;
      const vatAmount = payment.vatAmount ?? subtotal * vatRate / 100;
      const period = payment.periodStart
        ? `${payment.periodStart.getFullYear()}-${String(payment.periodStart.getMonth() + 1).padStart(2, '0')}`
        : `${payment.dueDate.getFullYear()}-${String(payment.dueDate.getMonth() + 1).padStart(2, '0')}`;
      return this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({ data: {
          // A deterministic source key prevents duplicate invoices when a request is retried.
          invoiceNumber: `SC-PAYMENT-${payment.id}`,
          billingPartyId: payment.contract.billingPartyId,
          sourceType: 'SERVICE_CONTRACT', sourceId: payment.contractId,
          period, type: 'SERVICE_CONTRACT', subtotal, vatRate, vatAmount,
          totalAmount: payment.totalAmount ?? subtotal + vatAmount,
          dueDate: payment.dueDate,
          notes: `${payment.contract.contractNumber} - ${payment.milestone}`,
          lines: { create: { type: 'SERVICE_CONTRACT', description: `${payment.contract.title} - ${payment.milestone}`, qty: 1, unitPrice: subtotal, amount: subtotal } },
        } });
        await tx.serviceContractPayment.update({ where: { id }, data: {
          invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber,
          billingStatus: 'INVOICE_DRAFT', transferredToBillingAt: new Date(), billingError: null,
        } });
        await tx.serviceContractEvent.create({ data: {
          contractId: payment.contractId, eventType: 'TRANSFERRED_TO_BILLING',
          description: `Chuyển kỳ thu ${payment.milestone} sang hóa đơn ${invoice.invoiceNumber}`, userId,
        } });
        return invoice;
      });
    }
    throw new BadRequestException('Nguồn phải thu không hợp lệ');
  }

  async createDueInvoicesFromPending(
    query: { mallId?: string; sourceType?: string; search?: string; items?: { id: string; sourceType: string }[] },
    userId: string,
    mallIds?: string[],
  ) {
    const pending = await this.getPendingReceivables(query, mallIds);
    const allDueRows = pending.data.filter((row) => row.isDueForInvoice);
    const requestedKeys = Array.isArray(query.items)
      ? new Set(query.items.slice(0, 100).map((row) => `${row.sourceType}:${row.id}`))
      : null;
    const dueRows = allDueRows
      .filter((row) => !requestedKeys || requestedKeys.has(`${row.sourceType}:${row.id}`))
      .slice(0, 100);
    const results: { id: string; sourceType: string; invoiceId?: string; invoiceNumber?: string; error?: string }[] = [];

    for (const row of dueRows) {
      try {
        const invoice = await this.createInvoiceFromPending(row.sourceType, row.id, userId, mallIds);
        results.push({ id: row.id, sourceType: row.sourceType, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber });
      } catch (error) {
        results.push({
          id: row.id,
          sourceType: row.sourceType,
          error: error instanceof Error ? error.message : 'Unable to create invoice',
        });
      }
    }

    return {
      requested: dueRows.length,
      created: results.filter((row) => row.invoiceId).length,
      failed: results.filter((row) => row.error).length,
      hasMore: allDueRows.length > dueRows.length,
      results,
    };
  }

  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const isWriteConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!isWriteConflict || attempt === maxAttempts) throw error;
      }
    }

    throw new Error('Serializable transaction retry limit exceeded');
  }

  async findAllInvoices(query: {
    status?: InvoiceStatus;
    tenantId?: string;
    period?: string;
    search?: string;
    page?: number;
    limit?: number;
    mallId?: string;
    sourceType?: string;
    type?: string;
    bucket?: string;
  }, currentUser?: CurrentUser, mallIds?: string[]) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const { search } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (query.period) where.period = query.period;

    if (currentUser?.role === 'TENANT') {
      // Không tin tưởng tenantId client gửi lên — luôn ép theo tenant của người đăng nhập.
      where.tenantId = currentUser.tenantId ?? '__none__';
    } else if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    const and: any[] = [];
    const now = new Date();
    if (mallIds) and.push({ OR: [
      { contract: { unit: { mallId: { in: mallIds } } } },
      { billingParty: { mallId: { in: mallIds } } },
    ] });
    if (search) {
      and.push({ OR: [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { tenant: { brandName: { contains: search, mode: 'insensitive' } } },
        { billingParty: { name: { contains: search, mode: 'insensitive' } } },
        { contract: { contractNumber: { contains: search, mode: 'insensitive' } } },
      ] });
    }
    if (and.length) where.AND = and;
    const summaryWhere = { ...where, ...(and.length ? { AND: [...and] } : {}) };
    if (query.status) where.status = query.status;
    if (query.sourceType) where.sourceType = query.sourceType;
    if (query.type) where.type = query.type;
    const filteredAnd = [...and];
    if (query.bucket === 'DRAFT') filteredAnd.push({ status: InvoiceStatus.DRAFT });
    if (query.bucket === 'CURRENT') filteredAnd.push({ status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] }, dueDate: { gte: now } });
    if (query.bucket === 'PARTIAL') filteredAnd.push({ status: InvoiceStatus.PARTIALLY_PAID, dueDate: { gte: now } });
    if (query.bucket === 'OVERDUE') filteredAnd.push({ status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] }, dueDate: { lt: now } });
    if (filteredAnd.length) where.AND = filteredAnd;

    const [rawData, total, summaryRows] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        include: {
          tenant: { select: { id: true, brandName: true } },
          billingParty: { select: { id: true, name: true, taxCode: true } },
          contract: { select: { id: true, contractNumber: true, unit: { select: { mallId: true, code: true } } } },
          serviceContractPayment: { select: { milestone: true, contract: { select: { id: true, contractNumber: true, title: true } } } },
          payments: { select: { id: true, amount: true, paidAt: true, method: true, reversedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where: summaryWhere,
        select: { status: true, sourceType: true, type: true, totalAmount: true, dueDate: true, payments: { select: { amount: true, reversedAt: true } } },
      }),
    ]);

    const today = new Date();
    const enrich = (invoice: any) => {
      const totalPaid = invoice.payments.filter((payment: any) => !payment.reversedAt).reduce((sum: number, payment: any) => sum + payment.amount, 0);
      const balance = Math.max(0, invoice.totalAmount - totalPaid);
      const daysOverdue = balance > 0 && new Date(invoice.dueDate) < today
        ? Math.max(1, Math.floor((today.getTime() - new Date(invoice.dueDate).getTime()) / 86400000))
        : 0;
      return { ...invoice, totalPaid, balance, daysOverdue };
    };
    const data = rawData.map(enrich);
    const summary = {
      totalOutstanding: 0,
      draft: { count: 0, amount: 0 },
      current: { count: 0, amount: 0 },
      partial: { count: 0, amount: 0 },
      overdue: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      bySource: {} as Record<string, { count: number; amount: number }>,
    };
    for (const row of summaryRows.map(enrich)) {
      const source = row.sourceType || row.type || 'OTHER';
      summary.bySource[source] ||= { count: 0, amount: 0 };
      summary.bySource[source].count++;
      summary.bySource[source].amount += row.balance;
      if (!['PAID', 'CANCELLED'].includes(row.status)) summary.totalOutstanding += row.balance;
      const bucket = row.status === 'DRAFT' ? summary.draft
        : row.status === 'PAID' ? summary.paid
        : row.daysOverdue > 0 || row.status === 'OVERDUE' ? summary.overdue
        : row.status === 'PARTIALLY_PAID' ? summary.partial
        : summary.current;
      bucket.count++;
      bucket.amount += row.status === 'PAID' ? row.totalAmount : row.balance;
    }
    return { data, total, page, limit, totalPages: Math.ceil(total / limit), summary };
  }

  async findOneInvoice(id: string, currentUser?: CurrentUser) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        tenant: true,
        billingParty: true,
        contract: { include: { unit: { select: { id: true, code: true, name: true } } } },
        serviceContractPayment: { include: { contract: true } },
        lines: { orderBy: { order: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    if (currentUser?.role === 'TENANT' && invoice.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('Bạn không có quyền xem hóa đơn này');
    }

    return invoice;
  }

  async createInvoice(dto: {
    contractId?: string;
    tenantId?: string;
    billingPartyId?: string;
    sourceType?: string;
    sourceId?: string;
    period: string;
    type?: string;
    subtotal: number;
    vatRate?: number;
    dueDate: string;
    notes?: string;
    lines?: { type: string; description: string; qty: number; unitPrice: number; amount: number }[];
  }) {
    const year = new Date().getFullYear();
    const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
    const invoiceNumber = `INV-${year}-${rand}`;

    const vatRate = dto.vatRate ?? 10;
    const vatAmount = dto.subtotal * (vatRate / 100);
    const totalAmount = dto.subtotal + vatAmount;

    return this.prisma.invoice.create({
      data: {
        invoiceNumber,
        contractId: dto.contractId,
        tenantId: dto.tenantId,
        billingPartyId: dto.billingPartyId,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        period: dto.period,
        type: (dto.type as any) ?? 'MONTHLY_RENT',
        subtotal: dto.subtotal,
        vatRate,
        vatAmount,
        totalAmount,
        dueDate: new Date(dto.dueDate),
        notes: dto.notes,
        lines: dto.lines ? { create: dto.lines } : undefined,
      },
    });
  }

  async issueInvoice(id: string) {
    const invoice = await this.findOneInvoice(id);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Invoice is not DRAFT');

    // Recalculate totals from lines before issuing
    await this.recalculateTotals(id);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.ISSUED, issuedAt: new Date() },
    });
    await this.syncServiceContractPayment(id);
    return updated;
  }

  // ── Invoice Line Management ────────────────────────────────────────────────

  async addInvoiceLine(invoiceId: string, dto: {
    type: string;
    description: string;
    qty: number;
    unitPrice: number;
    unit?: string;
    notes?: string;
  }) {
    const invoice = await this.findOneInvoice(invoiceId);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Chỉ có thể chỉnh sửa hóa đơn ở trạng thái DRAFT');

    const amount = dto.qty * dto.unitPrice;
    const maxOrder = invoice.lines.reduce((max, l) => Math.max(max, l.order), 0);

    const line = await this.prisma.invoiceLine.create({
      data: {
        invoiceId,
        type: dto.type,
        description: dto.description,
        qty: dto.qty,
        unitPrice: dto.unitPrice,
        amount,
        order: maxOrder + 1,
      },
    });

    await this.recalculateTotals(invoiceId);
    return line;
  }

  async updateInvoiceLine(invoiceId: string, lineId: string, dto: {
    description?: string;
    qty?: number;
    unitPrice?: number;
  }) {
    const invoice = await this.findOneInvoice(invoiceId);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Chỉ có thể chỉnh sửa hóa đơn ở trạng thái DRAFT');

    const line = invoice.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Invoice line not found');

    const newQty = dto.qty ?? line.qty;
    const newPrice = dto.unitPrice ?? line.unitPrice;
    const newAmount = newQty * newPrice;

    const updated = await this.prisma.invoiceLine.update({
      where: { id: lineId },
      data: {
        description: dto.description ?? line.description,
        qty: newQty,
        unitPrice: newPrice,
        amount: newAmount,
      },
    });

    await this.recalculateTotals(invoiceId);
    return updated;
  }

  async removeInvoiceLine(invoiceId: string, lineId: string) {
    const invoice = await this.findOneInvoice(invoiceId);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Chỉ có thể chỉnh sửa hóa đơn ở trạng thái DRAFT');

    const line = invoice.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Invoice line not found');

    // Only allow removing variable/utility lines (not rent/CAM base lines)
    const fixedTypes = ['RENT', 'CAM', 'DEPOSIT'];
    if (fixedTypes.includes(line.type.toUpperCase())) {
      throw new BadRequestException('Không thể xóa dòng chi phí cố định (tiền thuê, CAM, đặt cọc)');
    }

    await this.prisma.invoiceLine.delete({ where: { id: lineId } });
    await this.recalculateTotals(invoiceId);
    return { deleted: true };
  }

  private async recalculateTotals(invoiceId: string) {
    const lines = await this.prisma.invoiceLine.findMany({ where: { invoiceId } });
    const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { vatRate: true } });
    const vatRate = invoice?.vatRate ?? 10;
    const vatAmount = subtotal * (vatRate / 100);
    const totalAmount = subtotal + vatAmount;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { subtotal, vatAmount, totalAmount },
    });
  }

  async getInvoiceSummary(invoiceId: string) {
    const invoice = await this.findOneInvoice(invoiceId);
    // Bút toán đã đảo không còn tính vào số đã thanh toán.
    const totalPaid = invoice.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0);
    return {
      ...invoice,
      totalPaid,
      balance: invoice.totalAmount - totalPaid,
    };
  }

  async recordPayment(invoiceId: string, dto: {
    amount: number;
    method?: PaymentMethod;
    reference?: string;
    paidAt?: string;
    notes?: string;
    idempotencyKey?: string;
  }, currentUser?: CurrentUser) {
    const invoice = await this.findOneInvoice(invoiceId, currentUser);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Hóa đơn đã bị hủy — không thể ghi nhận thanh toán');
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;
    const idempotencyHash = idempotencyKey
      ? crypto
          .createHash('sha256')
          .update(JSON.stringify({
            invoiceId,
            amount: dto.amount,
            method: dto.method ?? PaymentMethod.BANK_TRANSFER,
            reference: dto.reference ?? null,
            paidAt: dto.paidAt ?? null,
            notes: dto.notes ?? null,
          }))
          .digest('hex')
      : undefined;

    if (idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (
          existing.invoiceId !== invoiceId ||
          existing.idempotencyHash !== idempotencyHash
        ) {
          throw new ConflictException(
            'Idempotency key was already used with a different payment payload',
          );
        }
        return existing;
      }
    }

    return this.runSerializableTransaction(async (tx) => {
      let payment;
      try {
        payment = await tx.payment.create({
          data: {
            invoiceId,
            tenantId: invoice.tenantId,
            billingPartyId: invoice.billingPartyId,
            amount: dto.amount,
            method: dto.method ?? PaymentMethod.BANK_TRANSFER,
            reference: dto.reference,
            paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
            notes: dto.notes,
            idempotencyKey,
            idempotencyHash,
          },
        });
      } catch (error) {
        if (
          idempotencyKey &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const concurrent = await tx.payment.findUnique({ where: { idempotencyKey } });
          if (
            concurrent &&
            concurrent.invoiceId === invoiceId &&
            concurrent.idempotencyHash === idempotencyHash
          ) {
            return concurrent;
          }
          throw new ConflictException(
            'Idempotency key was already used with a different payment payload',
          );
        }
        throw error;
      }

      await this.recomputeInvoiceStatusFromPayments(invoiceId, tx);
      return payment;
    });
  }

  /** Tính lại trạng thái hóa đơn dựa trên tổng các bút toán CÒN HIỆU LỰC (chưa bị đảo). */
  private async recomputeInvoiceStatusFromPayments(
    invoiceId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.status === InvoiceStatus.CANCELLED) return;

    const activePayments = await db.payment.findMany({ where: { invoiceId, reversedAt: null } });
    const totalPaid = activePayments.reduce((s, p) => s + p.amount, 0);

    let newStatus: InvoiceStatus;
    if (totalPaid >= invoice.totalAmount && totalPaid > 0) {
      newStatus = InvoiceStatus.PAID;
    } else if (totalPaid > 0) {
      newStatus = InvoiceStatus.PARTIALLY_PAID;
    } else {
      newStatus = invoice.issuedAt ? InvoiceStatus.ISSUED : InvoiceStatus.DRAFT;
    }

    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus, paidAt: newStatus === InvoiceStatus.PAID ? new Date() : null },
    });
    await this.syncServiceContractPayment(invoiceId, db);
  }

  private async syncServiceContractPayment(
    invoiceId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { payments: { where: { reversedAt: null } } } });
    if (!invoice || invoice.sourceType !== 'SERVICE_CONTRACT') return;
    const paidAmount = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const statusMap: Record<InvoiceStatus, string> = {
      DRAFT: 'PENDING', ISSUED: 'PENDING', PARTIALLY_PAID: 'PARTIAL', PAID: 'PAID', OVERDUE: 'OVERDUE', CANCELLED: 'CANCELLED',
    };
    await db.serviceContractPayment.updateMany({ where: { invoiceId }, data: {
      billingStatus: invoice.status === InvoiceStatus.DRAFT ? 'INVOICE_DRAFT' : invoice.status,
      status: statusMap[invoice.status], paidAmount,
      paidDate: invoice.status === InvoiceStatus.PAID ? (invoice.paidAt || new Date()) : null,
    } });
  }

  // ── Void / Reversal (Phase 1 — kiểm soát tài chính) ─────────────────────────

  async voidInvoice(invoiceId: string, reason: string, userId: string) {
    const invoice = await this.findOneInvoice(invoiceId);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Hóa đơn này đã bị hủy trước đó');
    }

    const activePayments = invoice.payments.filter((p) => !p.reversedAt);
    if (activePayments.length > 0) {
      throw new BadRequestException('Hóa đơn còn bút toán thanh toán hiệu lực — phải đảo các bút toán trước khi hủy hóa đơn');
    }
    if (!reason?.trim()) {
      throw new BadRequestException('Phải nêu lý do hủy hóa đơn');
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELLED,
        voidedAt: new Date(),
        voidedById: userId,
        voidReason: reason.trim(),
      },
    });
    await this.syncServiceContractPayment(invoiceId);
    return updated;
  }

  async reversePayment(paymentId: string, reason: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.reversedAt) throw new BadRequestException('Bút toán này đã được đảo trước đó');
    if (!reason?.trim()) throw new BadRequestException('Phải nêu lý do đảo bút toán');

    return this.runSerializableTransaction(async (tx) => {
      const reversed = await tx.payment.update({
        where: { id: paymentId },
        data: { reversedAt: new Date(), reversedById: userId, reversalReason: reason.trim() },
      });

      await this.recomputeInvoiceStatusFromPayments(payment.invoiceId, tx);
      return reversed;
    });
  }

  async calculateRevenueShare(period: string, mallId?: string) {
    // Find all sales turnovers for this period where contract has revenue share %
    const salesWhere: any = { period };
    if (mallId) salesWhere.unit = { floor: { mallId } };

    const sales = await this.prisma.salesTurnover.findMany({
      where: salesWhere,
      include: {
        tenant: { select: { id: true, brandName: true } },
        unit: { select: { id: true, code: true } },
      },
    });

    const created: any[] = [];

    for (const sale of sales) {
      const contract = await this.prisma.contract.findFirst({
        where: { tenantId: sale.tenantId, unitId: sale.unitId, isActive: true, status: { in: ['ACTIVE', 'EXPIRING'] } },
        include: { unit: true },
      });
      if (!contract) continue;

      const proposal = contract.proposalId
        ? await this.prisma.proposal.findUnique({ where: { id: contract.proposalId }, select: { revenueSharePercent: true } })
        : null;
      const pct = proposal?.revenueSharePercent ?? 0;
      if (!pct || pct <= 0) continue;

      // Revenue share = max(0, grossSales * pct% - monthlyRent)
      const shareAmount = Math.max(0, sale.grossSales * (pct / 100) - contract.rent);
      if (shareAmount <= 0) continue;

      // Skip if already exists
      const existing = await this.prisma.invoice.findFirst({
        where: { contractId: contract.id, period, type: 'REVENUE_SHARE' as any },
      });
      if (existing) continue;

      const year = new Date().getFullYear();
      const rand = crypto.randomBytes(2).readUInt16BE(0).toString().padStart(5, '0').slice(0, 5);
      const invoiceNumber = `RS-${year}-${rand}`;
      const vatRate = 10;
      const vatAmount = shareAmount * (vatRate / 100);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      const inv = await this.prisma.invoice.create({
        data: {
          invoiceNumber,
          contractId: contract.id,
          tenantId: sale.tenantId,
          period,
          type: 'REVENUE_SHARE' as any,
          subtotal: shareAmount,
          vatRate,
          vatAmount,
          totalAmount: shareAmount + vatAmount,
          dueDate,
          notes: `Doanh thu chia sẻ ${pct}% từ doanh thu ${sale.grossSales.toLocaleString('vi-VN')} VNĐ kỳ ${period}`,
          lines: {
            create: [{
              type: 'REVENUE_SHARE',
              description: `Revenue share ${pct}% — doanh thu ${period}: ${sale.grossSales.toLocaleString('vi-VN')} VNĐ`,
              qty: 1,
              unitPrice: shareAmount,
              amount: shareAmount,
              order: 1,
            }],
          },
        },
      });
      created.push(inv);
    }

    return { created: created.length, invoices: created.map((i) => i.invoiceNumber) };
  }

  async exportInvoicesCsv(query: { status?: InvoiceStatus; tenantId?: string; period?: string; search?: string }): Promise<string> {
    const where: any = { isActive: true };
    if (query.status) where.status = query.status;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.period) where.period = query.period;
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { tenant: { brandName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        tenant: { select: { brandName: true, companyName: true } },
        contract: { select: { contractNumber: true } },
        payments: { select: { amount: true, reversedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const header = ['Số HĐ', 'Khách thuê', 'Công ty', 'Số HĐ thuê', 'Kỳ', 'Loại', 'Tạm tính', 'VAT', 'Tổng tiền', 'Đã thanh toán', 'Còn lại', 'Hạn TT', 'Trạng thái', 'Ngày tạo'];
    const rows = invoices.map((inv) => {
      const paid = inv.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0);
      const remaining = inv.totalAmount - paid;
      return [
        inv.invoiceNumber,
        inv.tenant?.brandName ?? '',
        inv.tenant?.companyName ?? '',
        inv.contract?.contractNumber ?? '',
        inv.period,
        inv.type,
        inv.subtotal.toFixed(0),
        inv.vatAmount.toFixed(0),
        inv.totalAmount.toFixed(0),
        paid.toFixed(0),
        remaining.toFixed(0),
        new Date(inv.dueDate).toLocaleDateString('vi-VN'),
        inv.status,
        new Date(inv.createdAt).toLocaleDateString('vi-VN'),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    });

    return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  async getArAging(mallIds?: string[]) {
    const today = new Date();
    const overdue = await this.prisma.invoice.findMany({
      where: {
        isActive: true,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        ...(mallIds ? { OR: [{ contract: { unit: { mallId: { in: mallIds } } } }, { billingParty: { mallId: { in: mallIds } } }] } : {}),
      },
      include: {
        tenant: { select: { id: true, brandName: true, companyName: true } },
        billingParty: { select: { id: true, name: true, taxCode: true } },
        payments: true,
      },
    });

    const byTenant: Record<string, any> = {};

    for (const inv of overdue) {
      // Bút toán đã đảo không còn tính vào số đã thanh toán — nếu không, công nợ sẽ bị báo thấp hơn thực tế.
      const paid = inv.payments.filter((p) => !p.reversedAt).reduce((s, p) => s + p.amount, 0);
      const outstanding = inv.totalAmount - paid;
      if (outstanding <= 0) continue;

      const daysDue = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000);

      const counterpartyKey = inv.tenantId ? `tenant:${inv.tenantId}` : inv.billingPartyId ? `party:${inv.billingPartyId}` : `invoice:${inv.id}`;
      if (!byTenant[counterpartyKey]) {
        byTenant[counterpartyKey] = {
          tenant: inv.tenant,
          billingParty: inv.billingParty,
          counterpartyName: inv.tenant?.brandName || inv.billingParty?.name || 'Chưa xác định',
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          days90plus: 0,
          total: 0,
        };
      }

      const bucket = byTenant[counterpartyKey];
      bucket.total += outstanding;
      if (daysDue <= 0) bucket.current += outstanding;
      else if (daysDue <= 30) bucket.days30 += outstanding;
      else if (daysDue <= 60) bucket.days60 += outstanding;
      else if (daysDue <= 90) bucket.days90 += outstanding;
      else bucket.days90plus += outstanding;
    }

    return Object.values(byTenant);
  }
}
