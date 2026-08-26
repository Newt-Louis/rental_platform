// One-off demo data script: adds 20 Contracts spanning all 8 ContractStatus values so
// /contracts can be reviewed with every status represented. Does NOT touch existing data
// (unlike prisma/seed.ts, this never deletes anything) -- safe to run against a live dev DB.
// Run: npx ts-node --transpile-only prisma/scripts/seed-contract-demo-statuses.ts
import { PrismaClient, ContractStatus, ContractType, BillingCycle, BillingScheduleStatus } from '@prisma/client';
import { generateBillingPeriods } from '../../src/modules/billing/billing-schedule.util';

const prisma = new PrismaClient();

interface Plan {
  status: ContractStatus;
  startDate: Date;
  endDate: Date;
}

const PLAN: Plan[] = [
  { status: ContractStatus.DRAFT, startDate: new Date('2026-10-01'), endDate: new Date('2029-09-30') },
  { status: ContractStatus.DRAFT, startDate: new Date('2026-11-01'), endDate: new Date('2029-10-31') },

  { status: ContractStatus.PENDING_LEGAL, startDate: new Date('2026-10-15'), endDate: new Date('2029-10-14') },
  { status: ContractStatus.PENDING_LEGAL, startDate: new Date('2026-11-15'), endDate: new Date('2029-11-14') },
  { status: ContractStatus.PENDING_LEGAL, startDate: new Date('2026-12-01'), endDate: new Date('2029-11-30') },

  { status: ContractStatus.PENDING_SIGNATURE, startDate: new Date('2026-09-15'), endDate: new Date('2029-09-14') },
  { status: ContractStatus.PENDING_SIGNATURE, startDate: new Date('2026-09-20'), endDate: new Date('2029-09-19') },

  { status: ContractStatus.ACTIVE, startDate: new Date('2025-01-01'), endDate: new Date('2028-12-31') },
  { status: ContractStatus.ACTIVE, startDate: new Date('2025-03-01'), endDate: new Date('2028-02-29') },
  { status: ContractStatus.ACTIVE, startDate: new Date('2025-06-01'), endDate: new Date('2028-05-31') },

  { status: ContractStatus.EXPIRING, startDate: new Date('2024-01-01'), endDate: new Date('2026-10-31') },
  { status: ContractStatus.EXPIRING, startDate: new Date('2024-02-01'), endDate: new Date('2026-11-30') },

  { status: ContractStatus.EXPIRED, startDate: new Date('2022-01-01'), endDate: new Date('2025-06-30') },
  { status: ContractStatus.EXPIRED, startDate: new Date('2021-06-01'), endDate: new Date('2025-05-31') },
  { status: ContractStatus.EXPIRED, startDate: new Date('2022-08-01'), endDate: new Date('2025-07-31') },

  { status: ContractStatus.TERMINATING, startDate: new Date('2024-01-01'), endDate: new Date('2027-12-31') },
  { status: ContractStatus.TERMINATING, startDate: new Date('2023-09-01'), endDate: new Date('2027-08-31') },

  { status: ContractStatus.TERMINATED, startDate: new Date('2022-01-01'), endDate: new Date('2025-12-31') },
  { status: ContractStatus.TERMINATED, startDate: new Date('2021-01-01'), endDate: new Date('2024-12-31') },
  { status: ContractStatus.TERMINATED, startDate: new Date('2022-05-01'), endDate: new Date('2025-04-30') },
];

