import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { MallAccessService } from "../../common/services/mall-access.service";
import { ParkingService } from "./parking.service";
const VIEW = [
  Role.ADMIN,
  Role.CEO,
  Role.MALL_DIRECTOR,
  Role.OPERATION,
  Role.FINANCE,
  Role.LEASING_MANAGER,
];
const EDIT = [
  Role.ADMIN,
  Role.MALL_DIRECTOR,
  Role.OPERATION,
  Role.FINANCE,
  Role.LEASING_MANAGER,
];
@ApiTags("Parking Contracts & Receivables")
@ApiBearerAuth("JWT-auth")
@Roles(...VIEW)
@Controller("parking")
export class ParkingController {
  constructor(
    private service: ParkingService,
    private access: MallAccessService,
  ) {}
  private async ids(u: any, mallId?: string) {
    if (mallId) {
      await this.access.assertMallAccess(u.id, u.role, mallId);
      return [mallId];
    }
    return (await this.access.getAccessibleMallIds(u.id, u.role)) ?? undefined;
  }
  private async assertContract(id: string, u: any) {
    await this.access.assertMallAccess(
      u.id,
      u.role,
      await this.service.contractMallId(id),
    );
  }
  private async assertStatement(id: string, u: any) {
    await this.access.assertMallAccess(
      u.id,
      u.role,
      await this.service.statementMallId(id),
    );
  }
  @Get("dashboard") async dashboard(@Query() q: any, @CurrentUser() u: any) {
    return this.service.dashboard(await this.ids(u, q.mallId), q);
  }
  @Get("alerts") async alerts(
    @Query("mallId") mallId: string,
    @CurrentUser() u: any,
  ) {
    return this.service.alerts(await this.ids(u, mallId), mallId);
  }
  @Get("contracts") async contracts(@Query() q: any, @CurrentUser() u: any) {
    return this.service.contracts(await this.ids(u, q.mallId), q);
  }
  @Get("contracts/:id") async contract(
    @Param("id") id: string,
    @CurrentUser() u: any,
  ) {
    await this.assertContract(id, u);
    return this.service.contract(id);
  }
  @Post("contracts") @Roles(...EDIT) async create(
    @Body() b: any,
    @CurrentUser() u: any,
  ) {
    await this.access.assertMallAccess(u.id, u.role, b.mallId);
    return this.service.createContract(b, u.id);
  }
  @Patch("contracts/:id") @Roles(...EDIT) async update(
    @Param("id") id: string,
    @Body() b: any,
    @CurrentUser() u: any,
  ) {
    await this.assertContract(id, u);
    return this.service.updateContract(id, b);
  }
  @Patch("contracts/:id/status") @Roles(...EDIT) async status(
    @Param("id") id: string,
    @Body("status") status: string,
    @CurrentUser() u: any,
  ) {
    await this.assertContract(id, u);
    return this.service.updateStatus(id, status);
  }
  @Post("contracts/:id/adjustments") @Roles(...EDIT) async adjustment(
    @Param("id") id: string,
    @Body() b: any,
    @CurrentUser() u: any,
  ) {
    await this.assertContract(id, u);
    return this.service.adjustQuantity(id, b, u.id);
  }
  @Post("contracts/:id/statements") @Roles(...EDIT) async statement(
    @Param("id") id: string,
    @Body() b: any,
    @CurrentUser() u: any,
  ) {
    await this.assertContract(id, u);
    return this.service.generateStatement(id, b.period, b.actualQuantities);
  }
  @Post("contracts/:id/documents")
  @Roles(...EDIT)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async document(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("documentType") type: string,
    @CurrentUser() u: any,
  ) {
    await this.assertContract(id, u);
    return this.service.uploadDocument(id, file, type, u.id);
  }
  @Get("statements") async statements(@Query() q: any, @CurrentUser() u: any) {
    return this.service.statements(await this.ids(u, q.mallId), q);
  }
  @Patch("statements/:id/actual") @Roles(...EDIT) async actual(
    @Param("id") id: string,
    @Body() b: any,
    @CurrentUser() u: any,
  ) {
    await this.assertStatement(id, u);
    return this.service.updateActual(
      id,
      b.actualQuantities,
      b.adjustment,
      b.notes,
    );
  }
  @Patch("statements/:id/reconcile") @Roles(...EDIT) async reconcile(
    @Param("id") id: string,
    @Body("status") status: string,
    @CurrentUser() u: any,
  ) {
    await this.assertStatement(id, u);
    return this.service.reconcile(id, status);
  }
  @Post("statements/:id/payments") @Roles(...EDIT) async payment(
    @Param("id") id: string,
    @Body() b: any,
    @CurrentUser() u: any,
  ) {
    await this.assertStatement(id, u);
    return this.service.addPayment(id, b, u.id);
  }
  @Get("reports/receivables.csv") async receivables(
    @Query() q: any,
    @CurrentUser() u: any,
    @Res() res: Response,
  ) {
    const csv = await this.service.receivablesCsv(
      await this.ids(u, q.mallId),
      q,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="parking-receivables-${q.period || "all"}.csv"`,
    );
    res.send(csv);
  }
  @Get("reports/vehicles.csv") async vehicles(
    @Query() q: any,
    @CurrentUser() u: any,
    @Res() res: Response,
  ) {
    const csv = await this.service.vehiclesCsv(await this.ids(u, q.mallId), q);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="parking-vehicles-${q.period || "all"}.csv"`,
    );
    res.send(csv);
  }
}
