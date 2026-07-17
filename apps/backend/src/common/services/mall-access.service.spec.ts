import { ForbiddenException } from '@nestjs/common';
import { MallAccessService } from './mall-access.service';

describe('MallAccessService resource resolution', () => {
  const prisma = {
    userMallAccess: { findFirst: jest.fn() },
    unit: { findUnique: jest.fn() },
    floor: { findUnique: jest.fn() },
    contract: { findUnique: jest.fn() },
    fitoutProject: { findUnique: jest.fn() },
    fitoutSubmittal: { findUnique: jest.fn() },
    fitoutIssue: { findUnique: jest.fn() },
    invoice: { findUnique: jest.fn() },
  };
  let service: MallAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MallAccessService(prisma as any);
  });

  it.each([
    ['fitoutProjectId', 'fitoutProject'],
    ['fitoutSubmittalId', 'fitoutSubmittal'],
    ['fitoutIssueId', 'fitoutIssue'],
    ['invoiceId', 'invoice'],
  ])('enforces mall access resolved from %s', async (source, repository) => {
    const relation = repository === 'fitoutProject'
      ? { unit: { mallId: 'mall-1', floor: null } }
      : repository === 'fitoutSubmittal'
        ? { project: { unit: { mallId: 'mall-1', floor: null } } }
        : repository === 'fitoutIssue'
          ? { unit: { mallId: 'mall-1', floor: null } }
          : { contract: { unit: { mallId: 'mall-1', floor: null } } };
    (prisma as any)[repository].findUnique.mockResolvedValue(relation);
    prisma.userMallAccess.findFirst.mockResolvedValue(null);

    await expect(service.extractAndValidateMallAccess(
      'user-1',
      'OPERATION',
      { [source]: 'resource-1' },
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.userMallAccess.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', mallId: 'mall-1', isActive: true },
    });
  });
});
