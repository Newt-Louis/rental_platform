import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MODULE_ROLES } from '../../common/constants/role-permissions';
import { CategoriesService } from './categories.service';
import { Role } from '@prisma/client';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import {
  CreateCategoryPricingDto,
  UpdateCategoryPricingDto,
  ValidatePriceDto,
} from './dto/category-pricing.dto';

@ApiTags('Categories')
@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get()
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'List all categories (flat)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async getCategories(@Query('includeInactive') includeInactive?: string) {
    return this.categoriesService.getCategories(includeInactive === 'true');
  }

  @Get('tree')
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'Get categories as tree structure' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async getCategoriesTree(@Query('includeInactive') includeInactive?: string) {
    return this.categoriesService.getCategoriesTree(includeInactive === 'true');
  }

  @Get('options')
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'Get categories for dropdown/select' })
  async getCategoryOptions() {
    return this.categoriesService.getCategoryOptions();
  }

  @Get(':id')
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'Get category details' })
  async getCategory(@Param('id') id: string) {
    return this.categoriesService.getCategory(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new category' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.createCategory(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a category' })
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.updateCategory(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate a category' })
  async deleteCategory(@Param('id') id: string) {
    return this.categoriesService.deleteCategory(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY PRICING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('pricing/list')
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'List category pricings by mall/category' })
  @ApiQuery({ name: 'mallId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async getCategoryPricings(
    @Query('mallId') mallId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    return this.categoriesService.getCategoryPricings({
      mallId,
      categoryId,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get('pricing/lookup')
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'Get applicable pricing for mall+category+floor+zone' })
  @ApiQuery({ name: 'mallId', required: true })
  @ApiQuery({ name: 'categoryId', required: true })
  @ApiQuery({ name: 'floorId', required: false })
  @ApiQuery({ name: 'zoneId', required: false })
  async getApplicablePricing(
    @Query('mallId') mallId: string,
    @Query('categoryId') categoryId: string,
    @Query('floorId') floorId?: string,
    @Query('zoneId') zoneId?: string
  ) {
    const pricing = await this.categoriesService.getApplicablePricing({
      mallId,
      categoryId,
      floorId,
      zoneId,
    });

    if (!pricing) {
      return { found: false, pricing: null };
    }

    return { found: true, pricing };
  }

  @Post('pricing/validate')
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'Validate proposed price against category pricing' })
  async validatePrice(@Body() dto: ValidatePriceDto) {
    return this.categoriesService.validateProposedPrice({
      mallId: dto.mallId,
      categoryId: dto.categoryId,
      floorId: dto.floorId,
      zoneId: dto.zoneId,
      proposedRentPerSqm: dto.proposedRentPerSqm,
    });
  }

  @Get('pricing/mall/:mallId/summary')
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'Get pricing summary for a mall (all categories)' })
  async getMallPricingSummary(@Param('mallId') mallId: string) {
    return this.categoriesService.getMallPricingSummary(mallId);
  }

  @Get('pricing/:id')
  @Roles(...MODULE_ROLES.categoriesRead)
  @ApiOperation({ summary: 'Get category pricing details' })
  async getCategoryPricing(@Param('id') id: string) {
    return this.categoriesService.getCategoryPricing(id);
  }

  @Post('pricing')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create category pricing rule' })
  async createCategoryPricing(@Body() dto: CreateCategoryPricingDto, @Req() req: any) {
    return this.categoriesService.createCategoryPricing(dto, req.user?.id);
  }

  @Patch('pricing/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update category pricing rule' })
  async updateCategoryPricing(@Param('id') id: string, @Body() dto: UpdateCategoryPricingDto) {
    return this.categoriesService.updateCategoryPricing(id, dto);
  }

  @Delete('pricing/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate category pricing rule' })
  async deleteCategoryPricing(@Param('id') id: string) {
    return this.categoriesService.deleteCategoryPricing(id);
  }
}
