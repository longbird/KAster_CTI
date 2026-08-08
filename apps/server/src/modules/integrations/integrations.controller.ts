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
import { CreateIntegrationAutomationDto } from './dto/create-integration-automation.dto';
import { TestIntegrationAutomationDto } from './dto/test-integration-automation.dto';
import { UpdateIntegrationAutomationDto } from './dto/update-integration-automation.dto';
import { IntegrationsService } from './integrations.service';
import { RequiresWriteAvailability } from '../resilience/write-availability.decorator';

const MENU_KEY = 'integrations';

@ApiTags('admin/settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/settings/integrations')
// DB 장애 대응 모드에서 설정 쓰기를 차단한다. 가드가 조회 메서드는 통과시키므로
// 클래스 전체에 붙여도 읽기 경로는 영향받지 않는다.
@RequiresWriteAvailability('general')
export class IntegrationsController {
  constructor(
    private readonly service: IntegrationsService,
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

  @Post()
  @Roles('supervisor', 'admin')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateIntegrationAutomationDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'create',
      user.sub,
    );
    return this.service.create(user.tenantId, dto, user.sub);
  }

  @Post(':integrationAutomationId')
  @Roles('supervisor', 'admin')
  async update(
    @CurrentUser() user: any,
    @Param('integrationAutomationId') id: string,
    @Body() dto: UpdateIntegrationAutomationDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'update',
      user.sub,
    );
    return this.service.update(user.tenantId, id, dto, user.sub);
  }

  @Post(':integrationAutomationId/toggle')
  @Roles('supervisor', 'admin')
  async toggle(
    @CurrentUser() user: any,
    @Param('integrationAutomationId') id: string,
    @Body() body: { enabled: boolean },
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'operate',
      user.sub,
    );
    return this.service.toggle(user.tenantId, id, !!body?.enabled);
  }

  @Post(':integrationAutomationId/test')
  @Roles('supervisor', 'admin')
  async test(
    @CurrentUser() user: any,
    @Param('integrationAutomationId') id: string,
    @Body() dto: TestIntegrationAutomationDto,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'operate',
      user.sub,
    );
    return this.service.test(user.tenantId, id, dto);
  }

  @Delete(':integrationAutomationId')
  @Roles('supervisor', 'admin')
  async remove(
    @CurrentUser() user: any,
    @Param('integrationAutomationId') id: string,
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      MENU_KEY,
      'delete',
      user.sub,
    );
    return this.service.remove(user.tenantId, id);
  }
}
