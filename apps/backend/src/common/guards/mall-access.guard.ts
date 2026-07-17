import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MallAccessService } from '../services/mall-access.service';

@Injectable()
export class MallAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private mallAccess: MallAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return true;

    const query = req.query ?? {};
    const body = req.body ?? {};
    const params = req.params ?? {};
    const path = String(req.path ?? '');
    const resourceId = params.id;

    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, {
      mallId: query.mallId ?? body.mallId ?? params.mallId,
      unitId: body.unitId ?? params.unitId ?? query.unitId,
      floorId: body.floorId ?? params.floorId ?? query.floorId,
      contractId: resourceId && path.includes('contract') ? resourceId : body.contractId,
      fitoutProjectId: query.projectId ?? body.projectId
        ?? (resourceId && /^\/fitout(?:\/|$)/.test(path) ? resourceId : undefined),
      fitoutSubmittalId: resourceId && path.includes('fitout-submittal') ? resourceId : undefined,
      fitoutIssueId: resourceId && path.includes('fitout-issue') ? resourceId : undefined,
      invoiceId: resourceId && path.includes('/invoices/') ? resourceId : undefined,
    });

    return true;
  }
}
