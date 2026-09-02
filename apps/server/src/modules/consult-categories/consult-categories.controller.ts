import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService, PermissionAction } from '../../common/menu-permission.service';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';
import { CONSULT_CATEGORIES_MENU_KEY } from './consult-categories.constants';
import { ConsultCategoriesService } from './consult-categories.service';
import { CreateConsultCategoryDto } from './dto/create-consult-category.dto';
import { ListConsultCategoriesQueryDto } from './dto/list-consult-categories.query.dto';
import { UpdateConsultCategoryDto } from './dto/update-consult-category.dto';

@ApiTags('consult-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/consult-categories')
@RequiresWriteAvailability('general')
export class ConsultCategoriesController {
  constructor(
    private readonly categories: ConsultCategoriesService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get()
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '상담분류 목록', description: '대-중-소 3단계를 레벨·정렬순으로 준다.' })
  async list(@Req() req: any, @Query() query: ListConsultCategoriesQueryDto) {
    await this.assert(req, 'view');
    return this.categories.list(req.user.tenantId, { activeOnly: query.activeOnly === 'true' });
  }

  @Post()
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '상담분류 등록', description: 'parentCategoryId 를 주면 그 아래 단계로 만든다.' })
  async create(@Req() req: any, @Body() dto: CreateConsultCategoryDto) {
    await this.assert(req, 'create');
    return this.categories.create(req.user.tenantId, dto);
  }

  @Patch(':categoryId')
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '상담분류 수정', description: '코드는 바꾸지 않는다 — 이미 분석된 통화가 코드를 가리킨다.' })
  async update(
    @Req() req: any,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateConsultCategoryDto,
  ) {
    await this.assert(req, 'update');
    return this.categories.update(req.user.tenantId, categoryId, dto);
  }

  @Delete(':categoryId')
  @Roles('supervisor', 'admin')
  @ApiOperation({ summary: '상담분류 삭제', description: '하위 분류가 남아 있으면 거부한다.' })
  async remove(@Req() req: any, @Param('categoryId') categoryId: string) {
    await this.assert(req, 'delete');
    return this.categories.remove(req.user.tenantId, categoryId);
  }

  private assert(req: any, action: PermissionAction) {
    return this.menuPermissionService.assertMenuAction(
      req.user.tenantId,
      req.user.role,
      CONSULT_CATEGORIES_MENU_KEY,
      action,
      req.user.sub,
    );
  }
}
