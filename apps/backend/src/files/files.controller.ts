import { Controller, Get, Param, NotFoundException, ForbiddenException, StreamableFile, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Scope } from '../common/decorators/scope.decorator';
import { ScopeType, EnforcementStatus } from '../common/constants/scope.types';
import { MallAccessService } from '../common/services/mall-access.service';
import { MODULE_ROLES } from '../common/constants/role-permissions';

// CR-101 Phase 1: descriptive only. Confirmed SAFE for unauthenticated/
// cross-tenant access (see docs/architecture-review/02-FILE-SECURITY-ARCHITECTURE.md)
// -- every route does its own per-request tenant/role ownership check.
//
// CR-101 Phase 3C (C1+C2, docs/changes/CR-101-PHASE-3C-C1-C2-COMPLETION.md):
// Contract/Invoice/Ticket/Fitout* routes below now ALSO call MallAccessService,
// using the SAME already-registered resolvers (`contract`, `invoice`, `ticket`,
// `fitoutSubmittal`, `fitoutIssue`, `fitoutDailyReportEntry`, `fitoutProject`)
// every other CR-101-remediated route in the codebase uses -- no new resolver
// logic was written for these families, only new call sites.
//
// CR-101 Phase 3C (C3, docs/changes/CR-101-PHASE-3C-C3-COMPLETION.md):
// Parking/ServiceContract/WorkOrder/Patrol/Maintenance now ALSO Mall-checked,
// using 4 new resolvers (`workOrder`, `parkingCustomerContract`,
// `serviceContract`, `patrolCheck`) added to MallAccessService this batch --
// all direct-field lookups, no schema change. `fitout.controller.ts`'s
// `reviewDocument` docId-substitution bug and `fitout-issue.controller.ts`'s
// incidental-only protection remain open (C4, not authorized).

/**
 * Authenticated, authorized document downloads (docs/security/SECRET_INCIDENT_REMEDIATION.md
 * P1: Contract/Billing/Fitout/service documents were reachable unauthenticated
 * via the blanket `/uploads` static mount — see main.ts, which now restricts
 * that mount to genuinely public assets only). Every route here requires the
 * globally-registered JwtAuthGuard (APP_GUARD in app.module.ts) to have
 * already populated `user`, then does its own role + ownership check before
 * streaming — there is no `@Roles()` shortcut here because each route needs a
 * different allowed-role set, and several need a per-record tenant-ownership
 * check that a role list alone can't express.
 *
 * No MallAccessGuard integration yet (would need per-route mall resolution) —
 * out of scope for this pass; the fix that matters is "no longer reachable
 * without being logged in and authorized for the specific record."
 */

// These modules have no shared `MODULE_ROLES` export (they declare local
// VIEW/EDIT-style constants in their own controllers) — mirrored here rather
// than imported, to avoid reaching into another module's private constants.
// Keep in sync with role-permissions.ts / the frontend's lib/permissions.ts.
const PATROL_ROLES = [Role.ADMIN, Role.CEO, Role.MALL_DIRECTOR, Role.OPERATION];
const WORK_ORDER_ROLES = [Role.ADMIN, Role.CEO, Role.MALL_DIRECTOR, Role.OPERATION, Role.LEASING_MANAGER];
const SERVICE_CONTRACT_ROLES = [Role.ADMIN, Role.CEO, Role.LEASING_MANAGER, Role.MALL_DIRECTOR, Role.FINANCE, Role.LEGAL, Role.OPERATION];
const PARKING_ROLES = [Role.ADMIN, Role.CEO, Role.MALL_DIRECTOR, Role.FINANCE, Role.OPERATION];
const MAINTENANCE_ROLES = [Role.ADMIN, Role.MALL_DIRECTOR, Role.LEASING_MANAGER, Role.OPERATION];
const FITOUT_STAFF_ROLES = [Role.ADMIN, Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR];

function requireRole(user: { role: Role }, allowed: Role[]) {
  if (user.role !== Role.ADMIN && !allowed.includes(user.role)) {
    throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này');
  }
}

