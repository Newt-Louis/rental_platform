import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';
import { OperationalMetricsService } from '../services/operational-metrics.service';

@Injectable()
export class RequestObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestObservabilityInterceptor.name);

  constructor(private readonly metrics: OperationalMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();
    const incoming = request.headers?.['x-request-id'];
    const requestId =
      typeof incoming === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)
        ? incoming
        : randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.finish(request, response, requestId, startedAt),
        error: () => this.finish(request, response, requestId, startedAt),
      }),
    );
  }

  private finish(request: any, response: any, requestId: string, startedAt: number) {
    const duration = Date.now() - startedAt;
    const status = response.statusCode || 500;
    this.metrics.record(status, duration);
    this.logger.log(
      JSON.stringify({
        requestId,
        method: request.method,
        path: request.originalUrl ?? request.url,
        status,
        durationMs: duration,
        userId: request.user?.id ?? null,
      }),
    );
  }
}
