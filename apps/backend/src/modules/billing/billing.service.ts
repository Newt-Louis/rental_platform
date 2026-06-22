import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async findAllInvoices(query: {
    status?: InvoiceStatus;
    tenantId?: string;
    period?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, search, ...filters } = query;
    const skip = (page - 1) * +limit;

    const where: any = { isActive: true };
    if (filters.status) where.status = filters.status;
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.period) where.period = filters.period;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { tenant: { brandName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: +limit,
        include: {
          tenant: { select: { id: true, brandName: true } },
          contract: { select: { id: true, contractNumber: true } },
          payments: { select: { id: true, amount: true, paidAt: true, method: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOneInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        tenant: true,
        contract: { include: { unit: { select: { id: true, code: true, name: true } } } },
        lines: { orderBy: { order: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async createInvoice(dto: {
    contractId: string;
    tenantId: string;
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

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.ISSUED, issuedAt: new Date() },
    });
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
    const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0);
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
  }) {
    const invoice = await this.findOneInvoice(invoiceId);

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        tenantId: invoice.tenantId,
        amount: dto.amount,
        method: dto.method ?? PaymentMethod.BANK_TRANSFER,
        reference: dto.reference,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        notes: dto.notes,
      },
    });

    const allPayments = await this.prisma.payment.findMany({ where: { invoiceId } });
    const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);

    let newStatus: InvoiceStatus;
    if (totalPaid >= invoice.totalAmount) {
      newStatus = InvoiceStatus.PAID;
    } else {
      newStatus = InvoiceStatus.PARTIALLY_PAID;
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus, paidAt: newStatus === InvoiceStatus.PAID ? new Date() : undefined },
    });

    return payment;
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
        payments: { select: { amount: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const header = ['Số HĐ', 'Khách thuê', 'Công ty', 'Số HĐ thuê', 'Kỳ', 'Loại', 'Tạm tính', 'VAT', 'Tổng tiền', 'Đã thanh toán', 'Còn lại', 'Hạn TT', 'Trạng thái', 'Ngày tạo'];
    const rows = invoices.map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
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

  async getArAging() {
    const today = new Date();
    const overdue = await this.prisma.invoice.findMany({
      where: {
        isActive: true,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      },
      include: {
        tenant: { select: { id: true, brandName: true, companyName: true } },
        payments: true,
      },
    });

    const byTenant: Record<string, any> = {};

    for (const inv of overdue) {
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
      const outstanding = inv.totalAmount - paid;
      if (outstanding <= 0) continue;

      const daysDue = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86400000);

      if (!byTenant[inv.tenantId]) {
        byTenant[inv.tenantId] = {
          tenant: inv.tenant,
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          days90plus: 0,
          total: 0,
        };
      }

      const bucket = byTenant[inv.tenantId];
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
