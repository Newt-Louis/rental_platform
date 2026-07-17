import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

// UserMallAccess mô hình hoá "nhân viên này phụ trách mall nào" — không áp dụng cho TENANT
// (khách thuê không có khái niệm phụ trách mall). Cách ly dữ liệu của TENANT được thực hiện bằng
// kiểm tra tenantId ở tầng service (findOne/findAll mỗi module), chặt hơn và đúng bản chất hơn
// so với UserMallAccess — nên TENANT bypass guard này thay vì bị chặn vì thiếu UserMallAccess.
const BYPASS_ROLES: Role[] = [Role.ADMIN, Role.CEO, Role.TENANT];

@Injectable()
export class MallAccessService {
  constructor(private prisma: PrismaService) {}

  bypassesMallCheck(role?: string): boolean {
    return !!role && BYPASS_ROLES.includes(role as Role);
  }

  async assertMallAccess(userId: string, role: string, mallId: string): Promise<void> {
    if (this.bypassesMallCheck(role)) return;

    const access = await this.prisma.userMallAccess.findFirst({
      where: { userId, mallId, isActive: true },
    });

    if (!access) {
      throw new ForbiddenException('You do not have access to this mall');
    }
  }

  /** Resolve mallId from unitId when mallId not provided explicitly */
  async resolveMallIdFromUnit(unitId: string): Promise<string | null> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { mallId: true, floor: { select: { mallId: true } } },
    });
    if (!unit) return null;
    return unit.mallId ?? unit.floor?.mallId ?? null;
  }

  async extractAndValidateMallAccess(
    userId: string,
    role: string,
    sources: {
      mallId?: string;
      unitId?: string;
      floorId?: string;
      contractId?: string;
      fitoutProjectId?: string;
      fitoutSubmittalId?: string;
      fitoutIssueId?: string;
      invoiceId?: string;
    },
  ): Promise<void> {
    if (this.bypassesMallCheck(role)) return;

    let mallId = sources.mallId;

    if (!mallId && sources.unitId) {
      mallId = (await this.resolveMallIdFromUnit(sources.unitId)) ?? undefined;
    }

    if (!mallId && sources.floorId) {
      const floor = await this.prisma.floor.findUnique({
        where: { id: sources.floorId },
        select: { mallId: true },
      });
      mallId = floor?.mallId;
    }

    if (!mallId && sources.contractId) {
      const contract = await this.prisma.contract.findUnique({
        where: { id: sources.contractId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = contract?.unit?.mallId ?? contract?.unit?.floor?.mallId;
    }

    if (!mallId && sources.fitoutProjectId) {
      const project = await this.prisma.fitoutProject.findUnique({
        where: { id: sources.fitoutProjectId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = project?.unit?.mallId ?? project?.unit?.floor?.mallId;
    }

    if (!mallId && sources.fitoutSubmittalId) {
      const submittal = await this.prisma.fitoutSubmittal.findUnique({
        where: { id: sources.fitoutSubmittalId },
        select: { project: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } },
      });
      mallId = submittal?.project?.unit?.mallId ?? submittal?.project?.unit?.floor?.mallId;
    }

    if (!mallId && sources.fitoutIssueId) {
      const issue = await this.prisma.fitoutIssue.findUnique({
        where: { id: sources.fitoutIssueId },
        select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
      });
      mallId = issue?.unit?.mallId ?? issue?.unit?.floor?.mallId;
    }

    if (!mallId && sources.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: sources.invoiceId },
        select: { contract: { select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } } } },
      });
      mallId = invoice?.contract?.unit?.mallId ?? invoice?.contract?.unit?.floor?.mallId;
    }

    if (mallId) {
      await this.assertMallAccess(userId, role, mallId);
    }
  }
}
