import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { CreateWorkOrderDto } from "./dto/work-order.dto";
import { NotificationsService } from "../notifications/notifications.service";
import { SchedulerLockService } from "../../common/services/scheduler-lock.service";

const TRANSITIONS: Record<string, string[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_REVIEW", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["IN_PROGRESS", "CANCELLED"],
  WAITING_REVIEW: ["IN_PROGRESS", "COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class WorkOrdersService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private schedulerLock: SchedulerLockService,
  ) {}
  async mallId(id: string) {
    const row = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { mallId: true },
    });
    if (!row) throw new NotFoundException("Không tìm thấy công việc");
    return row.mallId;
  }

  async templateMallId(id: string) {
    const row = await this.prisma.workOrderTemplate.findUnique({
      where: { id },
      select: { mallId: true },
    });
    if (!row) throw new NotFoundException("Không tìm thấy mẫu công việc");
    return row.mallId;
  }

  async listTemplates(query: any, mallIds?: string[]) {
    return this.prisma.workOrderTemplate.findMany({
      where: {
        ...(query.mallId
          ? { mallId: query.mallId }
          : mallIds
            ? { mallId: { in: mallIds } }
            : {}),
        ...(query.isActive === undefined
          ? {}
          : { isActive: String(query.isActive) === "true" }),
      },
      include: {
        mall: { select: { id: true, code: true, name: true } },
        assignee: { select: { id: true, fullName: true } },
        _count: { select: { workOrders: true } },
      },
      orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }],
    });
  }

  async createTemplate(body: any, userId: string) {
    this.validateTemplate(body);
    return this.prisma.workOrderTemplate.create({
      data: {
        mallId: body.mallId,
        name: body.name.trim(),
        category: body.category,
        title: body.title.trim(),
        description: body.description || undefined,
        priority: body.priority || "MEDIUM",
        location: body.location || undefined,
        assignedDepartment: body.assignedDepartment || undefined,
        assigneeId: body.assigneeId || undefined,
        frequency: body.frequency,
        nextRunAt: new Date(body.nextRunAt),
        dueHours: Math.max(1, Number(body.dueHours) || 24),
        checklist: Array.isArray(body.checklist) ? body.checklist : [],
        createdById: userId,
      },
    });
  }

  async updateTemplate(id: string, body: any) {
    const current = await this.prisma.workOrderTemplate.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException("Không tìm thấy mẫu công việc");
    const data: any = {};
    for (const key of [
      "name",
      "category",
      "title",
      "description",
      "priority",
      "location",
      "assignedDepartment",
      "assigneeId",
      "frequency",
      "dueHours",
      "checklist",
    ])
      if (key in body) data[key] = body[key] === "" ? null : body[key];
    if (body.nextRunAt) data.nextRunAt = new Date(body.nextRunAt);
    if (data.name) data.name = data.name.trim();
    if (data.title) data.title = data.title.trim();
    if (data.dueHours) data.dueHours = Math.max(1, Number(data.dueHours));
    if (data.frequency && !this.frequencies.includes(data.frequency))
      throw new BadRequestException("Tần suất không hợp lệ");
    return this.prisma.workOrderTemplate.update({ where: { id }, data });
  }

  async toggleTemplate(id: string, isActive?: boolean) {
    const row = await this.prisma.workOrderTemplate.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("Không tìm thấy mẫu công việc");
    return this.prisma.workOrderTemplate.update({
      where: { id },
      data: { isActive: isActive ?? !row.isActive },
    });
  }

  async runTemplate(id: string, scheduledFor?: Date) {
    const template = await this.prisma.workOrderTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException("Không tìm thấy mẫu công việc");
    const runAt = scheduledFor || new Date();
    const dueDate = new Date(runAt.getTime() + template.dueHours * 3600000);
    try {
      const created = await this.prisma.workOrder.create({
        data: {
          workOrderNumber: `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
          mallId: template.mallId,
          category: template.category,
          title: template.title,
          description: template.description,
          priority: template.priority,
          location: template.location,
          assignedDepartment: template.assignedDepartment,
          assigneeId: template.assigneeId,
          status: template.assigneeId ? "ASSIGNED" : "NEW",
          requesterId: template.createdById,
          dueDate,
          templateId: template.id,
          scheduledFor: runAt,
          sourceEntityType: "WORK_ORDER_TEMPLATE",
          sourceEntityId: template.id,
          checklist: {
            create: ((template.checklist as string[]) || []).map(
              (title, order) => ({
                title,
                order,
              }),
            ),
          },
          events: {
            create: {
              eventType: "SCHEDULED_CREATED",
              description: `Tự động tạo từ mẫu ${template.name}`,
              userId: template.createdById,
            },
          },
        },
      });
      if (created.assigneeId)
        await this.notify(
          created.assigneeId,
          created.id,
          "Công việc định kỳ mới",
          `${created.workOrderNumber} · ${created.title}`,
        );
      return { created: true, workOrder: created };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return { created: false, reason: "DUPLICATE_SCHEDULE" };
      throw error;
    }
  }

  private readonly frequencies = [
    "DAILY",
    "WEEKLY",
    "MONTHLY",
    "QUARTERLY",
    "ANNUALLY",
  ];
  private validateTemplate(body: any) {
    if (
      !body.mallId ||
      !body.name?.trim() ||
      !body.title?.trim() ||
      !body.nextRunAt
    )
      throw new BadRequestException(
        "Mall, tên mẫu, tiêu đề và lần chạy tiếp theo là bắt buộc",
      );
    if (!this.frequencies.includes(body.frequency))
      throw new BadRequestException("Tần suất không hợp lệ");
    if (Number.isNaN(new Date(body.nextRunAt).getTime()))
      throw new BadRequestException("Ngày chạy tiếp theo không hợp lệ");
  }

  private nextRun(from: Date, frequency: string) {
    const next = new Date(from);
    if (frequency === "DAILY") next.setDate(next.getDate() + 1);
    if (frequency === "WEEKLY") next.setDate(next.getDate() + 7);
    if (frequency === "MONTHLY") next.setMonth(next.getMonth() + 1);
    if (frequency === "QUARTERLY") next.setMonth(next.getMonth() + 3);
    if (frequency === "ANNUALLY") next.setFullYear(next.getFullYear() + 1);
    return next;
  }

  @Cron("0 5 * * *", {
    name: "work-order-template-generator",
    timeZone: "Asia/Ho_Chi_Minh",
  })
  async generateScheduledWorkOrders() {
    return this.schedulerLock.runExclusive("work-order-template-generator", 14_400_000, () => this.generateScheduledWorkOrdersUnlocked());
  }

  private async generateScheduledWorkOrdersUnlocked() {
    const now = new Date();
    const templates = await this.prisma.workOrderTemplate.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
    });
    let created = 0;
    for (const template of templates) {
      let scheduledFor = template.nextRunAt;
      while (scheduledFor <= now) {
        const result = await this.runTemplate(template.id, scheduledFor);
        if (result.created) created++;
        scheduledFor = this.nextRun(scheduledFor, template.frequency);
      }
      await this.prisma.workOrderTemplate.update({
        where: { id: template.id },
        data: { lastRunAt: now, nextRunAt: scheduledFor },
      });
    }
    return { templates: templates.length, created };
  }

  async list(query: any, mallIds?: string[]) {
    const page = Math.max(1, Number(query.page) || 1),
      limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const now = new Date();
    const dueSoon = new Date(now.getTime() + Math.min(168, Math.max(1, Number(query.dueHours) || 24)) * 3600000);
    const where: Prisma.WorkOrderWhereInput = {
      isActive: true,
      ...(query.mallId
        ? { mallId: query.mallId }
        : mallIds
          ? { mallId: { in: mallIds } }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(!query.status && query.scope === "ACTIVE" ? { status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "WAITING_REVIEW"] } } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.department ? { assignedDepartment: query.department } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.overdue === "true"
        ? {
            dueDate: { lt: new Date() },
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          }
        : {}),
      ...(query.alert === "DUE_SOON" ? { dueDate: { gte: now, lte: dueSoon }, status: { notIn: ["COMPLETED", "CANCELLED"] } } : {}),
      ...(query.alert === "OVERDUE" ? { dueDate: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } } : {}),
      ...(query.alert === "UNASSIGNED" ? { assigneeId: null, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } } : {}),
      ...(query.alert === "CRITICAL" ? { priority: "CRITICAL", status: { notIn: ["COMPLETED", "CANCELLED"] } } : {}),
      ...(query.search
        ? {
            OR: [
              {
                workOrderNumber: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
              { title: { contains: query.search, mode: "insensitive" } },
              { location: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const include = {
      mall: { select: { id: true, code: true, name: true } },
      unit: { select: { id: true, code: true, name: true } },
      requester: { select: { id: true, fullName: true, department: true } },
      assignee: { select: { id: true, fullName: true } },
      _count: { select: { checklist: true, evidence: true } },
    } as const;
    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        include,
        orderBy: [
          { priority: "desc" },
          { dueDate: "asc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return {
      data: await this.attachRequesterDepartments(data),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async detail(id: string) {
    const row = await this.prisma.workOrder.findFirst({
      where: { id, isActive: true },
      include: {
        mall: true,
        unit: true,
        requester: { select: { id: true, fullName: true, department: true } },
        assignee: { select: { id: true, fullName: true } },
        reviewer: { select: { id: true, fullName: true } },
        checklist: {
          include: { completedBy: { select: { fullName: true } } },
          orderBy: { order: "asc" },
        },
        evidence: {
          include: { uploadedBy: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
        },
        events: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
        },
        comments: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!row) throw new NotFoundException("Không tìm thấy công việc");
    const [resolved] = await this.attachRequesterDepartments([row]);
    return resolved;
  }

  /**
   * Department catalogue used by the assignment pickers. `mallIds` follows the
   * module convention: `undefined` means "no Mall restriction" (ADMIN bypass),
   * an empty array means the caller holds no Mall grant and must therefore see
   * nothing -- an empty list, not an error.
   */
  async assignmentDepartments(mallIds?: string[], search?: string) {
    if (mallIds && mallIds.length === 0) return [];
    const term = search?.trim();

    return this.prisma.department.findMany({
      where: {
        ...(mallIds ? { mallId: { in: mallIds } } : {}),
        ...(term ? { name: { contains: term, mode: "insensitive" } } : {}),
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        mallId: true,
        mall: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
      },
      orderBy: [{ name: "asc" }],
      take: 100,
    });
  }

  /**
   * Staff assignable to a Work Order in the caller's Mall scope. Membership is
   * UserMallAccess, so an account with no grant is never offered as an assignee
   * -- it could not act on the Mall's data anyway.
   */
  async assignmentAssignees(mallIds?: string[], departmentId?: string, search?: string) {
    if (mallIds && mallIds.length === 0) return [];
    const term = search?.trim();

    // CR-114 left `User.department` a plain string: new assignments store a
    // Department id, staff onboarded earlier still carry the free-text label.
    // Matching on both keeps the department -> assignee link working on
    // existing records instead of silently returning nobody.
    const target = departmentId
      ? await this.prisma.department.findUnique({
          where: { id: departmentId },
          select: { id: true, name: true },
        })
      : null;
    const departmentValues = target ? [target.id, target.name] : [];

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        role: { not: "TENANT" },
        ...(mallIds
          ? { mallAccess: { some: { mallId: { in: mallIds }, isActive: true } } }
          : {}),
        ...(departmentId ? { department: { in: departmentValues } } : {}),
        ...(term
          ? {
              OR: [
                { fullName: { contains: term, mode: "insensitive" } },
                { email: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, fullName: true, email: true, role: true, department: true },
      orderBy: { fullName: "asc" },
      take: 100,
    });

    return this.attachAssigneeDepartments(users, mallIds);
  }

  /**
   * Resolves each user's stored department value to a Department record, by id
   * for current assignments and by name for legacy labels. The name lookup is
   * confined to the caller's Mall scope so one Mall's catalogue never resolves
   * a label into another Mall's Department.
   */
  private async attachAssigneeDepartments<T extends { department: string | null }>(
    users: T[],
    mallIds?: string[],
  ) {
    const values = [...new Set(users.map((user) => user.department).filter(Boolean))] as string[];
    if (values.length === 0) {
      return users.map((user) => ({ ...user, departmentInfo: null }));
    }

    const departments = await this.prisma.department.findMany({
      where: {
        ...(mallIds ? { mallId: { in: mallIds } } : {}),
        OR: [{ id: { in: values } }, { name: { in: values } }],
      },
      select: { id: true, name: true, mallId: true },
    });
    const byId = new Map(departments.map((department) => [department.id, department]));
    const byName = new Map(departments.map((department) => [department.name, department]));

    return users.map((user) => ({
      ...user,
      departmentInfo: user.department
        ? byId.get(user.department) ?? byName.get(user.department) ?? null
        : null,
    }));
  }

  private async attachRequesterDepartments<T extends { requester?: { department?: string | null } | null }>(rows: T[]) {
    const ids = [...new Set(
      rows.map((row) => row.requester?.department).filter(Boolean),
    )] as string[];
    const departments = ids.length
      ? await this.prisma.department.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, mallId: true },
        })
      : [];
    const byId = new Map(departments.map((department) => [department.id, department]));
    return rows.map((row) => ({
      ...row,
      requester: row.requester
        ? {
            ...row.requester,
            departmentInfo: row.requester.department
              ? byId.get(row.requester.department) ?? null
              : null,
          }
        : null,
    }));
  }

  async create(dto: CreateWorkOrderDto, userId: string) {
    if (dto.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, mallId: dto.mallId },
      });
      if (!unit)
        throw new BadRequestException(
          "Mặt bằng không thuộc trung tâm thương mại đã chọn",
        );
    }
    const no = `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const created = await this.prisma.workOrder.create({
      data: {
        workOrderNumber: no,
        mallId: dto.mallId,
        unitId: dto.unitId || undefined,
        category: dto.category,
        title: dto.title.trim(),
        description: dto.description,
        priority: dto.priority || "MEDIUM",
        location: dto.location,
        assignedDepartment: dto.assignedDepartment,
        assigneeId: dto.assigneeId || undefined,
        status: dto.assigneeId ? "ASSIGNED" : "NEW",
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        sourceEntityType: dto.sourceEntityType,
        sourceEntityId: dto.sourceEntityId,
        requesterId: userId,
        checklist: dto.checklist?.length
          ? {
              create: dto.checklist
                .filter(Boolean)
                .map((title, order) => ({ title, order })),
            }
          : undefined,
        events: {
          create: {
            eventType: "CREATED",
            description: "Tạo công việc vận hành",
            userId,
          },
        },
      },
      include: { checklist: true },
    });
    if (created.assigneeId) {
      await this.notify(
        created.assigneeId,
        created.id,
        "Công việc mới được giao",
        `${created.workOrderNumber} · ${created.title}`,
      );
    }
    return created;
  }

  async update(id: string, body: any, userId: string) {
    const before = await this.detail(id);
    const allowed = [
      "title",
      "description",
      "priority",
      "location",
      "assignedDepartment",
      "assigneeId",
      "dueDate",
    ];
    const data: any = {};
    for (const key of allowed)
      if (key in body)
        data[key] =
          key === "dueDate" && body[key]
            ? new Date(body[key])
            : body[key] || (key === "assigneeId" ? null : body[key]);
    if (body.assigneeId && before.status === "NEW") data.status = "ASSIGNED";
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({ where: { id }, data });
      await this.event(id, "UPDATED", userId, undefined, JSON.stringify(data), undefined, tx);
      return updated;
    });
    if (body.assigneeId && body.assigneeId !== before.assigneeId) {
      await this.notify(
        body.assigneeId,
        id,
        "Bạn được giao công việc",
        `${before.workOrderNumber} · ${before.title}`,
      );
    }
    return row;
  }
  async transition(id: string, status: string, userId: string, note?: string) {
    const row = await this.detail(id);
    if (!(TRANSITIONS[row.status] || []).includes(status))
      throw new BadRequestException(
        `Không thể chuyển từ ${row.status} sang ${status}`,
      );
    if (status === "WAITING_REVIEW") {
      const missing = row.checklist.filter(
        (x) => x.isRequired && !x.isCompleted,
      );
      if (missing.length)
        throw new BadRequestException(
          `Còn ${missing.length} mục checklist bắt buộc chưa hoàn thành`,
        );
      if (!row.evidence.some((x) => x.evidenceType === "AFTER"))
        throw new BadRequestException(
          "Cần tải ít nhất một ảnh minh chứng sau xử lý",
        );
    }
    const data: any = { status };
    if (status === "IN_PROGRESS") data.startedAt = row.startedAt || new Date();
    if (status === "COMPLETED") data.completedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.workOrder.update({ where: { id }, data });
      await this.event(id, "STATUS_CHANGED", userId, row.status, status, note, tx);
      return next;
    });
    const recipient =
      status === "WAITING_REVIEW" ? row.requesterId : row.assigneeId;
    if (recipient && recipient !== userId)
      await this.notify(
        recipient,
        id,
        `Công việc: ${status}`,
        `${row.workOrderNumber} · ${row.title}`,
      );
    return updated;
  }
  async review(
    id: string,
    approved: boolean,
    note: string | undefined,
    userId: string,
  ) {
    const row = await this.detail(id);
    if (row.status !== "WAITING_REVIEW")
      throw new BadRequestException(
        "Công việc chưa ở trạng thái chờ nghiệm thu",
      );
    const status = approved ? "COMPLETED" : "IN_PROGRESS";
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.workOrder.update({
        where: { id },
        data: {
          status,
          reviewerId: userId,
          reviewedAt: new Date(),
          reviewStatus: approved ? "APPROVED" : "REJECTED",
          reviewNote: note,
          completedAt: approved ? new Date() : null,
        },
      });
      await this.event(
        id,
        approved ? "APPROVED" : "REJECTED",
        userId,
        "WAITING_REVIEW",
        status,
        note,
        tx,
      );
      return next;
    });
    if (row.assigneeId && row.assigneeId !== userId)
      await this.notify(
        row.assigneeId,
        id,
        approved
          ? "Công việc đã được nghiệm thu"
          : "Công việc cần khắc phục lại",
        `${row.workOrderNumber} · ${row.title}`,
      );
    return updated;
  }
  async addComment(id: string, content: string, userId: string) {
    const row = await this.detail(id);
    if (!content?.trim())
      throw new BadRequestException("Nội dung trao đổi không được để trống");
    const comment = await this.prisma.workOrderComment.create({
      data: { workOrderId: id, userId, content: content.trim() },
      include: { user: { select: { id: true, fullName: true } } },
    });
    const recipients = [row.requesterId, row.assigneeId].filter(
      (x): x is string => !!x && x !== userId,
    );
    await Promise.all(
      [...new Set(recipients)].map((uid) =>
        this.notify(
          uid,
          id,
          "Trao đổi mới về công việc",
          `${row.workOrderNumber} · ${content.trim().slice(0, 100)}`,
        ),
      ),
    );
    return comment;
  }
  async addChecklist(id: string, body: any) {
    await this.detail(id);
    return this.prisma.workOrderChecklistItem.create({
      data: {
        workOrderId: id,
        title: body.title,
        description: body.description,
        isRequired: body.isRequired !== false,
        order: Number(body.order) || 0,
      },
    });
  }
  async toggleChecklist(
    id: string,
    itemId: string,
    completed: boolean,
    userId: string,
  ) {
    const item = await this.prisma.workOrderChecklistItem.findFirst({
      where: { id: itemId, workOrderId: id },
    });
    if (!item) throw new NotFoundException("Không tìm thấy mục checklist");
    return this.prisma.workOrderChecklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted: completed,
        completedAt: completed ? new Date() : null,
        completedById: completed ? userId : null,
      },
    });
  }
  async upload(
    id: string,
    file: Express.Multer.File,
    evidenceType: string,
    caption: string | undefined,
    userId: string,
  ) {
    if (!file) throw new BadRequestException("Vui lòng chọn file minh chứng");
    await this.detail(id);
    if (!["BEFORE", "PROGRESS", "AFTER", "DOCUMENT"].includes(evidenceType))
      throw new BadRequestException("Loại minh chứng không hợp lệ");
    const saved = await this.storage.saveFile(file, `work-orders/${id}`);
    return this.prisma.workOrderEvidence.create({
      data: {
        workOrderId: id,
        evidenceType,
        caption,
        fileName: saved.fileName,
        filePath: saved.filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: userId,
      },
    });
  }
  async summary(mallIds?: string[], mallId?: string) {
    const where: Prisma.WorkOrderWhereInput = {
      isActive: true,
      ...(mallId ? { mallId } : mallIds ? { mallId: { in: mallIds } } : {}),
    };
    const dueSoonAt = new Date(Date.now() + 24 * 3600000);
    const [total, grouped, overdue, pendingReview, dueSoon, unassigned, critical] = await Promise.all([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.groupBy({ by: ["status"], where, _count: true }),
      this.prisma.workOrder.count({
        where: {
          ...where,
          dueDate: { lt: new Date() },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
      this.prisma.workOrder.count({
        where: { ...where, status: "WAITING_REVIEW" },
      }),
      this.prisma.workOrder.count({ where: { ...where, dueDate: { gte: new Date(), lte: dueSoonAt }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      this.prisma.workOrder.count({ where: { ...where, assigneeId: null, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] } } }),
      this.prisma.workOrder.count({ where: { ...where, priority: "CRITICAL", status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    ]);
    return {
      total,
      overdue,
      pendingReview,
      dueSoon,
      unassigned,
      critical,
      byStatus: Object.fromEntries(grouped.map((x) => [x.status, x._count])),
    };
  }
  async exportCsv(query: any, mallIds?: string[]) {
    const first = await this.list({ ...query, page: 1, limit: 100 }, mallIds);
    const data = [...first.data];
    for (let page = 2; page <= first.totalPages; page++) data.push(...(await this.list({ ...query, page, limit: 100 }, mallIds)).data);
    const esc = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "Số phiếu",
      "Mall",
      "Tiêu đề",
      "Nhóm",
      "Bộ phận",
      "Ưu tiên",
      "Trạng thái",
      "Người xử lý",
      "Vị trí",
      "Hạn hoàn thành",
      "Ngày tạo",
    ];
    const lines = data.map((x) =>
      [
        x.workOrderNumber,
        x.mall.name,
        x.title,
        x.category,
        x.assignedDepartment,
        x.priority,
        x.status,
        x.assignee?.fullName,
        x.location,
        x.dueDate?.toISOString(),
        x.createdAt.toISOString(),
      ]
        .map(esc)
        .join(","),
    );
    return `\uFEFF${headers.map(esc).join(",")}\n${lines.join("\n")}`;
  }
  @Cron("0 8 * * *", {
    name: "work-order-overdue-reminders",
    timeZone: "Asia/Ho_Chi_Minh",
  })
  async sendOverdueReminders() {
    return this.schedulerLock.runExclusive("work-order-overdue-reminders", 14_400_000, () => this.sendOverdueRemindersUnlocked());
  }

  private async sendOverdueRemindersUnlocked() {
    const now = new Date(),
      since = new Date();
    since.setHours(0, 0, 0, 0);
    const rows = await this.prisma.workOrder.findMany({
      where: {
        isActive: true,
        assigneeId: { not: null },
        dueDate: { lt: now },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    });
    const dueSoonRows = await this.prisma.workOrder.findMany({ where: { isActive: true, assigneeId: { not: null }, dueDate: { gte: now, lte: new Date(now.getTime() + 24 * 3600000) }, status: { notIn: ["COMPLETED", "CANCELLED"] } } });
    let sent = 0;
    for (const row of rows) {
      const exists = await this.prisma.notification.findFirst({
        where: {
          userId: row.assigneeId!,
          entityType: "WORK_ORDER_OVERDUE",
          entityId: row.id,
          createdAt: { gte: since },
        },
      });
      if (!exists) {
        await this.notifications.create({
          userId: row.assigneeId!,
          title: "Công việc đã quá hạn",
          body: `${row.workOrderNumber} · ${row.title}`,
          type: "WORK_ORDER",
          entityType: "WORK_ORDER_OVERDUE",
          entityId: row.id,
        });
        sent++;
      }
    }
    for (const row of dueSoonRows) {
      const exists = await this.prisma.notification.findFirst({ where: { userId: row.assigneeId!, entityType: "WORK_ORDER_DUE_SOON", entityId: row.id, createdAt: { gte: since } } });
      if (!exists) { await this.notifications.create({ userId: row.assigneeId!, title: "Công việc sắp đến hạn", body: `${row.workOrderNumber} · ${row.title} · hạn ${row.dueDate?.toLocaleString("vi-VN")}`, type: "WORK_ORDER", entityType: "WORK_ORDER_DUE_SOON", entityId: row.id }); sent++; }
    }
    return { sent };
  }
  private notify(
    userId: string,
    entityId: string,
    title: string,
    body: string,
  ) {
    return this.notifications.create({
      userId,
      title,
      body,
      type: "WORK_ORDER",
      entityType: "WORK_ORDER",
      entityId,
    });
  }
  private event(
    workOrderId: string,
    eventType: string,
    userId: string,
    oldValue?: string,
    newValue?: string,
    description?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return db.workOrderEvent.create({
      data: { workOrderId, eventType, userId, oldValue, newValue, description },
    });
  }
}
