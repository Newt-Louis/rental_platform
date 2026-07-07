import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FitoutStageConfigService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.fitoutStageConfig.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async upsert(data: {
    code: string;
    name: string;
    phaseGroup: string;
    roleColumn: string;
    order: number;
    meetingRequired?: boolean;
    triggersUnitStatus?: string | null;
    setsField?: string | null;
    colorHex?: string;
  }) {
    return this.prisma.fitoutStageConfig.upsert({
      where: { code: data.code },
      create: {
        code: data.code,
        name: data.name,
        phaseGroup: data.phaseGroup,
        roleColumn: data.roleColumn,
        order: data.order,
        meetingRequired: data.meetingRequired ?? false,
        triggersUnitStatus: data.triggersUnitStatus ?? null,
        setsField: data.setsField ?? null,
        colorHex: data.colorHex ?? '#6b7280',
      },
      update: {
        name: data.name,
        phaseGroup: data.phaseGroup,
        roleColumn: data.roleColumn,
        order: data.order,
        meetingRequired: data.meetingRequired,
        triggersUnitStatus: data.triggersUnitStatus,
        setsField: data.setsField,
        colorHex: data.colorHex,
      },
    });
  }

  async deactivate(code: string) {
    const inUse = await this.prisma.fitoutProject.count({ where: { status: code } });
    if (inUse > 0) {
      throw new BadRequestException(`Cannot deactivate stage "${code}" — ${inUse} fitout project(s) currently use it`);
    }
    return this.prisma.fitoutStageConfig.update({ where: { code }, data: { isActive: false } });
  }

  /** Cached-per-call ordered list, used by FitoutService for transition logic. */
  async getOrderedActive() {
    return this.prisma.fitoutStageConfig.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async getByCode(code: string) {
    return this.prisma.fitoutStageConfig.findUnique({ where: { code } });
  }
}
