import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantsService } from './tenants.service';

describe('TenantsService portal account lifecycle', () => {
  const tenantDto = {
    companyName: 'Công ty ABC',
    brandName: 'ABC',
    contactName: 'Nguyễn Văn A',
    contactEmail: ' Portal@Example.com ',
    contactPhone: '0912345678',
  };

  function setup() {
    const tx = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-1', ...tenantDto, contactEmail: 'portal@example.com', isPortalUser: true }), update: jest.fn() },
      user: { create: jest.fn(), update: jest.fn() },
      emailDelivery: { create: jest.fn().mockResolvedValue({ id: 'delivery-1' }) },
    };
    const prisma: any = {
      tenant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      emailDelivery: { findUnique: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const email: any = {
      portalInvitationHtml: jest.fn().mockReturnValue('<p>Portal invitation</p>'),
      prepareTrackedDelivery: jest.fn((client, options) => client.emailDelivery.create({ data: options })),
      sendMail: jest.fn().mockResolvedValue({ messageId: 'mail-1' }),
    };
    return { service: new TenantsService(prisma, email), prisma, email, tx };
  }

  it('creates the tenant and its linked TENANT user in one transaction', async () => {
    const { service, prisma, tx, email } = setup();
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    const result: any = await service.create(tenantDto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.tenant.create).toHaveBeenCalledWith({ data: expect.objectContaining({ contactEmail: 'portal@example.com', isPortalUser: true }) });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'portal@example.com', role: 'TENANT', tenantId: 'tenant-1', mustChangePassword: true }),
    });
    expect(email.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'portal@example.com' }));
    expect(result.portalAccount).toEqual(expect.objectContaining({ email: 'portal@example.com', emailSent: true }));
  });

  it('does not create a tenant when the portal email belongs to another account', async () => {
    const { service, prisma } = setup();
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'staff-1', role: 'ADMIN', tenantId: null });

    await expect(service.create(tenantDto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sets an administrator-provided password and clears an outstanding invitation', async () => {
    const { service, prisma } = setup();
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1', brandName: 'ABC', contactName: 'A', deletedAt: null,
      portalUsers: [{ id: 'user-1', email: 'portal@example.com' }],
    });

    await service.setPortalPassword('tenant-1', 'NewPassword123!');

    const update = prisma.user.update.mock.calls[0][0];
    expect(await bcrypt.compare('NewPassword123!', update.data.password)).toBe(true);
    expect(update.data).toEqual(expect.objectContaining({ inviteTokenHash: null, inviteExpiresAt: null, mustChangePassword: false, isActive: true }));
  });

  it('provisions a portal account for an existing tenant without a second admin workflow', async () => {
    const { service, prisma, tx, email } = setup();
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1', brandName: 'ABC', contactName: 'A', contactEmail: 'Portal@Example.com',
      contactPhone: null, deletedAt: null, portalUsers: [],
    });
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.createPortalAccount('tenant-1');

    expect(tx.tenant.update).toHaveBeenCalledWith({ where: { id: 'tenant-1' }, data: { isPortalUser: true, contactEmail: 'portal@example.com' } });
    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'portal@example.com', tenantId: 'tenant-1', role: 'TENANT' }) });
    expect(email.sendMail).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ email: 'portal@example.com', emailSent: true }));
  });

  it('EMAIL-OPS-015 preserves the previous activation token when delivery staging fails', async () => {
    const { service, prisma, tx, email } = setup();
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1', brandName: 'ABC', contactName: 'A', deletedAt: null,
      portalUsers: [{ id: 'user-1', email: 'portal@example.com', mustChangePassword: true }],
    });
    tx.emailDelivery.create.mockRejectedValue(new Error('ledger unavailable'));

    await expect(
      service.reissuePortalActivation('tenant-1', 'original-1', 'operation-1', 'mall-a'),
    ).rejects.toThrow('ledger unavailable');

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(email.sendMail).not.toHaveBeenCalled();
  });

  it('does not send when token replacement fails after delivery staging', async () => {
    const { service, prisma, tx, email } = setup();
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1', brandName: 'ABC', contactName: 'A', deletedAt: null,
      portalUsers: [{ id: 'user-1', email: 'portal@example.com', mustChangePassword: true }],
    });
    tx.user.update.mockRejectedValue(new Error('token update unavailable'));

    await expect(
      service.reissuePortalActivation('tenant-1', 'original-1', 'operation-1', 'mall-a'),
    ).rejects.toThrow('token update unavailable');

    expect(tx.emailDelivery.create).toHaveBeenCalled();
    expect(email.sendMail).not.toHaveBeenCalled();
  });

  it('keeps a recoverable ledger and valid new token when SMTP fails after commit', async () => {
    const { service, prisma, tx, email } = setup();
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1', brandName: 'ABC', contactName: 'A', deletedAt: null,
      portalUsers: [{ id: 'user-1', email: 'portal@example.com', mustChangePassword: true }],
    });
    const smtpError = Object.assign(new Error('SMTP unavailable'), { deliveryId: 'delivery-1' });
    email.sendMail.mockRejectedValue(smtpError);

    await expect(
      service.reissuePortalActivation('tenant-1', 'original-1', 'operation-1', 'mall-a'),
    ).resolves.toEqual(expect.objectContaining({ sent: false, deliveryId: 'delivery-1' }));

    expect(email.prepareTrackedDelivery).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        delivery: expect.objectContaining({
          mallId: 'mall-a',
          originalDeliveryId: 'original-1',
          resendOfId: 'original-1',
        }),
      }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({ inviteTokenHash: expect.any(String), inviteExpiresAt: expect.any(Date) }),
    });
  });

  it('deduplicates concurrent activation reissues by operation identity', async () => {
    const { service, prisma, tx, email } = setup();
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1', brandName: 'ABC', contactName: 'A', deletedAt: null,
      portalUsers: [{ id: 'user-1', email: 'portal@example.com', mustChangePassword: true }],
    });
    let transactionCount = 0;
    prisma.$transaction.mockImplementation((callback: any) => {
      transactionCount += 1;
      return transactionCount === 1
        ? callback(tx)
        : Promise.reject(Object.assign(new Error('duplicate'), { code: 'P2002' }));
    });
    prisma.emailDelivery.findUnique.mockResolvedValue({ id: 'delivery-1', status: 'SENT' });

    const first = await service.reissuePortalActivation(
      'tenant-1', 'original-1', 'same-operation', 'mall-a',
    );
    const duplicate = await service.reissuePortalActivation(
      'tenant-1', 'original-1', 'same-operation', 'mall-a',
    );

    expect(first).toEqual(expect.objectContaining({ created: true, deliveryId: 'delivery-1' }));
    expect(duplicate).toEqual(expect.objectContaining({ created: false, duplicate: true, deliveryId: 'delivery-1' }));
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(email.sendMail).toHaveBeenCalledTimes(1);
  });
});

