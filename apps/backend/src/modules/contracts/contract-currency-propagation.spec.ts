import { ContractStatus, UnitStatus } from '@prisma/client';
import { BillingScheduleService } from '../billing/billing-schedule.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractEventsService } from './contract-events.service';
import { ContractsService } from './contracts.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { OutboxService } from '../../common/services/outbox.service';
import { OperationalMetricsService } from '../../common/services/operational-metrics.service';

// Multi-currency foundation (docs/program/MULTI_CURRENCY_ARCHITECTURE.md /
// MULTI_CURRENCY_TEST_MATRIX.md): covers the exact silent-currency-drop bug
// found by the audit -- ContractsService.create() previously had no currency
// field at all, so whatever currency a Proposal was quoted in was dropped the
// moment it became a Contract.
describe('ContractsService currency propagation', () => {
  const prisma = {
    unit: { findUnique: jest.fn() },
    contract: { findFirst: jest.fn(), create: jest.fn() },
    proposal: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const events = { logEvent: jest.fn() };
  const unitStatus = { canTransition: jest.fn(), transition: jest.fn() };
  const billingSchedule = {};
  const outbox = {};
  const metrics = {};
  let service: ContractsService;

  const baseDto = {
    tenantId: 'tenant-1',
    unitId: 'unit-1',
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    term: 12,
    rent: 100,
    deposit: 300,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.unit.findUnique.mockResolvedValue({ id: 'unit-1', status: UnitStatus.NEGOTIATING });
    prisma.contract.findFirst.mockResolvedValue(null);
    unitStatus.canTransition.mockReturnValue(true);
    unitStatus.transition.mockResolvedValue(undefined);
    events.logEvent.mockResolvedValue(undefined);
    prisma.contract.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'contract-1', status: ContractStatus.DRAFT, ...data }),
    );
    prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
    service = new ContractsService(
      prisma as unknown as PrismaService,
      events as unknown as ContractEventsService,
      unitStatus as unknown as UnitStatusService,
      billingSchedule as unknown as BillingScheduleService,
      outbox as unknown as OutboxService,
      metrics as unknown as OperationalMetricsService,
    );
  });

  it('propagates Proposal.rentCurrency to Contract.currencyCode when created from a proposal', async () => {
    prisma.proposal.findUnique.mockResolvedValue({ rentCurrency: 'USD' });

    const contract = await service.create({ ...baseDto, proposalId: 'proposal-1' } as any, 'user-1');

    expect(prisma.proposal.findUnique).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      select: { rentCurrency: true },
    });
    expect(contract.currencyCode).toBe('USD');
  });

  it('propagates MMK the same way as any other supported currency', async () => {
    prisma.proposal.findUnique.mockResolvedValue({ rentCurrency: 'MMK' });

    const contract = await service.create({ ...baseDto, proposalId: 'proposal-1' } as any, 'user-1');

    expect(contract.currencyCode).toBe('MMK');
  });

  it('ignores a client-supplied currencyCode when a proposalId is present -- the Proposal always wins', async () => {
    prisma.proposal.findUnique.mockResolvedValue({ rentCurrency: 'USD' });

    const contract = await service.create(
      { ...baseDto, proposalId: 'proposal-1', currencyCode: 'MMK' } as any,
      'user-1',
    );

    expect(contract.currencyCode).toBe('USD');
  });

  it('uses the client-supplied currencyCode for a direct contract with no proposalId', async () => {
    const contract = await service.create({ ...baseDto, currencyCode: 'USD' } as any, 'user-1');

    expect(prisma.proposal.findUnique).not.toHaveBeenCalled();
    expect(contract.currencyCode).toBe('USD');
  });

  it('defaults to VND for a direct contract with no currencyCode specified', async () => {
    const contract = await service.create({ ...baseDto } as any, 'user-1');

    expect(contract.currencyCode).toBe('VND');
  });
});
