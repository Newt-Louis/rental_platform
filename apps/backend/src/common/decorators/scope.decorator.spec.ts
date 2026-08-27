import { Reflector } from '@nestjs/core';
import { Controller, Get, Post } from '@nestjs/common';
import { Scope, SCOPE_KEY, GlobalScope, UserScope } from './scope.decorator';
import { ScopeType, EnforcementStatus } from '../constants/scope.types';

// CR-101 Phase 1 -- proves the metadata infrastructure itself works, per
// docs/architecture-review/18-CR-101-TEST-STRATEGY.md's "startup-check test"
// and "metadata discoverable / class inheritance / method override" items.
// Uses the exact same Reflector.getAllAndOverride pattern MallAccessGuard would
// use in a future phase -- these tests do NOT touch MallAccessGuard itself
// (Phase 1/2 is descriptive-only, no behavior change).

@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED })
@Controller('dummy')
class ClassLevelOnlyController {
  @Get()
  list() {}
}

@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED })
@Controller('dummy')
class MethodOverrideController {
  @Get()
  list() {}

  @GlobalScope('method-level override reason')
  @Post()
  create() {}
}

@GlobalScope('class-level global reason')
@Controller('dummy')
class GlobalClassController {
  @Get()
  list() {}
}

@UserScope()
@Controller('dummy')
class UserScopeController {
  @Get()
  list() {}
}

describe('CR-101 Phase 1 -- @Scope metadata', () => {
  const reflector = new Reflector();

  function readScope(instance: any, methodName: string, cls: any) {
    return reflector.getAllAndOverride(SCOPE_KEY, [instance.prototype[methodName], cls]);
  }

  it('is discoverable via Reflector.getAllAndOverride, same mechanism as @Roles/@Public', () => {
    const scope = readScope(ClassLevelOnlyController, 'list', ClassLevelOnlyController);
    expect(scope).toEqual({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED });
  });

  it('class-level declaration is inherited by a method with no override', () => {
    const scope = readScope(MethodOverrideController, 'list', MethodOverrideController);
    expect(scope.type).toBe(ScopeType.MALL_SCOPED);
  });

  it('method-level declaration overrides the class-level default', () => {
    const scope = readScope(MethodOverrideController, 'create', MethodOverrideController);
    expect(scope.type).toBe(ScopeType.GLOBAL);
    expect(scope.globalReason).toBe('method-level override reason');
  });

  it('GlobalScope() shorthand produces a GLOBAL declaration with the given reason', () => {
    const scope = readScope(GlobalClassController, 'list', GlobalClassController);
    expect(scope).toEqual({ type: ScopeType.GLOBAL, globalReason: 'class-level global reason' });
  });

  it('UserScope() shorthand produces a USER_SCOPED declaration', () => {
    const scope = readScope(UserScopeController, 'list', UserScopeController);
    expect(scope).toEqual({ type: ScopeType.USER_SCOPED });
  });

  it('a route with no @Scope at all yields undefined (this is the UNDECLARED case the inventory tool detects)', () => {
    @Controller('dummy')
    class UndeclaredController {
      @Get()
      list() {}
    }
    const scope = readScope(UndeclaredController, 'list', UndeclaredController);
    expect(scope).toBeUndefined();
  });
});