describe('TenantsService Fitout dossier archive', () => {
  function setupArchive() {
    const prisma: any = {
      tenant: { findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      fitoutSubmittal: {
        findMany: jest.fn().mockImplementation(({ select }: any) => Promise.resolve(
          select?.id && Object.keys(select).length === 1 ? [
          { id: 'submittal-1' },
        ] : [{
          id: 'submittal-1', title: 'Approved shop drawing', status: 'APPROVED', revisionNo: 2,
          stageCode: 'FINAL', submittedAt: new Date('2026-08-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
          project: {
            id: 'project-1',
            tenant: { id: 'tenant-1', brandName: 'Tenant A' },
            contract: { id: 'contract-1', contractNumber: 'CTR-001' },
            unit: { id: 'unit-a', code: 'A-01', name: 'Shop A', mallId: 'mall-a', floor: { id: 'floor-a', name: 'L1', level: 1 } },
          },
          formType: { id: 'form-1', code: 'SHOP_DRAWING', name: 'Shop drawing', category: 'DRAWING' },
          submittedBy: { id: 'submitter-1', fullName: 'Submitter' },
          workflow: { id: 'workflow-1', status: 'APPROVED', steps: [{
            id: 'step-1', stepOrder: 1, stepName: 'Mall review', approverRole: 'MALL_DIRECTOR',
            status: 'APPROVED', comment: 'Compliant', decidedAt: new Date('2026-08-20T00:00:00Z'),
            approver: { id: 'approver-1', fullName: 'Mall Approver' },
          }] },
        }])),
        count: jest.fn().mockResolvedValue(1),
      },
      unifiedDocument: {
        findMany: jest.fn().mockImplementation(({ select }: any) => Promise.resolve(
          select && Object.keys(select).length === 1 && select.entityId ? [{ entityId: 'submittal-1' }] : [
            {
              id: 'document-v2', entityId: 'submittal-1', fileName: 'shop-drawing.pdf',
              version: 2, isLatest: true, isActive: true,
            },
            {
              id: 'document-v1', entityId: 'submittal-1', fileName: 'shop-drawing.pdf',
              version: 1, isLatest: false, isActive: true,
            },
          ])),
      },
      entityComment: {
        findMany: jest.fn().mockImplementation(({ select }: any) => Promise.resolve(
          select && Object.keys(select).length === 1 && select.entityId ? [{ entityId: 'submittal-1' }] : [{
            id: 'comment-1', entityId: 'submittal-1', body: 'Approved after fire-safety update',
            author: { id: 'user-1', fullName: 'Mall reviewer' },
          }])),
      },
    };
    const service = new TenantsService(prisma, {} as any);
    return { service, prisma };
  }

  it('DOSSIER-001/003/004/006 returns approved dossiers, retained versions and scoped comments', async () => {
    const { service, prisma } = setupArchive();

    const result = await service.getFitoutArchive('tenant-1', {
      search: 'shop-drawing.pdf', page: 1, limit: 20,
    }, ['mall-a']);

    const authorizedCandidateWhere = prisma.fitoutSubmittal.findMany.mock.calls[0][0].where;
    const dossierWhere = prisma.fitoutSubmittal.findMany.mock.calls[1][0].where;
    expect(authorizedCandidateWhere).toEqual(expect.objectContaining({
      project: { tenantId: 'tenant-1', unit: { mallId: { in: ['mall-a'] } } },
      status: { in: ['APPROVED', 'PUBLISHED'] },
    }));
    expect(dossierWhere).toEqual(expect.objectContaining({
      project: { tenantId: 'tenant-1', unit: { mallId: { in: ['mall-a'] } } },
      status: { in: ['APPROVED', 'PUBLISHED'] },
    }));
    expect(dossierWhere.OR).toContainEqual({ id: { in: ['submittal-1'] } });
    expect(prisma.unifiedDocument.findMany.mock.calls[0][0].where.entityId).toEqual({ in: ['submittal-1'] });
    expect(prisma.entityComment.findMany.mock.calls[0][0].where.entityId).toEqual({ in: ['submittal-1'] });
    expect(result.data[0].attachments).toHaveLength(2);
    expect(result.data[0].attachments.map((item: any) => item.version)).toEqual([2, 1]);
    expect(result.data[0].attachments[0]).not.toHaveProperty('entityId');
    expect(result.data[0].attachments[0]).not.toHaveProperty('filePath');
    expect(result.data[0].comments).toEqual([
      expect.objectContaining({ id: 'comment-1', body: 'Approved after fire-safety update' }),
    ]);
    expect(result.data[0].comments[0]).not.toHaveProperty('entityId');
    expect(result.data[0]).not.toHaveProperty('tenant');
    expect(result.data[0].project).not.toHaveProperty('tenant');
    expect(result.data[0]).not.toHaveProperty('financials');
  });

  it('DOSSIER-002 returns a published dossier through the same terminal-status boundary', async () => {
    const { service, prisma } = setupArchive();
    const records = await prisma.fitoutSubmittal.findMany({ select: { id: true, title: true } });
    prisma.fitoutSubmittal.findMany.mockClear();
    prisma.fitoutSubmittal.findMany.mockResolvedValueOnce([{ ...records[0], status: 'PUBLISHED' }]);

    const result = await service.getFitoutArchive(undefined, {}, ['mall-a']);

    expect(result.data[0].status).toBe('PUBLISHED');
    expect(prisma.fitoutSubmittal.findMany.mock.calls[0][0].where.status)
      .toEqual({ in: ['APPROVED', 'PUBLISHED'] });
  });

  it('DOSSIER-005 returns only the selected approval history and minimal approver identity', async () => {
    const { service } = setupArchive();
    const result = await service.getFitoutArchive(undefined, {}, ['mall-a']);

    expect(result.data[0].workflow.steps).toEqual([expect.objectContaining({
      id: 'step-1', stepName: 'Mall review', status: 'APPROVED',
      approver: { id: 'approver-1', fullName: 'Mall Approver' },
    })]);
    expect(result.data[0].workflow.steps[0].approver).not.toHaveProperty('email');
  });

  it('returns tenant identity only on the dedicated cross-tenant archive route', async () => {
    const { service } = setupArchive();

    const result = await service.getFitoutArchive(undefined, {}, ['mall-a']);

    expect(result.data[0].tenant).toEqual({ id: 'tenant-1', brandName: 'Tenant A' });
    expect(result.data[0].project).not.toHaveProperty('tenant');
  });

  it('DOSSIER-017 reads FitoutSubmittal and UnifiedDocument without an archive store or copied blob', async () => {
    const { service, prisma } = setupArchive();

    await service.getFitoutArchive(undefined, {}, ['mall-a']);

    expect(prisma.fitoutSubmittal.findMany).toHaveBeenCalled();
    expect(prisma.unifiedDocument.findMany).toHaveBeenCalled();
    expect(prisma).not.toHaveProperty('fitoutDossierArchive');
    expect(prisma.unifiedDocument).not.toHaveProperty('create');
  });

  it('DOSSIER-009 denies direct tenant IDs outside the authorized Mall set before dossier lookup', async () => {
    const { service, prisma } = setupArchive();
    prisma.tenant.findFirst.mockResolvedValueOnce(null);

    await expect(service.getFitoutArchive('tenant-in-mall-b', {}, ['mall-a']))
      .rejects.toThrow('Tenant is outside the authorized Fitout dossier scope');
    expect(prisma.fitoutSubmittal.findMany).not.toHaveBeenCalled();
  });

  it('DOSSIER-015 returns the explicit safe dossier response boundary', async () => {
    const { service } = setupArchive();
    const result = await service.getFitoutArchive(undefined, {}, ['mall-a']);
    const dossier = result.data[0] as any;

    expect(Object.keys(dossier).sort()).toEqual([
      'attachments', 'comments', 'formType', 'id', 'project', 'revisionNo', 'stageCode',
      'status', 'submittedAt', 'submittedBy', 'tenant', 'title', 'updatedAt', 'workflow',
    ].sort());
    expect(Object.keys(dossier.tenant).sort()).toEqual(['brandName', 'id']);
    expect(dossier).not.toHaveProperty('rent');
    expect(dossier).not.toHaveProperty('invoice');
    expect(dossier).not.toHaveProperty('tenant.contactEmail');
  });

  it('DOSSIER-011 prevents Mall-B filename/comment inference by searching only authorized completed IDs', async () => {
    const { service, prisma } = setupArchive();
    prisma.fitoutSubmittal.findMany.mockImplementation(({ select }: any) => Promise.resolve(
      select?.id && Object.keys(select).length === 1 ? [{ id: 'mall-a-submittal' }] : [],
    ));
    prisma.fitoutSubmittal.count.mockResolvedValue(0);
    prisma.unifiedDocument.findMany.mockResolvedValue([]);
    prisma.entityComment.findMany.mockResolvedValue([]);

    await service.getFitoutArchive(undefined, { search: 'secret-mall-b-file.pdf' }, ['mall-a']);

    expect(prisma.unifiedDocument.findMany.mock.calls[0][0].where.entityId)
      .toEqual({ in: ['mall-a-submittal'] });
    expect(prisma.entityComment.findMany.mock.calls[0][0].where.entityId)
      .toEqual({ in: ['mall-a-submittal'] });
  });

  it('DOSSIER-012 clamps pagination and counts with the same Mall-scoped filter', async () => {
    const { service, prisma } = setupArchive();
    prisma.fitoutSubmittal.count.mockResolvedValue(101);

    const result = await service.getFitoutArchive(undefined, { page: 2, limit: 999 }, ['mall-a']);

    expect(prisma.fitoutSubmittal.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 50 }));
    expect(prisma.fitoutSubmittal.count).toHaveBeenCalledWith({
      where: prisma.fitoutSubmittal.findMany.mock.calls[0][0].where,
    });
    expect(result).toEqual(expect.objectContaining({ page: 2, limit: 50, totalPages: 3 }));
  });

  it('returns no attachment query when no completed dossier is visible', async () => {
    const { service, prisma } = setupArchive();
    prisma.fitoutSubmittal.findMany.mockResolvedValue([]);
    prisma.fitoutSubmittal.count.mockResolvedValue(0);
    prisma.unifiedDocument.findMany.mockReset();
    prisma.entityComment.findMany.mockReset();

    const result = await service.getFitoutArchive('tenant-1');

    expect(result).toEqual(expect.objectContaining({ data: [], total: 0 }));
    expect(prisma.unifiedDocument.findMany).not.toHaveBeenCalled();
    expect(prisma.entityComment.findMany).not.toHaveBeenCalled();
  });
});
