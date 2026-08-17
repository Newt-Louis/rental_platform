import * as ExcelJS from 'exceljs';
import { InventoryService } from './inventory.service';

describe('InventoryService Excel export', () => {
  const prisma = {
    inventoryItem: { findMany: jest.fn() },
    inventoryTransaction: { findMany: jest.fn() },
    inventoryCategory: { findMany: jest.fn() },
  } as any;
  let service: InventoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventoryService(prisma);
  });

  it('exports stock, transactions and categories within the accessible mall scope', async () => {
    prisma.inventoryItem.findMany.mockResolvedValue([{
      id: 'item-1', sku: 'VT-001', name: 'Bóng đèn', itemType: 'VTTH', unit: 'Cái',
      specification: 'LED 12W', manufacturer: 'THISO', location: 'Kho A', currentStock: 8,
      minStock: 10, averageCost: 50000, notes: null, updatedAt: new Date('2026-08-17T01:00:00Z'),
      mall: { code: 'SALA', name: 'Thiso Mall Sala' }, category: { name: 'Điện' },
    }]);
    prisma.inventoryTransaction.findMany.mockResolvedValue([{
      id: 'tx-1', transactionNo: 'KHO-001', transactionAt: new Date('2026-08-17T02:00:00Z'),
      type: 'IN', quantity: 8, unitCost: 50000, stockBefore: 0, stockAfter: 8,
      supplier: 'Nhà cung cấp A', recipient: null, department: 'Vận hành', referenceNo: 'PO-001',
      purpose: 'Bổ sung kho', notes: null, mall: { code: 'SALA', name: 'Thiso Mall Sala' },
      item: { sku: 'VT-001', name: 'Bóng đèn', unit: 'Cái', itemType: 'VTTH' },
      createdBy: { fullName: 'Nguyễn Văn A' },
    }]);
    prisma.inventoryCategory.findMany.mockResolvedValue([{
      id: 'category-1', code: 'DIEN', name: 'Điện', itemType: 'VTTH', description: 'Vật tư điện',
      mall: { code: 'SALA', name: 'Thiso Mall Sala' }, _count: { items: 1 },
    }]);

    const buffer = await service.exportExcel(['mall-1'], { itemType: 'VTTH', search: 'đèn' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Tồn kho', 'Sổ nhập xuất', 'Danh mục']);
    expect(workbook.getWorksheet('Tồn kho')?.getCell('C2').value).toBe('VT-001');
    expect(workbook.getWorksheet('Tồn kho')?.getCell('M2').value).toBe('Sắp hết / hết hàng');
    expect(workbook.getWorksheet('Sổ nhập xuất')?.getCell('C2').value).toBe('KHO-001');
    expect(workbook.getWorksheet('Danh mục')?.getCell('C2').value).toBe('DIEN');
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ mallId: { in: ['mall-1'] }, itemType: 'VTTH' }),
    }));
  });
});
