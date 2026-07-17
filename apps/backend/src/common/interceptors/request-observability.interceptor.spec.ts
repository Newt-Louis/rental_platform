import { of } from 'rxjs';
import { RequestObservabilityInterceptor } from './request-observability.interceptor';
import { OperationalMetricsService } from '../services/operational-metrics.service';

describe('RequestObservabilityInterceptor', () => {
  it('preserves a valid request ID and records metrics', (done) => {
    const metrics = new OperationalMetricsService();
    const interceptor = new RequestObservabilityInterceptor(metrics);
    const response = { statusCode: 200, setHeader: jest.fn() };
    const request = { headers: { 'x-request-id': 'uat-contract-123' }, method: 'GET', url: '/api/health' };
    const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as any;

    interceptor.intercept(context, { handle: () => of({ ok: true }) }).subscribe({
      complete: () => {
        expect(request).toHaveProperty('requestId', 'uat-contract-123');
        expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'uat-contract-123');
        expect(metrics.snapshot().requests).toBe(1);
        done();
      },
    });
  });

  it('replaces an unsafe request ID', (done) => {
    const interceptor = new RequestObservabilityInterceptor(new OperationalMetricsService());
    const response = { statusCode: 200, setHeader: jest.fn() };
    const request = { headers: { 'x-request-id': '<script>' }, method: 'GET', url: '/' };
    const context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as any;

    interceptor.intercept(context, { handle: () => of(null) }).subscribe({
      complete: () => {
        expect((request as any).requestId).not.toBe('<script>');
        expect((request as any).requestId).toMatch(/^[0-9a-f-]{36}$/);
        done();
      },
    });
  });
});
