import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  MODULE_FIXED_ROLES_KEY,
  MODULE_KEY,
  MODULE_ROLE_CEILING_KEY,
} from '../decorators/module-roles.decorator';
import { PermissionsService } from '../services/permissions.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // A handler's own @Roles(...) always wins over the class-level default --
    // matches the previous getAllAndOverride behavior. Some controllers (e.g.
    // contracts.controller.ts) set a plain @Roles(...MODULE_ROLES.x, Role.Y)
    // at the handler level to extend the class default with an extra role;
    // that handler carries no MODULE_KEY, so it must be treated as fully
    // static and never overridden by a dynamic lookup of the CLASS's module.
    const handlerRoles = this.reflector.get<Role[]>(ROLES_KEY, context.getHandler());
    const classRoles = this.reflector.get<Role[]>(ROLES_KEY, context.getClass());
    const requiredRoles = handlerRoles ?? classRoles;

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // ADMIN là Super Admin của hệ thống: metadata @Roles ở từng endpoint không
    // được phép vô tình thu hẹp quyền của vai trò này.
    if (user.role === Role.ADMIN) {
      return true;
    }

    const moduleKey = handlerRoles
      ? this.reflector.get<string>(MODULE_KEY, context.getHandler())
      : this.reflector.get<string>(MODULE_KEY, context.getClass());

    if (moduleKey) {
      const req = context.switchToHttp().getRequest();
      const metadataTarget = handlerRoles ? context.getHandler() : context.getClass();
      const fixedRoles = this.reflector.get<Role[]>(MODULE_FIXED_ROLES_KEY, metadataTarget) ?? [];
      if (fixedRoles.includes(user.role)) return true;

      const roleCeiling = this.reflector.get<Role[] | undefined>(MODULE_ROLE_CEILING_KEY, metadataTarget);
      if (roleCeiling && !roleCeiling.includes(user.role)) {
        throw new ForbiddenException('Insufficient permissions for this action');
      }

      // Best-effort mallId: a direct field on the request, not the full
      // unit/floor/contract resolver chain MallAccessGuard uses -- requests
      // without one simply use the Global tier (see PermissionsService).
      const mallId = req.query?.mallId ?? req.body?.mallId ?? req.params?.mallId;
      const dynamic = await this.permissions.getAllowedRoles(moduleKey, mallId);
      if (dynamic) {
        if (!dynamic.has(user.role)) {
          throw new ForbiddenException('Insufficient permissions for this action');
        }
        return true;
      }
      // dynamic === null: module never configured in DB -- fall through to
      // the static requiredRoles baked into @ModuleRoles at decoration time.
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions for this action');
    }

    return true;
  }
}
