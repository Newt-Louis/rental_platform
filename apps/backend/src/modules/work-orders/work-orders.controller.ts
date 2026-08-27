import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { MallAccessService } from "../../common/services/mall-access.service";
import { CreateWorkOrderDto } from "./dto/work-order.dto";
import { WorkOrdersService } from "./work-orders.service";
import { Scope } from "../../common/decorators/scope.decorator";
import { ScopeType, EnforcementStatus } from "../../common/constants/scope.types";

// CR-101 Phase 1: descriptive only.

const ROLES = [
  Role.ADMIN,
  Role.CEO,
  Role.MALL_DIRECTOR,
  Role.OPERATION,
  Role.LEASING_MANAGER,
];
// CR-101 Phase 3G (BC-CEO-SCOPE Option A): Work Orders is a confirmed
// operational-write contradiction -- CEO keeps read/list/summary/export, loses
// every create/update/status/review/checklist/evidence/template-authoring
// route below.
const WRITE_ROLES = ROLES.filter((r) => r !== Role.CEO);
@ApiTags("Work Orders")
@ApiBearerAuth("JWT-auth")
@Roles(...ROLES)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED })
@Controller("work-orders")
export class WorkOrdersController {
  constructor(
    private service: WorkOrdersService,
    private mallAccess: MallAccessService,
  ) {}
  private async ids(user: any, mallId?: string) {
    if (mallId) {
      await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
      return [mallId];
    }
    return (
      (await this.mallAccess.getAccessibleMallIds(user.id, user.role)) ??
      undefined
    );
  }
  /**
   * Mall scope for the assignment lookups. Unlike `ids()` this never throws:
   * a caller holding no grant for the requested Mall simply gets an empty
   * scope, and the query returns nothing. The pickers are a read-only lookup,
   * so a silent empty list is the correct answer rather than a 403 the operator
   * cannot act on.
   */
  private async lookupScope(user: any, mallId?: string) {
    const accessible = await this.mallAccess.getAccessibleMallIds(
      user.id,
      user.role,
    );
    if (accessible === null) return mallId ? [mallId] : undefined;
    return mallId ? accessible.filter((id) => id === mallId) : accessible;
  }
  private async assert(id: string, user: any) {
    await this.mallAccess.assertMallAccess(
      user.id,
      user.role,
      await this.service.mallId(id),
    );
  }
  private async assertTemplate(id: string, user: any) {
    await this.mallAccess.assertMallAccess(
      user.id,
      user.role,
      await this.service.templateMallId(id),
    );
  }
  @Get() async list(@Query() q: any, @CurrentUser() u: any) {
    return this.service.list(q, await this.ids(u, q.mallId));
  }
  @Get("summary") async summary(
    @Query("mallId") mallId: string,
    @CurrentUser() u: any,
  ) {
    return this.service.summary(await this.ids(u, mallId), mallId);
  }
  @Get("export") async exportCsv(
    @Query() q: any,
    @CurrentUser() u: any,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportCsv(q, await this.ids(u, q.mallId));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="work-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }
  // Assignment pickers. Departments live behind the Departments module, whose
  // roles are the narrower administration set (ADMIN/CEO/MALL_DIRECTOR); these
  // read-only lookups are a different capability and follow the Work Orders
  // role list so OPERATION can assign work too.
  @Get("assignment/departments") async assignmentDepartments(
    @Query() q: any,
    @CurrentUser() u: any,
  ) {
    return this.service.assignmentDepartments(
      await this.lookupScope(u, q.mallId),
      q.search,
    );
  }
  @Get("assignment/assignees") async assignmentAssignees(
    @Query() q: any,
    @CurrentUser() u: any,
  ) {
    return this.service.assignmentAssignees(
      await this.lookupScope(u, q.mallId),
      q.departmentId,
      q.search,
    );
  }
  @Post("reminders/run")
  @Roles(Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION)
  reminders() {
    return this.service.sendOverdueReminders();
  }
  @Get("templates") async templates(@Query() q: any, @CurrentUser() u: any) {
    return this.service.listTemplates(q, await this.ids(u, q.mallId));
  }
  @Post("templates")
  @Roles(...WRITE_ROLES)
  async createTemplate(
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.mallAccess.assertMallAccess(u.id, u.role, body.mallId);
    return this.service.createTemplate(body, u.id);
  }
  @Put("templates/:id")
  @Roles(...WRITE_ROLES)
  async updateTemplate(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assertTemplate(id, u);
    return this.service.updateTemplate(id, body);
  }
  @Patch("templates/:id/toggle")
  @Roles(...WRITE_ROLES)
  async toggleTemplate(
    @Param("id") id: string,
    @Body("isActive") active: boolean,
    @CurrentUser() u: any,
  ) {
    await this.assertTemplate(id, u);
    return this.service.toggleTemplate(id, active);
  }
  @Post("templates/:id/run")
  @Roles(...WRITE_ROLES)
  async runTemplate(
    @Param("id") id: string,
    @CurrentUser() u: any,
  ) {
    await this.assertTemplate(id, u);
    return this.service.runTemplate(id);
  }
  @Post("templates/run-due")
  @Roles(Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION)
  runDueTemplates() {
    return this.service.generateScheduledWorkOrders();
  }
  @Get(":id") async detail(@Param("id") id: string, @CurrentUser() u: any) {
    await this.assert(id, u);
    return this.service.detail(id);
  }
  @Post()
  @Roles(...WRITE_ROLES)
  async create(@Body() dto: CreateWorkOrderDto, @CurrentUser() u: any) {
    await this.mallAccess.assertMallAccess(u.id, u.role, dto.mallId);
    return this.service.create(dto, u.id);
  }
  @Put(":id")
  @Roles(...WRITE_ROLES)
  async update(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.update(id, body, u.id);
  }
  @Patch(":id/status")
  @Roles(...WRITE_ROLES)
  async status(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.transition(id, body.status, u.id, body.note);
  }
  @Post(":id/review")
  @Roles(...WRITE_ROLES)
  async review(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.review(id, body.approved, body.note, u.id);
  }
  @Post(":id/checklist")
  @Roles(...WRITE_ROLES)
  async checklist(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.addChecklist(id, body);
  }
  @Post(":id/comments")
  @Roles(...WRITE_ROLES)
  async comment(
    @Param("id") id: string,
    @Body("content") content: string,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.addComment(id, content, u.id);
  }
  @Patch(":id/checklist/:itemId")
  @Roles(...WRITE_ROLES)
  async toggle(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body("isCompleted") completed: boolean,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.toggleChecklist(id, itemId, completed, u.id);
  }
  @Post(":id/evidence")
  @Roles(...WRITE_ROLES)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async evidence(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.upload(
      id,
      file,
      body.evidenceType || "PROGRESS",
      body.caption,
      u.id,
    );
  }
}