@ApiTags('Files')
@ApiBearerAuth('JWT-auth')
@Controller('files')
export class FilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mallAccess: MallAccessService,
  ) {}

  private stream(res: Response, fileName: string, mimeType: string | null, relativeFilePath: string): StreamableFile {
    const storageRelativePath = relativeFilePath.replace(/^\/?uploads\//, '');
    const fileStream = this.storage.getFileStream(storageRelativePath);
    if (!fileStream) throw new NotFoundException('Tài liệu không tồn tại trên máy chủ');
    res.set({
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });
    return new StreamableFile(fileStream);
  }

  private async assertCurrentFitoutApproverFileAccess(
    submittalId: string,
    user: { id: string; role: Role },
  ) {
    requireRole(user, MODULE_ROLES.approvals);
    const submittal = await this.prisma.fitoutSubmittal.findUnique({
      where: { id: submittalId },
      select: {
        id: true,
        workflowId: true,
        project: {
          select: { unit: { select: { mallId: true, floor: { select: { mallId: true } } } } },
        },
        workflow: {
          select: {
            id: true, entityType: true, entityId: true, status: true,
            steps: {
              select: { stepOrder: true, status: true, approverRole: true, approverId: true },
              orderBy: { stepOrder: 'asc' },
            },
          },
        },
      },
    });
    const workflow = submittal?.workflow;
    if (!submittal || !workflow || submittal.workflowId !== workflow.id
      || workflow.entityType !== 'FITOUT_SUBMITTAL' || workflow.entityId !== submittal.id
      || workflow.status !== 'IN_PROGRESS') {
      throw new ForbiddenException('Fitout approval document capability is unresolved');
    }
    const currentStep = workflow.steps.find((step, index, ordered) => step.status === 'PENDING'
      && ordered.slice(0, index).every((earlier) => earlier.status === 'APPROVED'));
    if (!currentStep || currentStep.approverRole !== user.role
      || (currentStep.approverId && currentStep.approverId !== user.id)) {
      throw new ForbiddenException('You are not the current actionable Fitout approver');
    }
    const mallId = submittal.project.unit.mallId ?? submittal.project.unit.floor?.mallId;
    if (!mallId) throw new ForbiddenException('Fitout approval Mall is unresolved');
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
  }

  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'fileId', resolver: 'contract' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C2)' })
  @Get('contracts/:fileId')
  async downloadContractFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.prisma.contractFile.findUnique({
      where: { id: fileId },
      include: { contract: { select: { tenantId: true } } },
    });
    if (!file) throw new NotFoundException('Tài liệu không tồn tại');
    if (user.role === Role.TENANT && file.contract.tenantId !== user.tenantId) {
      throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này');
    }
    // File-first: Mall is resolved from the file's OWN contractId (already
    // fetched above), never from a client-supplied parameter.
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { contractId: file.contractId });
    return this.stream(res, file.fileName, file.fileType, file.filePath);
  }

  @Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C2) -- polymorphic UnifiedDocument, resolver chosen per doc.entityType inside the handler body: invoice | ticket | fitoutSubmittal | fitoutIssue | fitoutDailyReportEntry (all pre-registered), see mall-resolver-registry.ts' })
  @Get('documents/:fileId')
  async downloadUnifiedDocument(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.prisma.unifiedDocument.findUnique({ where: { id: fileId } });
    if (!doc || !doc.isActive) throw new NotFoundException('Tài liệu không tồn tại');

    // UnifiedDocument is polymorphic (entityType + entityId) -- Mall resolution
    // is branch-aware: each entityType maps to its own already-registered
    // MallAccessService resolver, keyed off doc.entityId (the file's OWN
    // pointer to its owner, never a client-supplied parameter). An
    // entityType this switch doesn't recognize falls through to the `default`
    // branch below and is denied (fail-safe), not silently allowed.
    switch (doc.entityType) {
      case 'INVOICE': {
        const invoice = await this.prisma.invoice.findUnique({ where: { id: doc.entityId }, select: { tenantId: true } });
        if (!invoice) throw new NotFoundException('Hóa đơn không tồn tại');
        if (user.role === Role.TENANT) {
          if (invoice.tenantId !== user.tenantId) {
            throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này');
          }
        } else {
          // Phase 4 (docs/program/04-BILLING-FINANCE-COMPLETION.md): this branch previously
          // let *any* authenticated non-tenant role download invoice documents — no role
          // check at all, unlike the FITOUT_SUBMITTAL case a few lines below. Invoice
          // documents are financial records; restrict to the same roles that can read
          // billing data anywhere else in the platform (role-permissions.ts `billing`,
          // minus TENANT — handled above).
          requireRole(user, [Role.ADMIN, Role.FINANCE, Role.MALL_DIRECTOR]);
        }
        await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { invoiceId: doc.entityId });
        break;
      }
      case 'TICKET': {
        const ticket = await this.prisma.ticket.findUnique({ where: { id: doc.entityId }, select: { tenantId: true } });
        if (!ticket) throw new NotFoundException('Ticket không tồn tại');
        if (user.role === Role.TENANT && ticket.tenantId !== user.tenantId) {
          throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này');
        }
        await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { ticketId: doc.entityId });
        break;
      }
      case 'FITOUT_SUBMITTAL':
        // TENANT has no access to submittal/issue/daily-report controllers at all
        // Staff remain Mall-scoped. Tenant access is deliberately narrower:
        // only attachments linked to a submittal in their own Fitout project.
        if (user.role === Role.TENANT) {
          const submittal = await this.prisma.fitoutSubmittal.findUnique({
            where: { id: doc.entityId },
            select: { project: { select: { tenantId: true } } },
          });
          if (!submittal || !user.tenantId || submittal.project.tenantId !== user.tenantId) {
            throw new ForbiddenException('Tenant cannot access this fitout document');
          }
        } else {
          if (FITOUT_STAFF_ROLES.includes(user.role)) {
            await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutSubmittalId: doc.entityId });
          } else {
            await this.assertCurrentFitoutApproverFileAccess(doc.entityId, user);
          }
        }
        break;
      case 'FITOUT_ISSUE':
        requireRole(user, [Role.ADMIN, Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR]);
        await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutIssueId: doc.entityId });
        break;
      case 'FITOUT_DAILY_REPORT':
        requireRole(user, [Role.ADMIN, Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR]);
        await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutDailyReportEntryId: doc.entityId });
        break;
      default:
        throw new NotFoundException('Loại tài liệu không được hỗ trợ');
    }

    await this.prisma.unifiedDocument.update({ where: { id: fileId }, data: { downloadCount: { increment: 1 } } });
    return this.stream(res, doc.fileName, doc.mimeType, doc.filePath);
  }

  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'fileId', resolver: 'fitoutProject' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C2)' })
  @Get('fitout-documents/:fileId')
  async downloadFitoutDocument(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.prisma.fitoutDocument.findUnique({
      where: { id: fileId },
      include: { project: { select: { tenantId: true } } },
    });
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    if (user.role === Role.TENANT && doc.project.tenantId !== user.tenantId) {
      throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này');
    } else if (user.role !== Role.TENANT) {
      requireRole(user, [Role.ADMIN, Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR]);
    }
    // File-first: Mall is resolved from the file's OWN projectId (already
    // fetched above), never from a client-supplied parameter.
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { fitoutProjectId: doc.projectId });
    return this.stream(res, doc.fileName, null, doc.filePath);
  }

  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'fileId', resolver: 'parkingCustomerContract' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C3)' })
  @Get('parking-contract-documents/:fileId')
  async downloadParkingContractDocument(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, PARKING_ROLES);
    const doc = await this.prisma.parkingContractDocument.findUnique({ where: { id: fileId } });
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    // File-first: Mall is resolved from the file's OWN contractId, never a
    // client-supplied parameter.
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { parkingCustomerContractId: doc.contractId });
    return this.stream(res, doc.fileName, doc.mimeType, doc.filePath);
  }

  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'fileId', resolver: 'serviceContract' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C3)' })
  @Get('service-contract-documents/:fileId')
  async downloadServiceContractDocument(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, SERVICE_CONTRACT_ROLES);
    const doc = await this.prisma.serviceContractDocument.findUnique({ where: { id: fileId } });
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { serviceContractId: doc.contractId });
    return this.stream(res, doc.fileName, doc.mimeType, doc.filePath);
  }

  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'fileId', resolver: 'workOrder' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C3)' })
  @Get('work-order-evidence/:fileId')
  async downloadWorkOrderEvidence(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, WORK_ORDER_ROLES);
    const doc = await this.prisma.workOrderEvidence.findUnique({ where: { id: fileId } });
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { workOrderId: doc.workOrderId });
    return this.stream(res, doc.fileName, doc.mimeType, doc.filePath);
  }

  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'fileId', resolver: 'patrolCheck' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C3) -- closes the confirmed gap: the pre-existing PatrolService.checkMallId() helper was never called from this route; folded into MallAccessService as the `patrolCheck` resolver instead of importing PatrolService here, keeping one canonical resolution mechanism' })
  @Get('patrol-checks/:fileId')
  async downloadPatrolCheckFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, PATROL_ROLES);
    const check = await this.prisma.patrolCheck.findUnique({ where: { id: fileId } });
    if (!check || !check.filePath) throw new NotFoundException('Tài liệu không tồn tại');
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { patrolCheckId: fileId });
    return this.stream(res, check.fileName ?? 'evidence', check.mimeType ?? null, check.filePath);
  }

  @Scope({ type: ScopeType.MALL_SCOPED, resolution: { via: 'entity', from: 'param', key: 'executionId', resolver: 'maintenanceSchedule' }, status: EnforcementStatus.ENFORCED, trackedAs: 'CR-101 Phase 3C (C3)' })
  @Get('maintenance-evidence/:executionId/:fileName')
  async downloadMaintenanceEvidence(
    @Param('executionId') executionId: string,
    @Param('fileName') fileName: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, MAINTENANCE_ROLES);
    const execution = await this.prisma.maintenanceExecution.findUnique({ where: { id: executionId } });
    if (!execution) throw new NotFoundException('Không tìm thấy bản ghi bảo trì');
    const relativePath = `maintenance/${executionId}/${fileName}`;
    const matches = execution.evidenceUrls.some((url) => url.endsWith(relativePath));
    if (!matches) throw new NotFoundException('Tài liệu không thuộc bản ghi bảo trì này');
    // File-first: Mall is resolved from the execution's OWN scheduleId, never a
    // client-supplied parameter.
    await this.mallAccess.extractAndValidateMallAccess(user.id, user.role, { maintenanceScheduleId: execution.scheduleId });
    return this.stream(res, fileName, null, relativePath);
  }
}
