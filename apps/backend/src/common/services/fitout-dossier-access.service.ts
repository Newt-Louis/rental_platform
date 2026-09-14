import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MODULE_ROLES } from '../constants/role-permissions';
import { MallAccessService } from './mall-access.service';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../../prisma/prisma.service';

export const FITOUT_DOSSIER_VIEW_PERMISSION = 'fitout-dossier-view';

@Injectable()
export class FitoutDossierAccessService {
  constructor(
    private readonly mallAccess: MallAccessService,
    private readonly permissions: PermissionsService,
    private readonly prisma: PrismaService,
  ) {}

  async getAuthorizedMallIds(
    user: { id: string; role: Role },
    requestedMallId?: string,
  ): Promise<string[] | undefined> {
    const accessibleMallIds = await this.mallAccess.getAccessibleMallIds(user.id, user.role);
    if (accessibleMallIds === null) {
      return requestedMallId ? [requestedMallId] : undefined;
    }

    const candidates = requestedMallId
      ? accessibleMallIds.filter((mallId) => mallId === requestedMallId)
      : accessibleMallIds;
    if (!candidates.length) throw new ForbiddenException('FITOUT_DOSSIER_VIEW is not allowed for this Mall');

    const authorized: string[] = [];
    for (const mallId of candidates) {
      const configuredRoles = await this.permissions.getAllowedRoles(FITOUT_DOSSIER_VIEW_PERMISSION, mallId);
      const allowed = configuredRoles
        ? configuredRoles.has(user.role)
        : (MODULE_ROLES.fitoutDossierView as readonly Role[]).includes(user.role);
      if (allowed) authorized.push(mallId);
    }
    if (!authorized.length) throw new ForbiddenException('FITOUT_DOSSIER_VIEW permission is required');
    return authorized;
  }

  async assertCompletedDossierFileAccess(
    submittalId: string,
    user: { id: string; role: Role },
  ): Promise<void> {
    const submittal = await this.prisma.fitoutSubmittal.findUnique({
      where: { id: submittalId },
      select: {
        status: true,
        project: { select: { unit: { select: { mallId: true } } } },
      },
    });
    if (!submittal || !['APPROVED', 'PUBLISHED'].includes(submittal.status)) {
      throw new ForbiddenException('Only completed Fitout dossier files are available');
    }
    await this.getAuthorizedMallIds(user, submittal.project.unit.mallId);
  }
}
