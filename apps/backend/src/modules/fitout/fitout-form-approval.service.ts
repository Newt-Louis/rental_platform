import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Cấu hình "ai duyệt hồ sơ fitout" — khai báo riêng cho từng mall trên màn hình fitout/settings.
 *
 * Trước đây FitoutFormType chỉ có `approvalLevels` (số cấp) và `approverRoles` (Json), nhưng
 * approverRoles không có đường ghi nào từ API/UI nên luôn null: mọi cấp duyệt của mọi loại hồ sơ
 * đều rơi về fallback OPERATION và thông báo được broadcast cho toàn bộ OPERATION của mall cộng
 * toàn bộ ADMIN hệ thống. Ở đây mỗi cấp gắn đúng một tài khoản cụ thể, để người cấu hình nhìn
 * thấy chính xác hồ sơ sẽ đi qua tay ai.
 */
@Injectable()
export class FitoutFormApprovalService {
  /** Các role được phép đứng tên duyệt hồ sơ fitout — khớp MODULE_ROLES.fitout. */
  static readonly ELIGIBLE_ROLES: Role[] = [Role.ADMIN, Role.OPERATION, Role.LEASING_MANAGER, Role.MALL_DIRECTOR];

  constructor(private prisma: PrismaService) {}

  /** Cấp duyệt đã cấu hình cho (loại hồ sơ, mall), theo đúng thứ tự duyệt. */
  async listLevels(formTypeCode: string, mallId: string) {
    const formType = await this.requireFormType(formTypeCode);
    return this.prisma.fitoutFormApprovalLevel.findMany({
      where: { formTypeId: formType.id, mallId },
      orderBy: { level: 'asc' },
      include: {
        approver: { select: { id: true, fullName: true, email: true, role: true, isActive: true } },
      },
    });
  }

