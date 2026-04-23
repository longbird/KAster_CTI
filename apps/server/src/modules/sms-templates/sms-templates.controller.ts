import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MenuPermissionService } from '../../common/menu-permission.service';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CreateSmsTemplateDto } from './dto/create-sms-template.dto';
import { ListSmsTemplatesQueryDto } from './dto/list-sms-templates.query.dto';
import { UpdateSmsTemplateDto } from './dto/update-sms-template.dto';
import { SmsTemplatesService } from './sms-templates.service';

@ApiTags('sms-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor', 'admin')
@Controller('sms-templates')
export class SmsTemplatesController {
  constructor(
    private readonly smsTemplatesService: SmsTemplatesService,
    private readonly menuPermissionService: MenuPermissionService,
  ) {}

  private async assertMenuAction(
    user: any,
    action: 'view' | 'create' | 'update' | 'delete' | 'operate' | 'export',
  ) {
    await this.menuPermissionService.assertMenuAction(
      user.tenantId,
      user.role,
      'settings/sms-templates',
      action,
      user.sub,
    );
  }

  @Get()
  async list(@CurrentUser() user: any, @Query() query: ListSmsTemplatesQueryDto) {
    await this.assertMenuAction(user, 'view');
    return this.smsTemplatesService.list(user.tenantId, query);
  }

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateSmsTemplateDto) {
    await this.assertMenuAction(user, 'create');
    return this.smsTemplatesService.create(user.tenantId, dto);
  }

  @Put(':templateId')
  async update(
    @CurrentUser() user: any,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateSmsTemplateDto,
  ) {
    await this.assertMenuAction(user, 'update');
    return this.smsTemplatesService.update(user.tenantId, templateId, dto);
  }

  @Delete(':templateId')
  async remove(@CurrentUser() user: any, @Param('templateId') templateId: string) {
    await this.assertMenuAction(user, 'delete');
    return this.smsTemplatesService.remove(user.tenantId, templateId);
  }
}
