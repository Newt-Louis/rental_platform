import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceAdjustmentType, InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { StorageService } from '../../storage/storage.service';

interface CurrentUser {
  id: string;
  role: string;
  tenantId?: string | null;
}

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService, private storage?: StorageService) {}

  private financials(invoice: { totalAmount: number; adjustmentAmount?: number; refundedAmount?: number; payments: { amount: number; reversedAt?: Date | null }[] }) {
    const adjustedTotal = Math.max(0, invoice.totalAmount + (invoice.adjustmentAmount ?? 0));
    const grossPaid = invoice.payments.filter((payment) => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0);
    const totalPaid = Math.max(0, grossPaid - (invoice.refundedAmount ?? 0));
    return { adjustedTotal, grossPaid, totalPaid, balance: Math.max(0, adjustedTotal - totalPaid) };
  }

  async getPendingReceivables(query: {
    mallId?: string;
    sourceType?: string;
    search?: string;
  }, mallIds?: string[]) {
    const now = new Date();
    const search = query.search?.trim();
    const includeLease = !query.sourceType || query.sourceType === 'LEASE_CONTRACT';
    const includeService = !query.sourceType || query.sourceType === 'SERVICE_CONTRACT';
    const includeShortTerm = !query.sourceType || query.sourceType === 'SHORT_TERM_BOOKING';
    const includeParking = !query.sourceType || query.sourceType === 'PARKING';

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

    const [leaseRows, serviceRows, shortTermCandidates, parkingCandidates] = await Promise.all([
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
      includeShortTerm ? this.prisma.slotBooking.findMany({
        where: {
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          ...(mallIds ? { slot: { unit: { mallId: { in: mallIds } } } } : {}),
          ...(search ? { OR: [
            { bookingRef: { contains: search, mode: 'insensitive' } },
            { customer: { companyName: { contains: search, mode: 'insensitive' } } },
            { lead: { brandName: { contains: search, mode: 'insensitive' } } },
          ] } : {}),
        },
        take: 200,
        orderBy: { startDatetime: 'asc' },
        include: {
          customer: { select: { companyName: true, brandName: true, taxCode: true, tenantId: true } },
          lead: { select: { brandName: true, company: true, tenantId: true } },
          slot: { select: { code: true, name: true, unit: { select: { mallId: true, code: true } } } },
        },
      }) : [],
      includeParking ? this.prisma.parkingMonthlyStatement.findMany({
        where: {
          // Trạng thái thu tiền không thay thế nghĩa vụ xuất hóa đơn.
          status: { in: ['UNPAID', 'PARTIAL', 'PAID'] },
          contract: {
            isActive: true,
            status: { in: ['ACTIVE', 'EXPIRING'] },
            ...(mallIds ? { mallId: { in: mallIds } } : {}),
            ...(search ? { OR: [
              { contractNumber: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
              { tenant: { OR: [
                { brandName: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
              ] } },
            ] } : {}),
          },
        },
        take: 200,
        orderBy: { issueDate: 'asc' },
        include: {
          contract: { include: { tenant: true } },
          lines: true,
          payments: { orderBy: { paidAt: 'desc' } },
        },
      }) : [],
    ]);

    const [billedShortTermIds, billedParkingIds] = await Promise.all([
      shortTermCandidates.length
        ? this.prisma.invoice.findMany({
            where: { sourceType: 'SHORT_TERM_BOOKING', sourceId: { in: shortTermCandidates.map((row) => row.id) }, isActive: true },
            select: { sourceId: true },
          }).then((rows) => new Set(rows.map((invoice) => invoice.sourceId)))
        : Promise.resolve(new Set<string | null>()),
      parkingCandidates.length
        ? this.prisma.invoice.findMany({
            where: { sourceType: 'PARKING', sourceId: { in: parkingCandidates.map((row) => row.id) }, isActive: true },
            select: { sourceId: true },
          }).then((rows) => new Set(rows.map((invoice) => invoice.sourceId)))
        : Promise.resolve(new Set<string | null>()),
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
    const shortTerm = shortTermCandidates
      .filter((row) => !billedShortTermIds.has(row.id))
      .map((row) => ({
        id: row.id,
        sourceType: 'SHORT_TERM_BOOKING',
        contractId: null,
        contractNumber: row.bookingRef,
        counterpartyName: row.customer?.companyName || row.customer?.brandName || row.lead?.company || row.lead?.brandName || 'Khách thuê ngắn hạn',
        taxCode: row.customer?.taxCode || null,
        mallId: row.slot.unit.mallId,
        unitCode: `${row.slot.unit.code} / ${row.slot.code}`,
        period: `${row.startDatetime.getFullYear()}-${String(row.startDatetime.getMonth() + 1).padStart(2, '0')}`,
        milestone: `Thuê ngắn hạn ${row.slot.name}`,
        subtotal: row.totalAmount,
        vatRate: 10,
        totalAmount: row.totalAmount * 1.1,
        paidAmount: row.paidAmount || 0,
        amountToCollect: Math.max(0, row.totalAmount * 1.1 - (row.paidAmount || 0)),
        sourceStatus: row.status,
        invoicePlannedDate: row.createdAt,
        dueDate: row.startDatetime,
        ...timing(row.startDatetime, row.createdAt),
      }));
    const parking = parkingCandidates
      .filter((row) => !billedParkingIds.has(row.id))
      .map((row) => ({
        id: row.id,
        sourceType: 'PARKING',
        contractId: row.contractId,
        contractNumber: row.contract.contractNumber,
        counterpartyName: row.contract.tenant.brandName || row.contract.tenant.companyName,
        taxCode: row.contract.tenant.taxCode,
        mallId: row.contract.mallId,
        unitCode: null,
        period: row.period,
        milestone: `Phí bãi xe ${row.period}`,
        contractType: row.contract.contractType,
        subtotal: row.totalAmount,
        vatRate: 10,
        totalAmount: row.totalAmount * 1.1,
        invoicePlannedDate: row.issueDate,
        dueDate: row.dueDate,
        ...timing(row.dueDate, row.issueDate),
      }));
    const data = [...lease, ...service, ...shortTerm, ...parking].sort((a, b) =>
      new Date(a.invoicePlannedDate).getTime() - new Date(b.invoicePlannedDate).getTime());
    const dueRows = data.filter((row) => row.isDueForInvoice);
    const collectible = (row: { totalAmount: number; amountToCollect?: number }) =>
      row.amountToCollect ?? row.totalAmount;
    return {
      data,
      total: data.length,
      summary: {
        count: data.length,
        amount: data.reduce((sum, row) => sum + collectible(row), 0),
        dueCount: dueRows.length,
        dueAmount: dueRows.reduce((sum, row) => sum + collectible(row), 0),
        bySource: {
          LEASE_CONTRACT: { count: lease.length, amount: lease.reduce((sum, row) => sum + row.totalAmount, 0) },
          SERVICE_CONTRACT: { count: service.length, amount: service.reduce((sum, row) => sum + row.totalAmount, 0) },
          SHORT_TERM_BOOKING: { count: shortTerm.length, amount: shortTerm.reduce((sum, row) => sum + row.totalAmount, 0) },
          PARKING: { count: parking.length, amount: parking.reduce((sum, row) => sum + collectible(row), 0) },
        },
      },
    };
  }

  async createInvoiceFromPending(sourceType: string, id: string, userId: string, mallIds?: string[]) {
    if (sourceType === 'LEASE_CONTRACT') {
      const row = await this.prisma.billingScheduleEntry.findFirst({
        where: { id, ...(mallIds ? { contract: { unit: { mallId: { in: mallIds } } } } : {}) },
        include: { contract: { include: { unit: true, tenant: true } }, invoice: true },
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
          mallId: row.contract.unit.mallId,
          counterpartyName: row.contract.tenant.companyName,
          counterpartyTaxCode: row.contract.tenant.taxCode,
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
          mallId: payment.contract.mallId,
          counterpartyName: payment.contract.counterpartyName,
          counterpartyTaxCode: payment.contract.counterpartyTax,
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
    if (sourceType === 'PARKING') {
      const statement = await this.prisma.parkingMonthlyStatement.findFirst({
        where: {
          id,
          status: { in: ['UNPAID', 'PARTIAL', 'PAID'] },
          ...(mallIds ? { contract: { mallId: { in: mallIds } } } : {}),
        },
        include: {
          contract: { include: { tenant: true } },
          lines: true,
          payments: { orderBy: { paidAt: 'desc' } },
        },
      });
      if (!statement) throw new NotFoundException('Không tìm thấy bảng kê bãi xe chờ xuất hóa đơn');
      const existing = await this.prisma.invoice.findFirst({
        where: { sourceType: 'PARKING', sourceId: statement.id, isActive: true },
      });
      if (existing) return existing;

      const subtotal = statement.totalAmount;
      const vatRate = 10;
      const vatAmount = subtotal * vatRate / 100;
      return this.runSerializableTransaction(async (tx) => {
        const invoice = await tx.invoice.create({ data: {
          invoiceNumber: `PARKING-${statement.id}`,
          tenantId: statement.contract.tenantId,
          mallId: statement.contract.mallId,
          counterpartyName: statement.contract.tenant.companyName,
          counterpartyTaxCode: statement.contract.tenant.taxCode,
          sourceType: 'PARKING',
          sourceId: statement.id,
          period: statement.period,
          type: 'PARKING',
          subtotal,
          vatRate,
          vatAmount,
          totalAmount: subtotal + vatAmount,
          dueDate: statement.dueDate,
          notes: `${statement.contract.contractNumber} - bảng kê bãi xe ${statement.period}`,
          lines: { create: statement.lines.map((line, order) => ({
            type: 'PARKING',
            description: `${line.vehicleType}: ${line.actualQuantity} xe${line.excessQuantity ? ` (vượt ${line.excessQuantity})` : ''}`,
            qty: line.actualQuantity,
            unitPrice: line.actualQuantity > 0 ? line.totalAmount / line.actualQuantity : line.totalAmount,
            amount: line.totalAmount,
            order,
          })) },
        } });
        if (statement.paidAmount > 0) {
          const latestSourcePayment = statement.payments[0];
          await tx.payment.create({ data: {
            invoiceId: invoice.id,
            tenantId: statement.contract.tenantId,
            amount: Math.min(invoice.totalAmount, statement.paidAmount),
            method: PaymentMethod.BANK_TRANSFER,
            reference: latestSourcePayment?.referenceNo || `PARKING-${statement.id}`,
            paidAt: latestSourcePayment?.paidAt || new Date(),
            notes: 'Đồng bộ khoản thanh toán đã ghi nhận tại Parking',
            idempotencyKey: `parking-source-payment:${statement.id}`,
          } });
        }
        await tx.parkingMonthlyStatement.update({
          where: { id: statement.id },
          data: { reconciliationStatus: 'TRANSFERRED_TO_BILLING' },
        });
        return invoice;
      });
    }
    if (sourceType === 'SHORT_TERM_BOOKING') {
      const booking = await this.prisma.slotBooking.findFirst({
        where: { id, ...(mallIds ? { slot: { unit: { mallId: { in: mallIds } } } } : {}) },
        include: {
          customer: true,
          lead: true,
          slot: { include: { unit: true } },
        },
      });
      if (!booking) throw new NotFoundException('Không tìm thấy booking thuê ngắn hạn');
      if (!['CONFIRMED', 'COMPLETED'].includes(booking.status)) {
        throw new BadRequestException('Booking phải được xác nhận trước khi xuất hóa đơn');
      }
      const existing = await this.prisma.invoice.findFirst({
        where: { sourceType: 'SHORT_TERM_BOOKING', sourceId: booking.id, isActive: true },
      });
      if (existing) return existing;

      const subtotal = booking.totalAmount;
      const vatRate = 10;
      const vatAmount = subtotal * vatRate / 100;
      const counterpartyName = booking.customer?.companyName || booking.customer?.brandName
        || booking.lead?.company || booking.lead?.brandName || 'Khách thuê ngắn hạn';
      const tenantId = booking.customer?.tenantId || booking.lead?.tenantId || undefined;
      const period = `${booking.startDatetime.getFullYear()}-${String(booking.startDatetime.getMonth() + 1).padStart(2, '0')}`;
      return this.runSerializableTransaction(async (tx) => tx.invoice.create({ data: {
        invoiceNumber: `ST-BOOKING-${booking.id}`,
        mallId: booking.slot.unit.mallId,
        tenantId,
        counterpartyName,
        counterpartyTaxCode: booking.customer?.taxCode,
        sourceType: 'SHORT_TERM_BOOKING',
        sourceId: booking.id,
        period,
        type: 'MONTHLY_RENT',
        subtotal,
        vatRate,
        vatAmount,
        totalAmount: subtotal + vatAmount,
        dueDate: booking.startDatetime,
        notes: `${booking.bookingRef} - ${booking.slot.unit.code}/${booking.slot.code}`,
        lines: { create: {
          type: 'SHORT_TERM_RENT',
          description: `Thuê ngắn hạn ${booking.slot.name}: ${booking.startDatetime.toLocaleDateString('vi-VN')} - ${booking.endDatetime.toLocaleDateString('vi-VN')}`,
          qty: 1,
          unitPrice: subtotal,
          amount: subtotal,
        } },
      } }));
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
      { mallId: { in: mallIds } },
      { contract: { unit: { mallId: { in: mallIds } } } },
      { billingParty: { mallId: { in: mallIds } } },
    ] });
    if (search) {
      and.push({ OR: [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { counterpartyName: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { sourceId: { contains: search, mode: 'insensitive' } },
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

    const parkingSourceIds = rawData
      .filter((invoice) => invoice.sourceType === 'PARKING' && invoice.sourceId)
      .map((invoice) => invoice.sourceId as string);
    const parkingSources = parkingSourceIds.length
      ? await this.prisma.parkingMonthlyStatement.findMany({
          where: { id: { in: parkingSourceIds } },
          select: {
            id: true, period: true, status: true, paidAmount: true, totalAmount: true,
            contract: { select: { contractNumber: true, contractType: true } },
          },
        })
      : [];
    const parkingSourceMap = new Map(parkingSources.map((source) => [source.id, source]));
    const today = new Date();
    const enrich = (invoice: any) => {
      const { adjustedTotal, totalPaid, balance } = this.financials(invoice);
      const parkingSource = invoice.sourceType === 'PARKING'
        ? parkingSourceMap.get(invoice.sourceId)
        : undefined;
      const daysOverdue = balance > 0 && new Date(invoice.dueDate) < today
        ? Math.max(1, Math.floor((today.getTime() - new Date(invoice.dueDate).getTime()) / 86400000))
        : 0;
      return {
        ...invoice, adjustedTotal, totalPaid, balance, daysOverdue,
        sourceContractNumber: parkingSource?.contract.contractNumber,
        sourceContractType: parkingSource?.contract.contractType,
        sourceStatus: parkingSource?.status,
        sourcePaidAmount: parkingSource?.paidAmount,
        sourceTotalAmount: parkingSource?.totalAmount,
      };
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
        adjustments: { orderBy: { createdAt: 'desc' } },
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
    if (dto.contractId) {
      const contract = await this.prisma.contract.findUnique({
        where: { id: dto.contractId },
        select: { id: true, tenantId: true, isActive: true },
      });
      if (!contract || !contract.isActive) throw new BadRequestException('Hợp đồng không tồn tại hoặc không hoạt động');
      if (dto.tenantId && contract.tenantId !== dto.tenantId) {
        throw new BadRequestException('Khách thuê không thuộc hợp đồng đã chọn');
      }
    }
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
    await this.recomputeInvoiceStatusFromPayments(id);
    return (await this.prisma.invoice.findUnique({ where: { id } })) ?? updated;
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

  async getInvoiceSummary(invoiceId: string, currentUser?: CurrentUser) {
    const invoice = await this.findOneInvoice(invoiceId, currentUser);
    return {
      ...invoice,
      ...this.financials(invoice),
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
    const payableStatuses: InvoiceStatus[] = [
      InvoiceStatus.ISSUED,
      InvoiceStatus.PARTIALLY_PAID,
      InvoiceStatus.OVERDUE,
    ];
    if (!payableStatuses.includes(invoice.status)) {
      throw new BadRequestException('Chỉ có thể ghi nhận thanh toán cho hóa đơn đã phát hành');
    }
    const { balance } = this.financials(invoice);
    if (dto.amount > balance) {
      throw new BadRequestException(`Số tiền thanh toán vượt quá dư nợ còn lại (${balance.toLocaleString('vi-VN')} VND)`);
    }
    if (dto.paidAt && new Date(dto.paidAt).getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException('Ngày thanh toán không được nằm trong tương lai');
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
    const grossPaid = activePayments.reduce((s, p) => s + p.amount, 0);
    const totalPaid = Math.max(0, grossPaid - (invoice.refundedAmount ?? 0));
    const adjustedTotal = Math.max(0, invoice.totalAmount + (invoice.adjustmentAmount ?? 0));

    let newStatus: InvoiceStatus;
    if (totalPaid >= adjustedTotal && (totalPaid > 0 || adjustedTotal === 0)) {
      newStatus = InvoiceStatus.PAID;
    } else if (totalPaid > 0) {
      newStatus = InvoiceStatus.PARTIALLY_PAID;
    } else {
      newStatus = invoice.issuedAt
        ? (invoice.dueDate < new Date() ? InvoiceStatus.OVERDUE : InvoiceStatus.ISSUED)
        : InvoiceStatus.DRAFT;
    }

    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus, paidAt: newStatus === InvoiceStatus.PAID ? new Date() : null },
    });
    await this.syncSourceReceivable(invoiceId, db);
  }

  private async syncSourceReceivable(
    invoiceId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { payments: { where: { reversedAt: null } } } });
    if (!invoice || !['SERVICE_CONTRACT', 'PARKING'].includes(invoice.sourceType)) return;
    const paidAmount = Math.max(0, (invoice.payments || []).reduce((sum, payment) => sum + payment.amount, 0) - (invoice.refundedAmount || 0));
    if (invoice.sourceType === 'SERVICE_CONTRACT') {
      const statusMap: Record<InvoiceStatus, string> = {
        DRAFT: 'PENDING', ISSUED: 'PENDING', PARTIALLY_PAID: 'PARTIAL', PAID: 'PAID', OVERDUE: 'OVERDUE', CANCELLED: 'CANCELLED',
      };
      await db.serviceContractPayment.updateMany({ where: { invoiceId }, data: {
        billingStatus: invoice.status === InvoiceStatus.DRAFT ? 'INVOICE_DRAFT' : invoice.status,
        status: statusMap[invoice.status], paidAmount,
        paidDate: invoice.status === InvoiceStatus.PAID ? (invoice.paidAt || new Date()) : null,
      } });
      return;
    }
    if (invoice.sourceType === 'PARKING' && invoice.sourceId) {
      const statement = await db.parkingMonthlyStatement.findUnique({
        where: { id: invoice.sourceId },
        select: { totalAmount: true },
      });
      if (!statement) return;
      const sourcePaidAmount = Math.min(statement.totalAmount, paidAmount);
      const sourceStatus = sourcePaidAmount >= statement.totalAmount
        ? 'PAID'
        : sourcePaidAmount > 0 ? 'PARTIAL' : 'UNPAID';
      await db.parkingMonthlyStatement.update({
        where: { id: invoice.sourceId },
        data: { paidAmount: sourcePaidAmount, status: sourceStatus },
      });
    }
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
    if ((invoice.adjustments ?? []).some((adjustment) => adjustment.status === 'APPROVED')) {
      throw new BadRequestException('Hóa đơn còn bút toán điều chỉnh hiệu lực — phải hủy bút toán trước khi hủy hóa đơn');
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
    await this.syncSourceReceivable(invoiceId);
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

  async createInvoiceAdjustment(invoiceId: string, dto: {
    type: InvoiceAdjustmentType; amount: number; reason: string; reference?: string;
  }, userId: string) {
    const invoice = await this.findOneInvoice(invoiceId);
    const lockedStatuses: InvoiceStatus[] = [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED];
    const reducingTypes: InvoiceAdjustmentType[] = [InvoiceAdjustmentType.CREDIT_NOTE, InvoiceAdjustmentType.WRITE_OFF];
    if (lockedStatuses.includes(invoice.status)) {
      throw new BadRequestException('Chỉ điều chỉnh hóa đơn đã phát hành và còn hiệu lực');
    }
    if (!Object.values(InvoiceAdjustmentType).includes(dto.type)) throw new BadRequestException('Loại bút toán điều chỉnh không hợp lệ');
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new BadRequestException('Số tiền điều chỉnh phải lớn hơn 0');
    if (!dto.reason?.trim()) throw new BadRequestException('Phải nêu lý do điều chỉnh');
    const totals = this.financials(invoice);
    if (reducingTypes.includes(dto.type) && dto.amount > totals.balance) {
      throw new BadRequestException('Số tiền giảm trừ vượt quá dư nợ còn lại');
    }
    if (dto.type === InvoiceAdjustmentType.REFUND && dto.amount > totals.totalPaid) {
      throw new BadRequestException('Số tiền hoàn vượt quá số tiền đã thu ròng');
    }
    return this.runSerializableTransaction(async (tx) => {
      const adjustment = await tx.invoiceAdjustment.create({ data: {
        invoiceId, type: dto.type, amount: dto.amount, reason: dto.reason.trim(),
        reference: dto.reference?.trim() || null, createdById: userId,
      } });
      const adjustmentDelta = dto.type === InvoiceAdjustmentType.DEBIT_NOTE ? dto.amount
        : reducingTypes.includes(dto.type) ? -dto.amount : 0;
      await tx.invoice.update({ where: { id: invoiceId }, data: {
        adjustmentAmount: { increment: adjustmentDelta },
        refundedAmount: { increment: dto.type === InvoiceAdjustmentType.REFUND ? dto.amount : 0 },
      } });
      await this.recomputeInvoiceStatusFromPayments(invoiceId, tx);
      return adjustment;
    });
  }

  async listInvoiceDocuments(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.prisma.unifiedDocument.findMany({
      where: { entityType: 'INVOICE', entityId: invoiceId, isActive: true },
      orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
    });
  }

  async uploadInvoiceDocument(invoiceId: string, file: Express.Multer.File, uploadedById: string, documentType = 'SUPPORTING_DOCUMENT') {
    if (!file) throw new BadRequestException('Phải chọn tài liệu cần tải lên');
    if (file.size > 20 * 1024 * 1024) throw new BadRequestException('Tài liệu không được vượt quá 20 MB');
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Chỉ hỗ trợ PDF, JPG, PNG hoặc XLSX');
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, mallId: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!this.storage) throw new BadRequestException('Dịch vụ lưu trữ chưa sẵn sàng');
    const safeType = documentType.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 50) || 'SUPPORTING_DOCUMENT';
    const saved = await this.storage.saveFile(file, `billing/invoices/${invoiceId}`);
    const latest = await this.prisma.unifiedDocument.findFirst({
      where: { entityType: 'INVOICE', entityId: invoiceId, documentType: safeType },
      orderBy: { version: 'desc' },
    });
    if (latest) await this.prisma.unifiedDocument.update({ where: { id: latest.id }, data: { isLatest: false } });
    return this.prisma.unifiedDocument.create({ data: {
      mallId: invoice.mallId,
      entityType: 'INVOICE', entityId: invoiceId,
      category: safeType === 'E_INVOICE' ? 'SIGNED' : 'ORIGINAL',
      documentType: safeType,
      fileName: saved.fileName, filePath: saved.filePath, fileSize: file.size, mimeType: file.mimetype,
      version: (latest?.version ?? 0) + 1, uploadedById,
    } });
  }

  async requestElectronicInvoice(invoiceId: string) {
    const invoice = await this.findOneInvoice(invoiceId);
    if ([InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED].includes(invoice.status as any)) {
      throw new BadRequestException('Hóa đơn phải được phát hành trước khi gửi hóa đơn điện tử');
    }
    if (invoice.electronicInvoiceStatus === 'ISSUED') return invoice;
    const counterpartyName = invoice.counterpartyName || invoice.tenant?.companyName || invoice.billingParty?.name;
    const taxCode = invoice.counterpartyTaxCode || invoice.tenant?.taxCode || invoice.billingParty?.taxCode;
    if (!counterpartyName) throw new BadRequestException('Hóa đơn chưa có thông tin đối tượng thanh toán');
    if (!invoice.lines.length) throw new BadRequestException('Hóa đơn chưa có dòng hàng hóa/dịch vụ');
    const payload = JSON.stringify({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      counterparty: { name: counterpartyName, taxCode },
      period: invoice.period,
      issuedAt: invoice.issuedAt,
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      totalAmount: invoice.totalAmount + invoice.adjustmentAmount,
      lines: invoice.lines.map((line) => ({ description: line.description, qty: line.qty, unitPrice: line.unitPrice, amount: line.amount })),
    });
    const idempotencyKey = `E_INVOICE:${invoice.id}:ISSUE`;
    await this.prisma.sapIntegrationLog.upsert({
      where: { idempotencyKey },
      update: { payload, status: 'PENDING', errorMessage: null },
      create: { entityType: 'E_INVOICE', entityId: invoice.id, endpoint: '/electronic-invoices', payload, status: 'PENDING', idempotencyKey },
    });
    return this.prisma.invoice.update({ where: { id: invoice.id }, data: {
      electronicInvoiceStatus: 'PENDING', electronicInvoiceError: null,
    } });
  }

  async completeElectronicInvoice(invoiceId: string, dto: { success: boolean; reference?: string; legalInvoiceNumber?: string; error?: string }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (dto.success && !dto.legalInvoiceNumber?.trim()) throw new BadRequestException('Phải nhập số hóa đơn pháp lý');
    await this.prisma.sapIntegrationLog.updateMany({
      where: { entityType: 'E_INVOICE', entityId: invoiceId, status: { in: ['PENDING', 'RETRYING'] } },
      data: { status: dto.success ? 'SUCCESS' : 'FAILED', response: dto.reference || null, errorMessage: dto.success ? null : (dto.error || 'Provider rejected invoice') },
    });
    return this.prisma.invoice.update({ where: { id: invoiceId }, data: dto.success ? {
      electronicInvoiceStatus: 'ISSUED', electronicInvoiceRef: dto.reference?.trim() || null,
      electronicInvoiceIssuedAt: new Date(), legalInvoiceNumber: dto.legalInvoiceNumber!.trim(), electronicInvoiceError: null,
    } : {
      electronicInvoiceStatus: 'FAILED', electronicInvoiceError: dto.error?.trim() || 'Provider rejected invoice',
    } });
  }

  async cancelInvoiceAdjustment(adjustmentId: string, reason: string, userId: string) {
    const adjustment = await this.prisma.invoiceAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adjustment) throw new NotFoundException('Không tìm thấy bút toán điều chỉnh');
    if (adjustment.status === 'CANCELLED') throw new BadRequestException('Bút toán đã được hủy trước đó');
    if (!reason?.trim()) throw new BadRequestException('Phải nêu lý do hủy bút toán');
    const reducingTypes: InvoiceAdjustmentType[] = [InvoiceAdjustmentType.CREDIT_NOTE, InvoiceAdjustmentType.WRITE_OFF];
    return this.runSerializableTransaction(async (tx) => {
      const cancelled = await tx.invoiceAdjustment.update({ where: { id: adjustmentId }, data: {
        status: 'CANCELLED', cancelledAt: new Date(), cancelledById: userId, cancelReason: reason.trim(),
      } });
      const adjustmentDelta = adjustment.type === InvoiceAdjustmentType.DEBIT_NOTE ? -adjustment.amount
        : reducingTypes.includes(adjustment.type) ? adjustment.amount : 0;
      await tx.invoice.update({ where: { id: adjustment.invoiceId }, data: {
        adjustmentAmount: { increment: adjustmentDelta },
        refundedAmount: { increment: adjustment.type === InvoiceAdjustmentType.REFUND ? -adjustment.amount : 0 },
      } });
      await this.recomputeInvoiceStatusFromPayments(adjustment.invoiceId, tx);
      return cancelled;
    });
  }

  async calculateRevenueShare(period: string, mallIds?: string[]) {
    // Find all sales turnovers for this period where contract has revenue share %
    const salesWhere: any = { period };
    if (mallIds) salesWhere.unit = { mallId: { in: mallIds } };

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

  async exportInvoicesExcel(query: { status?: InvoiceStatus; tenantId?: string; period?: string; search?: string; mallId?: string }, mallIds?: string[]) {
    const filters: any[] = [];
    const where: any = { isActive: true, AND: filters };
    if (query.status) where.status = query.status;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.period) where.period = query.period;
    if (mallIds) filters.push({ OR: [
      { mallId: { in: mallIds } },
      { contract: { unit: { mallId: { in: mallIds } } } },
      { billingParty: { mallId: { in: mallIds } } },
    ] });
    if (query.search) {
      filters.push({ OR: [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { tenant: { brandName: { contains: query.search, mode: 'insensitive' } } },
        { billingParty: { name: { contains: query.search, mode: 'insensitive' } } },
      ] });
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        tenant: { select: { brandName: true, companyName: true } },
        contract: { select: { contractNumber: true } },
        mall: { select: { code: true, name: true } },
        payments: { select: { amount: true, reversedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'THISO Leasing Platform';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Hóa đơn', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'STT', key: 'index', width: 7 },
      { header: 'Mall', key: 'mall', width: 26 },
      { header: 'Số hóa đơn', key: 'invoiceNumber', width: 30 },
      { header: 'Đối tượng công nợ', key: 'counterparty', width: 30 },
      { header: 'Công ty', key: 'company', width: 30 },
      { header: 'Số hợp đồng', key: 'contractNumber', width: 22 },
      { header: 'Nguồn', key: 'sourceType', width: 22 },
      { header: 'Kỳ', key: 'period', width: 12 },
      { header: 'Loại', key: 'type', width: 22 },
      { header: 'Tạm tính', key: 'subtotal', width: 18 },
      { header: 'VAT', key: 'vatAmount', width: 18 },
      { header: 'Điều chỉnh', key: 'adjustmentAmount', width: 18 },
      { header: 'Tổng sau điều chỉnh', key: 'adjustedTotal', width: 22 },
      { header: 'Đã thanh toán', key: 'totalPaid', width: 20 },
      { header: 'Còn phải thu', key: 'balance', width: 20 },
      { header: 'Hạn thanh toán', key: 'dueDate', width: 18 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Ngày tạo', key: 'createdAt', width: 18 },
    ];
    invoices.forEach((inv, index) => {
      const { adjustedTotal, totalPaid, balance } = this.financials(inv);
      sheet.addRow({
        index: index + 1,
        mall: inv.mall ? `${inv.mall.code} — ${inv.mall.name}` : '',
        invoiceNumber: inv.invoiceNumber,
        counterparty: inv.counterpartyName || inv.tenant?.brandName || '',
        company: inv.tenant?.companyName || '',
        contractNumber: inv.contract?.contractNumber || '',
        sourceType: inv.sourceType || '',
        period: inv.period,
        type: inv.type,
        subtotal: inv.subtotal,
        vatAmount: inv.vatAmount,
        adjustmentAmount: inv.adjustmentAmount,
        adjustedTotal,
        totalPaid,
        balance,
        dueDate: inv.dueDate,
        status: inv.status,
        createdAt: inv.createdAt,
      });
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    sheet.getRow(1).height = 26;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    for (const key of ['subtotal', 'vatAmount', 'adjustmentAmount', 'adjustedTotal', 'totalPaid', 'balance']) {
      sheet.getColumn(key).numFmt = '#,##0';
    }
    sheet.getColumn('dueDate').numFmt = 'dd/mm/yyyy';
    sheet.getColumn('createdAt').numFmt = 'dd/mm/yyyy';
    return workbook.xlsx.writeBuffer();
  }

  async getArAging(mallIds?: string[]) {
    const today = new Date();
    const overdue = await this.prisma.invoice.findMany({
      where: {
        isActive: true,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
        ...(mallIds ? { OR: [{ mallId: { in: mallIds } }, { contract: { unit: { mallId: { in: mallIds } } } }, { billingParty: { mallId: { in: mallIds } } }] } : {}),
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
      const { balance: outstanding } = this.financials(inv);
      if (outstanding <= 0) continue;

      const daysDue = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000);

      const counterpartyKey = inv.tenantId ? `tenant:${inv.tenantId}` : inv.billingPartyId ? `party:${inv.billingPartyId}` : `invoice:${inv.id}`;
      if (!byTenant[counterpartyKey]) {
        byTenant[counterpartyKey] = {
          tenant: inv.tenant,
          billingParty: inv.billingParty,
          counterpartyName: inv.counterpartyName || inv.tenant?.brandName || inv.billingParty?.name || 'Chưa xác định',
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
