/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — approvers reach the bound document through
 * the workflow. Found at runtime: FINANCE and LEGAL approvers got 403 opening the
 * Tờ trình because they are not members of the `proposals` module.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProposalApprovalDocumentController } from './proposal-approval-document.controller';
import { MODULE_KEY } from '../../common/decorators/module-roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';

describe('ProposalApprovalDocumentController', () => {
  const model: any = { proposalNumber: 'PRO-1', version: { id: 'dv-1', versionNumber: 2, liveDiffers: false } };
  const finance = { id: 'u-finance', role: 'FINANCE' };

  function build(workflow: any, mallDenied = false) {
    const prisma: any = { approvalWorkflow: { findUnique: jest.fn().mockResolvedValue(workflow) } };
    const documents: any = { getVersionDocument: jest.fn().mockResolvedValue(model) };
    const pdf: any = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) };
    const mallAccess: any = { extractAndValidateMallAccess: jest.fn(async () => { if (mallDenied) throw new ForbiddenException(); }) };
    return { controller: new ProposalApprovalDocumentController(prisma, documents, pdf, mallAccess), prisma, documents, pdf, mallAccess };
  }

  it('belongs to the approvals module, which Finance and Legal approvers hold', () => {
    expect(Reflect.getMetadata(MODULE_KEY, ProposalApprovalDocumentController)).toBe('approvals');
    expect(MODULE_ROLES.approvals).toEqual(expect.arrayContaining(['FINANCE', 'LEGAL']));
    expect(MODULE_ROLES.proposals).not.toContain('FINANCE');
  });

  it('returns the version bound to the workflow, after checking Mall access from the workflow', async () => {
    const h = build({ entityType: 'PROPOSAL', documentVersion: { id: 'dv-1', proposalId: 'prop-1' } });
    await expect(h.controller.getDocument('wf-1', finance)).resolves.toBe(model);
    expect(h.mallAccess.extractAndValidateMallAccess).toHaveBeenCalledWith('u-finance', 'FINANCE', { approvalWorkflowId: 'wf-1' }, { crossMallRead: true });
    expect(h.documents.getVersionDocument).toHaveBeenCalledWith('prop-1', 'dv-1');
  });

  it('serves the PDF of exactly that version', async () => {
    const h = build({ entityType: 'PROPOSAL', documentVersion: { id: 'dv-1', proposalId: 'prop-1' } });
    const res: any = { set: jest.fn(), end: jest.fn() };
    await h.controller.getPdf('wf-1', res, finance);
    expect(h.pdf.render).toHaveBeenCalledWith(model);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'X-Proposal-Document-Version-Id': 'dv-1', 'X-Proposal-Document-Version': '2' }));
  });

  it('a user outside the workflow Mall is refused before anything is read', async () => {
    const h = build({ entityType: 'PROPOSAL', documentVersion: { id: 'dv-1', proposalId: 'prop-1' } }, true);
    await expect(h.controller.getDocument('wf-1', finance)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.prisma.approvalWorkflow.findUnique).not.toHaveBeenCalled();
    expect(h.documents.getVersionDocument).not.toHaveBeenCalled();
  });

  it('a workflow without a proposal document version is not found', async () => {
    await expect(build({ entityType: 'FITOUT_SUBMITTAL', documentVersion: null }).controller.getDocument('wf-1', finance)).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ entityType: 'PROPOSAL', documentVersion: null }).controller.getDocument('wf-1', finance)).rejects.toBeInstanceOf(NotFoundException);
  });
});