async function main() {
  const [tenants, units, manager, operation, lastContract] = await Promise.all([
    prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.unit.findMany({ orderBy: { code: 'asc' } }),
    prisma.user.findFirst({ where: { email: 'manager@thiso.com' } }),
    prisma.user.findFirst({ where: { email: 'operation@thiso.com' } }),
    prisma.contract.findFirst({ orderBy: { contractNumber: 'desc' } }),
  ]);

  if (!tenants.length || !units.length) {
    throw new Error('No tenants/units found -- run prisma db seed first');
  }
  if (!manager || !operation) {
    throw new Error('Expected manager@thiso.com and operation@thiso.com to exist -- run prisma db seed first');
  }

  const startSeq = lastContract ? parseInt(lastContract.contractNumber.split('-').pop() || '0', 10) + 1 : 1;
  // Reuse the tail of the unit list so these demo contracts don't collide with units the
  // main seed already assigned to its 15 contracts.
  const unitPool = units.slice(-PLAN.length);

  const created: { id: string; status: ContractStatus; tenantId: string; unitId: string; startDate: Date; endDate: Date; rent: number; cam: number; rentFree: number; escalationPercent: number; paymentTerm: number; billingCycle: BillingCycle; currencyCode: string }[] = [];

  for (let i = 0; i < PLAN.length; i++) {
    const plan = PLAN[i];
    const tenant = tenants[i % tenants.length];
    const unit = unitPool[i % unitPool.length];
    const rent = unit.baseRentPerSqm * unit.areaNLA;
    const cam = unit.camPerSqm * unit.areaNLA;
    const deposit = rent * 3;
    const term = Math.round((plan.endDate.getTime() - plan.startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));

    const contract = await prisma.contract.create({
      data: {
        contractNumber: `CTR-2026-${String(startSeq + i).padStart(4, '0')}`,
        tenantId: tenant.id,
        unitId: unit.id,
        type: ContractType.LEASE_AGREEMENT,
        status: plan.status,
        startDate: plan.startDate,
        endDate: plan.endDate,
        term,
        rent,
        cam,
        deposit,
        billingCycle: BillingCycle.MONTHLY,
        paymentTerm: 30,
        rentFree: 0,
        escalationPercent: 5,
        managedById: manager.id,
        notes: `Demo data - trạng thái ${plan.status} cho ${tenant.brandName} tại unit ${unit.code}`,
        isActive: true,
      },
    });

    created.push({
      id: contract.id,
      status: contract.status,
      tenantId: contract.tenantId,
      unitId: contract.unitId,
      startDate: contract.startDate,
      endDate: contract.endDate,
      rent: contract.rent,
      cam: contract.cam,
      rentFree: contract.rentFree,
      escalationPercent: contract.escalationPercent,
      paymentTerm: contract.paymentTerm,
      billingCycle: contract.billingCycle,
      currencyCode: contract.currencyCode,
    });
  }

  console.log(`Created ${created.length} contracts (${PLAN[0].status} .. ${PLAN[PLAN.length - 1].status})`);

  // ACTIVE/EXPIRING contracts must carry a BillingScheduleEntry + a FitoutProject at an
  // "opened" stage, per scripts/backbone-reconciliation.mjs invariants.
  for (const contract of created) {
    if (contract.status !== ContractStatus.ACTIVE && contract.status !== ContractStatus.EXPIRING) continue;

    const periods = generateBillingPeriods({
      startDate: contract.startDate,
      endDate: contract.endDate,
      rent: contract.rent,
      cam: contract.cam,
      rentFree: contract.rentFree,
      escalationPercent: contract.escalationPercent,
      paymentTerm: contract.paymentTerm,
      billingCycle: contract.billingCycle,
    });
    await prisma.billingScheduleEntry.createMany({
      data: periods.map((period) => ({
        contractId: contract.id,
        period: period.period,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        rentAmount: period.rentAmount,
        camAmount: period.camAmount,
        subtotal: period.subtotal,
        currencyCode: contract.currencyCode as any,
        dueDate: period.dueDate,
        status: period.skipped ? BillingScheduleStatus.SKIPPED : BillingScheduleStatus.PENDING,
      })),
    });

    await prisma.fitoutProject.create({
      data: {
        contractId: contract.id,
        tenantId: contract.tenantId,
        unitId: contract.unitId,
        status: 'OPENED',
        handoverDate: contract.startDate,
        startDate: contract.startDate,
        expectedOpenDate: contract.startDate,
        actualOpenDate: contract.startDate,
        operationManagerId: operation.id,
        notes: 'Demo data - fitout đã hoàn tất, cửa hàng đang hoạt động',
      },
    });

    // A FitoutProject at OPENED implies the tenant has moved in -- keep Unit.status in sync
    // (backbone-reconciliation.mjs flags OPENED fitouts on a non-OCCUPIED unit as P1 desync).
    await prisma.unit.update({
      where: { id: contract.unitId },
      data: {
        status: 'OCCUPIED',
        tenantId: contract.tenantId,
        leaseStartDate: contract.startDate,
        leaseEndDate: contract.endDate,
      },
    });
  }
  console.log('Billing schedules + fitout projects seeded for ACTIVE/EXPIRING demo contracts');

  // TERMINATING/TERMINATED contracts get a matching ContractTermination row so the
  // Termination tab has data instead of a dangling status.
  for (const contract of created) {
    if (contract.status !== ContractStatus.TERMINATING && contract.status !== ContractStatus.TERMINATED) continue;
    const isTerminated = contract.status === ContractStatus.TERMINATED;

    await prisma.contractTermination.create({
      data: {
        contractId: contract.id,
        initiatedBy: isTerminated ? 'THISO' : 'TENANT',
        reason: isTerminated ? 'Tenant không gia hạn, đã hoàn tất bàn giao mặt bằng' : 'Tenant xin chấm dứt hợp đồng trước hạn',
        effectiveDate: isTerminated ? contract.endDate : new Date('2026-11-30'),
        noticePeriodDays: 60,
        depositRefund: isTerminated ? contract.rent * 2 : null,
        handoverDate: isTerminated ? contract.endDate : null,
        handoverCondition: isTerminated ? 'GOOD' : null,
        accessCardReturn: isTerminated,
        signageRemoved: isTerminated,
        keysReturned: isTerminated,
        status: isTerminated ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: isTerminated ? contract.endDate : null,
        notes: 'Demo data',
        createdById: manager.id,
      },
    });
  }
  console.log('Termination records seeded for TERMINATING/TERMINATED demo contracts');

  const summary = await prisma.contract.groupBy({ by: ['status'], _count: true });
  console.log('Contract status distribution now:', summary.map((s) => `${s.status}=${s._count}`).join(', '));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
