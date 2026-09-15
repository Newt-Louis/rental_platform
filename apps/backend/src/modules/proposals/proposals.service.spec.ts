import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { ProposalApprovalRouteService } from './proposal-approval-route.service';
import { ProposalDocumentService } from './document/proposal-document.service';
import { ProposalDocumentDeliveryService } from './document/proposal-document-delivery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../crm/customers.service';
import { UnitStatusService } from '../../common/services/unit-status.service';
import { BillingScheduleService } from '../billing/billing-schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { CategoriesService } from '../categories/categories.service';
import { OperationalMetricsService } from '../../common/services/operational-metrics.service';
import { LeadLifecycleService } from '../crm/lead-lifecycle.service';
import { OutboxService } from '../../common/services/outbox.service';
import { ProposalStatus } from '@prisma/client';
import { Role } from '@prisma/client';

describe('ProposalsService integration (mocked DB)', () => {
  let service: ProposalsService;
  const prisma: any = {
    proposal: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    invoice: { count: jest.fn() },
    approvalPolicyRule: { findMany: jest.fn() },
    proposalVersion: { findFirst: jest.fn(), create: jest.fn() },
    approvalWorkflow: { create: jest.fn(), findUnique: jest.fn() },
    approvalStep: { findFirst: jest.fn().mockResolvedValue(null) },
    // Routing pre-flight loads the assigned approvers; each id resolves to an
    // active, Mall-scoped user holding the role its test rule names.
    user: {
      findMany: jest.fn(async ({ where }: any) => (where?.id?.in ?? []).map((id: string) => ({
        id, role: id === 'u-finance' ? Role.FINANCE : Role.LEASING_MANAGER, isActive: true, deletedAt: null, mallAccess: [{ id: 'access' }],
      }))),
    },
    auditLog: { create: jest.fn() },
    // submit() wraps its writes in $transaction — run the callback with `prisma`
    // itself standing in for `tx`, so the existing per-call mocks below double as
    // the transaction-scoped ones too.
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  const categories = { validateProposedPrice: jest.fn().mockResolvedValue({ deviationPercent: 0 }) };

  beforeEach(async () => {
    jest.clearAllMocks();
    categories.validateProposedPrice.mockResolvedValue({ deviationPercent: 0 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposalsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ProposalDocumentService,
          useValue: {
            assertSubmittable: jest.fn().mockResolvedValue({ proposalId: 'p1' }),
            createSubmittedVersion: jest.fn().mockResolvedValue({ id: 'dv1', versionNumber: 1, sourceFingerprint: 'f'.repeat(64) }),
          },
        },
        { provide: OutboxService, useValue: { enqueue: jest.fn() } },
        { provide: ProposalDocumentDeliveryService, useValue: { notifyApprovalStep: jest.fn() } },
        { provide: CustomersService, useValue: {} },
        { provide: UnitStatusService, useValue: { transition: jest.fn() } },
        { provide: BillingScheduleService, useValue: { buildScheduleForContract: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: EmailService, useValue: { sendMail: jest.fn(), isConfigured: false } },
        { provide: CategoriesService, useValue: categories },
        { provide: OperationalMetricsService, useValue: { increment: jest.fn() } },
        { provide: LeadLifecycleService, useValue: { transition: jest.fn() } },
        ProposalApprovalRouteService,
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
      createdById: 'u-author',
      unit: { category: 'F&B', mallId: 'mall-1' },
      tenant: { category: 'F&B' },
    };

    prisma.proposal.findUnique.mockResolvedValue({
      ...proposal,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.proposal.findUniqueOrThrow.mockResolvedValue({
      ...proposal,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.invoice.count.mockResolvedValue(0);
    prisma.approvalPolicyRule.findMany.mockResolvedValue([
      { stepName: 'Leasing Manager', stepOrder: 1, approverRole: Role.LEASING_MANAGER, approverId: 'u-manager', conditionType: 'DISCOUNT_PCT', operator: '>', threshold: 10, isRequired: false },
      { stepName: 'Finance', stepOrder: 2, approverRole: Role.FINANCE, approverId: 'u-finance', conditionType: 'DISCOUNT_PCT', operator: '>=', threshold: 0, isRequired: true },
    ]);
    prisma.proposalVersion.findFirst.mockResolvedValue(null);
    prisma.proposalVersion.create.mockResolvedValue({ id: 'v1', version: 1 });
    prisma.approvalWorkflow.create.mockResolvedValue({ id: 'w1' });
    prisma.proposal.update.mockResolvedValue({});

    const result = await service.submit('p1', 'u1');

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

  it('submit resolves a lost double-submit race to the winning workflow instead of throwing', async () => {
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
      createdById: 'u-author',
      unit: { category: 'F&B', mallId: 'mall-1' },
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
      { stepName: 'Finance', stepOrder: 1, approverRole: Role.FINANCE, approverId: 'u-finance', conditionType: 'DISCOUNT_PCT', operator: '>=', threshold: 0, isRequired: true },
    ]);
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.approvalWorkflow.findUnique.mockResolvedValue({ id: 'concurrent-winner' });

    const result = await service.submit('p1', 'u1');

    expect(result.workflowId).toBe('concurrent-winner');
    expect(prisma.approvalWorkflow.findUnique).toHaveBeenCalledWith({ where: { proposalId: 'p1' } });
  });

  // CategoryPricing now carries its own currencyCode (previously a plain VND-denominated
  // Float with no currency field at all). submit() used to skip validateProposedPrice()
  // entirely for a non-VND proposal to avoid comparing e.g. a USD rentPerSqm against a VND
  // floor. Now that validateProposedPrice() only matches a same-currency pricing rule, the
  // check runs for every currency -- assert the proposal's own currency is passed through.
  it('submit runs the floor/ceiling check for a non-VND proposal, passing its currencyCode through', async () => {
    const proposal = {
      id: 'p1',
      status: ProposalStatus.DRAFT,
      discount: 0,
      rentFree: 0,
      tenantId: 't1',
      startDate: new Date('2026-01-01'),
      area: 100,
      term: 36,
      rentPerSqm: 25,
      camPerSqm: 3,
      rentCurrency: 'USD',
      createdById: 'u-author',
      unit: { category: 'F&B', categoryId: 'cat-1', mallId: 'mall-1' },
      tenant: { category: 'F&B' },
    };
    prisma.proposal.findUnique.mockResolvedValue({
      ...proposal,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.proposal.findUniqueOrThrow.mockResolvedValue({
      ...proposal,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.invoice.count.mockResolvedValue(0);
    prisma.approvalPolicyRule.findMany.mockResolvedValue([
      { stepName: 'Leasing Manager', stepOrder: 1, approverRole: Role.LEASING_MANAGER, approverId: 'u-manager', conditionType: 'DISCOUNT_PCT', operator: '>=', threshold: 0, isRequired: true },
    ]);
    prisma.proposalVersion.findFirst.mockResolvedValue(null);
    prisma.proposalVersion.create.mockResolvedValue({ id: 'v1', version: 1 });
    prisma.approvalWorkflow.create.mockResolvedValue({ id: 'w1' });
    prisma.proposal.update.mockResolvedValue({});

    await service.submit('p1', 'u1');

    expect(categories.validateProposedPrice).toHaveBeenCalledWith(
      expect.objectContaining({ proposedRentPerSqm: 25, currencyCode: 'USD' }),
    );
  });

  it('submit still runs the VND floor/ceiling check for a VND proposal', async () => {
    const proposal = {
      id: 'p1',
      status: ProposalStatus.DRAFT,
      discount: 0,
      rentFree: 0,
      tenantId: 't1',
      startDate: new Date('2026-01-01'),
      area: 100,
      term: 36,
      rentPerSqm: 500000,
      camPerSqm: 50000,
      rentCurrency: 'VND',
      createdById: 'u-author',
      unit: { category: 'F&B', categoryId: 'cat-1', mallId: 'mall-1' },
      tenant: { category: 'F&B' },
    };
    prisma.proposal.findUnique.mockResolvedValue({
      ...proposal,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.proposal.findUniqueOrThrow.mockResolvedValue({
      ...proposal,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.invoice.count.mockResolvedValue(0);
    prisma.approvalPolicyRule.findMany.mockResolvedValue([
      { stepName: 'Leasing Manager', stepOrder: 1, approverRole: Role.LEASING_MANAGER, approverId: 'u-manager', conditionType: 'DISCOUNT_PCT', operator: '>=', threshold: 0, isRequired: true },
    ]);
    prisma.proposalVersion.findFirst.mockResolvedValue(null);
    prisma.proposalVersion.create.mockResolvedValue({ id: 'v1', version: 1 });
    prisma.approvalWorkflow.create.mockResolvedValue({ id: 'w1' });
    prisma.proposal.update.mockResolvedValue({});

    await service.submit('p1', 'u1');

    expect(categories.validateProposedPrice).toHaveBeenCalledWith(
      expect.objectContaining({ proposedRentPerSqm: 500000 }),
    );
  });

  it('submit rejects when no rules configured', async () => {
    prisma.proposal.findUnique.mockResolvedValue({
      id: 'p1',
      status: ProposalStatus.DRAFT,
      discount: 0,
      rentFree: 0,
      tenantId: null,
      unit: { mallId: 'mall-1' },
      tenant: null,
      approvalWorkflow: null,
      contract: null,
      lead: null,
    });
    prisma.invoice.count.mockResolvedValue(0);
    prisma.approvalPolicyRule.findMany.mockResolvedValue([]);

    await expect(service.submit('p1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProposalsService.submit — governance gates run before anything is written', () => {
  const baseProposal = {
    id: 'p1', status: 'DRAFT', discount: 0, rentFree: 0, tenantId: null, createdById: 'u-author',
    startDate: new Date('2026-01-01'), area: 100, term: 36, rentPerSqm: 500000, camPerSqm: 0, rentCurrency: 'VND',
    unit: { category: 'F&B', mallId: 'mall-1' }, tenant: null, lead: null, approvalWorkflow: null, contract: null,
  };

  async function build(opts: { rules: any[]; users?: any[]; review?: 'ok' | 'not-reviewed' | 'stale' }) {
    const writes = { version: jest.fn(), workflow: jest.fn(), outbox: jest.fn(), audit: jest.fn(), proposalUpdate: jest.fn(), proposalVersion: jest.fn() };
    const prisma: any = {
      proposal: {
        findUnique: jest.fn().mockResolvedValue(baseProposal),
        findUniqueOrThrow: jest.fn().mockResolvedValue(baseProposal),
        update: jest.fn(async (a: any) => writes.proposalUpdate(a)),
      },
      invoice: { count: jest.fn().mockResolvedValue(0) },
      approvalPolicyRule: { findMany: jest.fn().mockResolvedValue(opts.rules) },
      proposalVersion: { findFirst: jest.fn(), create: jest.fn(async (a: any) => writes.proposalVersion(a)) },
      approvalWorkflow: { create: jest.fn(async (a: any) => { writes.workflow(a); return { id: 'w1' }; }), findUnique: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue(opts.users ?? []) },
      auditLog: { create: jest.fn(async (a: any) => writes.audit(a)) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    const documents = {
      assertSubmittable: jest.fn(async () => {
        if (opts.review === 'not-reviewed') throw new BadRequestException({ code: 'PROPOSAL_DOCUMENT_NOT_REVIEWED' });
        if (opts.review === 'stale') throw new BadRequestException({ code: 'PROPOSAL_DOCUMENT_STALE' });
        return { proposalId: 'p1' };
      }),
      createSubmittedVersion: jest.fn(async () => { writes.version(); return { id: 'dv1', versionNumber: 1, sourceFingerprint: 'f' }; }),
    };
    const outbox = { enqueue: jest.fn(async () => writes.outbox()) };
    const module = await Test.createTestingModule({
      providers: [
        ProposalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProposalDocumentService, useValue: documents },
        { provide: OutboxService, useValue: outbox },
        { provide: ProposalDocumentDeliveryService, useValue: { notifyApprovalStep: jest.fn() } },
        { provide: CustomersService, useValue: {} },
        { provide: UnitStatusService, useValue: { transition: jest.fn() } },
        { provide: BillingScheduleService, useValue: { buildScheduleForContract: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: EmailService, useValue: { sendMail: jest.fn() } },
        { provide: CategoriesService, useValue: { validateProposedPrice: jest.fn() } },
        { provide: OperationalMetricsService, useValue: { increment: jest.fn() } },
        { provide: LeadLifecycleService, useValue: { transition: jest.fn() } },
        ProposalApprovalRouteService,
      ],
    }).compile();
    return { service: module.get(ProposalsService), writes, prisma, documents };
  }

  const expectNothingWritten = (writes: Record<string, jest.Mock>) => {
    for (const [name, fn] of Object.entries(writes)) expect({ name, calls: fn.mock.calls.length }).toEqual({ name, calls: 0 });
  };
  const rule = (approverId: string | null, role: Role = Role.LEASING_MANAGER) =>
    ({ stepName: 'Duyệt', stepOrder: 1, approverRole: role, approverId, conditionType: 'DISCOUNT_PCT', operator: '>=', threshold: 0, isRequired: true });
  const user = (id: string, over: any = {}) => ({ id, role: Role.LEASING_MANAGER, isActive: true, deletedAt: null, mallAccess: [{ id: 'a' }], ...over });

  it('PROP-REVIEW-002/003 an unreviewed document stops submit before routing, version or workflow', async () => {
    const h = await build({ rules: [rule('u-manager')], users: [user('u-manager')], review: 'not-reviewed' });
    const err = await h.service.submit('p1', 'u-author').catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_NOT_REVIEWED' });
    expect(h.prisma.approvalPolicyRule.findMany).not.toHaveBeenCalled();
    expectNothingWritten(h.writes);
  });

  it('PROP-REVIEW-006 a stale document stops submit with nothing written', async () => {
    const h = await build({ rules: [rule('u-manager')], users: [user('u-manager')], review: 'stale' });
    expect((await h.service.submit('p1', 'u-author').catch((e) => e)).getResponse()).toMatchObject({ code: 'PROPOSAL_DOCUMENT_STALE' });
    expectNothingWritten(h.writes);
  });

  it('PROP-ROUTE-003 a self-routed step fails with zero side effects', async () => {
    const h = await build({ rules: [rule('u-author')], users: [user('u-author')], review: 'ok' });
    const err = await h.service.submit('p1', 'u-author').catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'APPROVAL_ROUTING_SELF_CONFLICT' });
    expectNothingWritten(h.writes);
  });

  it('PROP-ROUTE-005 an unassigned step fails with zero side effects', async () => {
    const h = await build({ rules: [rule(null)], review: 'ok' });
    expect((await h.service.submit('p1', 'u-author').catch((e) => e)).getResponse()).toMatchObject({ code: 'APPROVAL_STEP_UNASSIGNED' });
    expectNothingWritten(h.writes);
  });

  it('PROP-ROUTE-007 an approver who lost Mall access fails before workflow creation', async () => {
    const h = await build({ rules: [rule('u-manager')], users: [user('u-manager', { mallAccess: [] })], review: 'ok' });
    const body = (await h.service.submit('p1', 'u-author').catch((e) => e)).getResponse();
    expect(body).toMatchObject({ code: 'APPROVAL_ROUTING_INVALID', errors: [{ stepOrder: 1, reason: 'APPROVER_NO_MALL_ACCESS' }] });
    expectNothingWritten(h.writes);
  });

  it('PROP-ROUTE-001/010 a valid route submits; rules are read inside the transaction after the review gate', async () => {
    const h = await build({ rules: [rule('u-manager')], users: [user('u-manager')], review: 'ok' });
    const order: string[] = [];
    h.documents.assertSubmittable.mockImplementation(async () => { order.push('review'); return { proposalId: 'p1' }; });
    h.prisma.approvalPolicyRule.findMany.mockImplementation(async () => { order.push('rules'); return [rule('u-manager')]; });
    h.prisma.user.findMany.mockImplementation(async () => { order.push('routing'); return [user('u-manager')]; });
    h.documents.createSubmittedVersion.mockImplementation(async () => { order.push('version'); return { id: 'dv1', versionNumber: 1, sourceFingerprint: 'f' }; });

    await expect(h.service.submit('p1', 'u-author')).resolves.toMatchObject({ workflowId: 'w1' });
    expect(order).toEqual(['review', 'rules', 'routing', 'version']);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.writes.workflow.mock.calls[0][0].data.steps.create).toEqual([expect.objectContaining({ approverId: 'u-manager' })]);
  });

  it('a Serializable conflict with no winning workflow asks for a retry instead of a 500', async () => {
    const h = await build({ rules: [rule('u-manager')], users: [user('u-manager')], review: 'ok' });
    h.prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('could not serialize'), { code: 'P2034' }));
    const err = await h.service.submit('p1', 'u-author').catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'PROPOSAL_SUBMIT_CONFLICT' });
  });
});
