import { OperationalController } from './operational.controller';
import { OperationalMetricsService } from './services/operational-metrics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OperationalController', () => {
  const metrics = { snapshot: jest.fn() };
  const prisma = {
    jobExecution: {
      findMany: jest.fn(),
    },
  };
  let controller: OperationalController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OperationalController(
      metrics as unknown as OperationalMetricsService,
      prisma as unknown as PrismaService,
    );
  });

  it('returns the process metrics snapshot', () => {
    metrics.snapshot.mockReturnValue({ uptimeSeconds: 10 });

    expect(controller.metricsSnapshot()).toEqual({ uptimeSeconds: 10 });
  });

  it('summarizes the most recent run and consecutive failures per job', async () => {
    prisma.jobExecution.findMany.mockImplementation((args: any) => {
      if (args.distinct) {
        return Promise.resolve([{ jobName: 'parking-contract-billing' }]);
      }
      return Promise.resolve([
        { status: 'FAILED', startedAt: new Date('2026-08-19T03:00:00Z'), finishedAt: new Date('2026-08-19T03:00:01Z'), durationMs: 1000, errorSummary: 'timeout' },
        { status: 'FAILED', startedAt: new Date('2026-08-19T02:00:00Z'), finishedAt: new Date('2026-08-19T02:00:01Z'), durationMs: 900, errorSummary: 'timeout' },
        { status: 'SUCCEEDED', startedAt: new Date('2026-08-19T01:00:00Z'), finishedAt: new Date('2026-08-19T01:00:01Z'), durationMs: 800, errorSummary: null },
      ]);
    });

    const result = await controller.jobsSnapshot();

    expect(result.jobs).toEqual([
      expect.objectContaining({
        jobName: 'parking-contract-billing',
        lastStatus: 'FAILED',
        lastErrorSummary: 'timeout',
        consecutiveFailures: 2,
      }),
    ]);
  });

  it('reports zero consecutive failures for a healthy job', async () => {
    prisma.jobExecution.findMany.mockImplementation((args: any) => {
      if (args.distinct) {
        return Promise.resolve([{ jobName: 'patrol-overdue-shifts' }]);
      }
      return Promise.resolve([
        { status: 'SUCCEEDED', startedAt: new Date(), finishedAt: new Date(), durationMs: 50, errorSummary: null },
      ]);
    });

    const result = await controller.jobsSnapshot();

    expect(result.jobs[0]).toEqual(
      expect.objectContaining({ jobName: 'patrol-overdue-shifts', consecutiveFailures: 0 }),
    );
  });

  it('reports null lastStatus for a job with no ledger rows yet', async () => {
    prisma.jobExecution.findMany.mockImplementation((args: any) => {
      if (args.distinct) {
        return Promise.resolve([{ jobName: 'never-run-job' }]);
      }
      return Promise.resolve([]);
    });

    const result = await controller.jobsSnapshot();

    expect(result.jobs[0]).toEqual(
      expect.objectContaining({ jobName: 'never-run-job', lastStatus: null, consecutiveFailures: 0 }),
    );
  });
});
