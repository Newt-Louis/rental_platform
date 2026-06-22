import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type EntityType = 'TENANT' | 'CONTRACT' | 'INVOICE' | 'PAYMENT';

@Injectable()
export class SapEntityMappingService {
  constructor(private prisma: PrismaService) {}

  async listMappings(query: { entityType?: string; syncStatus?: string; page?: number; limit?: number }) {
    const { page = 1, limit = 30, entityType, syncStatus } = query;
    const skip = (page - 1) * +limit;

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (syncStatus) where.syncStatus = syncStatus;

    const [data, total] = await Promise.all([
      this.prisma.sapEntityMapping.findMany({ where, skip, take: +limit, orderBy: { updatedAt: 'desc' } }),
      this.prisma.sapEntityMapping.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async upsertMapping(dto: {
    entityType: EntityType;
    entityId: string;
    sapRef: string;
    sapSystem?: string;
    sapCompanyCode?: string;
    notes?: string;
  }) {
    return this.prisma.sapEntityMapping.upsert({
      where: { entityType_entityId: { entityType: dto.entityType, entityId: dto.entityId } },
      create: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        sapRef: dto.sapRef,
        sapSystem: dto.sapSystem ?? 'S4HANA',
        sapCompanyCode: dto.sapCompanyCode ?? '1000',
        notes: dto.notes,
        syncStatus: 'SYNCED',
        lastSyncAt: new Date(),
      },
      update: {
        sapRef: dto.sapRef,
        sapSystem: dto.sapSystem ?? 'S4HANA',
        sapCompanyCode: dto.sapCompanyCode ?? '1000',
        notes: dto.notes,
        syncStatus: 'SYNCED',
        lastSyncAt: new Date(),
      },
    });
  }

  async getMapping(entityType: EntityType, entityId: string) {
    const mapping = await this.prisma.sapEntityMapping.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    });
    if (!mapping) throw new NotFoundException('Mapping not found');
    return mapping;
  }

  async markFailed(entityType: EntityType, entityId: string, notes?: string) {
    return this.prisma.sapEntityMapping.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: { entityType, entityId, sapRef: '', syncStatus: 'FAILED', notes },
      update: { syncStatus: 'FAILED', notes, lastSyncAt: new Date() },
    });
  }

  async getPendingMappings() {
    return this.prisma.sapEntityMapping.findMany({
      where: { syncStatus: { in: ['PENDING', 'FAILED'] } },
      orderBy: { lastSyncAt: 'asc' },
    });
  }

  async getSummary() {
    const counts = await this.prisma.sapEntityMapping.groupBy({
      by: ['entityType', 'syncStatus'],
      _count: { id: true },
    });

    const summary: Record<string, Record<string, number>> = {};
    for (const r of counts) {
      if (!summary[r.entityType]) summary[r.entityType] = {};
      summary[r.entityType][r.syncStatus] = r._count.id;
    }
    return summary;
  }

  async syncPending(sapService: { syncCustomer: (id: string) => Promise<any>; syncInvoice: (id: string) => Promise<any> }) {
    const pending = await this.getPendingMappings();
    const results: Array<{ entityType: string; entityId: string; success: boolean; error?: string }> = [];

    for (const m of pending) {
      try {
        if (m.entityType === 'TENANT') {
          await sapService.syncCustomer(m.entityId);
        } else if (m.entityType === 'INVOICE') {
          await sapService.syncInvoice(m.entityId);
        }
        await this.prisma.sapEntityMapping.update({
          where: { id: m.id },
          data: { syncStatus: 'SYNCED', lastSyncAt: new Date() },
        });
        results.push({ entityType: m.entityType, entityId: m.entityId, success: true });
      } catch (e: any) {
        await this.prisma.sapEntityMapping.update({
          where: { id: m.id },
          data: { syncStatus: 'FAILED', notes: e?.message, lastSyncAt: new Date() },
        });
        results.push({ entityType: m.entityType, entityId: m.entityId, success: false, error: e?.message });
      }
    }

    return { processed: pending.length, results };
  }
}
