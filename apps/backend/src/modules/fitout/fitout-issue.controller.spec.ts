import { ForbiddenException } from '@nestjs/common';
import { FitoutIssueController } from './fitout-issue.controller';

// CR-101 Phase 3C (C4-02) -- proves every route in this controller now calls
// MallAccessService explicitly (previously zero explicit calls, protection
// rode entirely on MallAccessGuard's incidental heuristic). Every route below
// is exercised with a DENY to prove the check actually blocks the operation --
// the underlying resolver correctness (fitoutProject/fitoutIssue DENY/ALLOW/
// bypass) is separately covered by mall-access.service.spec.ts's existing
// tests; this file only proves each ROUTE calls the right resolver with the
// right id and propagates a denial.
describe('FitoutIssueController — CR-101 Phase 3C C4-02', () => {
  const issueService: any = {
    list: jest.fn(), create: jest.fn(), getOne: jest.fn(), update: jest.fn(),
    transition: jest.fn(), listComments: jest.fn(), addComment: jest.fn(),
    listPhotos: jest.fn(), uploadPhoto: jest.fn(),
  };
  const mallAccess: any = { extractAndValidateMallAccess: jest.fn() };
  const controller = new FitoutIssueController(issueService, mallAccess);
  const user = { id: 'u1', role: 'OPERATION' };

  beforeEach(() => jest.resetAllMocks());

  it.each([
    ['list', { fitoutProjectId: 'project-A' }, () => controller.list('project-A', undefined, undefined, undefined, user)],
    ['create', { fitoutProjectId: 'project-A' }, () => controller.create({ projectId: 'project-A' } as any, user)],
    ['getOne', { fitoutIssueId: 'issue-1' }, () => controller.getOne('issue-1', user)],
    ['update', { fitoutIssueId: 'issue-1' }, () => controller.update('issue-1', {} as any, user)],
    ['transition', { fitoutIssueId: 'issue-1' }, () => controller.transition('issue-1', 'RESOLVED', user)],
    ['listComments', { fitoutIssueId: 'issue-1' }, () => controller.listComments('issue-1', user)],
    ['addComment', { fitoutIssueId: 'issue-1' }, () => controller.addComment('issue-1', 'note', user)],
    ['listPhotos', { fitoutIssueId: 'issue-1' }, () => controller.listPhotos('issue-1', user)],
    ['uploadPhoto', { fitoutIssueId: 'issue-1' }, () => controller.uploadPhoto('issue-1', {} as any, user)],
  ])('%s calls extractAndValidateMallAccess with %j and blocks the service call on denial', async (_name, expectedSource, invoke) => {
    mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException());
    await expect(invoke()).rejects.toBeInstanceOf(ForbiddenException);
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u1', 'OPERATION', expectedSource);
    for (const fn of Object.values(issueService)) expect(fn as jest.Mock).not.toHaveBeenCalled();
  });

  it('same-Mall ALLOW still reaches the service once Mall access resolves (regression: the new checks do not break the happy path)', async () => {
    mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined);
    issueService.getOne.mockResolvedValue({ id: 'issue-1' });
    const result = await controller.getOne('issue-1', user);
    expect(result).toEqual({ id: 'issue-1' });
  });

  it('ADMIN bypasses the Mall check (existing platform policy) and still reaches the service', async () => {
    mallAccess.extractAndValidateMallAccess.mockResolvedValue(undefined); // simulates BYPASS_ROLES short-circuit
    issueService.getOne.mockResolvedValue({ id: 'issue-1' });
    const result = await controller.getOne('issue-1', { id: 'admin-1', role: 'ADMIN' });
    expect(result).toEqual({ id: 'issue-1' });
  });
});
