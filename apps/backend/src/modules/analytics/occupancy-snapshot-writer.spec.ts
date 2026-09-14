/**
 * REMEDIATION WAVE 6.1 — OCC-CRON-001.
 *
 * `takeMonthlySnapshot` upserted on
 * `@@unique([mallId, floorId, category, leaseTermType, period])` while passing
 * `floorId: null` and `category: null`. Prisma refuses null inside a
 * compound-unique `where`, so the call threw on the first mall and **the job
 * never wrote a row** — every snapshot in the database came from the seed, and
 * the occupancy trend chart had been showing seeded data only.
 *
 * Two defects, not one. Even bypassing Prisma, Postgres treats NULLs as DISTINCT
 * in a standard unique index, so that constraint never prevented duplicate
 * mall-level rows either. Swapping the upsert for findFirst would have left an
 * application check with nothing behind it — the BILL-002 shape. The fix is a
 * partial unique index carrying the writer's own predicate, plus a P2002 branch
 * so the check and the constraint agree instead of merely coexisting.
 */
import { Prisma, UnitStatus } from '@prisma/client';
import { OccupancyAnalyticsService } from './occupancy-analytics.service';

function buildService(overrides: any = {}) {
  const prisma: any = {
    mall: { findMany: jest.fn().mockResolvedValue([{ id: 'mall-1' }]) },
    unit: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u1', mallId: 'mall-1', leaseTermType: 'LONG', status: UnitStatus.OCCUPIED, areaNLA: 100, isActive: true },
      ]),
    },
    slotBooking: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { subtotal: 50_000_000 } }) },
    occupancySnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'snap-new', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'snap-existing', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  const service = new OccupancyAnalyticsService(prisma as any, {
    runExclusive: (_n: string, _t: number, fn: any) => fn(),
  } as any);
  return { service, prisma };
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.10.0',
  });

describe('OCC-CRON-001 — the monthly snapshot actually writes', () => {
  it('writes a row for every lease term instead of throwing on the first mall', async () => {
    const { service, prisma } = buildService();

    const result: any = await service.takeMonthlySnapshot();

    expect(prisma.occupancySnapshot.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 2, updated: 0, failed: 0, malls: 1 });
  });

  // The exact shape that used to throw: null inside a compound-unique lookup.
  it('never passes null inside a compound-unique lookup', async () => {
    const { service, prisma } = buildService();
    await service.takeMonthlySnapshot();

    for (const call of prisma.occupancySnapshot.findFirst.mock.calls) {
      const where = call[0].where;
      // A plain `where` accepts null; a compound-unique key does not.
      expect(where).not.toHaveProperty('mallId_floorId_category_leaseTermType_period');
      expect(where.floorId).toBeNull();
      expect(where.category).toBeNull();
    }
  });

  it('looks the row up on the same scope the partial unique index covers', async () => {
    const { service, prisma } = buildService();
    await service.takeMonthlySnapshot();

    const where = prisma.occupancySnapshot.findFirst.mock.calls[0][0].where;
    // The index is (mallId, leaseTermType, period) WHERE floorId IS NULL AND
    // category IS NULL. The lookup must match it exactly, or the P2002 branch
    // would be reacting to a constraint it does not actually query by.
    expect(Object.keys(where).sort()).toEqual(
      ['category', 'floorId', 'leaseTermType', 'mallId', 'period'].sort(),
    );
  });
});

