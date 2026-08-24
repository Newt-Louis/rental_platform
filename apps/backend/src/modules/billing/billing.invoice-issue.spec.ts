import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { BillingService } from './billing.service';

/**
 * Phase 4 hardening (docs/program/04-BILLING-FINANCE-COMPLETION.md): issueInvoice() used to
 * never check BillingConfig.notifyTenantOnIssue at all (confirmed dead flag, Phase 2/3
 * finding). These tests cover the flag actually being enforced, going through the retryable
 * EmailDeliveryService queue rather than a synchronous send, and a same-invoice retry being
 * a safe idempotent replay instead of an error.
 */
describe('BillingService.issueInvoice — notifyTenantOnIssue enforcement & idempotency', () => {
  const DRAFT_INVOICE = {
    id: 'inv-1',
    status: InvoiceStatus.DRAFT,
    invoiceNumber: 'INV-2026-00001',
    period: '2026-09',
    totalAmount: 11_000_000,
    dueDate: new Date('2026-09-05'),
    tenantId: 'tenant-1',
  };

  const tx = {
    invoice: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    invoiceLine: { findMany: jest.fn().mockResolvedValue([]) },
    billingConfig: { findFirst: jest.fn() },
  };
  const prisma: any = {
    invoice: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  };
  const emailService = { invoiceIssuedHtml: jest.fn().mockReturnValue('<html></html>') };
  const emailDelivery = { enqueue: jest.fn().mockResolvedValue({}) };
  const metrics = { increment: jest.fn() };
  let service: BillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.invoiceLine.findMany.mockResolvedValue([]);
    tx.invoice.findUnique.mockResolvedValue({ vatRate: 10 });
    service = new BillingService(
      prisma,
      undefined,
      emailService as any,
      emailDelivery as any,
      metrics as any,
    );
    jest.spyOn(service, 'findOneInvoice').mockResolvedValue(DRAFT_INVOICE as any);
    jest.spyOn(service as any, 'recomputeInvoiceStatusFromPayments').mockResolvedValue(undefined);
  });

  it('queues a tenant notification through the retryable delivery queue when the flag is on', async () => {
    tx.invoice.findUniqueOrThrow.mockResolvedValue(DRAFT_INVOICE);
    tx.invoice.update.mockResolvedValue({ ...DRAFT_INVOICE, status: InvoiceStatus.ISSUED, issuedAt: new Date() });
    tx.billingConfig.findFirst.mockResolvedValue({ notifyTenantOnIssue: true });
    // First tx.invoice.findUnique call is recalculateTotals' vatRate lookup; second is the
    // party-email lookup inside enqueueInvoiceIssuedNotification.
    tx.invoice.findUnique
      .mockResolvedValueOnce({ vatRate: 10 })
      .mockResolvedValueOnce({
        id: 'inv-1',
        tenant: { brandName: 'ABC Coffee', contactEmail: 'ap@abc.test' },
        billingParty: null,
      });
    prisma.invoice.findUnique.mockResolvedValue({ ...DRAFT_INVOICE, status: InvoiceStatus.ISSUED });

    await service.issueInvoice('inv-1');

    expect(emailDelivery.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ eventKey: 'invoice-issued:inv-1', to: 'ap@abc.test' }),
    );
  });

  it('issues successfully but sends no notification when the flag is off', async () => {
    tx.invoice.findUniqueOrThrow.mockResolvedValue(DRAFT_INVOICE);
    tx.invoice.update.mockResolvedValue({ ...DRAFT_INVOICE, status: InvoiceStatus.ISSUED });
    tx.billingConfig.findFirst.mockResolvedValue({ notifyTenantOnIssue: false });
    prisma.invoice.findUnique.mockResolvedValue({ ...DRAFT_INVOICE, status: InvoiceStatus.ISSUED });

    await service.issueInvoice('inv-1');

    expect(emailDelivery.enqueue).not.toHaveBeenCalled();
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: InvoiceStatus.ISSUED }) }),
    );
  });

  it('treats a same-invoice retry (already ISSUED) as an idempotent replay, not an error', async () => {
    const alreadyIssued = { ...DRAFT_INVOICE, status: InvoiceStatus.ISSUED };
    jest.spyOn(service, 'findOneInvoice').mockResolvedValue(alreadyIssued as any);
    tx.invoice.findUniqueOrThrow.mockResolvedValue(alreadyIssued);
    tx.billingConfig.findFirst.mockResolvedValue({ notifyTenantOnIssue: true });
    tx.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      tenant: { brandName: 'ABC Coffee', contactEmail: 'ap@abc.test' },
      billingParty: null,
    });
    prisma.invoice.findUnique.mockResolvedValue(alreadyIssued);

    const result = await service.issueInvoice('inv-1');

    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(emailDelivery.enqueue).toHaveBeenCalledTimes(1); // re-enqueued, safe no-op via upsert
    expect(metrics.increment).toHaveBeenCalledWith('duplicate_transition_blocked_total');
    expect(result.status).toBe(InvoiceStatus.ISSUED);
  });

  it('rejects issuing a CANCELLED invoice outright — not a safe replay case', async () => {
    const cancelled = { ...DRAFT_INVOICE, status: InvoiceStatus.CANCELLED };
    jest.spyOn(service, 'findOneInvoice').mockResolvedValue(cancelled as any);

    await expect(service.issueInvoice('inv-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
