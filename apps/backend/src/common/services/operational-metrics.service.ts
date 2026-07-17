import { Injectable } from '@nestjs/common';

@Injectable()
export class OperationalMetricsService {
  private startedAt = Date.now();
  private requests = 0;
  private errors = 0;
  private totalDurationMs = 0;
  private byStatus = new Map<number, number>();

  record(status: number, durationMs: number) {
    this.requests++;
    this.totalDurationMs += durationMs;
    if (status >= 500) this.errors++;
    this.byStatus.set(status, (this.byStatus.get(status) ?? 0) + 1);
  }

  snapshot() {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      requests: this.requests,
      serverErrors: this.errors,
      averageDurationMs: this.requests ? Math.round(this.totalDurationMs / this.requests) : 0,
      byStatus: Object.fromEntries([...this.byStatus.entries()].sort(([a], [b]) => a - b)),
      memory: {
        rssBytes: process.memoryUsage().rss,
        heapUsedBytes: process.memoryUsage().heapUsed,
      },
    };
  }
}