  /**
   * Tổng quan cho bảng danh sách loại hồ sơ: mỗi loại đã cấu hình mấy cấp cho mall đang chọn.
   * Trả về Map dạng object để UI cảnh báo những loại chưa cấu hình (chưa gửi duyệt được).
   */
  async countByFormType(mallId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.fitoutFormApprovalLevel.groupBy({
      by: ['formTypeId'],
      where: { mallId },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.formTypeId, r._count._all]));
  }

  /**
   * Thay thế toàn bộ cấp duyệt của (loại hồ sơ, mall) bằng danh sách mới — replace-all thay vì
   * patch từng dòng, vì thứ tự cấp là một chuỗi liên tục 1..n: sửa lẻ dễ để lại lỗ hổng cấp.
   * Hồ sơ đang chờ duyệt không bị ảnh hưởng — ApprovalStep đã được sinh ra tại thời điểm gửi duyệt.
   */
  async replaceLevels(
    formTypeCode: string,
    mallId: string,
    levels: Array<{ stepName?: string; approverId: string }>,
  ) {
    const formType = await this.requireFormType(formTypeCode);
    await this.requireMall(mallId);

    if (levels.length === 0) {
      await this.prisma.fitoutFormApprovalLevel.deleteMany({ where: { formTypeId: formType.id, mallId } });
      return [];
    }

    const duplicateApprover = levels.map((l) => l.approverId).find((id, i, arr) => arr.indexOf(id) !== i);
    if (duplicateApprover) {
      throw new BadRequestException('Một tài khoản không thể đứng tên ở hai cấp duyệt của cùng một loại hồ sơ');
    }

    // Validate trước, ghi sau: mỗi approver phải còn hoạt động, có role duyệt được fitout và có
    // quyền truy cập mall này — nếu không, hồ sơ sẽ tạo ra ApprovalStep mà không ai bấm duyệt nổi.
    const approvers = await this.resolveApprovers(levels.map((l) => l.approverId), mallId);

    const data = levels.map((level, idx) => ({
      formTypeId: formType.id,
      mallId,
      level: idx + 1,
      stepName: level.stepName?.trim() || `${formType.name} — Cấp ${idx + 1}`,
      approverRole: approvers.get(level.approverId)!.role,
      approverId: level.approverId,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.fitoutFormApprovalLevel.deleteMany({ where: { formTypeId: formType.id, mallId } });
      await tx.fitoutFormApprovalLevel.createMany({ data });
    });

    return this.listLevels(formTypeCode, mallId);
  }

  /**
   * Danh sách tài khoản có thể chọn làm người duyệt tại một mall — nguồn cho dropdown ở
   * fitout/settings. Chỉ user còn hoạt động, có role duyệt được fitout, và (trừ ADMIN) có
   * quyền truy cập mall đang cấu hình.
   */
  async listEligibleApprovers(mallId: string) {
    await this.requireMall(mallId);
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: FitoutFormApprovalService.ELIGIBLE_ROLES },
        OR: [{ role: Role.ADMIN }, { mallAccess: { some: { mallId, isActive: true } } }],
      },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  /**
   * Dùng khi gửi duyệt: dựng các bước duyệt cho ApprovalWorkflow từ cấu hình của mall chứa dự án.
   * Ném lỗi rõ ràng nếu mall chưa cấu hình — thà chặn tại chỗ còn hơn âm thầm đẩy hồ sơ về
   * fallback OPERATION như hành vi cũ.
   */
  async buildApprovalSteps(formTypeId: string, mallId: string, formTypeName: string) {
    const levels = await this.prisma.fitoutFormApprovalLevel.findMany({
      where: { formTypeId, mallId },
      orderBy: { level: 'asc' },
      include: { approver: { select: { id: true, role: true, isActive: true } } },
    });
    if (levels.length === 0) {
      throw new BadRequestException(
        `Loại hồ sơ "${formTypeName}" chưa được cấu hình cấp duyệt cho mall này. Vào Fitout → Cài đặt → Loại hồ sơ để chỉ định người duyệt trước khi gửi.`,
      );
    }
    const inactive = levels.filter((l) => !l.approver.isActive);
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Người duyệt cấp ${inactive.map((l) => l.level).join(', ')} của loại hồ sơ "${formTypeName}" đã bị khoá. Cập nhật cấu hình cấp duyệt trước khi gửi.`,
      );
    }
    return levels.map((l) => ({
      stepName: l.stepName,
      stepOrder: l.level,
      approverRole: l.approverRole,
      approverId: l.approverId,
    }));
  }

  private async requireFormType(code: string) {
    const formType = await this.prisma.fitoutFormType.findUnique({ where: { code } });
    if (!formType) throw new NotFoundException(`Form type "${code}" not found`);
    return formType;
  }

  private async requireMall(mallId: string) {
    const mall = await this.prisma.mall.findUnique({ where: { id: mallId }, select: { id: true } });
    if (!mall) throw new NotFoundException('Mall not found');
    return mall;
  }

  private async resolveApprovers(approverIds: string[], mallId: string) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: approverIds } },
      select: {
        id: true,
        fullName: true,
        role: true,
        isActive: true,
        mallAccess: { where: { mallId, isActive: true }, select: { id: true }, take: 1 },
      },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    for (const id of approverIds) {
      const user = byId.get(id);
      if (!user) throw new BadRequestException('Tài khoản người duyệt không tồn tại');
      if (!user.isActive) throw new BadRequestException(`Tài khoản "${user.fullName}" đang bị khoá`);
      if (!FitoutFormApprovalService.ELIGIBLE_ROLES.includes(user.role)) {
        throw new BadRequestException(`Tài khoản "${user.fullName}" (${user.role}) không có quyền duyệt hồ sơ fitout`);
      }
      if (user.role !== Role.ADMIN && user.mallAccess.length === 0) {
        throw new BadRequestException(`Tài khoản "${user.fullName}" không có quyền truy cập mall này`);
      }
    }
    return byId;
  }
}
