import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { MallAccessService } from "../../common/services/mall-access.service";
import { Scope } from "../../common/decorators/scope.decorator";
import { ScopeType, EnforcementStatus } from "../../common/constants/scope.types";
import { PatrolService } from "./patrol.service";

const VIEW = [Role.ADMIN, Role.CEO, Role.MALL_DIRECTOR, Role.OPERATION];
const EDIT = [Role.ADMIN, Role.MALL_DIRECTOR, Role.OPERATION];
// CR-101 Phase 1: descriptive only.
@ApiTags("Security Patrol")
@ApiBearerAuth("JWT-auth")
@Roles(...VIEW)
@Scope({ type: ScopeType.MALL_SCOPED, status: EnforcementStatus.ENFORCED })
@Controller("patrol")
export class PatrolController {
  constructor(
    private service: PatrolService,
    private access: MallAccessService,
  ) {}
  private async ids(u: any, mallId?: string) {
    if (mallId) {
      await this.access.assertMallAccess(u.id, u.role, mallId);
      return [mallId];
    }
    return (await this.access.getAccessibleMallIds(u.id, u.role)) ?? undefined;
  }
  private async assertShift(id: string, u: any) {
    await this.access.assertMallAccess(
      u.id,
      u.role,
      await this.service.shiftMallId(id),
    );
  }
  private async assertRoute(id: string, u: any) {
    await this.access.assertMallAccess(
      u.id,
      u.role,
      await this.service.routeMallId(id),
    );
  }
  private async assertPoint(id: string, u: any) {
    await this.access.assertMallAccess(
      u.id,
      u.role,
      await this.service.pointMallId(id),
    );
  }
  private async assertSchedule(id: string, u: any) {
    await this.access.assertMallAccess(
      u.id,
      u.role,
      await this.service.scheduleMallId(id),
    );
  }

  @Get("summary") async summary(@Query() q: any, @CurrentUser() u: any) {
    return this.service.summary(await this.ids(u, q.mallId), q);
  }
  @Get("report") async report(@Query() q: any, @CurrentUser() u: any) {
    return this.service.report(await this.ids(u, q.mallId), q);
  }
  @Get("routes") async routes(@Query() q: any, @CurrentUser() u: any) {
    return this.service.routes(await this.ids(u, q.mallId), q);
  }
  @Post("routes") @Roles(...EDIT) async createRoute(
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.access.assertMallAccess(u.id, u.role, body.mallId);
    return this.service.createRoute(body);
  }
  @Patch("routes/:id") @Roles(...EDIT) async updateRoute(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assertRoute(id, u);
    return this.service.updateRoute(id, body);
  }
  @Post("routes/:id/points") @Roles(...EDIT) async addPoint(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assertRoute(id, u);
    return this.service.addPoint(id, body);
  }
  @Patch("routes/:id/points/reorder") @Roles(...EDIT) async reorderPoints(
    @Param("id") id: string,
    @Body("orderedIds") orderedIds: string[],
    @CurrentUser() u: any,
  ) {
    await this.assertRoute(id, u);
    return this.service.reorderPoints(id, orderedIds);
  }
  @Patch("points/:id") @Roles(...EDIT) async updatePoint(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assertPoint(id, u);
    return this.service.updatePoint(id, body);
  }
  @Delete("points/:id") @Roles(...EDIT) async deletePoint(
    @Param("id") id: string,
    @CurrentUser() u: any,
  ) {
    await this.assertPoint(id, u);
    return this.service.deletePoint(id);
  }
  @Get("shifts") async shifts(@Query() q: any, @CurrentUser() u: any) {
    return this.service.shifts(await this.ids(u, q.mallId), q);
  }
  @Get("shifts/:id") async shift(
    @Param("id") id: string,
    @CurrentUser() u: any,
  ) {
    await this.assertShift(id, u);
    return this.service.shift(id);
  }
  @Post("shifts") @Roles(...EDIT) async createShift(
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.access.assertMallAccess(u.id, u.role, body.mallId);
    return this.service.createShift(body, u.id);
  }
  @Patch("shifts/:id/start") async start(
    @Param("id") id: string,
    @CurrentUser() u: any,
  ) {
    await this.assertShift(id, u);
    return this.service.start(id, u.id);
  }
  @Patch("shifts/:id/complete") async complete(
    @Param("id") id: string,
    @Body("notes") notes: string,
    @CurrentUser() u: any,
  ) {
    await this.assertShift(id, u);
    return this.service.complete(id, notes);
  }
  @Patch("shifts/:id/cancel") @Roles(...EDIT) async cancelShift(
    @Param("id") id: string,
    @Body("reason") reason: string,
    @CurrentUser() u: any,
  ) {
    await this.assertShift(id, u);
    return this.service.cancelShift(id, reason);
  }
  @Patch("shifts/:id/assignee") @Roles(...EDIT) async reassignShift(
    @Param("id") id: string,
    @Body("assigneeId") assigneeId: string,
    @CurrentUser() u: any,
  ) {
    await this.assertShift(id, u);
    return this.service.reassignShift(id, assigneeId);
  }
  @Patch("checks/:id") async check(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.access.assertMallAccess(
      u.id,
      u.role,
      await this.service.checkMallId(id),
    );
    return this.service.check(id, body, u.id);
  }
  @Post("checks/:id/evidence")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async evidence(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() u: any,
  ) {
    await this.access.assertMallAccess(
      u.id,
      u.role,
      await this.service.checkMallId(id),
    );
    return this.service.upload(id, file);
  }
  @Get("schedules") async schedules(@Query() q: any, @CurrentUser() u: any) {
    return this.service.schedules(await this.ids(u, q.mallId), q);
  }
  @Post("schedules") @Roles(...EDIT) async createSchedule(
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.access.assertMallAccess(u.id, u.role, body.mallId);
    return this.service.createSchedule(body, u.id);
  }
  @Patch("schedules/:id") @Roles(...EDIT) async updateSchedule(
    @Param("id") id: string,
    @Body() body: any,
    @CurrentUser() u: any,
  ) {
    await this.assertSchedule(id, u);
    return this.service.updateSchedule(id, body);
  }
  @Delete("schedules/:id") @Roles(...EDIT) async deleteSchedule(
    @Param("id") id: string,
    @CurrentUser() u: any,
  ) {
    await this.assertSchedule(id, u);
    return this.service.deleteSchedule(id);
  }
}
