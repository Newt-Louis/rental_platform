import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerLockService } from '../../common/services/scheduler-lock.service';

@Injectable()
export class FitoutGanttService {
  private readonly logger = new Logger(FitoutGanttService.name);

  constructor(private prisma: PrismaService, private schedulerLock: SchedulerLockService) {}

  async listTasks(projectId: string) {
    return this.prisma.fitoutTask.findMany({
      where: { projectId },
      include: {
        assignedContractor: { select: { id: true, companyName: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createTask(projectId: string, dto: {
    name: string;
    parentTaskId?: string;
    plannedStart: string;
    plannedEnd: string;
    assignedContractorId?: string;
    dependsOnTaskId?: string;
    sortOrder?: number;
  }) {
    const project = await this.prisma.fitoutProject.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Fitout project not found');

    const last = await this.prisma.fitoutTask.findFirst({
      where: { projectId },
      orderBy: { sortOrder: 'desc' },
    });

    return this.prisma.fitoutTask.create({
      data: {
        projectId,
        name: dto.name,
        parentTaskId: dto.parentTaskId,
        plannedStart: new Date(dto.plannedStart),
        plannedEnd: new Date(dto.plannedEnd),
        assignedContractorId: dto.assignedContractorId,
        dependsOnTaskId: dto.dependsOnTaskId,
        sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateTask(id: string, dto: Partial<{
    name: string;
    plannedStart: string;
    plannedEnd: string;
    revisedStart: string;
    revisedEnd: string;
    actualStart: string;
    actualEnd: string;
    percentComplete: number;
    assignedContractorId: string;
    sortOrder: number;
  }>) {
    const existing = await this.prisma.fitoutTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    const data: any = { ...dto };
    for (const field of ['plannedStart', 'plannedEnd', 'revisedStart', 'revisedEnd', 'actualStart', 'actualEnd']) {
      if (dto[field as keyof typeof dto] !== undefined) {
        data[field] = dto[field as keyof typeof dto] ? new Date(dto[field as keyof typeof dto] as string) : null;
      }
    }
    if (dto.percentComplete === 100) {
      data.isLate = false;
      if (!existing.actualEnd) data.actualEnd = new Date();
    }

    return this.prisma.fitoutTask.update({ where: { id }, data });
  }

  async deleteTask(id: string) {
    const existing = await this.prisma.fitoutTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    return this.prisma.fitoutTask.delete({ where: { id } });
  }

  @Cron('0 1 * * *', { name: 'fitout-gantt-late-check', timeZone: 'Asia/Ho_Chi_Minh' })
  async checkLateTasks() {
    return this.schedulerLock.runExclusive('fitout-gantt-late-check', 14_400_000, () => this.checkLateTasksUnlocked());
  }

  private async checkLateTasksUnlocked() {
    this.logger.log('Checking late fitout Gantt tasks...');
    const now = new Date();

    const tasks = await this.prisma.fitoutTask.findMany({
      where: { percentComplete: { lt: 100 } },
    });

    let lateCount = 0;
    for (const task of tasks) {
      const deadline = task.revisedEnd ?? task.plannedEnd;
      const shouldBeLate = deadline < now;
      if (shouldBeLate !== task.isLate) {
        await this.prisma.fitoutTask.update({ where: { id: task.id }, data: { isLate: shouldBeLate } });
        if (shouldBeLate) lateCount++;
      }
    }

    this.logger.log(`Gantt late check: ${lateCount} newly late tasks`);
  }
}
