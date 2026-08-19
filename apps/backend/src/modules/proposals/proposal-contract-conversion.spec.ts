import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../crm/customers.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { BillingScheduleService } from '../billing/billing-schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { CategoriesService } from '../categories/categories.service';
import { ProposalStatus, UnitStatus } from '@prisma/client';

/**
 * Data integrity hardening (docs/security/DATA_INTEGRITY_PROPOSAL_CONTRACT.md):
 * Proposal→Contract used to run as several unwrapped writes. These tests
 * cover the three failure modes named in the sprint brief (section 20):
 * rollback on partial failure, idempotency under a same-request retry, and
 * no duplicate under a simulated concurrent race.
 */
describe('ProposalsService.createContractFromProposal — atomicity & idempotency', () => {
  let service: ProposalsService;
  const APPROVED_PROPOSAL = {
    id: 'p1',
    proposalNumber: 'PRP-2026-00001',
    status: ProposalStatus.APPROVED,
    tenantId: 't1',
    unitId: 'u1',
    leadId: 'l1',
    createdById: 'creator-1',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-01-01'),
    term: 12,
    monthlyRent: 50_000_000,
    monthlyCAM: 5_000_000,
    depositAmount: 100_000_000,
    rentFree: 0,
    escalationPercent: 0,
  };

  const prisma: any = {
    proposal: { findUnique: jest.fn(), update: jest.fn() },
    contract: { findFirst: jest.fn(), create: jest.fn() },
    unitBooking: { updateMany: jest.fn() },
    lead: { update: jest.fn() },
    $transaction: jest.fn(),
  };
  const unitStatus: any = { transition: jest.fn() };
  const customersService: any = { createFromLead: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.proposal.findUnique.mockResolvedValue({ ...APPROVED_PROPOSAL, unit: {}, tenant: {}, lead: { id: 'l1' }, approvalWorkflow: null, contract: null });
    // Route the transaction callback straight to the same mocked `prisma`
    // object, so `tx.contract.create` etc. hit the same jest.fn()s the test
    // asserts against — equivalent to the real thing for these tests, since
    // we're testing call sequencing/error-handling, not real Postgres locking.
    prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
    unitStatus.transition.mockResolvedValue({ id: 'u1', status: UnitStatus.CONTRACTED });
    customersService.createFromLead.mockResolvedValue({ id: 'cust-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomersService, useValue: customersService },
        { provide: UnitStatusService, useValue: unitStatus },
        { provide: BillingScheduleService, useValue: { buildScheduleForContract: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: EmailService, useValue: { sendMail: jest.fn(), isConfigured: false } },
        { provide: CategoriesService, useValue: { validateProposedPrice: jest.fn().mockResolvedValue({ deviationPercent: 0 }) } },
      ],
    }).compile();
    service = module.get(ProposalsService);
  });

  it('creates the contract and performs every dependent write inside one transaction, in order', async () => {
    prisma.contract.findFirst.mockResolvedValue(null); // no pre-existing contract, inside or outside tx
    prisma.contract.create.mockResolvedValue({ id: 'c1', contractNumber: 'CTR-2026-00001', proposalId: 'p1' });

    const result = await service.createContractFromProposal('p1', { userId: 'user-1' });

    expect(result).toMatchObject({ id: 'c1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contract.create).toHaveBeenCalledTimes(1);
    // unitStatus.transition must receive the transaction client (4th arg),
    // not silently fall back to opening its own separate transaction.
    expect(unitStatus.transition).toHaveBeenCalledWith(
      'u1', UnitStatus.CONTRACTED, expect.objectContaining({ tenantId: 't1' }), prisma,
    );
    expect(prisma.unitBooking.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.proposal.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: ProposalStatus.CONVERTED } });
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { status: 'WON' } });
  });

  it('rolls back — a failure partway through the transaction propagates and the contract create is not treated as committed', async () => {
    prisma.contract.findFirst.mockResolvedValue(null);
    prisma.contract.create.mockResolvedValue({ id: 'c1', contractNumber: 'CTR-2026-00001', proposalId: 'p1' });
    // Simulate the unit-status transition itself rejecting (e.g. an invalid
    // state transition) — in real Postgres, the transaction wrapping this
    // would roll back the just-created contract row along with it.
    unitStatus.transition.mockRejectedValue(new BadRequestException('Invalid unit status transition'));

    await expect(service.createContractFromProposal('p1', { userId: 'user-1' })).rejects.toThrow('Invalid unit status transition');

    // Nothing after the failure point should have run.
    expect(prisma.unitBooking.updateMany).not.toHaveBeenCalled();
    expect(prisma.proposal.update).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('is idempotent on a same-request retry: returns the already-created contract without re-running any writes', async () => {
    const existingContract = { id: 'c1', contractNumber: 'CTR-2026-00001', proposalId: 'p1' };
    prisma.contract.findFirst.mockResolvedValue(existingContract); // pre-check finds it already

    const result = await service.createContractFromProposal('p1', { userId: 'user-1' });

    expect(result).toEqual(existingContract);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.contract.create).not.toHaveBeenCalled();
    expect(unitStatus.transition).not.toHaveBeenCalled();
  });

  it('resolves a concurrent-race duplicate (P2002 on Contract.proposalId) to the winning contract instead of throwing', async () => {
    // Both requests pass the outer pre-check (nobody has committed yet)...
    prisma.contract.findFirst
      .mockResolvedValueOnce(null) // outer pre-check
      .mockResolvedValueOnce(null) // inner re-check inside the transaction
      .mockResolvedValueOnce(null) // existingUnitContract guard — no conflicting live contract on the unit
      .mockResolvedValueOnce({ id: 'c-winner', contractNumber: 'CTR-2026-99999', proposalId: 'p1' }); // post-P2002 lookup
    const p2002: any = new Error('Unique constraint failed on the fields: (`proposalId`)');
    p2002.code = 'P2002';
    prisma.contract.create.mockRejectedValue(p2002);

    const result = await service.createContractFromProposal('p1', { userId: 'user-1' });

    expect(result).toEqual({ id: 'c-winner', contractNumber: 'CTR-2026-99999', proposalId: 'p1' });
  });

  it('rejects converting a proposal that is not APPROVED, before any write happens', async () => {
    prisma.proposal.findUnique.mockResolvedValue({ ...APPROVED_PROPOSAL, status: ProposalStatus.DRAFT, unit: {}, tenant: {}, lead: null, approvalWorkflow: null, contract: null });
    await expect(service.createContractFromProposal('p1')).rejects.toThrow('Proposal must be approved');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
