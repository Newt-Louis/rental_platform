import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';

describe('BillingService payment transaction safety', () => {
  const tx = {
    payment: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    invoice: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    parkingMonthlyStatement: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
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

  it('creates payment and updates invoice status in one transaction', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      payments: [],
    });
    tx.payment.create.mockResolvedValue({ id: 'payment-1', amount: 100 });
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      totalAmount: 100,
      status: InvoiceStatus.ISSUED,
      issuedAt: new Date(),
    });
    tx.payment.findMany.mockResolvedValue([{ amount: 100 }]);

    const result = await service.recordPayment('invoice-1', {
      amount: 100,
      method: PaymentMethod.BANK_TRANSFER,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.payment.create).toHaveBeenCalled();
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { status: InvoiceStatus.PAID, paidAt: expect.any(Date) },
    });
    expect(result.id).toBe('payment-1');
  });

  it('synchronizes a Billing payment back to its Parking statement', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-parking', tenantId: 'tenant-1', status: InvoiceStatus.ISSUED,
      sourceType: 'PARKING', sourceId: 'statement-1', totalAmount: 1_100, payments: [],
    });
    tx.payment.create.mockResolvedValue({ id: 'payment-parking', amount: 1_100 });
    tx.payment.findMany.mockResolvedValue([{ amount: 1_100, reversedAt: null }]);
    tx.invoice.findUnique
      .mockResolvedValueOnce({
        id: 'invoice-parking', totalAmount: 1_100, refundedAmount: 0,
        status: InvoiceStatus.ISSUED, issuedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'invoice-parking', sourceType: 'PARKING', sourceId: 'statement-1',
        status: InvoiceStatus.PAID, refundedAmount: 0,
        payments: [{ amount: 1_100, reversedAt: null }],
      });
    tx.parkingMonthlyStatement.findUnique.mockResolvedValue({ totalAmount: 1_000 });

    await service.recordPayment('invoice-parking', { amount: 1_100 });

    expect(tx.parkingMonthlyStatement.update).toHaveBeenCalledWith({
      where: { id: 'statement-1' },
      data: { paidAmount: 1_000, status: 'PAID' },
    });
  });

  it('rolls back the payment when invoice status recomputation fails', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      payments: [],
    });
    prisma.$transaction.mockRejectedValue(new Error('invoice update failed'));

    await expect(service.recordPayment('invoice-1', { amount: 100 })).rejects.toThrow(
      'invoice update failed',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('reverses payment and recomputes invoice status in one transaction', async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      invoiceId: 'invoice-1',
      reversedAt: null,
    });
    tx.payment.update.mockResolvedValue({ id: 'payment-1', reversedAt: new Date() });
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      totalAmount: 100,
      status: InvoiceStatus.PAID,
      issuedAt: new Date(),
    });
    tx.payment.findMany.mockResolvedValue([]);

    await service.reversePayment('payment-1', 'Duplicate transfer', 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        reversedAt: expect.any(Date),
        reversedById: 'user-1',
        reversalReason: 'Duplicate transfer',
      },
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { status: InvoiceStatus.ISSUED, paidAt: null },
    });
  });

  it('uses Serializable isolation for payment state transitions', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      payments: [],
    });
    tx.payment.create.mockResolvedValue({ id: 'payment-1' });
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      totalAmount: 100,
      status: InvoiceStatus.ISSUED,
      issuedAt: new Date(),
    });
    tx.payment.findMany.mockResolvedValue([{ amount: 100 }]);

    await service.recordPayment('invoice-1', { amount: 100 });

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
  });

  it('retries a bounded number of times on Prisma P2034 write conflicts', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      payments: [],
    });
    const conflict = new (jest.requireActual('@prisma/client').Prisma.PrismaClientKnownRequestError)(
      'write conflict',
      { code: 'P2034', clientVersion: '5.10.0' },
    );
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce((callback) => callback(tx));
    tx.payment.create.mockResolvedValue({ id: 'payment-1' });
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      totalAmount: 100,
      status: InvoiceStatus.ISSUED,
      issuedAt: new Date(),
    });
    tx.payment.findMany.mockResolvedValue([{ amount: 100 }]);

    await expect(service.recordPayment('invoice-1', { amount: 100 })).resolves.toEqual({
      id: 'payment-1',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('stops after three Serializable write-conflict attempts', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      payments: [],
    });
    const conflict = new (jest.requireActual('@prisma/client').Prisma.PrismaClientKnownRequestError)(
      'write conflict',
      { code: 'P2034', clientVersion: '5.10.0' },
    );
    prisma.$transaction.mockRejectedValue(conflict);

    await expect(service.recordPayment('invoice-1', { amount: 100 })).rejects.toMatchObject({
      code: 'P2034',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('returns the original payment when an idempotent retry has the same payload', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      payments: [],
    });
    const dto = { amount: 100, idempotencyKey: 'payment-request-1' };
    const hash = require('crypto').createHash('sha256').update(JSON.stringify({
      invoiceId: 'invoice-1',
      amount: 100,
      method: PaymentMethod.BANK_TRANSFER,
      reference: null,
      paidAt: null,
      notes: null,
    })).digest('hex');
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-existing',
      invoiceId: 'invoice-1',
      idempotencyKey: 'payment-request-1',
      idempotencyHash: hash,
      amount: 100,
    });

    await expect(service.recordPayment('invoice-1', dto)).resolves.toMatchObject({
      id: 'payment-existing',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    prisma.invoice.findUnique.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.ISSUED,
      payments: [],
    });
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-existing',
      invoiceId: 'invoice-1',
      idempotencyKey: 'payment-request-1',
      idempotencyHash: 'different-hash',
    });

    await expect(service.recordPayment('invoice-1', {
      amount: 200,
      idempotencyKey: 'payment-request-1',
    })).rejects.toMatchObject({ status: 409 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
