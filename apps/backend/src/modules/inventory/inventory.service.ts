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
