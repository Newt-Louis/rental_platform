import { Controller, Get, Param, NotFoundException, ForbiddenException, StreamableFile, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

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
    return this.stream(res, file.fileName, file.fileType, file.filePath);
  }

  @Get('documents/:fileId')
  async downloadUnifiedDocument(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.prisma.unifiedDocument.findUnique({ where: { id: fileId } });
    if (!doc || !doc.isActive) throw new NotFoundException('Tài liệu không tồn tại');

    switch (doc.entityType) {
      case 'INVOICE': {
        const invoice = await this.prisma.invoice.findUnique({ where: { id: doc.entityId }, select: { tenantId: true } });
        if (!invoice) throw new NotFoundException('Hóa đơn không tồn tại');
        if (user.role === Role.TENANT && invoice.tenantId !== user.tenantId) {
          throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này');
        }
        break;
      }
      case 'TICKET': {
        const ticket = await this.prisma.ticket.findUnique({ where: { id: doc.entityId }, select: { tenantId: true } });
        if (!ticket) throw new NotFoundException('Ticket không tồn tại');
        if (user.role === Role.TENANT && ticket.tenantId !== user.tenantId) {
          throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này');
        }
        break;
      }
      case 'FITOUT_SUBMITTAL':
      case 'FITOUT_ISSUE':
      case 'FITOUT_DAILY_REPORT':
        // TENANT has no access to submittal/issue/daily-report controllers at all
        // (backend MODULE_ROLES.fitout excludes TENANT there) — role check below
        // is the full authorization surface for these three.
        requireRole(user, [Role.ADMIN, Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR]);
        break;
      default:
        throw new NotFoundException('Loại tài liệu không được hỗ trợ');
    }

    await this.prisma.unifiedDocument.update({ where: { id: fileId }, data: { downloadCount: { increment: 1 } } });
    return this.stream(res, doc.fileName, doc.mimeType, doc.filePath);
  }

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
    return this.stream(res, doc.fileName, null, doc.filePath);
  }

  @Get('parking-contract-documents/:fileId')
  async downloadParkingContractDocument(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, PARKING_ROLES);
    const doc = await this.prisma.parkingContractDocument.findUnique({ where: { id: fileId } });
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    return this.stream(res, doc.fileName, doc.mimeType, doc.filePath);
  }

  @Get('service-contract-documents/:fileId')
  async downloadServiceContractDocument(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, SERVICE_CONTRACT_ROLES);
    const doc = await this.prisma.serviceContractDocument.findUnique({ where: { id: fileId } });
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    return this.stream(res, doc.fileName, doc.mimeType, doc.filePath);
  }

  @Get('work-order-evidence/:fileId')
  async downloadWorkOrderEvidence(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, WORK_ORDER_ROLES);
    const doc = await this.prisma.workOrderEvidence.findUnique({ where: { id: fileId } });
    if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
    return this.stream(res, doc.fileName, doc.mimeType, doc.filePath);
  }

  @Get('patrol-checks/:fileId')
  async downloadPatrolCheckFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    requireRole(user, PATROL_ROLES);
    const check = await this.prisma.patrolCheck.findUnique({ where: { id: fileId } });
    if (!check || !check.filePath) throw new NotFoundException('Tài liệu không tồn tại');
    return this.stream(res, check.fileName ?? 'evidence', check.mimeType ?? null, check.filePath);
  }

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
    return this.stream(res, fileName, null, relativePath);
  }
}
