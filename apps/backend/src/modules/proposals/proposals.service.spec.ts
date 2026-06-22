import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../crm/customers.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { BillingScheduleService } from '../billing/billing-schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { ProposalStatus } from '@prisma/client';
import { Role } from '@prisma/client';

describe('ProposalsService integration (mocked DB)', () => {
  let service: ProposalsService;
  const prisma: any = {
    proposal: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    invoice: { count: jest.fn() },
    approvalPolicyRule: { findMany: jest.fn() },
    proposalVersion: { findFirst: jest.fn(), create: jest.fn() },
    approvalWorkflow: { create: jest.fn() },
    approvalStep: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomersService, useValue: {} },
        { provide: UnitStatusService, useValue: { transition: jest.fn() } },
        { provide: BillingScheduleService, useValue: { buildScheduleForContract: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: EmailService, useValue: { sendMail: jest.fn(), isConfigured: false } },
      ],
    }).compile();
    service = module.get(ProposalsService);
  });

  it('submit creates workflow steps from policy rules', async () => {
    const proposal = {
      id: 'p1',
      status: ProposalStatus.DRAFT,
      discount: 12,
      rentFree: 30,
      tenantId: 't1',
      startDate: new Date('2026-01-01'),
      area: 100,
      term: 36,
      rentPerSqm: 500000,
      camPerSqm: 50000,
      unit: { category: 'F&B' },
      tenant: { category: 'F&B' },
    };

    prisma.proposal.findUnique.mockResolvedValue({
      ...proposal,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.invoice.count.mockResolvedValue(0);
    prisma.approvalPolicyRule.findMany.mockResolvedValue([
      { stepName: 'Leasing Manager', stepOrder: 1, approverRole: Role.LEASING_MANAGER, conditionType: 'DISCOUNT_PCT', operator: '>', threshold: 10, isRequired: false },
      { stepName: 'Finance', stepOrder: 2, approverRole: Role.FINANCE, conditionType: 'DISCOUNT_PCT', operator: '>=', threshold: 0, isRequired: true },
    ]);
    prisma.proposalVersion.findFirst.mockResolvedValue(null);
    prisma.proposalVersion.create.mockResolvedValue({ id: 'v1', version: 1 });
    prisma.approvalWorkflow.create.mockResolvedValue({ id: 'w1' });
    prisma.proposal.update.mockResolvedValue({});

    const result = await service.submit('p1');

    expect(result.workflowId).toBe('w1');
    expect(prisma.approvalWorkflow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          steps: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ approverRole: Role.LEASING_MANAGER }),
              expect.objectContaining({ approverRole: Role.FINANCE }),
            ]),
          }),
        }),
      }),
    );
  });

  it('submit rejects when no rules configured', async () => {
    prisma.proposal.findUnique.mockResolvedValue({
      id: 'p1',
      status: ProposalStatus.DRAFT,
      discount: 0,
      rentFree: 0,
      tenantId: null,
      unit: {},
      tenant: null,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.invoice.count.mockResolvedValue(0);
    prisma.approvalPolicyRule.findMany.mockResolvedValue([]);

    await expect(service.submit('p1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
