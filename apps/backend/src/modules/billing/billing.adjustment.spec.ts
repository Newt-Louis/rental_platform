import { BadRequestException } from '@nestjs/common';
import { InvoiceAdjustmentType, InvoiceStatus } from '@prisma/client';
import { BillingService } from './billing.service';

describe('BillingService invoice adjustments', () => {
  const tx = {
    invoiceAdjustment: { create: jest.fn(), update: jest.fn() },
    invoice: { update: jest.fn() },
  } as any;
  const prisma = {
    $transaction: jest.fn((callback: any) => callback(tx)),
    invoiceAdjustment: { findUnique: jest.fn() },
  } as any;
  let service: BillingService;

  const invoice = {
    id: 'invoice-1', status: InvoiceStatus.ISSUED, totalAmount: 1_000,
    adjustmentAmount: 0, refundedAmount: 0,
    payments: [{ amount: 400, reversedAt: null }], adjustments: [],
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingService(
      prisma,
      undefined,
      { invoiceIssuedHtml: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      { increment: jest.fn() } as any,
    );
    jest.spyOn(service, 'findOneInvoice').mockResolvedValue(invoice);
    jest.spyOn(service as any, 'recomputeInvoiceStatusFromPayments').mockResolvedValue(undefined);
    tx.invoiceAdjustment.create.mockResolvedValue({ id: 'adjustment-1' });
  });

  it('records a credit note and atomically reduces the invoice amount', async () => {
    await service.createInvoiceAdjustment('invoice-1', {
      type: InvoiceAdjustmentType.CREDIT_NOTE,
      amount: 200,
      reason: 'Commercial rebate',
    }, 'finance-1');

    expect(tx.invoiceAdjustment.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      invoiceId: 'invoice-1', type: InvoiceAdjustmentType.CREDIT_NOTE, amount: 200,
    }) });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { adjustmentAmount: { increment: -200 }, refundedAmount: { increment: 0 } },
    });
  });

  it('rejects refunds greater than the net amount collected', async () => {
    await expect(service.createInvoiceAdjustment('invoice-1', {
      type: InvoiceAdjustmentType.REFUND,
      amount: 401,
      reason: 'Refund duplicate transfer',
    }, 'finance-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cancels a write-off by applying the exact inverse delta', async () => {
    prisma.invoiceAdjustment.findUnique.mockResolvedValue({
      id: 'adjustment-1', invoiceId: 'invoice-1', type: InvoiceAdjustmentType.WRITE_OFF,
      amount: 150, status: 'APPROVED',
    });
    tx.invoiceAdjustment.update.mockResolvedValue({ id: 'adjustment-1', status: 'CANCELLED' });

    await service.cancelInvoiceAdjustment('adjustment-1', 'Entered against wrong invoice', 'finance-1');

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { adjustmentAmount: { increment: 150 }, refundedAmount: { increment: 0 } },
    });
  });
});
