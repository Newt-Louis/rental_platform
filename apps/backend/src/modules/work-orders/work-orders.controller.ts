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

const ROLES = [
  Role.ADMIN,
  Role.CEO,
  Role.MALL_DIRECTOR,
  Role.OPERATION,
  Role.LEASING_MANAGER,
];
@ApiTags("Work Orders")
@ApiBearerAuth("JWT-auth")
@Roles(...ROLES)
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
  @Post("reminders/run")
  @Roles(Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION)
  reminders() {
    return this.service.sendOverdueReminders();
  }
  @Get("templates") async templates(@Query() q: any, @CurrentUser() u: any) {
    return this.service.listTemplates(q, await this.ids(u, q.mallId));
  }
  @Post("templates") async createTemplate(
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.mallAccess.assertMallAccess(u.id, u.role, body.mallId);
    return this.service.createTemplate(body, u.id);
  }
  @Put("templates/:id") async updateTemplate(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assertTemplate(id, u);
    return this.service.updateTemplate(id, body);
  }
  @Patch("templates/:id/toggle") async toggleTemplate(
    @Param("id") id: string,
    @Body("isActive") active: boolean,
    @CurrentUser() u: any,
  ) {
    await this.assertTemplate(id, u);
    return this.service.toggleTemplate(id, active);
  }
  @Post("templates/:id/run") async runTemplate(
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
  @Post() async create(@Body() dto: CreateWorkOrderDto, @CurrentUser() u: any) {
    await this.mallAccess.assertMallAccess(u.id, u.role, dto.mallId);
    return this.service.create(dto, u.id);
  }
  @Put(":id") async update(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.update(id, body, u.id);
  }
  @Patch(":id/status") async status(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.transition(id, body.status, u.id, body.note);
  }
  @Post(":id/review") async review(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.review(id, body.approved, body.note, u.id);
  }
  @Post(":id/checklist") async checklist(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.addChecklist(id, body);
  }
  @Post(":id/comments") async comment(
    @Param("id") id: string,
    @Body("content") content: string,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.addComment(id, content, u.id);
  }
  @Patch(":id/checklist/:itemId") async toggle(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body("isCompleted") completed: boolean,
    @CurrentUser() u: any,
  ) {
    await this.assert(id, u);
    return this.service.toggleChecklist(id, itemId, completed, u.id);
  }
  @Post(":id/evidence")
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
