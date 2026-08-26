import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FitoutAccessPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectContext(projectId: string) {
    const project = await this.prisma.fitoutProject.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        tenantId: true,
        contract: { select: { currencyCode: true } },
        unit: { select: { mallId: true, floor: { select: { mallId: true } } } },
      },
    });
    if (!project) throw new NotFoundException('Fitout project not found');
    const mallId = project.unit.mallId ?? project.unit.floor?.mallId;
    if (!mallId) throw new NotFoundException('Fitout project Mall could not be resolved');
    return {
      id: project.id,
      tenantId: project.tenantId,
      mallId,
      contractCurrencyCode: project.contract.currencyCode,
    };
  }

  async assertTenantProject(projectId: string, user: { tenantId?: string | null }) {
    const context = await this.getProjectContext(projectId);
    if (!user.tenantId || context.tenantId !== user.tenantId) {
      throw new ForbiddenException('Tenant cannot access this fitout project');
    }
    return context;
  }

  async assertTenantSubmittal(
    submittalId: string,
    user: { id: string; tenantId?: string | null },
    requireSubmittedBy = false,
  ) {
    const submittal = await this.prisma.fitoutSubmittal.findUnique({
      where: { id: submittalId },
      select: { id: true, projectId: true, submittedById: true, project: { select: { tenantId: true } } },
    });
    if (!submittal) throw new NotFoundException('Submittal not found');
    if (!user.tenantId || submittal.project.tenantId !== user.tenantId) {
      throw new ForbiddenException('Tenant cannot access this fitout submittal');
    }
    if (requireSubmittedBy && submittal.submittedById !== user.id) {
      throw new ForbiddenException('Tenant can modify only their own submittal');
    }
    return submittal;
  }

  async assertActiveProjectMallUser(projectId: string, userId: string, requiredRole?: Role) {
    const { mallId } = await this.getProjectContext(projectId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        mallAccess: {
          where: { mallId, isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user || !user.isActive) throw new ForbiddenException('Selected user is inactive or unavailable');
    const fitoutStaffRoles: Role[] = [Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER];
    if (!fitoutStaffRoles.includes(user.role)) {
      throw new ForbiddenException('Selected user does not have an approved fitout staff role');
    }
    if (requiredRole && user.role !== requiredRole) {
      throw new ForbiddenException(`Selected user must have role ${requiredRole}`);
    }
    if (user.role !== Role.ADMIN && user.mallAccess.length === 0) {
      throw new ForbiddenException('Selected user has no active access to the project Mall');
    }
    return user;
  }

  async findProjectMallRecipients(projectId: string, role: Role) {
    const { mallId } = await this.getProjectContext(projectId);
    const scopedRoleRecipients =
      role === Role.TENANT
        ? []
        : [
            {
              role,
              mallAccess: { some: { mallId, isActive: true } },
            },
          ];
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: Role.ADMIN },
          ...scopedRoleRecipients,
        ],
      },
      select: { id: true, email: true, fullName: true, role: true },
    });
  }
}
