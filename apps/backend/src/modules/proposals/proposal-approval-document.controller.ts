import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleRoles } from '../../common/decorators/module-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MallAccessService } from '../../common/services/mall-access.service';
import { Scope } from '../../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../../common/constants/scope.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalDocumentService } from './document/proposal-document.service';
import { ProposalPdfService } from './proposal-pdf.service';

/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — the Tờ trình an approver is deciding on,
 * reached through the approval workflow rather than the Proposal module.
 *
 * Finance and Legal approve Proposals but are not members of the `proposals`
 * module, so `/proposals/:id/...` refused them and the approval screen could not
 * open the document they were asked to sign. Access here follows the workflow:
 * the `approvals` module plus Mall access resolved from the workflow, the same
 * rule that already lets them read the workflow itself.
 */
@ApiTags('Approvals')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@ModuleRoles('approvals')
@Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'workflowId', resolver: 'approvalStepOrWorkflow' }, status: EnforcementStatus.ENFORCED })
@Controller('approvals/workflows')
export class ProposalApprovalDocumentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: ProposalDocumentService,
    private readonly pdf: ProposalPdfService,
    private readonly mallAccess: MallAccessService,
  ) {}

  private async boundVersion(workflowId: string, user: any) {
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { approvalWorkflowId: workflowId }, { crossMallRead: true });
    const workflow = await this.prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
      select: { entityType: true, documentVersion: { select: { id: true, proposalId: true } } },
    });
    if (!workflow || workflow.entityType !== 'PROPOSAL' || !workflow.documentVersion) {
      throw new NotFoundException('This approval workflow has no proposal document version');
    }
    return workflow.documentVersion;
  }

  @Get(':workflowId/document')
  @ApiOperation({ summary: 'The document version bound to this approval workflow' })
  async getDocument(@Param('workflowId') workflowId: string, @CurrentUser() user: any) {
    const version = await this.boundVersion(workflowId, user);
    return this.documents.getVersionDocument(version.proposalId, version.id);
  }

  @Get(':workflowId/document/pdf')
  @ApiOperation({ summary: 'Official PDF of the document version bound to this approval workflow' })
  async getPdf(@Param('workflowId') workflowId: string, @Res() res: Response, @CurrentUser() user: any) {
    const version = await this.boundVersion(workflowId, user);
    const document = await this.documents.getVersionDocument(version.proposalId, version.id);
    const buffer = await this.pdf.render(document);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="proposal-${document.proposalNumber}-v${document.version!.versionNumber}.pdf"`,
      'Content-Length': buffer.length,
      'X-Proposal-Document-Version-Id': document.version!.id,
      'X-Proposal-Document-Version': String(document.version!.versionNumber),
      'X-Proposal-Live-Differs': String(document.version!.liveDiffers),
    });
    res.end(buffer);
  }
}
