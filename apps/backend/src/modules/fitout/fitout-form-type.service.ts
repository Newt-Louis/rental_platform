import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FitoutFormTypeService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.fitoutFormType.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async upsert(data: {
    code: string;
    name: string;
    category?: string;
    defaultStageCode?: string | null;
    approvalLevels?: number;
    order?: number;
  }) {
    return this.prisma.fitoutFormType.upsert({
      where: { code: data.code },
      create: {
        code: data.code,
        name: data.name,
        category: data.category ?? 'OTHER',
        defaultStageCode: data.defaultStageCode ?? null,
        approvalLevels: data.approvalLevels ?? 1,
        order: data.order ?? 0,
      },
      update: {
        name: data.name,
        category: data.category,
        defaultStageCode: data.defaultStageCode,
        approvalLevels: data.approvalLevels,
        order: data.order,
      },
    });
  }

  async deactivate(code: string) {
    const inUse = await this.prisma.fitoutDocument.count({ where: { documentType: code } });
    if (inUse > 0) {
      throw new BadRequestException(`Cannot deactivate form type "${code}" — ${inUse} document(s) currently use it`);
    }
    return this.prisma.fitoutFormType.update({ where: { code }, data: { isActive: false } });
  }
}
