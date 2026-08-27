import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FitoutSlaService } from './fitout-sla.service';

function countBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

@Injectable()
export class FitoutDashboardService {
  constructor(
    private prisma: PrismaService,
    private slaService: FitoutSlaService,
  ) {}

  /** Tổng quan toàn bộ dự án đang mở — tái dùng getFitoutProgress() đã có thay vì viết lại. */
  async getOverview(mallIds?: string[] | null) {
    const projects = await this.slaService.getFitoutProgress(mallIds);
    return {
      totalActive: projects.length,
      atRiskCount: projects.filter((p) => p.isAtRisk).length,
      avgProgress: projects.length
        ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
        : 0,
      projects,
    };
  }

  async getProjectDashboard(projectId: string) {
    const project = await this.prisma.fitoutProject.findUnique({
      where: { id: projectId },
      include: {
        tenant: { select: { brandName: true } },
        unit: { select: { code: true } },
        milestones: { orderBy: { startedAt: 'asc' } },
      },
    });
    if (!project) throw new NotFoundException('Fitout project not found');

    const [tasks, issues, submittals] = await Promise.all([
      this.prisma.fitoutTask.findMany({ where: { projectId } }),
      this.prisma.fitoutIssue.findMany({ where: { projectId } }),
      this.prisma.fitoutSubmittal.findMany({ where: { projectId } }),
    ]);

    const now = new Date();
    const countdownDays = project.expectedOpenDate
      ? Math.ceil((project.expectedOpenDate.getTime() - now.getTime()) / 86400000)
      : null;

    const lateTasks = tasks.filter((t) => t.isLate);
    const overdueMilestones = project.milestones.filter((m) => m.isOverdue);
    const overdueIssues = issues.filter((i) => i.isOverdue);
    const delayDays = lateTasks.reduce((max, t) => {
      const deadline = t.revisedEnd ?? t.plannedEnd;
      const days = Math.max(0, Math.ceil((now.getTime() - deadline.getTime()) / 86400000));
      return Math.max(max, days);
    }, 0);

    const completedPct = tasks.length
      ? Math.round(tasks.reduce((s, t) => s + t.percentComplete, 0) / tasks.length)
      : null;

    return {
      project: {
        id: project.id,
        tenant: project.tenant.brandName,
        unit: project.unit.code,
        status: project.status,
        expectedOpenDate: project.expectedOpenDate,
        actualOpenDate: project.actualOpenDate,
      },
      countdownDays,
      delayDays,
      completedPct,
      taskCount: tasks.length,
      lateTaskCount: lateTasks.length,
      overdueMilestoneCount: overdueMilestones.length,
      overdueIssueCount: overdueIssues.length,
      issueByStatus: countBy(issues, (i) => i.status),
      issueByCategory: countBy(issues, (i) => i.category),
      submittalByStatus: countBy(submittals, (s) => s.status),
      milestones: project.milestones,
    };
  }
}
