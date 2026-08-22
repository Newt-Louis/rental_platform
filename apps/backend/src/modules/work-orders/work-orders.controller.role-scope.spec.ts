import { WorkOrdersController } from './work-orders.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

// CR-101 Phase 3G (BC-CEO-SCOPE Option A): Work Orders was a confirmed
// operational-write contradiction -- CEO kept full create/update/status/
// review/checklist/comment/evidence/template-authoring access despite the
// documented persona explicitly excluding "day-to-day operational detail".
// This proves every mutating route's role metadata now excludes CEO while
// read/list/summary/export (and the two routes that already excluded CEO
// before this phase) are unaffected.
describe('WorkOrdersController — CR-101 Phase 3G role metadata (BC-CEO-SCOPE)', () => {
  const writeMethods: (keyof WorkOrdersController)[] = [
    'createTemplate', 'updateTemplate', 'toggleTemplate', 'runTemplate',
    'create', 'update', 'status', 'review', 'checklist', 'comment', 'toggle', 'evidence',
  ];

  it.each(writeMethods)('%s excludes CEO from its role metadata', (method) => {
    const roles = Reflect.getMetadata(ROLES_KEY, (WorkOrdersController.prototype as any)[method]);
    expect(roles).toBeDefined();
    expect(roles).not.toContain('CEO');
    // Still reachable by the operational roles that legitimately need it.
    expect(roles).toEqual(expect.arrayContaining(['ADMIN', 'MALL_DIRECTOR', 'OPERATION', 'LEASING_MANAGER']));
  });

  it('list/summary/export/templates(list)/detail carry no method-level override -- inherit the class default, which still includes CEO', () => {
    const readMethods: (keyof WorkOrdersController)[] = ['list', 'summary', 'exportCsv', 'templates', 'detail'];
    for (const method of readMethods) {
      expect(Reflect.getMetadata(ROLES_KEY, (WorkOrdersController.prototype as any)[method])).toBeUndefined();
    }
  });

  it('reminders/run and templates/run-due already excluded CEO before this phase -- unchanged', () => {
    const roles1 = Reflect.getMetadata(ROLES_KEY, WorkOrdersController.prototype.reminders);
    const roles2 = Reflect.getMetadata(ROLES_KEY, WorkOrdersController.prototype.runDueTemplates);
    expect(roles1).not.toContain('CEO');
    expect(roles2).not.toContain('CEO');
  });
});
