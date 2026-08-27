import { Injectable } from '@nestjs/common';

@Injectable()
export class OperationalMetricsService {
  private startedAt = Date.now();
  private requests = 0;
  private errors = 0;
  private totalDurationMs = 0;
  private byStatus = new Map<number, number>();
  // Generic named-counter map — Phase 3 (docs/program/03-CONTRACT-LIFECYCLE-COMPLETION.md)
  // reuses this existing metrics service for domain-level reliability counters
  // (proposal_submit_failure_total, contract_activation_failure_total, etc.) rather
  // than introducing a separate monitoring stack for a handful of counters.
  private counters = new Map<string, number>();

  record(status: number, durationMs: number) {
    this.requests++;
    this.totalDurationMs += durationMs;
    if (status >= 500) this.errors++;
    this.byStatus.set(status, (this.byStatus.get(status) ?? 0) + 1);
  }

  increment(counterName: string) {
    this.counters.set(counterName, (this.counters.get(counterName) ?? 0) + 1);
  }

  snapshot() {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      requests: this.requests,
      serverErrors: this.errors,
      averageDurationMs: this.requests ? Math.round(this.totalDurationMs / this.requests) : 0,
      byStatus: Object.fromEntries([...this.byStatus.entries()].sort(([a], [b]) => a - b)),
      counters: Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
      memory: {
        rssBytes: process.memoryUsage().rss,
        heapUsedBytes: process.memoryUsage().heapUsed,
      },
    };
  }
}
