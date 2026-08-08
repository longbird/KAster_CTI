import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { CreateShareRuleDto } from './dto/create-share-rule.dto';
import { PutShareRuleAgentsDto } from './dto/put-share-rule-agents.dto';
import { PutShareRuleBranchesDto } from './dto/put-share-rule-branches.dto';
import { UpdateShareRuleDto } from './dto/update-share-rule.dto';
import { ShareRulesService } from './share-rules.service';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';

const MENU_KEY = 'settings/share-rules';

@ApiTags('admin/settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/settings/share-rules')
// DB 장애 대응 모드에서 설정 쓰기를 차단한다. 가드가 조회 메서드는 통과시키므로
// 클래스 전체에 붙여도 읽기 경로는 영향받지 않는다.
@RequiresWriteAvailability('general')
export class ShareRulesController {
  constructor(
    private readonly service: ShareRulesService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get()
  @Roles('supervisor', 'admin')
  async list(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'view',
      user.sub,
    );
    return this.service.list(user.tenantId);
  }

  @Get(':shareRuleId')
  @Roles('supervisor', 'admin')
  async get(@CurrentUser() user: any, @Param('shareRuleId') shareRuleId: string) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'view',
      user.sub,
    );
    return this.service.get(user.tenantId, shareRuleId);
  }

  @Post()
  @Roles('supervisor', 'admin')
  async create(@CurrentUser() user: any, @Body() dto: CreateShareRuleDto) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'create',
      user.sub,
    );
    return this.service.create(user.tenantId, dto, user.sub);
  }

  @Post(':shareRuleId')
  @Roles('supervisor', 'admin')
  async update(
    @CurrentUser() user: any,
    @Param('shareRuleId') shareRuleId: string,
    @Body() dto: UpdateShareRuleDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'update',
      user.sub,
    );
    return this.service.update(user.tenantId, shareRuleId, dto, user.sub);
  }

  @Delete(':shareRuleId')
  @Roles('supervisor', 'admin')
  async remove(@CurrentUser() user: any, @Param('shareRuleId') shareRuleId: string) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'delete',
      user.sub,
    );
    return this.service.remove(user.tenantId, shareRuleId);
  }

  @Put(':shareRuleId/agents')
  @Roles('supervisor', 'admin')
  async putAgents(
    @CurrentUser() user: any,
    @Param('shareRuleId') shareRuleId: string,
    @Body() dto: PutShareRuleAgentsDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'update',
      user.sub,
    );
    return this.service.putAgents(user.tenantId, shareRuleId, dto);
  }

  @Put(':shareRuleId/branches')
  @Roles('supervisor', 'admin')
  async putBranches(
    @CurrentUser() user: any,
    @Param('shareRuleId') shareRuleId: string,
    @Body() dto: PutShareRuleBranchesDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'update',
      user.sub,
    );
    return this.service.putBranches(user.tenantId, shareRuleId, dto);
  }
}
