import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { CreateOutboundRuleDto } from './dto/create-outbound-rule.dto';
import { TestOutboundRuleDto } from './dto/test-outbound-rule.dto';
import { UpdateOutboundRuleDto } from './dto/update-outbound-rule.dto';
import { OutboundRulesService } from './outbound-rules.service';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';

@ApiTags('admin/settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/settings/outbound-rules')
// DB 장애 대응 모드에서 설정 쓰기를 차단한다. 가드가 조회 메서드는 통과시키므로
// 클래스 전체에 붙여도 읽기 경로는 영향받지 않는다.
@RequiresWriteAvailability('general')
export class OutboundRulesController {
  constructor(
    private readonly service: OutboundRulesService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  @Get()
  @Roles('supervisor', 'admin')
  async list(@CurrentUser() user: any) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/outbound-rules',
      'view',
      user.sub,
    );
    return this.service.list(user.tenantId);
  }

  @Post()
  @Roles('supervisor', 'admin')
  async create(@CurrentUser() user: any, @Body() dto: CreateOutboundRuleDto) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/outbound-rules',
      'create',
      user.sub,
    );
    return this.service.create(user.tenantId, dto);
  }

  @Post('test')
  @Roles('supervisor', 'admin')
  async test(@CurrentUser() user: any, @Body() dto: TestOutboundRuleDto) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/outbound-rules',
      'view',
      user.sub,
    );
    return this.service.test(user.tenantId, dto);
  }

  @Post(':ruleId')
  @Roles('supervisor', 'admin')
  async update(
    @CurrentUser() user: any,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateOutboundRuleDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/outbound-rules',
      'update',
      user.sub,
    );
    return this.service.update(user.tenantId, ruleId, dto);
  }

  @Delete(':ruleId')
  @Roles('supervisor', 'admin')
  async remove(@CurrentUser() user: any, @Param('ruleId') ruleId: string) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/outbound-rules',
      'delete',
      user.sub,
    );
    return this.service.remove(user.tenantId, ruleId);
  }
}
