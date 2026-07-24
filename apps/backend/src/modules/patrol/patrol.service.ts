import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class PatrolService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}
  async routeMallId(id: string) {
    const x = await this.prisma.patrolRoute.findUnique({
      where: { id },
      select: { mallId: true },
    });
    if (!x) throw new NotFoundException("Không tìm thấy tuyến tuần tra");
    return x.mallId;
  }
  async shiftMallId(id: string) {
    const x = await this.prisma.patrolShift.findUnique({
      where: { id },
      select: { mallId: true },
    });
    if (!x) throw new NotFoundException("Không tìm thấy ca tuần tra");
    return x.mallId;
  }
  async checkMallId(id: string) {
    const x = await this.prisma.patrolCheck.findUnique({
      where: { id },
      select: { shift: { select: { mallId: true } } },
    });
    if (!x) throw new NotFoundException("Không tìm thấy điểm kiểm tra");
    return x.shift.mallId;
  }
  routes(mallIds?: string[], q?: any) {
    return this.prisma.patrolRoute.findMany({
      where: {
        ...(q?.mallId
          ? { mallId: q.mallId }
          : mallIds
            ? { mallId: { in: mallIds } }
            : {}),
        isActive: true,
      },
      include: {
        mall: { select: { id: true, name: true } },
        points: { orderBy: { order: "asc" } },
        _count: { select: { shifts: true } },
      },
      orderBy: { name: "asc" },
    });
  }
  async createRoute(body: any) {
    if (!body.mallId || !body.code?.trim() || !body.name?.trim())
      throw new BadRequestException("Mall, mã và tên tuyến là bắt buộc");
    return this.prisma.patrolRoute.create({
      data: {
        mallId: body.mallId,
        code: body.code.trim().toUpperCase(),
        name: body.name.trim(),
        description: body.description,
        points: body.points?.length
          ? {
              create: body.points.map((p: any, order: number) => ({
                code: p.code?.trim().toUpperCase() || `P${order + 1}`,
                name: p.name,
                location: p.location,
                instructions: p.instructions,
                order,
              })),
            }
          : undefined,
      },
      include: { points: true },
    });
  }
  async addPoint(routeId: string, body: any) {
    if (!body.name?.trim())
      throw new BadRequestException("Tên điểm kiểm tra là bắt buộc");
    const count = await this.prisma.patrolPoint.count({ where: { routeId } });
    return this.prisma.patrolPoint.create({
      data: {
        routeId,
        code: body.code?.trim().toUpperCase() || `P${count + 1}`,
        name: body.name.trim(),
        location: body.location,
        instructions: body.instructions,
        order: count,
      },
    });
  }
  shifts(mallIds?: string[], q?: any) {
    return this.prisma.patrolShift.findMany({
      where: {
        ...(q?.mallId
          ? { mallId: q.mallId }
          : mallIds
            ? { mallId: { in: mallIds } }
            : {}),
        ...(q?.status ? { status: q.status } : {}),
      },
      include: {
        mall: { select: { name: true } },
        route: { select: { name: true } },
        assignee: { select: { id: true, fullName: true } },
        _count: { select: { checks: true } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 200,
    });
  }
  async shift(id: string) {
    const x = await this.prisma.patrolShift.findUnique({
      where: { id },
      include: {
        mall: true,
        route: true,
        assignee: { select: { id: true, fullName: true } },
        checks: {
          include: { point: true, performedBy: { select: { fullName: true } } },
          orderBy: { point: { order: "asc" } },
        },
      },
    });
    if (!x) throw new NotFoundException("Không tìm thấy ca tuần tra");
    return x;
  }
  async createShift(body: any, userId: string) {
    if (!body.mallId || !body.routeId || !body.scheduledAt)
      throw new BadRequestException("Mall, tuyến và thời gian là bắt buộc");
    const route = await this.prisma.patrolRoute.findFirst({
      where: { id: body.routeId, mallId: body.mallId, isActive: true },
      include: { points: true },
    });
    if (!route) throw new BadRequestException("Tuyến không thuộc Mall đã chọn");
    const shiftNumber = `PT-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const row = await this.prisma.patrolShift.create({
      data: {
        shiftNumber,
        mallId: body.mallId,
        routeId: route.id,
        assigneeId: body.assigneeId || undefined,
        createdById: userId,
        scheduledAt: new Date(body.scheduledAt),
        notes: body.notes,
        checks: { create: route.points.map((p) => ({ pointId: p.id })) },
      },
    });
    if (row.assigneeId)
      await this.notifications.create({
        userId: row.assigneeId,
        title: "Ca tuần tra mới",
        body: `${shiftNumber} · ${route.name}`,
        type: "WORK_ORDER",
        entityType: "PATROL_SHIFT",
        entityId: row.id,
      });
    return row;
  }
  async start(id: string, userId: string) {
    const row = await this.shift(id);
    if (!["SCHEDULED", "OVERDUE"].includes(row.status))
      throw new BadRequestException("Ca tuần tra không thể bắt đầu");
    return this.prisma.patrolShift.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
        assigneeId: row.assigneeId || userId,
      },
    });
  }
  async complete(id: string, notes?: string) {
    const row = await this.shift(id);
    if (row.status !== "IN_PROGRESS")
      throw new BadRequestException("Ca tuần tra chưa được bắt đầu");
    const missing = row.checks.filter(
      (x) => x.point.isRequired && x.result === "PENDING",
    );
    if (missing.length)
      throw new BadRequestException(
        `Còn ${missing.length} điểm bắt buộc chưa kiểm tra`,
      );
    return this.prisma.patrolShift.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        notes: notes || row.notes,
      },
    });
  }
  async check(id: string, body: any, userId: string) {
    if (!["NORMAL", "ABNORMAL", "SKIPPED"].includes(body.result))
      throw new BadRequestException("Kết quả kiểm tra không hợp lệ");
    const current = await this.prisma.patrolCheck.findUnique({
      where: { id },
      include: { shift: true, point: true },
    });
    if (!current) throw new NotFoundException("Không tìm thấy điểm kiểm tra");
    if (current.shift.status !== "IN_PROGRESS")
      throw new BadRequestException(
        "Ca tuần tra chưa bắt đầu hoặc đã kết thúc",
      );
    let workOrderId = current.workOrderId;
    if (body.result === "ABNORMAL" && !workOrderId) {
      const wo = await this.prisma.workOrder.create({
        data: {
          workOrderNumber: `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`,
          mallId: current.shift.mallId,
          category: "SECURITY",
          title: `Bất thường tuần tra: ${current.point.name}`,
          description: body.note || current.point.instructions,
          priority: body.priority || "HIGH",
          location: current.point.location,
          assignedDepartment: "An ninh",
          requesterId: userId,
          sourceEntityType: "PATROL_CHECK",
          sourceEntityId: current.id,
          dueDate: new Date(Date.now() + 4 * 3600000),
          events: {
            create: {
              eventType: "CREATED",
              description: "Tự động tạo từ bất thường tuần tra",
              userId,
            },
          },
        },
      });
      workOrderId = wo.id;
    }
    return this.prisma.patrolCheck.update({
      where: { id },
      data: {
        result: body.result,
        note: body.note,
        checkedAt: new Date(),
        performedById: userId,
        workOrderId,
      },
    });
  }
  async upload(id: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("Vui lòng chọn file minh chứng");
    const saved = await this.storage.saveFile(file, `patrol/${id}`);
    return this.prisma.patrolCheck.update({
      where: { id },
      data: {
        fileName: saved.fileName,
        filePath: saved.filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  }
  async summary(mallIds?: string[], mallId?: string) {
    const where: Prisma.PatrolShiftWhereInput = mallId
      ? { mallId }
      : mallIds
        ? { mallId: { in: mallIds } }
        : {};
    const [total, completed, active, abnormal] = await Promise.all([
      this.prisma.patrolShift.count({ where }),
      this.prisma.patrolShift.count({
        where: { ...where, status: "COMPLETED" },
      }),
      this.prisma.patrolShift.count({
        where: { ...where, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      }),
      this.prisma.patrolCheck.count({
        where: { shift: where, result: "ABNORMAL" },
      }),
    ]);
    return {
      total,
      completed,
      active,
      abnormal,
      completionRate: total ? Math.round((completed * 100) / total) : 0,
    };
  }

  @Cron("*/15 * * * *", {
    name: "patrol-overdue-monitor",
    timeZone: "Asia/Ho_Chi_Minh",
  })
  async markOverdueShifts() {
    const rows = await this.prisma.patrolShift.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lt: new Date() } },
    });
    for (const row of rows) {
      await this.prisma.patrolShift.update({
        where: { id: row.id },
        data: { status: "OVERDUE" },
      });
      if (row.assigneeId)
        await this.notifications.create({
          userId: row.assigneeId,
          title: "Ca tuần tra đã quá giờ",
          body: row.shiftNumber,
          type: "WORK_ORDER",
          entityType: "PATROL_SHIFT_OVERDUE",
          entityId: row.id,
        });
    }
    return { updated: rows.length };
  }
}
