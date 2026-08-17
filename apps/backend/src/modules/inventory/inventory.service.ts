import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventoryCategoryDto, CreateInventoryItemDto, CreateInventoryTransactionDto } from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async mallIdForItem(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id }, select: { mallId: true } });
    if (!item) throw new NotFoundException('Không tìm thấy mã vật tư');
    return item.mallId;
  }

  async mallIdForCategory(id: string) {
    const category = await this.prisma.inventoryCategory.findUnique({ where: { id }, select: { mallId: true } });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục kho');
    return category.mallId;
  }

  listCategories(mallIds: string[] | undefined, query: any) {
    return this.prisma.inventoryCategory.findMany({
      where: { ...(query.mallId ? { mallId: query.mallId } : mallIds ? { mallId: { in: mallIds } } : {}), ...(query.itemType ? { itemType: query.itemType } : {}), isActive: query.includeInactive === 'true' ? undefined : true },
      include: { _count: { select: { items: true } } }, orderBy: [{ itemType: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateInventoryCategoryDto) {
    try { return await this.prisma.inventoryCategory.create({ data: { ...dto, code: dto.code.trim().toUpperCase(), name: dto.name.trim() } }); }
    catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('Mã danh mục đã tồn tại tại trung tâm thương mại này'); throw error; }
  }

  updateCategory(id: string, data: any) {
    return this.prisma.inventoryCategory.update({ where: { id }, data: { ...data, code: data.code?.trim().toUpperCase() } });
  }

  async listItems(mallIds: string[] | undefined, query: any) {
    const page = Math.max(1, Number(query.page) || 1), limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Prisma.InventoryItemWhereInput = {
      ...(query.mallId ? { mallId: query.mallId } : mallIds ? { mallId: { in: mallIds } } : {}),
      ...(query.itemType ? { itemType: query.itemType } : {}), ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      isActive: query.includeInactive === 'true' ? undefined : true,
      ...(query.search ? { OR: [{ sku: { contains: query.search, mode: 'insensitive' } }, { name: { contains: query.search, mode: 'insensitive' } }, { location: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
    // Prisma cannot compare two columns through a portable where clause; apply low-stock after the regular query.
    const all = query.lowStock === 'true'
      ? (await this.prisma.inventoryItem.findMany({ where, include: { category: true, mall: { select: { id: true, name: true, code: true } } }, orderBy: { updatedAt: 'desc' } })).filter(x => x.currentStock <= x.minStock)
      : null;
    const [data, total] = all ? [all.slice((page - 1) * limit, page * limit), all.length] : await Promise.all([
      this.prisma.inventoryItem.findMany({ where, include: { category: true, mall: { select: { id: true, name: true, code: true } } }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async exportExcel(mallIds: string[] | undefined, query: any) {
    const mallScope = query.mallId ? { mallId: query.mallId } : mallIds ? { mallId: { in: mallIds } } : {};
    const searchFilter = query.search ? {
      OR: [
        { sku: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
        { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
        { location: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
      ],
    } : {};
    const itemFilter = {
      ...(query.itemType ? { itemType: query.itemType } : {}),
      ...searchFilter,
    };
    const itemWhere: Prisma.InventoryItemWhereInput = { ...mallScope, ...itemFilter, isActive: true };
    const categoryWhere: Prisma.InventoryCategoryWhereInput = {
      ...mallScope,
      ...(query.itemType ? { itemType: query.itemType } : {}),
      isActive: true,
    };
    const transactionWhere: Prisma.InventoryTransactionWhereInput = {
      ...mallScope,
      ...(Object.keys(itemFilter).length ? { item: { is: itemFilter } } : {}),
    };
    const [items, transactions, categories] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: itemWhere,
        include: { category: true, mall: { select: { name: true, code: true } } },
        orderBy: [{ mall: { code: 'asc' } }, { sku: 'asc' }],
      }),
      this.prisma.inventoryTransaction.findMany({
        where: transactionWhere,
        include: {
          mall: { select: { name: true, code: true } },
          item: { select: { sku: true, name: true, unit: true, itemType: true } },
          createdBy: { select: { fullName: true } },
        },
        orderBy: { transactionAt: 'desc' },
      }),
      this.prisma.inventoryCategory.findMany({
        where: categoryWhere,
        include: { mall: { select: { name: true, code: true } }, _count: { select: { items: true } } },
        orderBy: [{ mall: { code: 'asc' } }, { itemType: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'THISO Leasing Platform';
    workbook.created = new Date();
    const typeLabels: Record<string, string> = { VTTH: 'Vật tư tiêu hao', CCDC: 'Công cụ dụng cụ', EQUIPMENT: 'Trang thiết bị vận hành' };
    const transactionLabels: Record<string, string> = { IN: 'Nhập kho', OUT: 'Xuất kho', RETURN: 'Hoàn trả', ADJUST: 'Kiểm kê/điều chỉnh' };

    const stockSheet = workbook.addWorksheet('Tồn kho', { views: [{ state: 'frozen', ySplit: 1 }] });
    stockSheet.columns = [
      { header: 'STT', key: 'index', width: 7 }, { header: 'Mall', key: 'mall', width: 25 },
      { header: 'Mã hàng', key: 'sku', width: 18 }, { header: 'Tên hàng', key: 'name', width: 32 },
      { header: 'Nhóm', key: 'itemType', width: 26 }, { header: 'Danh mục', key: 'category', width: 24 },
      { header: 'ĐVT', key: 'unit', width: 12 }, { header: 'Quy cách', key: 'specification', width: 24 },
      { header: 'Nhà sản xuất', key: 'manufacturer', width: 22 }, { header: 'Vị trí kho', key: 'location', width: 20 },
      { header: 'Tồn hiện tại', key: 'currentStock', width: 15 }, { header: 'Tồn tối thiểu', key: 'minStock', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 17 }, { header: 'Đơn giá bình quân', key: 'averageCost', width: 20 },
      { header: 'Giá trị tồn', key: 'inventoryValue', width: 20 }, { header: 'Ghi chú', key: 'notes', width: 28 },
      { header: 'Cập nhật lúc', key: 'updatedAt', width: 20 },
    ];
    items.forEach((item, index) => stockSheet.addRow({
      index: index + 1, mall: `${item.mall.code} — ${item.mall.name}`, sku: item.sku, name: item.name,
      itemType: typeLabels[item.itemType] ?? item.itemType, category: item.category.name, unit: item.unit,
      specification: item.specification, manufacturer: item.manufacturer, location: item.location,
      currentStock: item.currentStock, minStock: item.minStock,
      status: item.currentStock <= item.minStock ? 'Sắp hết / hết hàng' : 'Đủ tồn',
      averageCost: item.averageCost, inventoryValue: item.currentStock * item.averageCost,
      notes: item.notes, updatedAt: item.updatedAt,
    }));

    const txSheet = workbook.addWorksheet('Sổ nhập xuất', { views: [{ state: 'frozen', ySplit: 1 }] });
    txSheet.columns = [
      { header: 'STT', key: 'index', width: 7 }, { header: 'Mall', key: 'mall', width: 25 },
      { header: 'Số phiếu', key: 'transactionNo', width: 24 }, { header: 'Thời gian', key: 'transactionAt', width: 20 },
      { header: 'Loại', key: 'type', width: 22 }, { header: 'Mã hàng', key: 'sku', width: 18 },
      { header: 'Tên hàng', key: 'name', width: 30 }, { header: 'Nhóm', key: 'itemType', width: 26 },
      { header: 'Số lượng', key: 'quantity', width: 14 }, { header: 'ĐVT', key: 'unit', width: 12 },
      { header: 'Đơn giá', key: 'unitCost', width: 18 }, { header: 'Tồn trước', key: 'stockBefore', width: 14 },
      { header: 'Tồn sau', key: 'stockAfter', width: 14 }, { header: 'Nhà cung cấp', key: 'supplier', width: 24 },
      { header: 'Người nhận', key: 'recipient', width: 22 }, { header: 'Bộ phận', key: 'department', width: 20 },
      { header: 'Số chứng từ', key: 'referenceNo', width: 20 }, { header: 'Mục đích', key: 'purpose', width: 26 },
      { header: 'Ghi chú', key: 'notes', width: 26 }, { header: 'Người tạo', key: 'createdBy', width: 22 },
    ];
    transactions.forEach((transaction, index) => txSheet.addRow({
      index: index + 1, mall: `${transaction.mall.code} — ${transaction.mall.name}`,
      transactionNo: transaction.transactionNo, transactionAt: transaction.transactionAt,
      type: transactionLabels[transaction.type] ?? transaction.type, sku: transaction.item.sku,
      name: transaction.item.name, itemType: typeLabels[transaction.item.itemType] ?? transaction.item.itemType,
      quantity: transaction.quantity, unit: transaction.item.unit, unitCost: transaction.unitCost,
      stockBefore: transaction.stockBefore, stockAfter: transaction.stockAfter, supplier: transaction.supplier,
      recipient: transaction.recipient, department: transaction.department, referenceNo: transaction.referenceNo,
      purpose: transaction.purpose, notes: transaction.notes, createdBy: transaction.createdBy.fullName,
    }));

    const categorySheet = workbook.addWorksheet('Danh mục', { views: [{ state: 'frozen', ySplit: 1 }] });
    categorySheet.columns = [
      { header: 'STT', key: 'index', width: 7 }, { header: 'Mall', key: 'mall', width: 25 },
      { header: 'Mã danh mục', key: 'code', width: 20 }, { header: 'Tên danh mục', key: 'name', width: 30 },
      { header: 'Nhóm', key: 'itemType', width: 26 }, { header: 'Số mã hàng', key: 'itemCount', width: 15 },
      { header: 'Mô tả', key: 'description', width: 36 },
    ];
    categories.forEach((category, index) => categorySheet.addRow({
      index: index + 1, mall: `${category.mall.code} — ${category.mall.name}`, code: category.code,
      name: category.name, itemType: typeLabels[category.itemType] ?? category.itemType,
      itemCount: category._count.items, description: category.description,
    }));

    for (const sheet of [stockSheet, txSheet, categorySheet]) {
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
      sheet.getRow(1).height = 24;
      sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
      });
    }
    for (const key of ['averageCost', 'inventoryValue']) stockSheet.getColumn(key).numFmt = '#,##0.00';
    txSheet.getColumn('unitCost').numFmt = '#,##0.00';
    stockSheet.getColumn('updatedAt').numFmt = 'dd/mm/yyyy hh:mm';
    txSheet.getColumn('transactionAt').numFmt = 'dd/mm/yyyy hh:mm';
    return workbook.xlsx.writeBuffer();
  }

  async createItem(dto: CreateInventoryItemDto) {
    const category = await this.prisma.inventoryCategory.findFirst({ where: { id: dto.categoryId, mallId: dto.mallId, itemType: dto.itemType, isActive: true } });
    if (!category) throw new BadRequestException('Danh mục không thuộc Mall hoặc không đúng nhóm tài sản');
    try { return await this.prisma.inventoryItem.create({ data: { ...dto, sku: dto.sku.trim().toUpperCase(), name: dto.name.trim(), minStock: Number(dto.minStock || 0) } }); }
    catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('Mã vật tư đã tồn tại tại trung tâm thương mại này'); throw error; }
  }

  async updateItem(id: string, data: any) {
    const current = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Không tìm thấy mã vật tư');
    if (data.categoryId) {
      const category = await this.prisma.inventoryCategory.findFirst({ where: { id: data.categoryId, mallId: current.mallId, itemType: data.itemType || current.itemType } });
      if (!category) throw new BadRequestException('Danh mục không hợp lệ');
    }
    return this.prisma.inventoryItem.update({ where: { id }, data: { ...data, sku: data.sku?.trim().toUpperCase(), currentStock: undefined, averageCost: undefined, mallId: undefined } });
  }

  async createTransaction(dto: CreateInventoryTransactionDto, userId: string) {
    const quantity = Number(dto.quantity);
    return this.prisma.$transaction(async tx => {
      const item = await tx.inventoryItem.findUnique({ where: { id: dto.itemId } });
      if (!item || !item.isActive) throw new NotFoundException('Không tìm thấy mã vật tư đang hoạt động');
      let stockAfter = item.currentStock;
      if (dto.type === InventoryTransactionType.IN || dto.type === InventoryTransactionType.RETURN) stockAfter += quantity;
      else if (dto.type === InventoryTransactionType.OUT) stockAfter -= quantity;
      else stockAfter = quantity;
      if (stockAfter < 0) throw new BadRequestException(`Không đủ tồn kho. Tồn hiện tại: ${item.currentStock} ${item.unit}`);
      let averageCost = item.averageCost;
      if (dto.type === InventoryTransactionType.IN && dto.unitCost != null && stockAfter > 0) averageCost = ((item.currentStock * item.averageCost) + quantity * Number(dto.unitCost)) / stockAfter;
      const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { currentStock: stockAfter, averageCost } });
      const transactionNo = `KHO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-7)}`;
      const transaction = await tx.inventoryTransaction.create({ data: { ...dto, quantity, unitCost: dto.unitCost == null ? undefined : Number(dto.unitCost), transactionAt: dto.transactionAt ? new Date(dto.transactionAt) : new Date(), mallId: item.mallId, stockBefore: item.currentStock, stockAfter, transactionNo, createdById: userId } });
      return { transaction, item: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listTransactions(mallIds: string[] | undefined, query: any) {
    const page = Math.max(1, Number(query.page) || 1), limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const where: Prisma.InventoryTransactionWhereInput = { ...(query.mallId ? { mallId: query.mallId } : mallIds ? { mallId: { in: mallIds } } : {}), ...(query.itemId ? { itemId: query.itemId } : {}), ...(query.type ? { type: query.type } : {}), ...(query.from || query.to ? { transactionAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}) } } : {}) };
    const [data, total] = await Promise.all([this.prisma.inventoryTransaction.findMany({ where, include: { item: { select: { sku: true, name: true, unit: true, itemType: true } }, createdBy: { select: { fullName: true } } }, orderBy: { transactionAt: 'desc' }, skip: (page - 1) * limit, take: limit }), this.prisma.inventoryTransaction.count({ where })]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async summary(mallIds: string[] | undefined, mallId?: string) {
    const where = { ...(mallId ? { mallId } : mallIds ? { mallId: { in: mallIds } } : {}), isActive: true } as Prisma.InventoryItemWhereInput;
    const items = await this.prisma.inventoryItem.findMany({ where, select: { itemType: true, currentStock: true, minStock: true, averageCost: true } });
    return { totalItems: items.length, lowStock: items.filter(x => x.currentStock <= x.minStock).length, inventoryValue: items.reduce((s, x) => s + x.currentStock * x.averageCost, 0), byType: Object.fromEntries(['VTTH', 'CCDC', 'EQUIPMENT'].map(type => [type, items.filter(x => x.itemType === type).length])) };
  }
}