describe('OCC-CRON-001 — idempotency and concurrency', () => {
  it('updates an existing snapshot rather than creating a second one', async () => {
    const { service, prisma } = buildService({
      occupancySnapshot: {
        findFirst: jest.fn().mockResolvedValue({ id: 'snap-existing' }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result: any = await service.takeMonthlySnapshot();

    expect(prisma.occupancySnapshot.create).not.toHaveBeenCalled();
    expect(prisma.occupancySnapshot.update).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 0, updated: 2, failed: 0 });
  });

  it('re-running the same month rewrites the measures, not the identity', async () => {
    const { service, prisma } = buildService({
      occupancySnapshot: {
        findFirst: jest.fn().mockResolvedValue({ id: 'snap-existing' }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
    await service.takeMonthlySnapshot();

    const call = prisma.occupancySnapshot.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'snap-existing' });
    // Identity columns are never rewritten on update.
    expect(call.data).not.toHaveProperty('mallId');
    expect(call.data).not.toHaveProperty('period');
    expect(call.data).not.toHaveProperty('leaseTermType');
    expect(call.data).toHaveProperty('occupancyRate');
  });

  // A concurrent run wins the race between findFirst and create. The snapshot is
  // idempotent, so the loser adopts the winner's row instead of failing the
  // month. Without the partial unique index there would be no P2002 at all and
  // both runs would simply insert.
  it('resolves a P2002 race by adopting the winning row and updating it', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce(null)               // LONG: nothing yet
      .mockResolvedValueOnce({ id: 'snap-won' }) // LONG: re-read after P2002
      .mockResolvedValue({ id: 'snap-short' });  // SHORT: already there
    const { service, prisma } = buildService({
      occupancySnapshot: {
        findFirst,
        create: jest.fn().mockRejectedValueOnce(p2002()),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result: any = await service.takeMonthlySnapshot();

    expect(prisma.occupancySnapshot.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'snap-won' } }),
    );
    expect(result.failed).toBe(0);
    expect(result.updated).toBe(2);
  });

  it('a P2002 with no findable winner is not swallowed', async () => {
    const { service, prisma } = buildService({
      occupancySnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(p2002()),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result: any = await service.takeMonthlySnapshot();

    // It counts as a failure rather than silently reporting success.
    expect(result.failed).toBe(2);
    expect(prisma.occupancySnapshot.update).not.toHaveBeenCalled();
  });

  it('a non-P2002 error is not mistaken for a race', async () => {
    const { service } = buildService({
      occupancySnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('disk on fire')),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result: any = await service.takeMonthlySnapshot();
    expect(result.failed).toBe(2);
  });
});

describe('OCC-CRON-001 — failure isolation and honest reporting', () => {
  it('one failing mall does not take the rest of the month down', async () => {
    const create = jest.fn()
      .mockRejectedValueOnce(new Error('mall-1 LONG blew up'))
      .mockResolvedValue({ id: 'ok' });
    const { service } = buildService({
      mall: { findMany: jest.fn().mockResolvedValue([{ id: 'mall-1' }, { id: 'mall-2' }]) },
      occupancySnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result: any = await service.takeMonthlySnapshot();

    // 2 malls x 2 lease terms = 4 attempts; one failed, three landed.
    expect(result).toMatchObject({ created: 3, failed: 1, malls: 2 });
  });

  // The old log read "Occupancy snapshot taken for N malls", computed from the
  // mall count alone — so it reported success on every run while every single
  // write was throwing. That is what let the defect sit unnoticed.
  it('reports what reached the table, not how many malls were looped over', async () => {
    const { service } = buildService({
      occupancySnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('always fails')),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result: any = await service.takeMonthlySnapshot();

    expect(result.malls).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.failed).toBe(2);
    // A summary that cannot distinguish these two is the bug, not the report.
    expect(result.created + result.updated).not.toBe(result.malls);
  });

  it('still runs under the scheduler lock', async () => {
    const runExclusive = jest.fn((_n: string, _t: number, fn: any) => fn());
    const prisma: any = buildService().prisma;
    const service = new OccupancyAnalyticsService(prisma, { runExclusive } as any);

    await service.takeMonthlySnapshot();

    expect(runExclusive).toHaveBeenCalledWith('occupancy-snapshot', 21_600_000, expect.any(Function));
  });
});

/**
 * REGRESSION PROOF — the defect was invisible to every behavioural test because
 * the method threw before touching anything a mock could observe. These read the
 * writer's source and fail if the null-in-compound-unique shape comes back.
 */
describe('OCC-CRON-001 — structure', () => {
  const readWriterCode = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs');
    const src = readFileSync(require.resolve('./occupancy-analytics.service.ts'), 'utf8');
    const start = src.indexOf('private async takeMonthlySnapshotUnlocked()');
    const end = src.indexOf('async getVacancyAnalysis', start);
    return src.slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
  };

  it('does not upsert on the compound unique that contains nullable columns', () => {
    const code = readWriterCode();
    expect(code).not.toContain('mallId_floorId_category_leaseTermType_period');
    expect(code).not.toContain('null as any');
  });

  it('keeps the P2002 branch that makes the DB constraint meaningful', () => {
    const code = readWriterCode();
    expect(code).toContain("error.code === 'P2002'");
  });
});
