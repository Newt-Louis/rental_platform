import { SalesController } from './sales.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

// CR-101 Phase 3G (BC-CEO-SCOPE Option A): "Sales creation" was a confirmed
// operational-write contradiction -- CEO could create/upsert sales turnover
// submissions directly, not just approve/dispute them. This proves the
// create route now excludes CEO while TENANT (who legitimately submits their
// own sales) and staff keep it, and that approve/dispute/read routes are
// unaffected.
describe('SalesController — CR-101 Phase 3G role metadata (BC-CEO-SCOPE)', () => {
  it('create excludes CEO but keeps TENANT and staff', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SalesController.prototype.create);
    expect(roles).toBeDefined();
    expect(roles).not.toContain('CEO');
    expect(roles).toEqual(expect.arrayContaining(['ADMIN', 'FINANCE', 'MALL_DIRECTOR', 'TENANT']));
  });

  it('approve and dispute carry no method-level override for CEO removal -- inherit salesStaff, which still includes CEO', () => {
    const approveRoles = Reflect.getMetadata(ROLES_KEY, SalesController.prototype.approveSales);
    const disputeRoles = Reflect.getMetadata(ROLES_KEY, SalesController.prototype.disputeSales);
    expect(approveRoles).toContain('CEO');
    expect(disputeRoles).toContain('CEO');
  });

  it('findAll/getSummary/getSubmissionUnits carry no method-level override -- inherit the class default, which still includes CEO', () => {
    for (const method of ['findAll', 'getSummary', 'getSubmissionUnits'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype[method])).toBeUndefined();
    }
  });
});
