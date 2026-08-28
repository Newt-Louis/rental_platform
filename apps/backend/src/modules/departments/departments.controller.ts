import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Scope } from "../../common/decorators/scope.decorator";
import { MODULE_ROLES } from "../../common/constants/role-permissions";
import {
  EnforcementStatus,
  ScopeType,
} from "../../common/constants/scope.types";
import { MallAccessService } from "../../common/services/mall-access.service";
import {
  CreateDepartmentDto,
  DepartmentOptionsDto,
  ListDepartmentsDto,
  UpdateDepartmentDto,
} from "./dto/department.dto";
import { DepartmentsService } from "./departments.service";

@ApiTags("Departments")
@ApiBearerAuth("JWT-auth")
@Roles(...MODULE_ROLES.departments)
@Controller("departments")
export class DepartmentsController {
  constructor(
    private readonly departments: DepartmentsService,
    private readonly mallAccess: MallAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List Departments in an authorised Mall" })
  @Scope({
    type: ScopeType.MALL_SCOPED,
    resolution: { via: "direct", from: "query", key: "mallId" },
    status: EnforcementStatus.ENFORCED,
    trackedAs: "CR-114",
  })
  async findAll(@Query() query: ListDepartmentsDto, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    return this.departments.findAll(query);
  }

  @Get("malls")
  @ApiOperation({ summary: "List Malls available to the Department operator" })
  @Scope({
    type: ScopeType.MALL_SCOPED,
    status: EnforcementStatus.ENFORCED,
    trackedAs: "CR-114",
  })
  async findMalls(@CurrentUser() user: any) {
    const mallIds = await this.mallAccess.getAccessibleMallIds(
      user.id,
      user.role,
    );
    return this.departments.findMalls(mallIds ?? undefined);
  }

  @Get("options")
  @ApiOperation({
    summary: "List all Department options in an authorised Mall",
  })
  @Scope({
    type: ScopeType.MALL_SCOPED,
    resolution: { via: "direct", from: "query", key: "mallId" },
    status: EnforcementStatus.ENFORCED,
    trackedAs: "CR-114",
  })
  async findOptions(
    @Query() query: DepartmentOptionsDto,
    @CurrentUser() user: any,
  ) {
    await this.mallAccess.assertMallAccess(user.id, user.role, query.mallId);
    return this.departments.findOptions(query.mallId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a Department by ID" })
  @Scope({
    type: ScopeType.MALL_SCOPED,
    resolution: {
      via: "entity",
      from: "param",
      key: "id",
      resolver: "department",
    },
    status: EnforcementStatus.ENFORCED,
    trackedAs: "CR-114",
  })
  async findOne(@Param("id") id: string, @CurrentUser() user: any) {
    await this.assertDepartmentAccess(id, user);
    return this.departments.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a Department" })
  @Scope({
    type: ScopeType.MALL_SCOPED,
    resolution: { via: "direct", from: "body", key: "mallId" },
    status: EnforcementStatus.ENFORCED,
    trackedAs: "CR-114",
  })
  async create(@Body() dto: CreateDepartmentDto, @CurrentUser() user: any) {
    await this.mallAccess.assertMallAccess(user.id, user.role, dto.mallId);
    return this.departments.create(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Replace editable Department information" })
  @Scope({
    type: ScopeType.MALL_SCOPED,
    resolution: {
      via: "entity",
      from: "param",
      key: "id",
      resolver: "department",
    },
    status: EnforcementStatus.ENFORCED,
    trackedAs: "CR-114",
  })
  async replace(
    @Param("id") id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: any,
  ) {
    await this.assertDepartmentAccess(id, user);
    return this.departments.update(id, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a Department" })
  @Scope({
    type: ScopeType.MALL_SCOPED,
    resolution: {
      via: "entity",
      from: "param",
      key: "id",
      resolver: "department",
    },
    status: EnforcementStatus.ENFORCED,
    trackedAs: "CR-114",
  })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: any,
  ) {
    await this.assertDepartmentAccess(id, user);
    return this.departments.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({
    summary: "Hard-delete a leaf Department and clear User assignments",
  })
  @Scope({
    type: ScopeType.MALL_SCOPED,
    resolution: {
      via: "entity",
      from: "param",
      key: "id",
      resolver: "department",
    },
    status: EnforcementStatus.ENFORCED,
    trackedAs: "CR-114",
  })
  async remove(@Param("id") id: string, @CurrentUser() user: any) {
    await this.assertDepartmentAccess(id, user);
    return this.departments.remove(id);
  }

  private async assertDepartmentAccess(id: string, user: any) {
    const mallId = await this.departments.resolveMallId(id);
    await this.mallAccess.assertMallAccess(user.id, user.role, mallId);
  }
}
