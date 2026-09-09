import { ForbiddenException } from '@nestjs/common';
import { FitoutDossierAccessService } from './fitout-dossier-access.service';

describe('FitoutDossierAccessService (CR-AUTH-FITOUT-001)', () => {
  const mallAccess: any = { getAccessibleMallIds: jest.fn() };
  const permissions: any = { getAllowedRoles: jest.fn() };
  const prisma: any = { fitoutSubmittal: { findUnique: jest.fn() } };
  let service: FitoutDossierAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-a']);
    permissions.getAllowedRoles.mockResolvedValue(new Set(['FITOUT_BASIC_TEAM']));
    service = new FitoutDossierAccessService(mallAccess, permissions, prisma);
  });

  it('DOSSIER-013 allows FITOUT_BASIC_TEAM for an assigned Mall with the action permission', async () => {
    await expect(service.getAuthorizedMallIds({ id: 'basic-1', role: 'FITOUT_BASIC_TEAM' } as any))
      .resolves.toEqual(['mall-a']);
    expect(permissions.getAllowedRoles).toHaveBeenCalledWith('fitout-dossier-view', 'mall-a');
  });

  it('DOSSIER-008 rejects Mall-B scope before any dossier query', async () => {
    await expect(service.getAuthorizedMallIds(
      { id: 'basic-1', role: 'FITOUT_BASIC_TEAM' } as any,
      'mall-b',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.getAllowedRoles).not.toHaveBeenCalled();
  });

  it('DOSSIER-016 rejects an assigned Mall when the action permission is absent', async () => {
    permissions.getAllowedRoles.mockResolvedValue(new Set(['LEGAL']));
    await expect(service.getAuthorizedMallIds({ id: 'basic-1', role: 'FITOUT_BASIC_TEAM' } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('DOSSIER-018 allows an authenticated historical file only for a completed dossier in Mall A', async () => {
    prisma.fitoutSubmittal.findUnique.mockResolvedValue({
      status: 'APPROVED', project: { unit: { mallId: 'mall-a' } },
    });
    await expect(service.assertCompletedDossierFileAccess(
      'submittal-1', { id: 'basic-1', role: 'FITOUT_BASIC_TEAM' } as any,
    )).resolves.toBeUndefined();
  });

  it.each(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REJECTED'])('DOSSIER-003 rejects a %s dossier file', async (status) => {
    prisma.fitoutSubmittal.findUnique.mockResolvedValue({ status, project: { unit: { mallId: 'mall-a' } } });
    await expect(service.assertCompletedDossierFileAccess(
      'submittal-1', { id: 'basic-1', role: 'FITOUT_BASIC_TEAM' } as any,
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(mallAccess.getAccessibleMallIds).not.toHaveBeenCalled();
  });
});
