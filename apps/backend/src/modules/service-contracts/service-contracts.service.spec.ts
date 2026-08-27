import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ServiceContractsService } from './service-contracts.service';

describe('ServiceContractsService data boundaries', () => {
  const prisma = {
    serviceContract: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    serviceContractPayment: { findFirst: jest.fn(), delete: jest.fn(), count: jest.fn() },
    serviceContractChecklistItem: { findFirst: jest.fn(), update: jest.fn() },
    serviceContractMilestone: { findFirst: jest.fn(), update: jest.fn() },
    serviceContractDocument: { aggregate: jest.fn(), create: jest.fn() },
    mall: { findMany: jest.fn() },
  } as any;
  const storage = { saveFile: jest.fn(), deleteFile: jest.fn() } as any;
  let service: ServiceContractsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ServiceContractsService(prisma, storage);
  });

  it('rejects updating a checklist item that belongs to another contract', async () => {
    prisma.serviceContractChecklistItem.findFirst.mockResolvedValue(null);

    await expect(service.updateChecklist('contract-a', 'item-b', { isCompleted: true }, 'user-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.serviceContractChecklistItem.update).not.toHaveBeenCalled();
    expect(prisma.serviceContractChecklistItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'item-b', contractId: 'contract-a' },
      select: { id: true },
    });
  });

  it('rejects updating a milestone that belongs to another contract', async () => {
    prisma.serviceContractMilestone.findFirst.mockResolvedValue(null);

    await expect(service.updateMilestone('contract-a', 'item-b', { status: 'DONE' }, 'user-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.serviceContractMilestone.update).not.toHaveBeenCalled();
  });

  it('rejects a payment document linked to a different contract', async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({ id: 'contract-a', documents: [], payments: [] });
    prisma.serviceContractPayment.findFirst.mockResolvedValue(null);

    await expect(service.uploadDocument(
      'contract-a',
      { mimetype: 'application/pdf', size: 10 } as any,
      'INVOICE',
      'user-1',
      'payment-b',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('does not delete a payment already transferred to Billing', async () => {
    prisma.serviceContractPayment.findFirst.mockResolvedValue({ id: 'payment-1', invoiceId: 'invoice-1' });

    await expect(service.deletePayment('contract-1', 'payment-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.serviceContractPayment.delete).not.toHaveBeenCalled();
  });

  it('only renews expiring or expired contracts', async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({ id: 'contract-1', status: 'ACTIVE' });

    await expect(service.renew('contract-1', { contractNumber: 'PL-RENEW-001', endDate: '2027-12-31' }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the legal contract number instead of generating an internal number', async () => {
    await expect(service.create({
      contractNumber: '   ',
      title: 'Hợp đồng bảo trì',
      mallId: 'mall-1',
      counterpartyName: 'Đối tác',
      serviceCategory: 'MAINTENANCE',
      valueBasis: 'ANNUAL',
    } as any, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow marking a contract renewed without creating its renewal', async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({ id: 'contract-1', status: 'EXPIRED' });

    await expect(service.updateStatus('contract-1', 'RENEWED', undefined, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero-value payment schedules', async () => {
    prisma.serviceContract.findFirst.mockResolvedValue({ id: 'contract-1', defaultVatRate: 10 });

    await expect(service.createPayment('contract-1', {
      milestone: 'Đợt 1',
      dueDate: '2027-01-01',
      amount: 0,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported document types before storing the file', async () => {
    await expect(service.uploadDocument(
      'contract-1',
      { mimetype: 'application/pdf', size: 10 } as any,
      'UNTRUSTED_TYPE',
      'user-1',
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.saveFile).not.toHaveBeenCalled();
  });

  it('includes draft contracts in the expiring-soon list filter', async () => {
    prisma.serviceContract.findMany.mockResolvedValue([]);
    prisma.serviceContract.count.mockResolvedValue(0);

    await service.findAll({ alert: 'EXPIRING', alertDays: 30 }, ['mall-1']);

    expect(prisma.serviceContract.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        mallId: { in: ['mall-1'] },
        status: { in: expect.arrayContaining(['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'EXPIRING']) },
        endDate: { gte: expect.any(Date), lte: expect.any(Date) },
      }),
    }));
  });

  it('counts draft contracts in the 30-day expiry alert without enabling draft payment alerts', async () => {
    prisma.serviceContract.count.mockResolvedValue(1);
    prisma.serviceContractPayment.count.mockResolvedValue(0);

    const result = await service.alerts(['mall-1'], 30);

    expect(result.expiring).toBe(1);
    expect(prisma.serviceContract.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      status: { in: expect.arrayContaining(['DRAFT', 'ACTIVE', 'EXPIRING']) },
    }) });
    expect(prisma.serviceContractPayment.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      contract: expect.objectContaining({ status: { in: ['ACTIVE', 'EXPIRING'] } }),
    }) });
  });

  it('exports filtered contracts and their payment schedule to an Excel workbook', async () => {
    prisma.serviceContract.findMany.mockResolvedValue([{
      id: 'contract-1', contractNumber: 'PL-2026-001', title: 'Hợp đồng bảo trì', counterpartyName: 'Đối tác A',
      counterpartyTax: '0312345678', type: 'SERVICE', serviceCategory: 'MAINTENANCE', productName: 'Bảo trì hệ thống',
      status: 'ACTIVE', paymentDirection: 'PAYABLE', signedDate: new Date('2026-01-01'), startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'), totalValue: 120000000, valueBasis: 'ANNUAL', currency: 'VND', notes: null,
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-08-17'), mallId: 'mall-1',
      _count: { documents: 1 }, payments: [{
        milestone: 'Đợt 1', dueDate: new Date('2026-09-01'), subtotal: 10000000, vatRate: 10, vatAmount: 1000000,
        totalAmount: 11000000, amount: 11000000, paidAmount: null, currency: 'VND', status: 'PENDING',
        invoiceNumber: null, notes: null,
      }],
    }]);
    prisma.mall.findMany.mockResolvedValue([{ id: 'mall-1', code: 'SALA', name: 'Thiso Mall Sala' }]);

    const buffer = await service.exportExcel({ serviceCategory: 'MAINTENANCE' }, ['mall-1']);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Hợp đồng', 'Lịch thanh toán']);
    expect(workbook.getWorksheet('Hợp đồng')?.getCell('C2').value).toBe('PL-2026-001');
    expect(workbook.getWorksheet('Lịch thanh toán')?.getCell('F2').value).toBe('Đợt 1');
    expect(prisma.serviceContract.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ mallId: { in: ['mall-1'] }, serviceCategory: 'MAINTENANCE' }),
    }));
  });
});
