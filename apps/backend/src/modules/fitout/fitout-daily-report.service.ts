import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

const ENTITY_TYPE = 'FITOUT_DAILY_REPORT';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

@Injectable()
export class FitoutDailyReportService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  async list(projectId: string, query: { from?: string; to?: string } = {}) {
    return this.prisma.fitoutDailyReportEntry.findMany({
      where: {
        projectId,
        reportDate: {
          gte: query.from ? startOfDay(new Date(query.from)) : undefined,
          lte: query.to ? startOfDay(new Date(query.to)) : undefined,
        },
      },
      include: {
        contractor: { select: { id: true, companyName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Gộp toàn bộ entry của 1 ngày thành 1 view tổng hợp (không gộp vật lý ở DB). */
  async getMergedView(projectId: string, date: string) {
    const day = startOfDay(new Date(date));
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const entries = await this.prisma.fitoutDailyReportEntry.findMany({
      where: { projectId, reportDate: { gte: day, lt: nextDay } },
      include: {
        contractor: { select: { id: true, companyName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const entryIds = entries.map((e) => e.id);
    const photos = entryIds.length
      ? await this.prisma.unifiedDocument.findMany({
          where: { entityType: ENTITY_TYPE, entityId: { in: entryIds }, isActive: true },
        })
      : [];

    const totalWorkforce = entries.reduce((s, e) => s + e.workforceCount, 0);
    const byArea = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = e.areaTag ?? 'Khác';
      byArea.set(key, [...(byArea.get(key) ?? []), e]);
    }

    return {
      date: day,
      totalWorkforce,
      entryCount: entries.length,
      byArea: Array.from(byArea.entries()).map(([areaTag, items]) => ({ areaTag, entries: items })),
      photos,
    };
  }

  async create(projectId: string, dto: {
    reportDate: string;
    contractorId?: string;
    workforceCount?: number;
    description: string;
    areaTag?: string;
  }, createdById: string) {
    const project = await this.prisma.fitoutProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Fitout project not found');

    return this.prisma.fitoutDailyReportEntry.create({
      data: {
        projectId,
        reportDate: startOfDay(new Date(dto.reportDate)),
        contractorId: dto.contractorId,
        workforceCount: dto.workforceCount ?? 0,
        description: dto.description,
        areaTag: dto.areaTag,
        createdById,
      },
    });
  }

  async listPhotos(entryId: string) {
    return this.prisma.unifiedDocument.findMany({
      where: { entityType: ENTITY_TYPE, entityId: entryId, isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async uploadPhoto(entryId: string, file: Express.Multer.File, uploadedById: string) {
    const entry = await this.prisma.fitoutDailyReportEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Daily report entry not found');

    const saved = await this.storageService.saveFile(file, `fitout-daily-report/${entryId}`);
    return this.prisma.unifiedDocument.create({
      data: {
        entityType: ENTITY_TYPE,
        entityId: entryId,
        category: 'ORIGINAL',
        documentType: 'DAILY_REPORT_PHOTO',
        fileName: saved.fileName,
        filePath: saved.filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById,
      },
    });
  }
}
