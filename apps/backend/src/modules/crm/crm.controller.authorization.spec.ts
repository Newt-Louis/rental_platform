import { Role } from '@prisma/client';
import { SCOPE_KEY } from '../../common/decorators/scope.decorator';
import { EnforcementStatus } from '../../common/constants/scope.types';
import { CrmController } from './crm.controller';

describe('CrmController unified-deals scope', () => {
  it('validates explicit Mall access and propagates caller scope', async () => {
    const crmService: any = { getUnifiedDeals: jest.fn() };
    const mallAccess: any = {
      assertMallAccess: jest.fn(),
      getAccessibleMallIds: jest.fn(),
    };
    const controller = new CrmController(crmService, mallAccess);
    const user = { id: 'manager-1', role: Role.LEASING_MANAGER };

    await controller.getUnifiedDeals({ mallId: 'mall-1', page: 2 }, user);

    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith(user.id, user.role, 'mall-1');
    expect(crmService.getUnifiedDeals).toHaveBeenCalledWith({
      mallId: 'mall-1',
      page: 2,
      scope: { userId: user.id, role: user.role, mallIds: ['mall-1'] },
    });
  });

  it('uses the caller accessible Mall set when no explicit Mall is requested', async () => {
    const crmService: any = { getUnifiedDeals: jest.fn() };
    const mallAccess: any = {
      assertMallAccess: jest.fn(),
      getAccessibleMallIds: jest.fn().mockResolvedValue(['mall-1', 'mall-2']),
    };
    const controller = new CrmController(crmService, mallAccess);
    const user = { id: 'manager-1', role: Role.LEASING_MANAGER };

    await controller.getUnifiedDeals({}, user);

    expect(crmService.getUnifiedDeals).toHaveBeenCalledWith({
      scope: { userId: user.id, role: user.role, mallIds: ['mall-1', 'mall-2'] },
    });
  });

  it('declares the route scope as enforced', () => {
    const scope = Reflect.getMetadata(SCOPE_KEY, CrmController.prototype.getUnifiedDeals);
    expect(scope.status).toBe(EnforcementStatus.ENFORCED);
  });
});
