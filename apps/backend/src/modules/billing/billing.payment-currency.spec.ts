import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';

// Multi-currency foundation (docs/program/MULTI_CURRENCY_ARCHITECTURE.md /
// MULTI_CURRENCY_TEST_MATRIX.md): Payment.currencyCode is always the
// invoice's -- there is no FX settlement in this system, so a mismatched
// currency must be rejected outright rather than silently coerced.
describe('BillingService.recordPayment currency invariant', () => {
  const tx = {
    payment: { create: jest.fn(), findMany: jest.fn() },
    invoice: { findUnique: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    invoice: { findUnique: jest.fn() },
    payment: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: BillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    service = new BillingService(
      prisma as unknown as PrismaService,
      undefined,
      { invoiceIssuedHtml: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      { increment: jest.fn() } as any,
    );
  });

  it('rejects a payment whose explicit currencyCode does not match the invoice (USD invoice + MMK payment)', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-usd',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      currencyCode: 'USD',
      totalAmount: 100,
      payments: [],
    });

    await expect(
      service.recordPayment('invoice-usd', { amount: 100, currencyCode: 'MMK' as any }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts a payment whose explicit currencyCode matches the invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-usd',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      currencyCode: 'USD',
      totalAmount: 100,
      payments: [],
    });
    tx.payment.create.mockResolvedValue({ id: 'payment-1', amount: 100, currencyCode: 'USD' });
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-usd', totalAmount: 100, status: InvoiceStatus.ISSUED, issuedAt: new Date(),
    });
    tx.payment.findMany.mockResolvedValue([{ amount: 100 }]);

    const result = await service.recordPayment('invoice-usd', {
      amount: 100,
      currencyCode: 'USD' as any,
      method: PaymentMethod.BANK_TRANSFER,
    });

    expect(result.currencyCode).toBe('USD');
  });

  it('inherits the invoice currency automatically when the caller sends none (MMK invoice)', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-mmk',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      currencyCode: 'MMK',
      totalAmount: 500,
      payments: [],
    });
    tx.payment.create.mockResolvedValue({ id: 'payment-2', amount: 500, currencyCode: 'MMK' });
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-mmk', totalAmount: 500, status: InvoiceStatus.ISSUED, issuedAt: new Date(),
    });
    tx.payment.findMany.mockResolvedValue([{ amount: 500 }]);

    await service.recordPayment('invoice-mmk', { amount: 500 });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ currencyCode: 'MMK' }),
    });
  });
});
