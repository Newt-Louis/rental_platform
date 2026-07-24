import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { NotificationsService } from "../notifications/notifications.service";

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const MIN_SECONDS_BETWEEN_CHECKS = 45;
const ON_TIME_GRACE_MINUTES = 15;
const SCHEDULE_GRACE_MINUTES = 15;

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  async pointMallId(id: string) {
    const x = await this.prisma.patrolPoint.findUnique({
      where: { id },
      select: { route: { select: { mallId: true } } },
    });
    if (!x) throw new NotFoundException("Không tìm thấy điểm kiểm tra");
    return x.route.mallId;
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
  async scheduleMallId(id: string) {
    const x = await this.prisma.patrolSchedule.findUnique({
      where: { id },
      select: { mallId: true },
    });
    if (!x) throw new NotFoundException("Không tìm thấy lịch tuần tra");
    return x.mallId;
  }
  routes(mallIds?: string[], q?: any) {
    return this.prisma.patrolRoute.findMany({
      where: {
        ...(q?.mallId
          ? { mallId: q.mallId }
          : mallIds
            ? { mallId: { in: mallIds } }
            : {}),
        ...(q?.includeInactive ? {} : { isActive: true }),
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
                isRequired: p.isRequired ?? true,
                requirePhoto: p.requirePhoto ?? true,
                requireQrScan: p.requireQrScan ?? false,
                latitude: p.latitude,
                longitude: p.longitude,
                geofenceRadius: p.geofenceRadius,
                order,
              })),
            }
          : undefined,
      },
      include: { points: true },
    });
  }
  async updateRoute(id: string, body: any) {
    const data: Prisma.PatrolRouteUpdateInput = {};
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    return this.prisma.patrolRoute.update({ where: { id }, data });
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
        isRequired: body.isRequired ?? true,
        requirePhoto: body.requirePhoto ?? true,
        requireQrScan: body.requireQrScan ?? false,
        latitude: body.latitude,
        longitude: body.longitude,
        geofenceRadius: body.geofenceRadius,
        order: count,
      },
    });
  }
  async updatePoint(id: string, body: any) {
    const data: Prisma.PatrolPointUpdateInput = {};
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.location !== undefined) data.location = body.location;
    if (body.instructions !== undefined) data.instructions = body.instructions;
    if (body.isRequired !== undefined) data.isRequired = !!body.isRequired;
    if (body.requirePhoto !== undefined)
      data.requirePhoto = !!body.requirePhoto;
    if (body.requireQrScan !== undefined)
      data.requireQrScan = !!body.requireQrScan;
    if (body.latitude !== undefined) data.latitude = body.latitude;
    if (body.longitude !== undefined) data.longitude = body.longitude;
    if (body.geofenceRadius !== undefined)
      data.geofenceRadius = body.geofenceRadius;
    return this.prisma.patrolPoint.update({ where: { id }, data });
  }
  async deletePoint(id: string) {
    const usedCount = await this.prisma.patrolCheck.count({
      where: { pointId: id, result: { not: "PENDING" } },
    });
    if (usedCount)
      throw new BadRequestException(
        "Điểm đã có lịch sử kiểm tra, không thể xóa. Hãy bỏ đánh dấu bắt buộc thay vì xóa.",
      );
    await this.prisma.patrolCheck.deleteMany({ where: { pointId: id } });
    return this.prisma.patrolPoint.delete({ where: { id } });
  }
  async reorderPoints(routeId: string, orderedIds: string[]) {
    const points = await this.prisma.patrolPoint.findMany({
      where: { routeId },
      select: { id: true },
    });
    const valid = new Set(points.map((p) => p.id));
    if (
      orderedIds.length !== points.length ||
      !orderedIds.every((id) => valid.has(id))
    )
      throw new BadRequestException("Danh sách điểm không khớp với tuyến");
    await this.prisma.$transaction(
      orderedIds.map((id, order) =>
        this.prisma.patrolPoint.update({ where: { id }, data: { order } }),
      ),
    );
    return { updated: orderedIds.length };
  }
  shifts(mallIds?: string[], q?: any) {
    const scheduledAt: Prisma.DateTimeFilter = {};
    if (q?.from) scheduledAt.gte = new Date(q.from);
    if (q?.to) scheduledAt.lte = new Date(q.to);
    const page = Math.max(1, Number(q?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q?.pageSize) || 50));
    const where: Prisma.PatrolShiftWhereInput = {
      ...(q?.mallId
        ? { mallId: q.mallId }
        : mallIds
          ? { mallId: { in: mallIds } }
          : {}),
      ...(q?.status ? { status: q.status } : {}),
      ...(q?.assigneeId ? { assigneeId: q.assigneeId } : {}),
      ...(q?.routeId ? { routeId: q.routeId } : {}),
      ...(q?.from || q?.to ? { scheduledAt } : {}),
    };
    return Promise.all([
      this.prisma.patrolShift.findMany({
        where,
        include: {
          mall: { select: { name: true } },
          route: { select: { name: true } },
          assignee: { select: { id: true, fullName: true } },
          _count: { select: { checks: true } },
        },
        orderBy: { scheduledAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patrolShift.count({ where }),
    ]).then(([data, total]) => ({ data, total, page, pageSize }));
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
  async cancelShift(id: string, reason: string) {
    const row = await this.shift(id);
    if (["COMPLETED", "CANCELLED"].includes(row.status))
      throw new BadRequestException("Ca tuần tra đã kết thúc, không thể hủy");
    if (!reason?.trim())
      throw new BadRequestException("Vui lòng nhập lý do hủy ca");
    const updated = await this.prisma.patrolShift.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason.trim(),
      },
    });
    if (row.assigneeId)
      await this.notifications.create({
        userId: row.assigneeId,
        title: "Ca tuần tra đã bị hủy",
        body: `${row.shiftNumber}: ${reason.trim()}`,
        type: "WORK_ORDER",
        entityType: "PATROL_SHIFT_CANCELLED",
        entityId: id,
      });
    return updated;
  }
  async reassignShift(id: string, assigneeId?: string) {
    const row = await this.shift(id);
    if (!["SCHEDULED", "OVERDUE"].includes(row.status))
      throw new BadRequestException(
        "Chỉ có thể đổi người phụ trách khi ca chưa bắt đầu",
      );
    const updated = await this.prisma.patrolShift.update({
      where: { id },
      data: { assigneeId: assigneeId || null },
    });
    if (assigneeId)
      await this.notifications.create({
        userId: assigneeId,
        title: "Bạn được phân công ca tuần tra",
        body: row.shiftNumber,
        type: "WORK_ORDER",
        entityType: "PATROL_SHIFT",
        entityId: id,
      });
    return updated;
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
    const missingPhoto = row.checks.filter(
      (x) =>
        x.point.requirePhoto && x.result !== "PENDING" && x.result !== "SKIPPED" && !x.filePath,
    );
    if (missingPhoto.length)
      throw new BadRequestException(
        `Còn ${missingPhoto.length} điểm bắt buộc ảnh minh chứng chưa tải lên: ${missingPhoto
          .map((x) => x.point.name)
          .join(", ")}`,
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
      include: { shift: { include: { checks: true } }, point: true },
    });
    if (!current) throw new NotFoundException("Không tìm thấy điểm kiểm tra");
    if (current.shift.status !== "IN_PROGRESS")
      throw new BadRequestException(
        "Ca tuần tra chưa bắt đầu hoặc đã kết thúc",
      );

    let qrVerified = false;
    if (body.qrToken) {
      qrVerified = String(body.qrToken).trim() === current.point.qrToken;
      if (current.point.requireQrScan && !qrVerified)
        throw new BadRequestException(
          "Mã xác thực điểm kiểm tra không đúng",
        );
    } else if (current.point.requireQrScan) {
      throw new BadRequestException(
        "Điểm này yêu cầu quét/nhập mã xác thực trước khi kiểm tra",
      );
    }

    let distanceMeters: number | null = null;
    let locationVerified: boolean | null = null;
    if (
      typeof body.latitude === "number" &&
      typeof body.longitude === "number" &&
      current.point.latitude != null &&
      current.point.longitude != null
    ) {
      distanceMeters = haversineMeters(
        current.point.latitude,
        current.point.longitude,
        body.latitude,
        body.longitude,
      );
      if (current.point.geofenceRadius != null)
        locationVerified = distanceMeters <= current.point.geofenceRadius;
    }

    const now = new Date();
    const lastChecked = current.shift.checks
      .filter((c) => c.id !== current.id && c.checkedAt)
      .sort(
        (a, b) => (b.checkedAt as Date).getTime() - (a.checkedAt as Date).getTime(),
      )[0];
    const tooFast = !!lastChecked
      ? (now.getTime() - (lastChecked.checkedAt as Date).getTime()) / 1000 <
        MIN_SECONDS_BETWEEN_CHECKS
      : false;

    let severity: string | null = null;
    if (body.result === "ABNORMAL")
      severity = SEVERITIES.includes(body.severity) ? body.severity : "MEDIUM";

    let workOrderId = current.workOrderId;
    if (body.result === "ABNORMAL" && !workOrderId) {
      const wo = await this.prisma.workOrder.create({
        data: {
          workOrderNumber: `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`,
          mallId: current.shift.mallId,
          category: "SECURITY",
          title: `Bất thường tuần tra: ${current.point.name}`,
          description: body.note || current.point.instructions,
          priority: severity || "HIGH",
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
      if (severity === "HIGH" || severity === "URGENT") {
        const directors = await this.prisma.userMallAccess.findMany({
          where: {
            mallId: current.shift.mallId,
            isActive: true,
            user: { role: Role.MALL_DIRECTOR },
          },
          select: { userId: true },
        });
        for (const d of directors)
          await this.notifications.create({
            userId: d.userId,
            title: `Bất thường tuần tra mức độ ${severity}`,
            body: `${current.point.name} · ${current.shift.shiftNumber}`,
            type: "WORK_ORDER",
            entityType: "PATROL_CHECK_ESCALATION",
            entityId: current.id,
          });
      }
    }

    return this.prisma.patrolCheck.update({
      where: { id },
      data: {
        result: body.result,
        note: body.note,
        severity,
        checkedAt: now,
        performedById: userId,
        workOrderId,
        qrVerified,
        latitude: body.latitude ?? undefined,
        longitude: body.longitude ?? undefined,
        distanceMeters: distanceMeters ?? undefined,
        locationVerified: locationVerified ?? undefined,
        tooFast,
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
  async summary(mallIds?: string[], q?: any) {
    const scheduledAt: Prisma.DateTimeFilter = {};
    if (q?.from) scheduledAt.gte = new Date(q.from);
    if (q?.to) scheduledAt.lte = new Date(q.to);
    const where: Prisma.PatrolShiftWhereInput = {
      ...(q?.mallId
        ? { mallId: q.mallId }
        : mallIds
          ? { mallId: { in: mallIds } }
          : {}),
      ...(q?.from || q?.to ? { scheduledAt } : {}),
    };
    const [total, completed, active, cancelled, abnormal, suspicious] =
      await Promise.all([
        this.prisma.patrolShift.count({ where }),
        this.prisma.patrolShift.count({
          where: { ...where, status: "COMPLETED" },
        }),
        this.prisma.patrolShift.count({
          where: { ...where, status: { in: ["SCHEDULED", "IN_PROGRESS", "OVERDUE"] } },
        }),
        this.prisma.patrolShift.count({
          where: { ...where, status: "CANCELLED" },
        }),
        this.prisma.patrolCheck.count({
          where: { shift: where, result: "ABNORMAL" },
        }),
        this.prisma.patrolCheck.count({
          where: {
            shift: where,
            OR: [{ tooFast: true }, { locationVerified: false }],
          },
        }),
      ]);
    return {
      total,
      completed,
      active,
      cancelled,
      abnormal,
      suspicious,
      completionRate: total ? Math.round((completed * 100) / total) : 0,
    };
  }
  async report(mallIds: string[] | undefined, q: any) {
    const from = q?.from
      ? new Date(q.from)
      : new Date(Date.now() - 30 * 86400000);
    const to = q?.to ? new Date(q.to) : new Date();
    const where: Prisma.PatrolShiftWhereInput = {
      ...(q?.mallId
        ? { mallId: q.mallId }
        : mallIds
          ? { mallId: { in: mallIds } }
          : {}),
      scheduledAt: { gte: from, lte: to },
    };
    const shifts = await this.prisma.patrolShift.findMany({
      where,
      include: {
        route: { select: { id: true, name: true } },
        assignee: { select: { id: true, fullName: true } },
        checks: {
          select: { result: true, tooFast: true, locationVerified: true },
        },
      },
    });
    const byRoute = new Map<string, any>();
    const byAssignee = new Map<string, any>();
    const suspicious: any[] = [];
    let onTimeCount = 0;
    let startedCount = 0;
    let completedWithDuration = 0;
    let totalDurationMinutes = 0;
    let abnormalTotal = 0;
    for (const s of shifts) {
      const abnormalCount = s.checks.filter((c) => c.result === "ABNORMAL").length;
      abnormalTotal += abnormalCount;

      const routeAgg = byRoute.get(s.route.id) || {
        routeId: s.route.id,
        name: s.route.name,
        total: 0,
        completed: 0,
        abnormal: 0,
      };
      routeAgg.total++;
      if (s.status === "COMPLETED") routeAgg.completed++;
      routeAgg.abnormal += abnormalCount;
      byRoute.set(s.route.id, routeAgg);

      const assigneeKey = s.assigneeId || "unassigned";
      const assigneeAgg = byAssignee.get(assigneeKey) || {
        assigneeId: s.assigneeId,
        name: s.assignee?.fullName || "Chưa phân công",
        total: 0,
        completed: 0,
        abnormal: 0,
      };
      assigneeAgg.total++;
      if (s.status === "COMPLETED") assigneeAgg.completed++;
      assigneeAgg.abnormal += abnormalCount;
      byAssignee.set(assigneeKey, assigneeAgg);

      if (s.startedAt) {
        startedCount++;
        if (
          s.startedAt.getTime() <=
          s.scheduledAt.getTime() + ON_TIME_GRACE_MINUTES * 60000
        )
          onTimeCount++;
      }
      if (s.completedAt && s.startedAt) {
        totalDurationMinutes +=
          (s.completedAt.getTime() - s.startedAt.getTime()) / 60000;
        completedWithDuration++;
      }
      if (s.checks.some((c) => c.tooFast || c.locationVerified === false))
        suspicious.push({
          shiftId: s.id,
          shiftNumber: s.shiftNumber,
          route: s.route.name,
          assignee: s.assignee?.fullName,
        });
    }
    return {
      range: { from, to },
      totals: {
        shifts: shifts.length,
        completed: shifts.filter((s) => s.status === "COMPLETED").length,
        abnormal: abnormalTotal,
        onTimeRate: startedCount
          ? Math.round((onTimeCount * 100) / startedCount)
          : 0,
        avgDurationMinutes: completedWithDuration
          ? Math.round(totalDurationMinutes / completedWithDuration)
          : 0,
      },
      byRoute: [...byRoute.values()],
      byAssignee: [...byAssignee.values()],
      suspicious,
    };
  }
  schedules(mallIds?: string[], q?: any) {
    return this.prisma.patrolSchedule.findMany({
      where: {
        ...(q?.mallId
          ? { mallId: q.mallId }
          : mallIds
            ? { mallId: { in: mallIds } }
            : {}),
      },
      include: {
        mall: { select: { name: true } },
        route: { select: { id: true, name: true, mallId: true } },
        assignee: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async createSchedule(body: any, userId: string) {
    if (!body.mallId || !body.routeId || !body.name?.trim())
      throw new BadRequestException("Mall, tuyến và tên lịch là bắt buộc");
    if (!Array.isArray(body.timesOfDay) || !body.timesOfDay.length)
      throw new BadRequestException(
        "Cần ít nhất một khung giờ tuần tra (VD: 08:00)",
      );
    const route = await this.prisma.patrolRoute.findFirst({
      where: { id: body.routeId, mallId: body.mallId, isActive: true },
    });
    if (!route) throw new BadRequestException("Tuyến không thuộc Mall đã chọn");
    return this.prisma.patrolSchedule.create({
      data: {
        mallId: body.mallId,
        routeId: body.routeId,
        name: body.name.trim(),
        assigneeId: body.assigneeId || undefined,
        daysOfWeek: Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [],
        timesOfDay: body.timesOfDay,
        generateDaysAhead: body.generateDaysAhead ?? 1,
        createdById: userId,
      },
    });
  }
  async updateSchedule(id: string, body: any) {
    const data: Prisma.PatrolScheduleUpdateInput = {};
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.assigneeId !== undefined)
      data.assignee = body.assigneeId
        ? { connect: { id: body.assigneeId } }
        : { disconnect: true };
    if (Array.isArray(body.daysOfWeek)) data.daysOfWeek = body.daysOfWeek;
    if (Array.isArray(body.timesOfDay) && body.timesOfDay.length)
      data.timesOfDay = body.timesOfDay;
    if (body.generateDaysAhead !== undefined)
      data.generateDaysAhead = body.generateDaysAhead;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    return this.prisma.patrolSchedule.update({ where: { id }, data });
  }
  deleteSchedule(id: string) {
    return this.prisma.patrolSchedule.delete({ where: { id } });
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

  @Cron("*/30 * * * *", {
    name: "patrol-schedule-generator",
    timeZone: "Asia/Ho_Chi_Minh",
  })
  async generateScheduledShifts() {
    const schedules = await this.prisma.patrolSchedule.findMany({
      where: { isActive: true },
      include: { route: { include: { points: true } } },
    });
    const now = new Date();
    let created = 0;
    for (const sch of schedules) {
      if (!sch.route.isActive || !sch.timesOfDay.length) continue;
      for (let offset = 0; offset <= sch.generateDaysAhead; offset++) {
        const day = new Date(now);
        day.setDate(day.getDate() + offset);
        if (sch.daysOfWeek.length && !sch.daysOfWeek.includes(day.getDay()))
          continue;
        for (const time of sch.timesOfDay) {
          const [h, m] = time.split(":").map(Number);
          if (Number.isNaN(h) || Number.isNaN(m)) continue;
          const scheduledAt = new Date(
            day.getFullYear(),
            day.getMonth(),
            day.getDate(),
            h,
            m,
            0,
            0,
          );
          if (
            scheduledAt.getTime() <
            now.getTime() - SCHEDULE_GRACE_MINUTES * 60000
          )
            continue;
          const exists = await this.prisma.patrolShift.findFirst({
            where: { scheduleId: sch.id, scheduledAt },
            select: { id: true },
          });
          if (exists) continue;
          const shiftNumber = `PT-${scheduledAt.getFullYear()}-${Date.now().toString().slice(-8)}${created}`;
          const row = await this.prisma.patrolShift.create({
            data: {
              shiftNumber,
              mallId: sch.mallId,
              routeId: sch.routeId,
              scheduleId: sch.id,
              assigneeId: sch.assigneeId || undefined,
              createdById: sch.createdById,
              scheduledAt,
              checks: { create: sch.route.points.map((p) => ({ pointId: p.id })) },
            },
          });
          created++;
          if (sch.assigneeId)
            await this.notifications.create({
              userId: sch.assigneeId,
              title: "Ca tuần tra định kỳ mới",
              body: `${shiftNumber} · ${sch.route.name}`,
              type: "WORK_ORDER",
              entityType: "PATROL_SHIFT",
              entityId: row.id,
            });
        }
      }
    }
    return { created };
  }
}
