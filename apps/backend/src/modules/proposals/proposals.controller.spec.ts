import { ProposalsController } from './proposals.controller';
import { ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('ProposalsController access and roles', () => {
  const service: any = { findAll: jest.fn(), getStats: jest.fn(), findOne: jest.fn(), update: jest.fn() };
  const mallAccess: any = {
    assertMallAccess: jest.fn(), getAccessibleMallIds: jest.fn(), extractAndValidateMallAccess: jest.fn(),
  };
  let controller: ProposalsController;

  beforeEach(() => {
    jest.clearAllMocks();
    mallAccess.getAccessibleMallIds.mockResolvedValue(['mall-1']);
    controller = new ProposalsController(service, {} as any, {} as any, mallAccess, {} as any, {} as any);
  });

  it('scopes lists and KPI to assigned malls', async () => {
    const user = { id: 'u1', role: 'LEASING_EXECUTIVE' };
    await controller.findAll({ status: 'DRAFT' }, user);
    await controller.stats(user);
    expect(service.findAll).toHaveBeenCalledWith({ status: 'DRAFT', mallIds: ['mall-1'] });
    // See note below on the leaseTermType forwarding — same reason.
    expect(service.getStats).toHaveBeenCalledWith(['mall-1'], undefined);
  });

  it('uses and validates the mall selected in the request instead of stale active mall context', async () => {
    const user = { id: 'u1', role: 'LEASING_EXECUTIVE', activeMallId: 'mall-old' };
    await controller.findAll({ status: 'DRAFT', mallId: 'mall-new' }, user);
    await controller.stats(user, 'mall-new');
    expect(mallAccess.assertMallAccess).toHaveBeenCalledTimes(2);
    expect(mallAccess.assertMallAccess).toHaveBeenCalledWith('u1', 'LEASING_EXECUTIVE', 'mall-new');
    expect(service.findAll).toHaveBeenCalledWith({ status: 'DRAFT', mallId: 'mall-new', mallIds: undefined });
    // Test defect fix (docs/reliability/TEST_BASELINE_REMEDIATION.md):
    // ProposalsController.stats() now also forwards an optional leaseTermType
    // query param to service.getStats(mallIds, leaseTermType) — a real,
    // intentional feature (LONG/SHORT lease-term filtering), not exercised by
    // this test, so the second arg is `undefined` here. The assertion below
    // was never updated for that extra parameter.
    expect(service.getStats).toHaveBeenCalledWith(['mall-new'], undefined);
  });

  it('validates proposal mall before returning detail', async () => {
    await controller.findOne('p1', { id: 'u1', role: 'LEASING_EXECUTIVE' });
    expect(mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith(
      'u1', 'LEASING_EXECUTIVE', { proposalId: 'p1' },
    );
  });

  it('prevents executive conversion and CEO mutation through role metadata', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProposalsController.prototype.convert)).toEqual([
      'ADMIN', 'LEASING_MANAGER', 'MALL_DIRECTOR',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ProposalsController.prototype.update)).not.toContain('CEO');
  });

});

describe('ProposalsController — canonical document (CR-PROPOSAL-DOCUMENT-SOURCE-001)', () => {
  const user = { id: 'u-mall-a', role: 'LEASING_EXECUTIVE' };
  const model: any = { proposalNumber: 'PRO-2026-00042', sync: { sourceFingerprint: 'f'.repeat(64), documentStale: false } };
  let service: any;
  let pdf: any;
  let documents: any;
  let mallAccess: any;
  let controller: ProposalsController;

  beforeEach(() => {
    service = { findOne: jest.fn() };
    pdf = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.3 test')), generateProposalPdf: jest.fn() };
    documents = { getDocument: jest.fn().mockResolvedValue(model), saveContent: jest.fn().mockResolvedValue(model) };
    mallAccess = { extractAndValidateMallAccess: jest.fn() };
    controller = new ProposalsController(service, pdf, {} as any, mallAccess, documents, {} as any);
  });

  const res = () => {
    const r: any = { set: jest.fn(), end: jest.fn() };
    return r;
  };

  it('PROP-PDF-024 the PDF endpoint renders the same canonical model GET /document returns', async () => {
    const r = res();
    await controller.exportPdf('p1', r, user);

    expect(documents.getDocument).toHaveBeenCalledWith('p1');
    expect(pdf.render).toHaveBeenCalledWith(model);
    expect(service.findOne).not.toHaveBeenCalled();
    expect(r.set).toHaveBeenCalledWith(expect.objectContaining({
      'Content-Type': 'application/pdf',
      'X-Proposal-Document-Fingerprint': model.sync.sourceFingerprint,
    }));

    await expect(controller.getDocument('p1', user)).resolves.toBe(model);
  });

  it('authorises every document route from the Proposal id before touching the document', async () => {
    const order: string[] = [];
    mallAccess.extractAndValidateMallAccess.mockImplementation(async () => { order.push('auth'); });
    documents.getDocument.mockImplementation(async () => { order.push('read'); return model; });
    documents.saveContent.mockImplementation(async () => { order.push('write'); return model; });

    await controller.getDocument('p1', user);
    await controller.exportPdf('p1', res(), user);
    await controller.saveDocumentContent('p1', { expectedContentVersion: 0, reviewedFingerprint: 'f'.repeat(64), content: {} }, user);

    expect(order).toEqual(['auth', 'read', 'auth', 'read', 'auth', 'write']);
    for (const call of mallAccess.extractAndValidateMallAccess.mock.calls) {
      expect(call).toEqual(['u-mall-a', 'LEASING_EXECUTIVE', { proposalId: 'p1' }]);
    }
  });

  it('a Mall B proposal requested by a Mall A user is refused with zero side effects', async () => {
    mallAccess.extractAndValidateMallAccess.mockRejectedValue(new ForbiddenException('No access to this mall'));
    const r = res();

    await expect(controller.getDocument('p-mall-b', user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.exportPdf('p-mall-b', r, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.saveDocumentContent('p-mall-b', { expectedContentVersion: 0, reviewedFingerprint: 'f'.repeat(64), content: { bodyIntro: 'x' } }, user))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(documents.getDocument).not.toHaveBeenCalled();
    expect(documents.saveContent).not.toHaveBeenCalled();
    expect(pdf.render).not.toHaveBeenCalled();
    expect(r.end).not.toHaveBeenCalled();
  });

  it('only proposal editors may save document content, and the unvalidated editor-content route is gone', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProposalsController.prototype.saveDocumentContent)).toEqual([
      'ADMIN', 'LEASING_MANAGER', 'LEASING_EXECUTIVE', 'MALL_DIRECTOR',
    ]);
    expect((ProposalsController.prototype as any).saveEditorContent).toBeUndefined();
  });
});

