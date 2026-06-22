import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths to skip audit logging (read-only, auth, health)
const SKIP_PATHS = ['/api/auth/', '/api/health', '/api/notifications', '/api/ai/chat'];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, user, body, params } = req;

    if (!WRITE_METHODS.has(method)) return next.handle();
    if (SKIP_PATHS.some((p) => url.includes(p))) return next.handle();

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          const duration = Date.now() - startedAt;
          const entityId = params?.id ?? responseData?.id ?? null;
          const entityType = this.extractEntityType(url);

          this.prisma.auditLog
            .create({
              data: {
                userId: user?.id ?? null,
                action: method,
                entityType,
                entityId,
                endpoint: `${method} ${url}`,
                payload: body ? JSON.stringify(body).substring(0, 2000) : null,
                ipAddress: req.ip ?? req.headers?.['x-forwarded-for'] ?? null,
                userAgent: req.headers?.['user-agent']?.substring(0, 500) ?? null,
                duration,
                status: 'SUCCESS',
              },
            })
            .catch((e) => this.logger.warn(`AuditLog write failed: ${e.message}`));
        },
        error: (err) => {
          const duration = Date.now() - startedAt;
          const entityType = this.extractEntityType(url);

          this.prisma.auditLog
            .create({
              data: {
                userId: user?.id ?? null,
                action: method,
                entityType,
                entityId: params?.id ?? null,
                endpoint: `${method} ${url}`,
                payload: body ? JSON.stringify(body).substring(0, 2000) : null,
                ipAddress: req.ip ?? null,
                userAgent: req.headers?.['user-agent']?.substring(0, 500) ?? null,
                duration,
                status: 'ERROR',
                errorMessage: err?.message?.substring(0, 500) ?? 'Unknown error',
              },
            })
            .catch((e) => this.logger.warn(`AuditLog error write failed: ${e.message}`));
        },
      }),
    );
  }

  private extractEntityType(url: string): string {
    const segments = url.replace('/api/', '').split('/').filter(Boolean);
    const map: Record<string, string> = {
      malls: 'MALL', floors: 'FLOOR', zones: 'ZONE', units: 'UNIT',
      users: 'USER', contracts: 'CONTRACT', proposals: 'PROPOSAL',
      invoices: 'INVOICE', tenants: 'TENANT', tickets: 'TICKET',
      leads: 'LEAD', fitouts: 'FITOUT', sales: 'SALES',
      approvals: 'APPROVAL', 'floor-plan': 'FLOOR_PLAN',
    };
    return map[segments[0]] ?? segments[0]?.toUpperCase() ?? 'UNKNOWN';
  }
}
