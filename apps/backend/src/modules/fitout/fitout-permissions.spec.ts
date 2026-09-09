import 'reflect-metadata';
import { Role } from '@prisma/client';
import {
  MODULE_FIXED_ROLES_KEY,
  MODULE_KEY,
  MODULE_ROLE_CEILING_KEY,
} from '../../common/decorators/module-roles.decorator';
import { FitoutController } from './fitout.controller';
import { FitoutSubmittalController } from './fitout-submittal.controller';

describe('Fitout dynamic permission metadata', () => {
  const tenantHandlers: Array<{ handler: Function; label: string }> = [
    { handler: FitoutController.prototype.findAll, label: 'FitoutController.findAll' },
    { handler: FitoutController.prototype.findOne, label: 'FitoutController.findOne' },
    { handler: FitoutController.prototype.listDocuments, label: 'FitoutController.listDocuments' },
    { handler: FitoutSubmittalController.prototype.list, label: 'FitoutSubmittalController.list' },
    { handler: FitoutSubmittalController.prototype.getOne, label: 'FitoutSubmittalController.getOne' },
    { handler: FitoutSubmittalController.prototype.uploadAttachment, label: 'FitoutSubmittalController.uploadAttachment' },
  ];

  it.each(tenantHandlers)('$label composes its Tenant exception with the live Fitout matrix', ({ handler }) => {
    expect(Reflect.getMetadata(MODULE_KEY, handler)).toBe('fitout');
    expect(Reflect.getMetadata(MODULE_FIXED_ROLES_KEY, handler)).toEqual([Role.TENANT]);
  });

  it('keeps stage advancement restricted even if the module matrix is wider', () => {
    expect(Reflect.getMetadata(MODULE_KEY, FitoutController.prototype.advanceStatus)).toBe('fitout');
    expect(Reflect.getMetadata(MODULE_ROLE_CEILING_KEY, FitoutController.prototype.advanceStatus)).toEqual([
      Role.MALL_DIRECTOR,
      Role.OPERATION,
    ]);
  });
});
