import 'reflect-metadata';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import {
  MODULE_FIXED_ROLES_KEY,
  MODULE_KEY,
  MODULE_ROLE_CEILING_KEY,
  ModuleRoles,
} from './module-roles.decorator';

describe('ModuleRoles', () => {
  it('composes a fixed Tenant capability with the Fitout matrix metadata', () => {
    class Controller {
      @ModuleRoles('fitout', { fixedRoles: [Role.TENANT] })
      handler() {}
    }

    expect(Reflect.getMetadata(MODULE_KEY, Controller.prototype.handler)).toBe('fitout');
    expect(Reflect.getMetadata(MODULE_FIXED_ROLES_KEY, Controller.prototype.handler)).toEqual([Role.TENANT]);
    expect(Reflect.getMetadata(ROLES_KEY, Controller.prototype.handler)).toEqual(expect.arrayContaining([
      Role.OPERATION,
      Role.TENANT,
    ]));
  });

  it('records an endpoint role ceiling without widening the static fallback', () => {
    class Controller {
      @ModuleRoles('fitout', { roleCeiling: [Role.MALL_DIRECTOR, Role.OPERATION] })
      handler() {}
    }

    expect(Reflect.getMetadata(MODULE_ROLE_CEILING_KEY, Controller.prototype.handler)).toEqual([
      Role.MALL_DIRECTOR,
      Role.OPERATION,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, Controller.prototype.handler)).toEqual([
      Role.MALL_DIRECTOR,
      Role.OPERATION,
    ]);
  });
});
